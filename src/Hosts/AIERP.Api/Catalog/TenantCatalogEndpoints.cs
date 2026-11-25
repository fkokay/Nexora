using System.Security.Claims;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using Microsoft.Data.SqlClient;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace AIERP.Api;

/// <summary>
/// Tenant catalog releases: immutable bundles of named data sources and actions that custom pages reference by code.
/// Creating and activating a release needs a verified TenantAdmin or Studio Developer (<see cref="CatalogDeveloperAccess"/>);
/// exactly one release per tenant is Active.
/// </summary>
internal static partial class TenantCatalogEndpoints
{
    internal const int PreviewMaxRows = 50;
    internal const string PreviewItemNotFoundError = "Önizlenecek veri kaynağı bulunamadı.";
    internal const string PreviewOperationItemError = "ERP işlemine dayanan veri kaynağı önizlenmez; sonuç kolonları işlem kataloğundan gelir.";
    private const string StaleMessage = "Katalog başka bir kullanıcı tarafından değiştirildi.";

    [GeneratedRegex(@"^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\z", RegexOptions.CultureInvariant, matchTimeoutMilliseconds: 100)]
    private static partial Regex SemVerPattern();

    public static void MapTenantCatalogEndpoints(this WebApplication app)
    {
        var catalog = app.MapGroup("/api/custom-pages/catalog").WithTags("Tenant Catalog").RequireAuthorization();

        catalog.MapPost("/releases", async (CreateReleaseRequest? request, ClaimsPrincipal user, TenantDbContext db, PlatformDbContext platformDb, CancellationToken ct) =>
        {
            if (!TenantCustomPageEndpoints.TryContext(user, out var tenant, out var userId, out var role)
                || !await CatalogDeveloperAccess.IsAllowedAsync(platformDb, tenant, userId, role, ct)) return Results.Forbid();
            if (request is null) return Results.BadRequest(new { error = "İstek gövdesi gerekli." });
            var version = request.Version?.Trim() ?? "";
            if (version.Length > 32 || !SemVerPattern().IsMatch(version))
                return Results.BadRequest(new { error = "Sürüm major.minor.patch biçiminde olmalıdır (en fazla 32 karakter)." });
            if (request.Bundle.ValueKind != JsonValueKind.Object) return Results.BadRequest(new { error = "Paket bir JSON nesnesi olmalıdır." });
            if ((request.SourceRepository?.Length ?? 0) > 400 || (request.SourceCommit?.Length ?? 0) > 64 || (request.SourcePath?.Length ?? 0) > 200)
                return Results.BadRequest(new { error = "Köken bilgisi çok uzun." });
            var bundleJson = request.Bundle.GetRawText();
            if (!TenantCatalogSchema.TryParse(bundleJson, ErpOperationCatalog.TryGet, out _, out var error))
                return Results.BadRequest(new { error });
            if (await db.TenantCatalogReleases.AnyAsync(x => x.TenantId == tenant && x.Version == version, ct))
                return Results.Conflict(new { error = "Bu sürüm numarası zaten var." });

            var sha = Convert.ToHexStringLower(System.Security.Cryptography.SHA256.HashData(Encoding.UTF8.GetBytes(bundleJson)));
            var release = new TenantCatalogRelease
            {
                TenantId = tenant, Version = version, Status = "Draft", BundleJson = bundleJson, BundleSha256 = sha,
                SourceRepository = Clean(request.SourceRepository), SourceCommit = Clean(request.SourceCommit), SourcePath = Clean(request.SourcePath),
                CreatedByUserId = userId,
            };
            db.TenantCatalogReleases.Add(release);
            AddAudit(db, tenant, userId, "catalog.release.created", release);
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateException) { return Results.Conflict(new { error = "Bu sürüm numarası zaten var." }); }
            return Results.Created($"/api/custom-pages/catalog/releases/{release.Id:D}", new { id = release.Id, version = release.Version, status = release.Status, bundleSha256 = release.BundleSha256 });
        });

