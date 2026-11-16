using System.Data;
using System.Globalization;
using System.Security.Claims;
using System.Text.Json;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using System.Threading.RateLimiting;

public sealed record CustomPageQueryRunRequest(Dictionary<string, JsonElement>? Parameters);
public sealed record CustomPageQueryRunResult(IReadOnlyList<ReportColumn> Columns, IReadOnlyList<IReadOnlyDictionary<string, object?>> Rows, int RowCount, bool Truncated);

/// <summary>Converts client-supplied values to typed SQL parameters for a query declared in a page definition.</summary>
internal static class CustomPageQueryParameters
{
    internal const int MaxTextLength = 4000;

    /// Gelen değerleri tanımlı türlere çevirir; ad kümesi birebir eşleşmeli. Hata: (null, "Türkçe mesaj").
    internal static (IReadOnlyList<SqlParameter>? Parameters, string? Error) Build(IReadOnlyList<PageQueryParameter> declared,
        IReadOnlyDictionary<string, JsonElement>? supplied)
    {
        supplied ??= new Dictionary<string, JsonElement>();
        var declaredNames = declared.Select(x => x.Name).ToHashSet(StringComparer.Ordinal);
        if (supplied.Keys.FirstOrDefault(name => !declaredNames.Contains(name)) is { } extra)
            return (null, $"'{Truncate(extra)}' parametresi bu sorguda tanımlı değil.");
        var parameters = new List<SqlParameter>(declared.Count);
        foreach (var parameter in declared)
        {
            if (!supplied.TryGetValue(parameter.Name, out var value)) return (null, $"'{parameter.Name}' parametresi eksik.");
            var converted = Convert(parameter, value);
            if (converted is null) return (null, TypeError(parameter));
            parameters.Add(converted);
        }
        return (parameters, null);
    }

    private static SqlParameter? Convert(PageQueryParameter parameter, JsonElement value)
    {
        var name = "@" + parameter.Name;
        var isNull = value.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined;
        switch (parameter.Type)
        {
            case "text":
                if (isNull) return Parameter(name, SqlDbType.NVarChar, DBNull.Value, size: MaxTextLength);
                // Longer values would be silently truncated by a sized NVarChar(4000) parameter.
                if (value.ValueKind != JsonValueKind.String || value.GetString()!.Length > MaxTextLength) return null;
                return Parameter(name, SqlDbType.NVarChar, value.GetString()!, size: MaxTextLength);
            case "int":
                if (isNull) return Parameter(name, SqlDbType.Int, DBNull.Value);
                if (value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out var number)) return Parameter(name, SqlDbType.Int, number);
                if (value.ValueKind == JsonValueKind.String && int.TryParse(value.GetString(), NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture, out number))
                    return Parameter(name, SqlDbType.Int, number);
                return null;
            case "decimal":
                if (isNull) return Parameter(name, SqlDbType.Decimal, DBNull.Value, precision: 38, scale: 10);
                if (value.ValueKind == JsonValueKind.Number && value.TryGetDecimal(out var amount)) return Parameter(name, SqlDbType.Decimal, amount, precision: 38, scale: 10);
                if (value.ValueKind == JsonValueKind.String && decimal.TryParse(value.GetString(), NumberStyles.AllowLeadingSign | NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out amount))
                    return Parameter(name, SqlDbType.Decimal, amount, precision: 38, scale: 10);
                return null;
            case "date":
                if (isNull) return Parameter(name, SqlDbType.Date, DBNull.Value);
                if (value.ValueKind == JsonValueKind.String
                    && DateOnly.TryParseExact(value.GetString(), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date))
                    return Parameter(name, SqlDbType.Date, date.ToDateTime(TimeOnly.MinValue));
                return null;
            case "bool":
                if (isNull) return Parameter(name, SqlDbType.Bit, DBNull.Value);
                return value.ValueKind is JsonValueKind.True or JsonValueKind.False ? Parameter(name, SqlDbType.Bit, value.GetBoolean()) : null;
            case "guid":
                if (isNull) return Parameter(name, SqlDbType.UniqueIdentifier, DBNull.Value);
                return value.ValueKind == JsonValueKind.String && Guid.TryParse(value.GetString(), out var guid)
                    ? Parameter(name, SqlDbType.UniqueIdentifier, guid) : null;
            default:
                return null;
        }
    }

    private static SqlParameter Parameter(string name, SqlDbType type, object value, int size = 0, byte precision = 0, byte scale = 0)
    {
        var parameter = new SqlParameter(name, type) { Value = value, Direction = ParameterDirection.Input };
        if (size > 0) parameter.Size = size;
        if (precision > 0) { parameter.Precision = precision; parameter.Scale = scale; }
        return parameter;
    }

    private static string TypeError(PageQueryParameter parameter) => parameter.Type switch
    {
        "text" => $"'{parameter.Name}' parametresi en fazla {MaxTextLength} karakterlik metin olmalı.",
        "int" => $"'{parameter.Name}' parametresi tam sayı olmalı.",
        "decimal" => $"'{parameter.Name}' parametresi ondalık sayı olmalı.",
        "date" => $"'{parameter.Name}' parametresi YYYY-AA-GG biçiminde tarih olmalı.",
        "bool" => $"'{parameter.Name}' parametresi true/false olmalı.",
        "guid" => $"'{parameter.Name}' parametresi GUID olmalı.",
        _ => $"'{parameter.Name}' parametresi {parameter.Type} olmalı."
    };

    private static string Truncate(string value) => value.Length <= 64 ? value : value[..64] + "…";
}

