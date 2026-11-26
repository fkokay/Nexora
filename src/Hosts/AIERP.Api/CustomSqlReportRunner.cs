using System.Data;
using System.Data.Common;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

internal sealed record CustomSqlResult(IReadOnlyList<ReportColumn> Columns, IReadOnlyList<IReadOnlyDictionary<string, object?>> Rows, bool Truncated);

/// <summary>Seçilen firmalar sorgu için farklı sütun kümesi döndürdüğünde atılır.</summary>
internal sealed class CustomSqlColumnMismatchException() : Exception("Seçilen firmalarda sorgu farklı sütunlar döndürdü.");

/// <summary>Tüm firmalardaki sorgular toplam süre sınırını aştığında atılır.</summary>
internal sealed class CustomSqlDeadlineExceededException() : Exception("Sorgular toplam 60 saniye içinde tamamlanmadı.");

/// <summary>Bir istekteki tüm hücreler için ortak karakter bütçesi; firmalar arasında paylaşılır.</summary>
internal sealed class CustomSqlCharacterBudget(long totalCharacters)
{
    public long Remaining { get; private set; } = totalCharacters;

    public bool TryConsume(long characters)
    {
        if (characters > Remaining) { Remaining = 0; return false; }
        Remaining -= characters;
        return true;
    }
}

/// <summary>
/// Yöneticinin yazdığı SQL raporunu her firmanın salt okunur sorgu bağlantısıyla çalıştırır.
/// Koruma üç katmanlıdır: metin doğrulayıcı (yazma, kilit, dış kaynak, sistem kataloğu/veritabanı adı fonksiyonları
/// ve başka veritabanı adlarını reddeder), veritabanı yetkileri (okuma login'i yalnız kendi veritabanında
/// db_datareader) ve DBA'nın sunucu düzeyinde uyguladığı DENY VIEW ANY DATABASE / xp_* DENY adımı
/// (docs/tenant-query-credentials.md). Login'in veritabanı yetkileri tek başına sunucu meta verisini gizlemez.
/// </summary>
internal static partial class CustomSqlReportRunner
{
    internal const int CommandTimeoutSeconds = 30;
    internal const int MaxRows = 5000;
    internal const int MaxPageSize = 500;
    internal const int MaxCellCharacters = 4000;
    internal const long MaxResponseCharacters = 10_000_000;
    internal const string CompanyColumnCode = "companyName";
    internal const string BinaryPlaceholder = "[ikili veri]";
    internal const string UnsupportedPlaceholder = "[desteklenmeyen veri]";
    internal static readonly TimeSpan TotalTimeout = TimeSpan.FromSeconds(60);
    // Metin dışı (sayı, tarih, Guid...) hücreler için yaklaşık karakter maliyeti.
    private const int ScalarCellCost = 32;

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

    /// <summary>
    /// Denetim kayıtlarını yönlendirir. Çağıranın kiracı veritabanına yalnız çağıran kiracı için TEK satır eklenir:
    /// kiracı veritabanında başka TenantId'li satır ayrım doğrulamasını (TenantDatabaseSeparationVerifier) bozar ve
    /// denetim tablosu yalnız eklemeli olduğundan bu satır sonradan silinemez. Firma başına okuma izi PlatformDB
    /// denetim tablosuna TenantId = firma olarak eklenir. Sorgu metni hiçbir yere yazılmaz; yalnız uzunluğu kaydedilir.
    /// </summary>
    internal static void AddAuditEvents(TenantDbContext tenantDb, PlatformDbContext platformDb, Guid callerTenantId, Guid userId,
        IReadOnlyList<(Guid TenantId, string CompanyName)> companies, bool export, int sqlLength, int rowCount)
    {
        var action = export ? "erp.report.exported" : "erp.report.executed";
        tenantDb.AuditEvents.Add(new AuditEvent
        {
            TenantId = callerTenantId, UserId = userId, Action = action,
            Resource = $"customSql:companies={companies.Count}:sqlLength={sqlLength}:rows={rowCount}"
        });
        foreach (var company in companies)
            platformDb.AuditEvents.Add(new AuditEvent
            {
                TenantId = company.TenantId, UserId = userId, Action = action,
                Resource = $"customSql:callerTenant={callerTenantId:N}:sqlLength={sqlLength}:rows={rowCount}"
            });
    }