        catalog.MapGet("/releases", async (ClaimsPrincipal user, TenantDbContext db, IPlatformPermissionAuthorizer auth, CancellationToken ct) =>
        {
            if (!TenantCustomPageEndpoints.TryContext(user, out var tenant, out var userId, out var role)
                || !await TenantCustomPageEndpoints.Allowed(auth, tenant, userId, role, "read", ct)) return Results.Forbid();
            var items = await db.TenantCatalogReleases.AsNoTracking().Where(x => x.TenantId == tenant)
                .OrderByDescending(x => x.CreatedAt).ThenByDescending(x => x.Version)
                .Select(x => new ReleaseSummary(x.Id, x.Version, x.Status, x.BundleSha256, x.SourceRepository, x.SourceCommit, x.SourcePath, x.CreatedAt, x.ActivatedAt))
                .ToListAsync(ct);
            return Results.Ok(items);
        });

        catalog.MapGet("", async (ClaimsPrincipal user, TenantDbContext db, PlatformDbContext platformDb, IPlatformPermissionAuthorizer auth, CancellationToken ct) =>
        {
            if (!TenantCustomPageEndpoints.TryContext(user, out var tenant, out var userId, out var role)
                || !await TenantCustomPageEndpoints.Allowed(auth, tenant, userId, role, "read", ct)) return Results.Forbid();
            // One read of the Active row. Items that no longer validate are left out and listed by code in invalidItems.
            var active = await TenantCatalogStore.ActiveReleaseAsync(db, tenant, ErpOperationCatalog.TryGet, ct);
            if (active is null) return Results.Ok(new ActiveCatalog(null, null, null, [], [], []));
            var bundle = active.Bundle;
            // SQL text is shown only to a verified TenantAdmin or Studio Developer (the designer); runtime consumers never need it.
            var showSql = await CatalogDeveloperAccess.IsAllowedAsync(platformDb, tenant, userId, role, ct);
            var dataSources = bundle.Items.Where(x => x.ItemKind == "dataSource").Select(x => new DataSourceView(x.Code, x.Label, SourceOf(x),
                x.ErpOperation, showSql ? x.Sql : null, x.Parameters, x.Columns, x.Opens)).ToArray();
            var actions = bundle.Items.Where(x => x.ItemKind == "action").Select(x => new ActionView(x.Code, x.Label, x.QueryKind, x.Target, SourceOf(x),
                x.ErpOperation, showSql ? x.Sql : null, x.Parameters, x.ConfirmText)).ToArray();
            return Results.Ok(new ActiveCatalog(active.Id, active.Version, active.SourcePath, dataSources, actions, bundle.InvalidCodes));
        });

        catalog.MapPost("/releases/{id:guid}/activate", async (Guid id, ActivateRequest? request, ClaimsPrincipal user, TenantDbContext db, PlatformDbContext platformDb, CancellationToken ct) =>
        {
            if (!TenantCustomPageEndpoints.TryContext(user, out var tenant, out var userId, out var role)
                || !await CatalogDeveloperAccess.IsAllowedAsync(platformDb, tenant, userId, role, ct)) return Results.Forbid();
            var target = await db.TenantCatalogReleases.SingleOrDefaultAsync(x => x.TenantId == tenant && x.Id == id, ct);
            if (target is null) return Results.NotFound();
            if (target.Status == "Active") return Results.Conflict(new { error = "Bu sürüm zaten etkin." });
            if (target.Status is not ("Draft" or "Superseded")) return Results.Conflict(new { error = "Bu sürüm etkinleştirilemez." });
            var current = await db.TenantCatalogReleases.SingleOrDefaultAsync(x => x.TenantId == tenant && x.Status == "Active", ct);
            if (current?.Id != request?.ExpectedActiveReleaseId) return Results.Conflict(new { error = StaleMessage });
            if (!TenantCatalogSchema.TryParse(target.BundleJson, ErpOperationCatalog.TryGet, out var newBundle, out var parseError))
                return Results.Conflict(new { error = $"Saklı paket bugünkü kurallara göre geçerli değil. {parseError}".TrimEnd() });

            var oldBundle = await TenantCatalogStore.ActiveAsync(db, tenant, ErpOperationCatalog.TryGet, ct);
            var broken = await BrokenPagesAsync(db, tenant, oldBundle, newBundle!, ct);
            if (broken.Count > 0)
                return Results.Conflict(new { error = "Bu sürüm yayımlanmış sayfaların kullandığı yapı taşlarını bozuyor.", pages = broken });

            // The Active index is enforced per statement, so the old release is superseded (and saved) before the new one is activated.
            await using var transaction = await db.Database.BeginTransactionAsync(ct);
            try
            {
                if (current is not null)
                {
                    current.Status = "Superseded";
                    AddAudit(db, tenant, userId, "catalog.release.superseded", current);
                    await db.SaveChangesAsync(ct);
                }
                target.Status = "Active";
                target.ActivatedByUserId = userId;
                target.ActivatedAt = DateTimeOffset.UtcNow;
                AddAudit(db, tenant, userId, "catalog.release.activated", target);
                await db.SaveChangesAsync(ct);
                await transaction.CommitAsync(ct);
            }
            catch (Exception ex) when (ex is DbUpdateException or DbUpdateConcurrencyException)
            {
                return Results.Conflict(new { error = StaleMessage });
            }
            return Results.Ok(new { id = target.Id, version = target.Version, status = target.Status });
        });

