using System.Data;
using System.Data.Common;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

internal sealed record CustomSqlResult(IReadOnlyList<ReportColumn> Columns, IReadOnlyList<IReadOnlyDictionary<string, object?>> Rows, bool Truncated);

/// <summary>Seçilen firmalar sorgu için farklı sütun kümesi döndürdüğünde atılır.</summary>
internal sealed class CustomSqlColumnMismatchException() : Exception("Seçilen firmalarda sorgu farklı sütunlar döndürdü.");

/// <summary>
/// Yöneticinin yazdığı SQL raporunu her firmanın salt okunur sorgu bağlantısıyla çalıştırır.
/// Yazma/çapraz veritabanı koruması SQL login yetkileriyle sağlanır; ön doğrulama yalnızca erken hata içindir.
/// </summary>
internal static class CustomSqlReportRunner
{
    internal const int CommandTimeoutSeconds = 30;
    internal const int MaxRows = 5000;
    internal const int MaxPageSize = 500;
    internal const string CompanyColumnCode = "companyName";

    /// Yetki: her CompanyId için kullanıcının aktif üyeliği Role=="TenantAdmin" olmalı; değilse null döner (çağıran 403 verir).
    internal static async Task<IReadOnlyList<(Guid TenantId, string CompanyName)>?> AuthorizeCompaniesAsync(
        Guid userId, IReadOnlyList<Guid> companyIds, PlatformDbContext platformDb, CancellationToken ct)
    {
        if (userId == Guid.Empty || companyIds.Count == 0) return null;
        var ids = companyIds.Distinct().ToArray();
        var memberships = await platformDb.TenantMemberships.AsNoTracking()
            .Where(membership => membership.UserId == userId && ids.Contains(membership.TenantId)
                && membership.Tenant.IsActive && membership.Role == "TenantAdmin")
            .Select(membership => new { membership.TenantId, CompanyName = membership.Tenant.Name })
            .ToListAsync(ct);
        var byId = memberships.GroupBy(x => x.TenantId).ToDictionary(x => x.Key, x => x.First().CompanyName);
        if (ids.Any(id => !byId.ContainsKey(id))) return null;
        // Kullanıcının seçtiği sırayı koru.
        return ids.Select(id => (id, byId[id])).ToArray();
    }

    internal static async Task<CustomSqlResult> ExecuteAsync(string sql,
        IReadOnlyList<(Guid TenantId, string CompanyName)> companies, ITenantQueryConnectionFactory factory, CancellationToken ct)
    {
        var multiCompany = companies.Count > 1;
        IReadOnlyList<ReportColumn>? columns = null;
        var rows = new List<IReadOnlyDictionary<string, object?>>();
        var truncated = false;
        for (var index = 0; index < companies.Count; index++)
        {
            var remaining = MaxRows - rows.Count;
            if (remaining <= 0) { truncated = true; break; }
            var company = companies[index];
            await using var connection = await factory.OpenAsync(company.TenantId, TenantQueryAccess.Read, ct);
            await using var command = connection.CreateCommand();
            command.CommandType = CommandType.Text;
            command.CommandText = sql;
            command.CommandTimeout = CommandTimeoutSeconds;
            await using var reader = await command.ExecuteReaderAsync(CommandBehavior.SequentialAccess, ct);
            var result = await ReadAsync(reader, remaining, ct);
            if (columns is null) columns = result.Columns;
            else if (!SameShape(columns, result.Columns)) throw new CustomSqlColumnMismatchException();
            foreach (var row in result.Rows)
            {
                if (!multiCompany) { rows.Add(row); continue; }
                var withCompany = new Dictionary<string, object?>(row.Count + 1, StringComparer.Ordinal) { [CompanyColumnCode] = company.CompanyName };
                foreach (var pair in row) withCompany[pair.Key] = pair.Value;
                rows.Add(withCompany);
            }
            if (result.Truncated) { truncated = true; break; }
        }
        columns ??= [];
        if (multiCompany) columns = [new ReportColumn(CompanyColumnCode, "Firma", "text"), .. columns];
        return new CustomSqlResult(columns, rows, truncated);
    }

