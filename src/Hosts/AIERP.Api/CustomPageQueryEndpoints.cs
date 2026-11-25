using System.Data;
using System.Globalization;
using System.Security.Claims;
using System.Text.Encodings.Web;
using System.Text.Json;
using AIERP.Api;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using System.Threading.RateLimiting;

/// <param name="ConfirmWrite">Preview only: a write query runs in preview only when this is true.</param>
public sealed record CustomPageQueryRunRequest(Dictionary<string, JsonElement>? Parameters, bool ConfirmWrite = false);
public sealed record CustomPageQueryRunResult(IReadOnlyList<ReportColumn> Columns, IReadOnlyList<IReadOnlyDictionary<string, object?>> Rows, int RowCount, bool Truncated);
public sealed record CustomPageWriteResult(int AffectedRows);
/// <summary>The caller's rights on a served page, so the runtime can hide actions it may not run.</summary>
public sealed record CustomPageRightsView(bool View, bool Insert, bool Update, bool Delete)
{
    internal static CustomPageRightsView From(CustomPageRights rights) => new(rights.View, rights.Insert, rights.Update, rights.Delete);
}

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

    /// <summary>
    /// The supplied values with every session-bound parameter (binding root <c>kullanici</c> or <c>bugun</c>) replaced by the
    /// server's value. A client value for such a parameter is ignored and may be omitted.
    /// </summary>
    internal static Dictionary<string, JsonElement> WithSessionValues(IReadOnlyList<PageQueryParameter> declared,
        IReadOnlyDictionary<string, JsonElement>? supplied, CustomPageSession session)
    {
        var values = supplied is null ? new Dictionary<string, JsonElement>(StringComparer.Ordinal) : new Dictionary<string, JsonElement>(supplied, StringComparer.Ordinal);
        foreach (var parameter in declared)
            if (SessionValue(parameter.Binding, session, out var value)) values[parameter.Name] = value;
        return values;
    }

    /// <summary>
    /// True when the binding is a session variable: <c>kullanici.id</c> (sub claim), <c>kullanici.ad</c> (name claim, empty when
    /// absent) or <c>bugun</c> (server UTC date, YYYY-MM-DD). Any other path under these roots binds to null.
    /// </summary>
    private static bool SessionValue(string binding, CustomPageSession session, out JsonElement value)
    {
        value = default;
        if (!TenantCustomPageQueries.TryParseBinding(binding, out var path)) return false;
        var root = TenantCustomPageQueries.RootOf(path);
        if (!TenantCustomPageQueries.ReservedNames.Contains(root)) return false;
        string? text = path.ToLowerInvariant() switch
        {
            "kullanici.id" => session.UserId,
            "kullanici.ad" => session.DisplayName,
            "bugun" => session.Today,
            _ => null
        };
        value = JsonSerializer.SerializeToElement(text);
        return true;
    }
}

/// <summary>Server-side values of the page session variables, taken from the verified claims and the server clock.</summary>
internal sealed record CustomPageSession(string UserId, string DisplayName, string Today)
{
    internal static CustomPageSession From(ClaimsPrincipal user) => new(user.FindFirstValue("sub") ?? "", user.FindFirstValue("name") ?? "",
        DateOnly.FromDateTime(DateTime.UtcNow).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture));
}

/// <summary>
/// Runs one validated, parameterized read query in a tenant. Registered only by tests (in-process hosts have no SQL Server);
/// when no implementation is registered the runtime uses <see cref="CustomSqlReportRunner.ExecuteSingleAsync"/> with the
/// tenant query connection factory.
/// </summary>
internal interface ICustomPageReadExecutor
{
    Task<CustomSqlResult> ExecuteAsync(string sql, IReadOnlyList<SqlParameter> parameters, Guid tenant, CancellationToken ct);
}

/// <summary>Write runs (published and preview) share one budget of 60 per user per minute, on top of the route limits.</summary>
internal sealed class CustomPageWriteRateLimiter : IDisposable
{
    internal const int PermitsPerMinute = 60;
    private readonly PartitionedRateLimiter<string> limiter = PartitionedRateLimiter.Create<string, string>(key =>
        RateLimitPartition.GetFixedWindowLimiter(key, _ => new FixedWindowRateLimiterOptions
        { PermitLimit = PermitsPerMinute, Window = TimeSpan.FromMinutes(1), QueueLimit = 0, AutoReplenishment = true }));