        // Preview: the bundle is stored first (append-only, audited); a run then carries only parameter values, never SQL.
        catalog.MapPost("/previews", async (CreatePreviewRequest? request, ClaimsPrincipal user, TenantDbContext db, PlatformDbContext platformDb, CancellationToken ct) =>
        {
            if (!TenantCustomPageEndpoints.TryContext(user, out var tenant, out var userId, out var role)
                || !await CatalogDeveloperAccess.IsAllowedAsync(platformDb, tenant, userId, role, ct)) return Results.Forbid();
            if (request is null) return Results.BadRequest(new { error = "İstek gövdesi gerekli." });
            if (request.Bundle.ValueKind != JsonValueKind.Object) return Results.BadRequest(new { error = "Paket bir JSON nesnesi olmalıdır." });
            var bundleJson = request.Bundle.GetRawText();
            if (!TenantCatalogSchema.TryParse(bundleJson, ErpOperationCatalog.TryGet, out _, out var error))
                return Results.BadRequest(new { error });
            var sha = Convert.ToHexStringLower(System.Security.Cryptography.SHA256.HashData(Encoding.UTF8.GetBytes(bundleJson)));
            var preview = new TenantCatalogPreview { TenantId = tenant, CreatedByUserId = userId, BundleJson = bundleJson, BundleSha256 = sha };
            db.TenantCatalogPreviews.Add(preview);
            db.AuditEvents.Add(new AuditEvent
            {
                TenantId = tenant, UserId = userId, Action = "catalog.preview.created",
                Resource = AuditResourceSanitizer.Sanitize($"{preview.Id:D}:{sha[..12]}"),
            });
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/custom-pages/catalog/previews/{preview.Id:D}", new { id = preview.Id });
        }).RequireRateLimiting(CustomPageQueryEndpoints.PreviewRateLimitPolicy);

