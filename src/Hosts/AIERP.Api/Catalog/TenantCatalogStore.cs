using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;

namespace AIERP.Api;

/// <summary>The tenant's active catalog bundle and the version of the release it came from.</summary>
internal sealed record ActiveCatalogRelease(string Version, CatalogBundle Bundle);

/// <summary>Reads the tenant's active catalog release.</summary>
internal static class TenantCatalogStore
{
    /// <summary>
    /// The bundle of the tenant's single Active release, parsed with today's rules. Null when there is no active release,
    /// or when the stored bundle no longer parses (a warning is logged; pages then treat the catalog as absent).
    /// </summary>
    public static async Task<CatalogBundle?> ActiveAsync(TenantDbContext db, Guid tenant, ErpOperationLookup lookup, CancellationToken ct) =>
        (await ActiveReleaseAsync(db, tenant, lookup, ct))?.Bundle;

    /// <summary><see cref="ActiveAsync"/> together with the release version, for audit records.</summary>
    public static async Task<ActiveCatalogRelease?> ActiveReleaseAsync(TenantDbContext db, Guid tenant, ErpOperationLookup lookup, CancellationToken ct)
    {
        var release = await db.TenantCatalogReleases.AsNoTracking()
            .Where(x => x.TenantId == tenant && x.Status == "Active")
            .Select(x => new { x.Id, x.Version, x.BundleJson })
            .FirstOrDefaultAsync(ct);
        if (release is null) return null;
        if (TenantCatalogSchema.TryParse(release.BundleJson, lookup, out var bundle, out var error)) return new ActiveCatalogRelease(release.Version, bundle!);
        var logger = db.GetService<ILoggerFactory>().CreateLogger(typeof(TenantCatalogStore).FullName!);
        logger.LogWarning("Active catalog release {ReleaseId} ({Version}) of tenant {TenantId} no longer validates: {Error}",
            release.Id, release.Version, tenant, error);
        return null;
    }

    /// <summary>
    /// Whether a page query's catalog reference still fits the item: the item exists, is of the referenced item kind
    /// (<c>dataSource</c> / <c>action</c>) and query kind, and, for a SQL item, the page declares exactly the item's
    /// parameter names (case-insensitive) with the same types. Shared by the activation guard and the runtime.
    /// </summary>
    internal static bool Fits(CatalogItem? item, string itemKind, PageQuery query) =>
        item is not null && item.ItemKind == itemKind && item.QueryKind == query.Kind
        && (item.Sql is null || SameParameters(query.Parameters, item.Parameters));

    private static bool SameParameters(IReadOnlyList<PageQueryParameter> page, IReadOnlyList<CatalogParameter> item)
    {
        if (page.Count != item.Count) return false;
        var types = item.ToDictionary(x => x.Name, x => x.Type, StringComparer.OrdinalIgnoreCase);
        return page.All(x => types.TryGetValue(x.Name, out var type) && type == x.Type);
    }
}