/// <summary>
/// Runs read queries declared in custom page definitions. The SQL always comes from the stored definition (published at
/// runtime, the draft in preview); the client only sends parameter values, which travel as typed SqlParameters.
/// </summary>
internal static class CustomPageQueryEndpoints
{
    internal const string RateLimitPolicy = "custom-page-query";
    private const int MaxAuditResourceLength = 240;

    internal static void ConfigureRateLimiting(RateLimiterOptions options) =>
        options.AddPolicy(RateLimitPolicy, context => RateLimitPartition.GetFixedWindowLimiter(
            context.User.FindFirstValue("sub") ?? context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions { PermitLimit = 60, Window = TimeSpan.FromMinutes(1), QueueLimit = 0, AutoReplenishment = true }));

    public static void MapCustomPageQueryEndpoints(this WebApplication app)
    {
        var pages = app.MapGroup("/api/custom-pages").WithTags("Tenant Custom Pages").RequireAuthorization();

        pages.MapPost("/{code}/queries/{queryId}/run", async (string code, string queryId, CustomPageQueryRunRequest? request,
            ClaimsPrincipal user, TenantDbContext db, PlatformDbContext platformDb, IPlatformPermissionAuthorizer auth,
            HttpContext http, CancellationToken ct) =>
        {
            if (!TryContext(user, out var tenant, out var userId, out var role) || !await ReadAllowedAsync(auth, tenant, userId, role, ct)) return Results.Forbid();
            var page = await db.TenantCustomPages.AsNoTracking().Where(x => x.TenantId == tenant && x.Code == code && x.IsPublished)
                .Select(x => new { x.Code, x.DefinitionJson }).SingleOrDefaultAsync(ct);
            if (page is null) return Results.NotFound();
            // Rights first (keyed by the stored code), so a user without View cannot probe query ids.
            if (!(await CustomPageAccess.GetRightsAsync(platformDb, tenant, page.Code, TenantCustomPageQueries.HasQueries(page.DefinitionJson), userId, role, ct)).View)
                return Results.Json(new { error = "Bu sayfayı görüntüleme yetkiniz yok." }, statusCode: StatusCodes.Status403Forbidden);
            return await RunAsync(page.Code, page.DefinitionJson, queryId, request, tenant, userId, "custom-page.query.run", platformDb, http, ct);
        }).RequireRateLimiting(RateLimitPolicy);

        pages.MapPost("/{id:guid}/preview/queries/{queryId}/run", async (Guid id, string queryId, CustomPageQueryRunRequest? request,
            ClaimsPrincipal user, TenantDbContext db, PlatformDbContext platformDb, HttpContext http, CancellationToken ct) =>
        {
            if (await CustomPageAccessEndpoints.AdminContextAsync(user, platformDb, ct) is not var (tenant, userId)) return Results.Forbid();
            var draft = await db.TenantCustomPages.AsNoTracking().Where(x => x.TenantId == tenant && x.Id == id && !x.IsPublished && !x.IsArchived)
                .Select(x => new { x.Code, x.DefinitionJson }).SingleOrDefaultAsync(ct);
            if (draft is null) return Results.NotFound();
            return await RunAsync(draft.Code, draft.DefinitionJson, queryId, request, tenant, userId, "custom-page.query.preview", platformDb, http, ct);
        }).RequireRateLimiting(RateLimitPolicy);
    }