    internal static async Task<CustomSqlResult> ExecuteAsync(string sql,
        IReadOnlyList<(Guid TenantId, string CompanyName)> companies, ITenantQueryConnectionFactory factory, CancellationToken ct,
        TimeSpan? totalTimeout = null)
    {
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(ct);
        deadline.CancelAfter(totalTimeout ?? TotalTimeout);
        try
        {
            return await ExecuteCoreAsync(sql, companies, factory, deadline.Token);
        }
        catch (Exception exception) when (deadline.IsCancellationRequested && !ct.IsCancellationRequested
            && exception is not CustomSqlColumnMismatchException)
        {
            // SqlClient belirteç iptalini SqlException, fabrika ise TenantQueryUnavailableException olarak
            // yüzeye çıkarabilir; toplam süre dolduysa tür ne olursa olsun süre hatasına çevrilir.
            throw new CustomSqlDeadlineExceededException();
        }
    }

    /// <summary>
    /// Runs one parameterized read query in a single tenant with the same limits as SQL reports: read login only,
    /// 30 s command timeout, 5 000 rows (or fewer, <paramref name="maxRows"/>), 4 000 characters per cell, 10 000 000 characters per response and a 60 s
    /// total deadline. Parameter values are sent only as SqlParameters; the SQL text is never altered.
    /// </summary>
    internal static async Task<CustomSqlResult> ExecuteSingleAsync(string sql, IReadOnlyList<SqlParameter> parameters, Guid tenantId,
        ITenantQueryConnectionFactory factory, CancellationToken ct, int maxRows = MaxRows)
    {
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(ct);
        deadline.CancelAfter(TotalTimeout);
        try
        {
            await using var connection = await factory.OpenAsync(tenantId, TenantQueryAccess.Read, deadline.Token);
            await using var command = connection.CreateCommand();
            command.CommandType = CommandType.Text;
            command.CommandText = sql;
            command.CommandTimeout = CommandTimeoutSeconds;
            foreach (var parameter in parameters) command.Parameters.Add(parameter);
            return await ExecuteCommandAsync(command, Math.Clamp(maxRows, 1, MaxRows), new CustomSqlCharacterBudget(MaxResponseCharacters), deadline.Token);
        }
        catch (Exception exception) when (deadline.IsCancellationRequested && !ct.IsCancellationRequested)
        {
            throw new CustomSqlDeadlineExceededException();
        }
    }

    /// <summary>
    /// Runs one parameterized page write query in a single tenant through the write login, inside a ReadCommitted
    /// transaction with a 30 s command timeout and the 60 s total deadline. Commits on success and returns the affected
    /// row count; any failure rolls the transaction back and is rethrown for <see cref="MapError"/>.
    /// </summary>
    internal static async Task<int> ExecuteWriteAsync(string sql, IReadOnlyList<SqlParameter> parameters, Guid tenantId,
        ITenantQueryConnectionFactory factory, CancellationToken ct)
    {
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(ct);
        deadline.CancelAfter(TotalTimeout);
        try
        {
            await using var connection = await factory.OpenAsync(tenantId, TenantQueryAccess.Write, deadline.Token);
            await using var transaction = await connection.BeginTransactionAsync(IsolationLevel.ReadCommitted, deadline.Token);
            try
            {
                await using var command = connection.CreateCommand();
                command.Transaction = (SqlTransaction)transaction;
                command.CommandType = CommandType.Text;
                command.CommandText = sql;
                command.CommandTimeout = CommandTimeoutSeconds;
                foreach (var parameter in parameters) command.Parameters.Add(parameter);
                var affected = await command.ExecuteNonQueryAsync(deadline.Token);
                // Not cancellable: once the statement succeeded the outcome must be decided, not abandoned.
                await transaction.CommitAsync(CancellationToken.None);
                return affected;
            }
            catch
            {
                await RollbackQuietlyAsync(transaction);
                throw;
            }
        }
        catch (Exception exception) when (deadline.IsCancellationRequested && !ct.IsCancellationRequested
            && exception is not CustomSqlDeadlineExceededException)
        {
            throw new CustomSqlDeadlineExceededException();
        }
    }

