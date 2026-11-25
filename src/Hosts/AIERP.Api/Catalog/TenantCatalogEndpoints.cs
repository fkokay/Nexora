using System.Security.Claims;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace AIERP.Api;

/// <summary>
/// Tenant catalog releases: immutable bundles of named data sources and actions that custom pages reference by code.
/// Creating and activating a release needs a verified TenantAdmin; exactly one release per tenant is Active.
/// </summary>
internal static partial class TenantCatalogEndpoints
{
    private const string StaleMessage = "Katalog başka bir kullanıcı tarafından değiştirildi.";

    [GeneratedRegex(@"^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\z", RegexOptions.CultureInvariant, matchTimeoutMilliseconds: 100)]
    private static partial Regex SemVerPattern();

    public static void MapTenantCatalogEndpoints(this WebApplication app)
    {
        var catalog = app.MapGroup("/api/custom-pages/catalog").WithTags("Tenant Catalog").RequireAuthorization();

        catalog.MapPost("/releases", async (CreateReleaseRequest? request, ClaimsPrincipal user, TenantDbContext db, PlatformDbContext platformDb, CancellationToken ct) =>
        {
            if (!TenantCustomPageEndpoints.TryContext(user, out var tenant, out var userId, out var role)
                || !await CustomPageAccessEndpoints.IsVerifiedTenantAdminAsync(platformDb, tenant, userId, role, ct)) return Results.Forbid();
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
                .Select(x => new ReleaseSummary(x.Id, x.Version, x.Status, x.BundleSha256, x.SourceRepository, x.SourceCommit, x.CreatedAt, x.ActivatedAt))
                .ToListAsync(ct);
            return Results.Ok(items);
        });

        catalog.MapGet("", async (ClaimsPrincipal user, TenantDbContext db, PlatformDbContext platformDb, IPlatformPermissionAuthorizer auth, CancellationToken ct) =>
        {
            if (!TenantCustomPageEndpoints.TryContext(user, out var tenant, out var userId, out var role)
                || !await TenantCustomPageEndpoints.Allowed(auth, tenant, userId, role, "read", ct)) return Results.Forbid();
            var bundle = await TenantCatalogStore.ActiveAsync(db, tenant, ErpOperationCatalog.TryGet, ct);
            var active = bundle is null ? null : await db.TenantCatalogReleases.AsNoTracking()
                .Where(x => x.TenantId == tenant && x.Status == "Active").Select(x => new { x.Id, x.Version }).FirstOrDefaultAsync(ct);
            if (bundle is null || active is null) return Results.Ok(new ActiveCatalog(null, null, [], []));
            // SQL text is shown to a verified TenantAdmin only (the designer); runtime consumers never need it.
            var showSql = await CustomPageAccessEndpoints.IsVerifiedTenantAdminAsync(platformDb, tenant, userId, role, ct);
            var dataSources = bundle.Items.Where(x => x.ItemKind == "dataSource").Select(x => new DataSourceView(x.Code, x.Label, SourceOf(x),
                x.ErpOperation, showSql ? x.Sql : null, x.Parameters, x.Columns, x.Opens)).ToArray();
            var actions = bundle.Items.Where(x => x.ItemKind == "action").Select(x => new ActionView(x.Code, x.Label, x.QueryKind, x.Target, SourceOf(x),
                x.ErpOperation, showSql ? x.Sql : null, x.Parameters, x.ConfirmText)).ToArray();
            return Results.Ok(new ActiveCatalog(active.Id, active.Version, dataSources, actions));
        });

        catalog.MapPost("/releases/{id:guid}/activate", async (Guid id, ActivateRequest? request, ClaimsPrincipal user, TenantDbContext db, PlatformDbContext platformDb, CancellationToken ct) =>
        {
            if (!TenantCustomPageEndpoints.TryContext(user, out var tenant, out var userId, out var role)
                || !await CustomPageAccessEndpoints.IsVerifiedTenantAdminAsync(platformDb, tenant, userId, role, ct)) return Results.Forbid();
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
    /// item kind or query kind changed, the source type (sql / ERP operation) changed, or a SQL item's parameters differ.
    /// </summary>
    private static async Task<List<BrokenPage>> BrokenPagesAsync(TenantDbContext db, Guid tenant, CatalogBundle? oldBundle, CatalogBundle newBundle, CancellationToken ct)
    {
        var pages = await db.TenantCustomPages.AsNoTracking()
            .Where(x => x.TenantId == tenant && x.IsPublished && !x.IsArchived)
            .OrderBy(x => x.Code).Select(x => new { x.Code, x.Name, x.DefinitionJson }).ToListAsync(ct);
        var result = new List<BrokenPage>();
        foreach (var page in pages)
        {
            var references = new List<string>();
            foreach (var query in TenantCustomPageQueries.ReadQueries(page.DefinitionJson))
            {
                var code = query.DataSource ?? query.Action;
                if (code is null) continue;
                var kind = query.DataSource is not null ? "dataSource" : "action";
                var item = newBundle.Find(code);
                var old = oldBundle?.Find(code);
                var intact = item is not null && item.ItemKind == kind && item.QueryKind == query.Kind
                    && (old is null || (old.Sql is null) == (item.Sql is null))
                    && (item.Sql is null || SameParameters(query.Parameters, item.Parameters));
                if (!intact && !references.Contains(code)) references.Add(code);
            }
            if (references.Count > 0) result.Add(new BrokenPage(page.Code, page.Name, references));
        }
        return result;
    }

    private static bool SameParameters(IReadOnlyList<PageQueryParameter> page, IReadOnlyList<CatalogParameter> item)
    {
        if (page.Count != item.Count) return false;
        var types = item.ToDictionary(x => x.Name, x => x.Type, StringComparer.OrdinalIgnoreCase);
        return page.All(x => types.TryGetValue(x.Name, out var type) && type == x.Type);
    }

    private sealed record CreateReleaseRequest(string? Version, JsonElement Bundle, string? SourceRepository, string? SourceCommit, string? SourcePath);
    private sealed record ActivateRequest(Guid? ExpectedActiveReleaseId);
    private sealed record ReleaseSummary(Guid Id, string Version, string Status, string BundleSha256, string? SourceRepository, string? SourceCommit,
        DateTimeOffset CreatedAt, DateTimeOffset? ActivatedAt);
    private sealed record BrokenPage(string Code, string Name, IReadOnlyList<string> References);
    private sealed record ActiveCatalog(Guid? ReleaseId, string? Version, IReadOnlyList<DataSourceView> DataSources, IReadOnlyList<ActionView> Actions);
    private sealed record DataSourceView(string Code, string Label, string Source,
        [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? ErpOperation,
        [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Sql,
        IReadOnlyList<CatalogParameter> Parameters, IReadOnlyList<CatalogColumn> Columns, string? Opens);
    private sealed record ActionView(string Code, string Label, string Kind, string? Target, string Source,
        [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? ErpOperation,
        [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Sql,
        IReadOnlyList<CatalogParameter> Parameters, string? Confirm);
}