    private static async Task<IResult> RunAsync(string pageCode, string definitionJson, string queryId, CustomPageQueryRunRequest? request,
        Guid tenant, Guid userId, string auditAction, PlatformDbContext platformDb, HttpContext http, CancellationToken ct)
    {
        var query = TenantCustomPageQueries.ReadQueries(definitionJson).FirstOrDefault(x => string.Equals(x.Id, queryId, StringComparison.Ordinal));
        if (query is null || query.Kind != "read") return Results.NotFound(new { error = "Sorgu bu sayfada bulunamadı." });
        var (parameters, error) = CustomPageQueryParameters.Build(query.Parameters, request?.Parameters);
        if (parameters is null) return Results.BadRequest(new { error });
        // The connection factory is resolved only after every authorization and validation check has passed.
        var factory = http.RequestServices.GetRequiredService<ITenantQueryConnectionFactory>();
        CustomSqlResult result;
        try
        {
            result = await CustomSqlReportRunner.ExecuteSingleAsync(query.Sql, parameters, tenant, factory, ct);
        }
        catch (Exception exception) when (CustomSqlReportRunner.MapError(exception) is not null)
        {
            return CustomSqlReportRunner.MapError(exception)!;
        }
        // Parameter values may hold personal data and are not audited; only their names are.
        var resource = $"{pageCode}:{query.Name}:rows={result.Rows.Count}:params={string.Join(',', query.Parameters.Select(x => x.Name))}";
        if (resource.Length > MaxAuditResourceLength) resource = resource[..MaxAuditResourceLength];
        platformDb.AuditEvents.Add(new AuditEvent { TenantId = tenant, UserId = userId, Action = auditAction, Resource = resource });
        await platformDb.SaveChangesAsync(ct);
        return Results.Ok(new CustomPageQueryRunResult(result.Columns, result.Rows, result.Rows.Count, result.Truncated));
    }

    private static bool TryContext(ClaimsPrincipal user, out Guid tenant, out Guid userId, out string role)
    { tenant = default; userId = default; role = user.FindFirstValue("role") ?? ""; return Guid.TryParse(user.FindFirstValue("tenant_id"), out tenant) && Guid.TryParse(user.FindFirstValue("sub"), out userId) && role.Length > 0; }

    /// <summary>Runtime query execution uses the same permission as opening a published page from navigation.</summary>
    private static async Task<bool> ReadAllowedAsync(IPlatformPermissionAuthorizer auth, Guid tenant, Guid userId, string role, CancellationToken ct)
    {
        var definition = PlatformPermissionCatalog.Definitions.FirstOrDefault(x => x.ResourceType == "erp.custom-menus" && x.Action == "read");
        if (definition is null) return false;
        var attributes = new Dictionary<string, string> { ["subject.userId"] = userId.ToString("D"), ["subject.role"] = role, ["resource.type"] = definition.ResourceType, ["resource.tenantId"] = tenant.ToString("D"), ["request.action"] = "read" };
        return await auth.IsAllowedAsync(tenant, userId, role, new ResolvedPlatformPermission(definition, attributes), ct);
    }
}