    private static async Task RollbackQuietlyAsync(DbTransaction transaction)
    {
        // SQL Server may already have rolled back (e.g. after a severe error); the original exception matters more.
        try { await transaction.RollbackAsync(CancellationToken.None); }
        catch (Exception exception) when (exception is DbException or InvalidOperationException) { }
    }

    private static async Task<CustomSqlResult> ExecuteCoreAsync(string sql,
        IReadOnlyList<(Guid TenantId, string CompanyName)> companies, ITenantQueryConnectionFactory factory, CancellationToken ct)
    {
        var multiCompany = companies.Count > 1;
        IReadOnlyList<ReportColumn>? columns = null;
        var rows = new List<IReadOnlyDictionary<string, object?>>();
        var truncated = false;
        // Toplam karakter bütçesi tüm firmalar arasında paylaşılır.
        var budget = new CustomSqlCharacterBudget(MaxResponseCharacters);
        for (var index = 0; index < companies.Count; index++)
        {
            var remaining = MaxRows - rows.Count;
            if (remaining <= 0 || budget.Remaining <= 0) { truncated = true; break; }
            var company = companies[index];
            await using var connection = await factory.OpenAsync(company.TenantId, TenantQueryAccess.Read, ct);
            await using var command = connection.CreateCommand();
            command.CommandType = CommandType.Text;
            command.CommandText = sql;
            command.CommandTimeout = CommandTimeoutSeconds;
            var result = await ExecuteCommandAsync(command, remaining, budget, ct);
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

    /// <summary>
    /// Komutu çalıştırıp okur. Okuma tamamlanmadan çıkılıyorsa (satır/karakter sınırı ya da hata) okuyucu kapatılmadan
    /// önce command.Cancel() çağrılır; böylece sonuç kümesinin kalanı sunucudan boşaltılmaz.
    /// </summary>
    internal static async Task<CustomSqlResult> ExecuteCommandAsync(DbCommand command, int maxRows, CustomSqlCharacterBudget budget,
        CancellationToken ct)
    {
        await using var reader = await command.ExecuteReaderAsync(CommandBehavior.SequentialAccess, ct);
        var completed = false;
        try
        {
            var result = await ReadAsync(reader, maxRows, ct, budget);
            completed = !result.Truncated;
            return result;
        }
        finally
        {
            if (!completed) CancelQuietly(command);
        }
    }

    private static void CancelQuietly(DbCommand command)
    {
        try { command.Cancel(); }
        catch (Exception exception) when (exception is DbException or InvalidOperationException) { }
    }

    /// DbDataReader'dan en fazla maxRows satır okur; sütun kodlarını benzersizleştirir; hücre başına
    /// MaxCellCharacters ve toplam karakter bütçesini uygular. Saf, birim test edilebilir.
    internal static async Task<CustomSqlResult> ReadAsync(DbDataReader reader, int maxRows, CancellationToken ct,
        CustomSqlCharacterBudget? budget = null)
    {
        budget ??= new CustomSqlCharacterBudget(MaxResponseCharacters);
        var columns = DescribeColumns(reader);
        var kinds = new CellKind[columns.Count];
        for (var ordinal = 0; ordinal < columns.Count; ordinal++) kinds[ordinal] = KindOf(TryGetFieldType(reader, ordinal));
        var rows = new List<IReadOnlyDictionary<string, object?>>();
        var truncated = false;
        var buffer = new char[MaxCellCharacters + 1];
        while (await reader.ReadAsync(ct))
        {
            if (rows.Count >= maxRows) { truncated = true; break; }
            var row = new Dictionary<string, object?>(columns.Count, StringComparer.Ordinal);
            // SequentialAccess: her sıra numarası bir kez ve artan sırayla okunur.
            for (var ordinal = 0; ordinal < columns.Count && !truncated; ordinal++)
            {
                var (value, cost) = await ReadCellAsync(reader, ordinal, kinds[ordinal], buffer, ct);
                if (budget.TryConsume(cost)) row[columns[ordinal].Code] = value;
                else truncated = true;
            }
            // Bütçe satırın ortasında biterse eksik satır döndürülmez.
            if (truncated) break;
            rows.Add(row);
        }
        return new CustomSqlResult(columns, rows, truncated);
    }

    private enum CellKind { Text, Binary, Scalar, Other, Unsupported }

    private static async Task<(object? Value, long Cost)> ReadCellAsync(DbDataReader reader, int ordinal, CellKind kind,
        char[] buffer, CancellationToken ct)
    {
        try
        {
            if (await reader.IsDBNullAsync(ordinal, ct)) return (null, 1);
            switch (kind)
            {
                case CellKind.Binary:
                    // İkili veri hiç okunmaz.
                    return (BinaryPlaceholder, BinaryPlaceholder.Length);
                case CellKind.Unsupported:
                    return (UnsupportedPlaceholder, UnsupportedPlaceholder.Length);
                case CellKind.Text:
                {
                    // En fazla MaxCellCharacters + 1 karakter okunur; büyük (max) değerler belleğe alınmaz.
                    using var text = reader.GetTextReader(ordinal);
                    var read = await text.ReadBlockAsync(buffer.AsMemory(), ct);
                    var value = read > MaxCellCharacters ? new string(buffer, 0, MaxCellCharacters) + "…" : new string(buffer, 0, read);
                    return (value, value.Length);
                }
                case CellKind.Scalar:
                    return (reader.GetValue(ordinal), ScalarCellCost);
                default:
                {
                    // sql_variant (typeof(object)) vb.: değer değişmez kültürle metne çevrilir ve sınırlanır.
                    var value = reader.GetValue(ordinal) switch
                    {
                        null or DBNull => null,
                        byte[] => BinaryPlaceholder,
                        var other => Convert.ToString(other, System.Globalization.CultureInfo.InvariantCulture) ?? ""
                    };
                    if (value is null) return (null, 1);
                    if (value.Length > MaxCellCharacters) value = value[..MaxCellCharacters] + "…";
                    return (value, value.Length);
                }
            }
        }
        catch (Exception exception) when (exception is not (DbException or OperationCanceledException))
        {
            // UDT/geography gibi istemcinin çözemediği türler 500 yerine yer tutucu olarak döner.
            return (UnsupportedPlaceholder, UnsupportedPlaceholder.Length);
        }
    }

    private static CellKind KindOf(Type? type)
    {
        if (type is null) return CellKind.Unsupported;
        type = Nullable.GetUnderlyingType(type) ?? type;
        if (type == typeof(string) || type == typeof(char[])) return CellKind.Text;
        if (type == typeof(byte[])) return CellKind.Binary;
        if (type.IsPrimitive || type == typeof(decimal) || type == typeof(DateTime) || type == typeof(DateTimeOffset)
            || type == typeof(DateOnly) || type == typeof(TimeOnly) || type == typeof(TimeSpan) || type == typeof(Guid)) return CellKind.Scalar;
        return CellKind.Other;
    }

    private static Type? TryGetFieldType(DbDataReader reader, int ordinal)
    {
        // UDT (ör. geography) derlemesi yüklenemezse GetFieldType atabilir; sütun metin olarak raporlanır.
        try { return reader.GetFieldType(ordinal); }
        catch (Exception exception) when (exception is not (DbException or OperationCanceledException)) { return null; }
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
            columns.Add(new ReportColumn(code, code, ReportType(TryGetFieldType(reader, ordinal))));
        }
        return columns;
    }

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
        CustomSqlDeadlineExceededException deadline => Results.ValidationProblem(new Dictionary<string, string[]> { ["sqlQuery"] = [deadline.Message] }),
        SqlException { Number: -2 } => Results.ValidationProblem(new Dictionary<string, string[]> { ["sqlQuery"] = ["Sorgu 30 saniye içinde tamamlanmadı."] }),
        SqlException sqlException => Results.ValidationProblem(new Dictionary<string, string[]> { ["sqlQuery"] = [$"SQL hatası: {sqlException.Message}"] }),
        CustomSqlColumnMismatchException mismatch => Results.ValidationProblem(new Dictionary<string, string[]> { ["sqlQuery"] = [mismatch.Message] }),
        TenantQueryUnavailableException unavailable => Results.Problem(unavailable.Message, statusCode: StatusCodes.Status503ServiceUnavailable),
        _ => null
    };
}