    /// DbDataReader'dan en fazla maxRows satır okur; sütun kodlarını benzersizleştirir. Saf, birim test edilebilir.
    internal static async Task<CustomSqlResult> ReadAsync(DbDataReader reader, int maxRows, CancellationToken ct)
    {
        var columns = DescribeColumns(reader);
        var rows = new List<IReadOnlyDictionary<string, object?>>();
        var truncated = false;
        while (await reader.ReadAsync(ct))
        {
            if (rows.Count >= maxRows) { truncated = true; break; }
            var row = new Dictionary<string, object?>(columns.Count, StringComparer.Ordinal);
            // SequentialAccess: her sıra numarası bir kez ve artan sırayla okunur.
            for (var ordinal = 0; ordinal < columns.Count; ordinal++)
                row[columns[ordinal].Code] = ConvertValue(await reader.IsDBNullAsync(ordinal, ct) ? null : reader.GetValue(ordinal));
            rows.Add(row);
        }
        return new CustomSqlResult(columns, rows, truncated);
    }

    internal static IReadOnlyList<ReportColumn> DescribeColumns(DbDataReader reader)
    {
        // "companyName" çok firmalı raporda başa eklenen sütun için ayrılmıştır.
        var used = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { CompanyColumnCode };
        var columns = new List<ReportColumn>(reader.FieldCount);
        for (var ordinal = 0; ordinal < reader.FieldCount; ordinal++)
        {
            var name = reader.GetName(ordinal);
            var baseName = string.IsNullOrWhiteSpace(name) ? $"Sütun {ordinal + 1}" : name;
            var code = baseName;
            for (var n = 2; !used.Add(code); n++) code = $"{baseName} ({n})";
            columns.Add(new ReportColumn(code, code, ReportType(reader.GetFieldType(ordinal))));
        }
        return columns;
    }

    private static object? ConvertValue(object? value) => value switch
    {
        null or DBNull => null,
        byte[] => "[ikili veri]",
        _ => value
    };

    private static string ReportType(Type? type)
    {
        type = type is null ? null : Nullable.GetUnderlyingType(type) ?? type;
        if (type == typeof(byte) || type == typeof(sbyte) || type == typeof(short) || type == typeof(ushort)
            || type == typeof(int) || type == typeof(uint) || type == typeof(long) || type == typeof(ulong)) return "number";
        if (type == typeof(decimal) || type == typeof(float) || type == typeof(double)) return "decimal";
        if (type == typeof(DateTime) || type == typeof(DateTimeOffset) || type == typeof(DateOnly)) return "date";
        if (type == typeof(bool)) return "boolean";
        return "text";
    }

    private static bool SameShape(IReadOnlyList<ReportColumn> left, IReadOnlyList<ReportColumn> right) =>
        left.Count == right.Count && left.Zip(right).All(pair =>
            string.Equals(pair.First.Code, pair.Second.Code, StringComparison.Ordinal) && pair.First.DataType == pair.Second.DataType);

    /// SQL/erişim hatalarını kullanıcıya gösterilecek sonuca çevirir; eşleşmeyen hatalar için null döner.
    internal static IResult? MapError(Exception exception) => exception switch
    {
        SqlException { Number: -2 } => Results.ValidationProblem(new Dictionary<string, string[]> { ["sqlQuery"] = ["Sorgu 30 saniye içinde tamamlanmadı."] }),
        SqlException sqlException => Results.ValidationProblem(new Dictionary<string, string[]> { ["sqlQuery"] = [$"SQL hatası: {sqlException.Message}"] }),
        CustomSqlColumnMismatchException mismatch => Results.ValidationProblem(new Dictionary<string, string[]> { ["sqlQuery"] = [mismatch.Message] }),
        TenantQueryUnavailableException unavailable => Results.Problem(unavailable.Message, statusCode: StatusCodes.Status503ServiceUnavailable),
        _ => null
    };
}