    internal RateLimitLease Acquire(Guid userId) => limiter.AttemptAcquire(userId.ToString("D"));

    public void Dispose() => limiter.Dispose();
}

/// <summary>
/// Runs read queries declared in custom page definitions. The SQL always comes from the stored definition (published at
/// runtime, the draft in preview); the client only sends parameter values, which travel as typed SqlParameters.
/// </summary>
internal static class CustomPageQueryEndpoints
{
    internal const string RateLimitPolicy = "custom-page-query";
    internal const string PreviewRateLimitPolicy = "custom-page-query-preview";
    internal const int RunPermitsPerMinute = 300;
    internal const int PreviewPermitsPerMinute = 120;
    internal const string InvalidStoredSqlError = "Sorgu tanımı geçersiz; sayfayı yönetici yeniden kaydetmeli.";
    private const int MaxAuditResourceLength = 240;

    /// <summary>
    /// Runtime runs: 300 per user per minute (a page may hold 20 load queries that re-run as inputs change).
    /// Studio preview runs have their own budget of 120 per user per minute. Both are fixed windows keyed by the sub claim.
    /// Write runs (published and preview) additionally draw from <see cref="CustomPageWriteRateLimiter"/> (60 per user per
    /// minute), checked in the handler because the query kind is known only after the page definition is loaded.
    /// </summary>
    internal static void ConfigureRateLimiting(RateLimiterOptions options)
    {
        options.AddPolicy(RateLimitPolicy, context => PerUser(context, RunPermitsPerMinute));
        options.AddPolicy(PreviewRateLimitPolicy, context => PerUser(context, PreviewPermitsPerMinute));
    }