        // Order of checks: admin or developer -> the caller's own preview row -> item -> parameters -> re-validation of the SQL -> connection.
        catalog.MapPost("/previews/{id:guid}/items/{code}/run", async (Guid id, string code, PreviewRunRequest? request, ClaimsPrincipal user,
            TenantDbContext db, PlatformDbContext platformDb, HttpContext http, CancellationToken ct) =>
        {
            if (!TenantCustomPageEndpoints.TryContext(user, out var tenant, out var userId, out var role)
                || !await CatalogDeveloperAccess.IsAllowedAsync(platformDb, tenant, userId, role, ct)) return Results.Forbid();
            var bundleJson = await db.TenantCatalogPreviews.AsNoTracking()
                .Where(x => x.TenantId == tenant && x.CreatedByUserId == userId && x.Id == id)
                .Select(x => x.BundleJson).SingleOrDefaultAsync(ct);
            if (bundleJson is null) return Results.NotFound();
            // A stored preview that no longer passes today's rules is never run.
            if (!TenantCatalogSchema.TryParse(bundleJson, ErpOperationCatalog.TryGet, out var bundle, out _))
                return Results.BadRequest(new { error = CustomPageQueryEndpoints.InvalidStoredSqlError });
            var item = bundle!.Find(code);
            if (item is null || item.ItemKind != "dataSource") return Results.NotFound(new { error = PreviewItemNotFoundError });
            if (item.ErpOperation is not null || item.Sql is null) return Results.BadRequest(new { error = PreviewOperationItemError });
            // Bindings do not matter in preview: values arrive by parameter name. Session values are not filled in.
            var declared = item.Parameters.Select(x => new PageQueryParameter(x.Name, "", x.Type)).ToArray();
            var (parameters, parameterError) = CustomPageQueryParameters.Build(declared, request?.Parameters);
            if (parameters is null) return Results.BadRequest(new { error = parameterError });
            if (!ReportEndpoints.TryValidateReadOnlySql(item.Sql, out _)) return Results.BadRequest(new { error = CustomPageQueryEndpoints.InvalidStoredSqlError });
            // The executor and the connection factory are resolved only after every check has passed.
            var execute = http.RequestServices.GetService<CatalogPreviewExecutor>() ?? CustomSqlReportRunner.ExecuteSingleAsync;
            var factory = http.RequestServices.GetRequiredService<ITenantQueryConnectionFactory>();
            CustomSqlResult result;
            try
            {
                result = await execute(item.Sql, parameters, tenant, factory, ct, PreviewMaxRows);
            }
            catch (Exception exception) when (CustomSqlReportRunner.MapError(exception) is not null)
            {
                return CustomSqlReportRunner.MapError(exception)!;
            }
            // Parameter values may hold personal data and are not audited.
            db.AuditEvents.Add(new AuditEvent
            {
                TenantId = tenant, UserId = userId, Action = "catalog.preview.run",
                Resource = AuditResourceSanitizer.Sanitize($"{code}:rows={result.Rows.Count}"),
            });
            await db.SaveChangesAsync(ct);
            return Results.Ok(new CustomPageQueryRunResult(result.Columns, result.Rows, result.Rows.Count, result.Truncated));
        }).RequireRateLimiting(CustomPageQueryEndpoints.PreviewRateLimitPolicy);
    }

    private static string SourceOf(CatalogItem item) => item.Sql is not null ? "sql" : "erpOperation";

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static void AddAudit(TenantDbContext db, Guid tenant, Guid userId, string action, TenantCatalogRelease release) =>
        db.AuditEvents.Add(new AuditEvent
        {
            TenantId = tenant, UserId = userId, Action = action,
            Resource = AuditResourceSanitizer.Sanitize($"{release.Version}:{release.BundleSha256[..12]}"),
        });

    /// <summary>
    /// Published, non-archived pages whose catalog references would stop working with the new bundle: the code is gone, the
    /// item kind or query kind changed, the source type (sql / ERP operation) changed against the active release (its items
    /// that no longer validate included), a SQL item's parameters differ (names compared Ordinal), or the page as a whole no
    /// longer validates against the new bundle (e.g. an operation swapped for one whose parameters the page does not satisfy).
    /// </summary>
    private static async Task<List<BrokenPage>> BrokenPagesAsync(TenantDbContext db, Guid tenant, CatalogBundle? oldBundle, CatalogBundle newBundle, CancellationToken ct)
    {
        var pages = await db.TenantCustomPages.AsNoTracking()
            .Where(x => x.TenantId == tenant && x.IsPublished && !x.IsArchived)
            .OrderBy(x => x.Code).Select(x => new { x.Code, x.Name, x.DefinitionJson }).ToListAsync(ct);
        var result = new List<BrokenPage>();
        foreach (var page in pages)
        {
            var queries = TenantCustomPageQueries.ReadQueries(page.DefinitionJson).Where(x => (x.DataSource ?? x.Action) is not null).ToArray();
            if (queries.Length == 0) continue;
            var references = new List<string>();
            foreach (var query in queries)
            {
                var code = (query.DataSource ?? query.Action)!;
                var kind = query.DataSource is not null ? "dataSource" : "action";
                var item = newBundle.Find(code);
                var old = oldBundle?.FindForRun(code);
                var intact = TenantCatalogStore.Fits(item, kind, query) && (old is null || (old.Sql is null) == (item!.Sql is null));
                // Only breakage this release causes blocks it: a reference that did not fit the active release either
                // (restored from an old revision, say) is already reported at run time and must not block a fix or a rollback.
                var fittedBefore = oldBundle is null || TenantCatalogStore.Fits(oldBundle.Find(code), kind, query);
                if (!intact && fittedBefore && !references.Contains(code)) references.Add(code);
            }
            // The whole page against the new bundle, with the same rules as save and publish. A page that is already
            // invalid under the active release (for a reason unrelated to the catalog) does not block activation; only a
            // page this release turns invalid does. Without an active bundle there is nothing to compare against.
            var operations = TenantCustomPageQueries.OperationNames(page.DefinitionJson);
            var validNew = TenantCustomPageSchema.Validate(page.DefinitionJson, out var error, operations, ErpOperationCatalog.TryGet, newBundle);
            var regressed = !validNew && oldBundle is not null
                && TenantCustomPageSchema.Validate(page.DefinitionJson, out _, operations, ErpOperationCatalog.TryGet, oldBundle);
            if (regressed && references.Count == 0)
                references.AddRange(queries.Select(x => (x.DataSource ?? x.Action)!).Distinct(StringComparer.Ordinal));
            if (references.Count > 0) result.Add(new BrokenPage(page.Code, page.Name, references, regressed ? error : null));
        }
        return result;
    }

    private sealed record CreateReleaseRequest(string? Version, JsonElement Bundle, string? SourceRepository, string? SourceCommit, string? SourcePath);
    private sealed record ActivateRequest(Guid? ExpectedActiveReleaseId);
    private sealed record CreatePreviewRequest(JsonElement Bundle);
    /// <summary>A preview run carries parameter values only; any other field (SQL, a bundle) is ignored.</summary>
    private sealed record PreviewRunRequest(Dictionary<string, JsonElement>? Parameters);
    private sealed record ReleaseSummary(Guid Id, string Version, string Status, string BundleSha256, string? SourceRepository, string? SourceCommit,
        string? SourcePath, DateTimeOffset CreatedAt, DateTimeOffset? ActivatedAt);
    /// <summary>A page the release would break; <see cref="Error"/> is the page validation message against the new bundle, when it fails.</summary>
    private sealed record BrokenPage(string Code, string Name, IReadOnlyList<string> References,
        [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Error);
    private sealed record ActiveCatalog(Guid? ReleaseId, string? Version, string? SourcePath, IReadOnlyList<DataSourceView> DataSources, IReadOnlyList<ActionView> Actions,
        IReadOnlyList<string> InvalidItems);
    private sealed record DataSourceView(string Code, string Label, string Source,
        [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? ErpOperation,
        [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Sql,
        IReadOnlyList<CatalogParameter> Parameters, IReadOnlyList<CatalogColumn> Columns, string? Opens);
    private sealed record ActionView(string Code, string Label, string Kind, string? Target, string Source,
        [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? ErpOperation,
        [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Sql,
        IReadOnlyList<CatalogParameter> Parameters, string? Confirm);
}

/// <summary>
/// Test seam for the catalog preview run: same contract as <see cref="CustomSqlReportRunner.ExecuteSingleAsync"/>, which is used
/// when nothing is registered (production never registers one).
/// </summary>
internal delegate Task<CustomSqlResult> CatalogPreviewExecutor(string sql, IReadOnlyList<SqlParameter> parameters, Guid tenantId,
    ITenantQueryConnectionFactory factory, CancellationToken ct, int maxRows);