    private static RateLimitPartition<string> PerUser(HttpContext context, int permitsPerMinute) => RateLimitPartition.GetFixedWindowLimiter(
        context.User.FindFirstValue("sub") ?? context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = permitsPerMinute, Window = TimeSpan.FromMinutes(1), QueueLimit = 0, AutoReplenishment = true });

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
            var rights = await CustomPageAccess.GetRightsAsync(platformDb, tenant, page.Code, CustomPageAccess.RestrictsMembersWithoutRow(page.Code, page.DefinitionJson), userId, role, ct);
            if (!rights.View) return Results.Json(new { error = "Bu sayfayı görüntüleme yetkiniz yok." }, statusCode: StatusCodes.Status403Forbidden);
            return await RunAsync(page.Code, page.DefinitionJson, queryId, request, tenant, userId, rights, isPreview: false, db, platformDb, http, ct);
        }).RequireRateLimiting(RateLimitPolicy);

        pages.MapPost("/{id:guid}/preview/queries/{queryId}/run", async (Guid id, string queryId, CustomPageQueryRunRequest? request,
            ClaimsPrincipal user, TenantDbContext db, PlatformDbContext platformDb, HttpContext http, CancellationToken ct) =>
        {
            if (await CustomPageAccessEndpoints.AdminContextAsync(user, platformDb, ct) is not var (tenant, userId)) return Results.Forbid();
            var draft = await db.TenantCustomPages.AsNoTracking().Where(x => x.TenantId == tenant && x.Id == id && !x.IsPublished && !x.IsArchived)
                .Select(x => new { x.Code, x.DefinitionJson }).SingleOrDefaultAsync(ct);
            if (draft is null) return Results.NotFound();
            // Preview is limited to verified TenantAdmins, who hold every right on every page.
            return await RunAsync(draft.Code, draft.DefinitionJson, queryId, request, tenant, userId, CustomPageRights.All, isPreview: true, db, platformDb, http, ct);
        }).RequireRateLimiting(PreviewRateLimitPolicy);
    }

    internal const string ForbiddenWriteError = "Bu sayfada bu işlemi yapma yetkiniz yok.";
    internal const string OperationQueryRunError = "ERP işlemi sayfa üzerinden doğrudan çalıştırılır.";
    internal const string PreviewWriteConfirmationError = "Önizlemede yazan sorgu yalnız açık onayla çalışır.";
    internal const string CatalogItemChangedError = "Yapı taşı değişti; sayfayı yeniden yükleyin.";

    /// <summary>Kind-to-right mapping: read → View, insert → Insert, update → Update, delete → Delete.</summary>
    internal static bool Allows(CustomPageRights rights, string kind) => kind switch
    {
        "read" => rights.View,
        "insert" => rights.Insert,
        "update" => rights.Update,
        "delete" => rights.Delete,
        _ => false
    };

    /// <summary>
    /// Order of checks: query lookup → right for the query kind → (catalog reference) the active catalog item → parameters →
    /// (preview) write confirmation → re-validation of the SQL → connection. Nothing touches the tenant query connection
    /// before the last step. A catalog reference always runs the catalog item's SQL, never SQL stored on the page.
    /// </summary>
    private static async Task<IResult> RunAsync(string pageCode, string definitionJson, string queryId, CustomPageQueryRunRequest? request,
        Guid tenant, Guid userId, CustomPageRights rights, bool isPreview, TenantDbContext db, PlatformDbContext platformDb, HttpContext http, CancellationToken ct)
    {
        var query = TenantCustomPageQueries.ReadQueries(definitionJson).FirstOrDefault(x => string.Equals(x.Id, queryId, StringComparison.Ordinal));
        if (query is null || query.Kind is not ("read" or "insert" or "update" or "delete")) return Results.NotFound(new { error = "Sorgu bu sayfada bulunamadı." });
        if (!Allows(rights, query.Kind)) return Results.Json(new { error = ForbiddenWriteError }, statusCode: StatusCodes.Status403Forbidden);
        // ERP operation queries are called by the page runtime against their own endpoint with the user's token.
        if (query.Operation is not null) return Results.BadRequest(new { error = OperationQueryRunError });
        var sql = query.Sql;
        string? catalogReference = null;
        if ((query.DataSource ?? query.Action) is { } code)
        {
            var catalog = await TenantCatalogStore.ActiveReleaseAsync(db, tenant, ErpOperationCatalog.TryGet, ct);
            // An item kept only for SQL that today's validator rejects still resolves here, so it reaches the
            // re-validation below and is answered with InvalidStoredSqlError before any connection is opened.
            var item = catalog?.Bundle.FindForRun(code);
            if (item is null) return Results.NotFound(new { error = TenantCustomPageQueries.CatalogMissingPrefix + code });
            if (item.ErpOperation is not null) return Results.BadRequest(new { error = OperationQueryRunError });
            if (!TenantCatalogStore.Fits(item, query.DataSource is not null ? "dataSource" : "action", query))
                return Results.Conflict(new { error = CatalogItemChangedError });
            sql = item.Sql!;
            catalogReference = $"{code}@{catalog!.Version}";
        }
        // Session variables are bound from the verified claims, never from the request.
        var values = CustomPageQueryParameters.WithSessionValues(query.Parameters, request?.Parameters, CustomPageSession.From(http.User));
        var (parameters, error) = CustomPageQueryParameters.Build(query.Parameters, values);
        if (parameters is null) return Results.BadRequest(new { error });
        if (query.Kind != "read")
        {
            if (isPreview && request?.ConfirmWrite != true) return Results.BadRequest(new { error = PreviewWriteConfirmationError });
            return await RunWriteAsync(pageCode, query, sql, catalogReference, parameters, values, tenant, userId, isPreview, platformDb, http, ct);
        }
        var auditAction = isPreview ? "custom-page.query.preview" : "custom-page.query.run";
        // Stored definitions were validated on save, but the read-only rules may have tightened since; never run SQL
        // that today's validator would reject.
        if (!ReportEndpoints.TryValidateReadOnlySql(sql, out _)) return Results.BadRequest(new { error = InvalidStoredSqlError });
        // The connection factory is resolved only after every authorization and validation check has passed.
        var factory = http.RequestServices.GetRequiredService<ITenantQueryConnectionFactory>();
        CustomSqlResult result;
        try
        {
            result = await CustomSqlReportRunner.ExecuteSingleAsync(sql, parameters, tenant, factory, ct);
        }
        catch (Exception exception) when (CustomSqlReportRunner.MapError(exception) is not null)
        {
            return CustomSqlReportRunner.MapError(exception)!;
        }
        // Parameter values may hold personal data and are not audited; only their names are.
        // The catalog reference comes before the parameter names, so the length cap cannot cut it off.
        var catalogPart = catalogReference is null ? "" : $":catalog={catalogReference}";
        var resource = $"{pageCode}:{query.Name}{catalogPart}:rows={result.Rows.Count}:params={string.Join(',', query.Parameters.Select(x => x.Name))}";
        if (resource.Length > MaxAuditResourceLength) resource = resource[..MaxAuditResourceLength];
        platformDb.AuditEvents.Add(new AuditEvent { TenantId = tenant, UserId = userId, Action = auditAction, Resource = resource });
        await platformDb.SaveChangesAsync(ct);
        return Results.Ok(new CustomPageQueryRunResult(result.Columns, result.Rows, result.Rows.Count, result.Truncated));
    }

    internal const string SampleParamsAuditAction = "custom-page.query.preview";

    /// <summary>
    /// The designer canvas's sample record for a Kayıt kartı draft: <c>{ &lt;p&gt;: key }</c>, where <c>&lt;p&gt;</c> is the page
    /// parameter the record query reads (<c>{{sayfa.parametre.&lt;p&gt;}}</c>, found as the ERP runtime finds it) and the key is
    /// the first row's key column of the first active catalog data source that opens this page and needs no parameter but
    /// an optional <c>q</c> (run with <c>q = ""</c>). Empty for any other template, no such source, no row or any failure;
    /// never throws except for cancellation. The caller has already authorized the request like GET /preview.
    /// </summary>
    internal static async Task<Dictionary<string, string>> SampleParamsAsync(string pageCode, string definitionJson, Guid tenant, Guid userId,
        TenantDbContext db, PlatformDbContext platformDb, HttpContext http, CancellationToken ct)
    {
        var none = new Dictionary<string, string>(StringComparer.Ordinal);
        try
        {
            if (PageTemplateSummary.Read(definitionJson).Template != "record") return none;
            var param = RecordKeyParam(definitionJson);
            if (param is null) return none;
            var catalog = await TenantCatalogStore.ActiveReleaseAsync(db, tenant, ErpOperationCatalog.TryGet, ct);
            var item = catalog?.Bundle.Items.FirstOrDefault(x => x.ItemKind == "dataSource" && x.QueryKind == "read" && x.Sql is not null
                && string.Equals(x.Opens, pageCode, StringComparison.Ordinal) && x.Columns.Any(c => c.Key)
                && (x.Parameters.Count == 0 || x.Parameters is [{ Name: "q" }]));
            if (item is null) return none;
            if (!ReportEndpoints.TryValidateReadOnlySql(item.Sql!, out _)) return none;
            var declared = item.Parameters.Select(x => new PageQueryParameter(x.Name, "", x.Type)).ToList();
            var values = declared.ToDictionary(x => x.Name, _ => JsonSerializer.SerializeToElement(""), StringComparer.Ordinal);
            var (parameters, _) = CustomPageQueryParameters.Build(declared, values);
            if (parameters is null) return none;
            var executor = http.RequestServices.GetService<ICustomPageReadExecutor>();
            // The connection factory is resolved only after every check has passed.
            var result = executor is not null
                ? await executor.ExecuteAsync(item.Sql!, parameters, tenant, ct)
                : await CustomSqlReportRunner.ExecuteSingleAsync(item.Sql!, parameters, tenant, http.RequestServices.GetRequiredService<ITenantQueryConnectionFactory>(), ct);
            var resource = $"{pageCode}:sample-params:catalog={item.Code}@{catalog!.Version}:rows={result.Rows.Count}";
            if (resource.Length > MaxAuditResourceLength) resource = resource[..MaxAuditResourceLength];
            platformDb.AuditEvents.Add(new AuditEvent { TenantId = tenant, UserId = userId, Action = SampleParamsAuditAction, Resource = resource });
            await platformDb.SaveChangesAsync(ct);
            if (result.Rows.Count == 0) return none;
            var keyColumn = item.Columns.First(x => x.Key).Code;
            var row = result.Rows[0];
            var value = row.TryGetValue(keyColumn, out var exact) ? exact
                : row.FirstOrDefault(x => string.Equals(x.Key, keyColumn, StringComparison.OrdinalIgnoreCase)).Value;
            var text = value switch
            {
                null or DBNull => null,
                string s => s,
                Guid g => g.ToString("D"),
                DateTime d => d.ToString(d.TimeOfDay == TimeSpan.Zero ? "yyyy-MM-dd" : "O", CultureInfo.InvariantCulture),
                bool b => b ? "true" : "false",
                IFormattable f => f.ToString(null, CultureInfo.InvariantCulture),
                _ => value.ToString(),
            };
            if (string.IsNullOrWhiteSpace(text)) return none;
            none[param] = text;
            return none;
        }
        catch (Exception exception) when (!ct.IsCancellationRequested)
        {
            http.RequestServices.GetRequiredService<ILoggerFactory>().CreateLogger(typeof(CustomPageQueryEndpoints).FullName!)
                .LogWarning(exception, "Sample params for custom page {PageCode} of tenant {TenantId} could not be read.", pageCode, tenant);
            return new Dictionary<string, string>(StringComparer.Ordinal);
        }
    }

    /// <summary>
    /// The record page's key parameter, read as the ERP runtime's <c>recordKeyParam</c> reads it: the first section formCard's
    /// <c>recordKey</c> (<c>{{X.rows[0].k}}</c>) names query X (by name, then id), whose parameter bound to exactly
    /// <c>{{sayfa.parametre.&lt;p&gt;}}</c> gives <c>&lt;p&gt;</c>. Null when any step is missing.
    /// </summary>
    internal static string? RecordKeyParam(string definitionJson)
    {
        using var document = JsonDocument.Parse(definitionJson);
        if (!document.RootElement.TryGetProperty("components", out var components) || components.ValueKind != JsonValueKind.Array) return null;
        string? root = null;
        foreach (var component in components.EnumerateArray())
        {
            if (component.ValueKind != JsonValueKind.Object || !component.TryGetProperty("props", out var props) || props.ValueKind != JsonValueKind.Object) continue;
            if (!(component.TryGetProperty("type", out var type) && type.ValueKind == JsonValueKind.String && type.GetString() == "formCard")
                || !(props.TryGetProperty("slot", out var slot) && slot.ValueKind == JsonValueKind.String && slot.GetString() == "section")) continue;
            var key = props.TryGetProperty("recordKey", out var recordKey) && recordKey.ValueKind == JsonValueKind.String ? recordKey.GetString()! : "";
            root = RecordKeyRoot.Match(key) is { Success: true } match ? match.Groups[1].Value : null;
            break;
        }
        if (root is null) return null;
        var queries = TenantCustomPageQueries.ReadQueries(definitionJson);
        var query = queries.FirstOrDefault(x => x.Name == root) ?? queries.FirstOrDefault(x => x.Id == root);
        foreach (var parameter in query?.Parameters ?? [])
            if (PageParameterBinding.Match(parameter.Binding) is { Success: true } match) return match.Groups[1].Value;
        return null;
    }

    private static readonly System.Text.RegularExpressions.Regex RecordKeyRoot = new(@"^\s*\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\.",
        System.Text.RegularExpressions.RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(100));
    private static readonly System.Text.RegularExpressions.Regex PageParameterBinding = new(@"^\s*\{\{\s*sayfa\.parametre\.([^\s}.]+)\s*\}\}\s*\z",
        System.Text.RegularExpressions.RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(100));

    internal const string WriteRateLimitError = "Çok fazla yazma isteği gönderildi; bir dakika sonra yeniden deneyin.";
    internal const string WriteAuditUnavailableError = "Yazma işlemi denetim kaydı oluşturulamadığı için çalıştırılmadı; daha sonra yeniden deneyin.";

    /// <summary>
    /// Runs a write query through the write login. Audit fails closed: the attempt row (Succeeded = false) is stored in
    /// TenantCustomPageWriteAudits before the tenant connection is opened, and no write runs when that insert fails.
    /// The row is completed with the outcome afterwards; a failure there is logged and never changes the response.
    /// <paramref name="sql"/> is the page's SQL or, for a catalog action, the catalog item's (<paramref name="catalogReference"/>
    /// = <c>&lt;code&gt;@&lt;release version&gt;</c>, stored on the audit row).
    /// </summary>
    private static async Task<IResult> RunWriteAsync(string pageCode, PageQuery query, string sql, string? catalogReference, IReadOnlyList<SqlParameter> parameters,
        IReadOnlyDictionary<string, JsonElement> values, Guid tenant, Guid userId, bool isPreview, PlatformDbContext platformDb, HttpContext http, CancellationToken ct)
    {
        // The write rules may have tightened since the page was saved; never run SQL today's validator would reject.
        if (!ReportEndpoints.TryValidateWriteSql(sql, query.Kind, out _)) return Results.BadRequest(new { error = InvalidStoredSqlError });
        using var lease = http.RequestServices.GetRequiredService<CustomPageWriteRateLimiter>().Acquire(userId);
        if (!lease.IsAcquired) return Results.Json(new { error = WriteRateLimitError }, statusCode: StatusCodes.Status429TooManyRequests);
        var logger = http.RequestServices.GetRequiredService<ILoggerFactory>().CreateLogger(typeof(CustomPageQueryEndpoints).FullName!);

        var audit = new TenantCustomPageWriteAudit
        {
            TenantId = tenant, UserId = userId, PageCode = pageCode, QueryName = query.Name, Kind = query.Kind,
            ParametersJson = ParametersJson(values), IsPreview = isPreview, Succeeded = false, OccurredAt = DateTimeOffset.UtcNow,
            CatalogReference = catalogReference is null ? null : AuditResourceSanitizer.Sanitize(catalogReference)
        };
        platformDb.TenantCustomPageWriteAudits.Add(audit);
        try
        {
            await platformDb.SaveChangesAsync(ct);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            logger.LogError(exception, "Custom page write audit row could not be stored for page {PageCode}, query {QueryName}; the write was not run.", pageCode, query.Name);
            return Results.Json(new { error = WriteAuditUnavailableError }, statusCode: StatusCodes.Status503ServiceUnavailable);
        }

        // The connection factory is resolved only after every authorization, validation and audit step has passed.
        var factory = http.RequestServices.GetRequiredService<ITenantQueryConnectionFactory>();
        var stopwatch = System.Diagnostics.Stopwatch.StartNew();
        int affectedRows;
        try
        {
            affectedRows = await CustomSqlReportRunner.ExecuteWriteAsync(sql, parameters, tenant, factory, ct);
        }
        catch (Exception exception)
        {
            audit.ErrorNumber = (exception as SqlException)?.Number;
            audit.DurationMs = ElapsedMs(stopwatch);
            await CompleteWriteAuditAsync(platformDb, audit, logger);
            var mapped = CustomSqlReportRunner.MapError(exception);
            if (mapped is null) throw;
            return mapped;
        }
        audit.Succeeded = true;
        audit.AffectedRows = affectedRows;
        audit.DurationMs = ElapsedMs(stopwatch);
        await CompleteWriteAuditAsync(platformDb, audit, logger);
        return Results.Ok(new CustomPageWriteResult(affectedRows));
    }

    private static int ElapsedMs(System.Diagnostics.Stopwatch stopwatch) => (int)Math.Min(int.MaxValue, stopwatch.ElapsedMilliseconds);

    /// <summary>
    /// Stores the outcome on the attempt row. Not cancellable, so a client disconnect cannot drop it; a failure is logged
    /// and swallowed, so the caller still gets the real result of the write.
    /// </summary>
    private static async Task CompleteWriteAuditAsync(PlatformDbContext platformDb, TenantCustomPageWriteAudit audit, ILogger logger)
    {
        try
        {
            await platformDb.SaveChangesAsync(CancellationToken.None);
        }
        catch (Exception exception)
        {
            logger.LogError(exception, "Custom page write audit {AuditId} could not be completed (succeeded: {Succeeded}, affected rows: {AffectedRows}).",
                audit.Id, audit.Succeeded, audit.AffectedRows);
        }
    }

    /// <summary>Non-ASCII text (Turkish letters) stays readable; the value is stored as a column value, never rendered as HTML.</summary>
    private static readonly JsonSerializerOptions AuditJsonOptions = new() { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping };

    /// <summary>The effective parameter values (session variables included) as complete JSON.</summary>
    internal static string ParametersJson(IReadOnlyDictionary<string, JsonElement>? parameters) =>
        JsonSerializer.Serialize(parameters ?? new Dictionary<string, JsonElement>(), AuditJsonOptions);

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
