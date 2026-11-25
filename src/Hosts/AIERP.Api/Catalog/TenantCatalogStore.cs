using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;

namespace AIERP.Api;

/// <summary>The tenant's active catalog bundle and the id and version of the release it came from.</summary>
internal sealed record ActiveCatalogRelease(Guid Id, string Version, string? SourcePath, CatalogBundle Bundle);

/// <summary>Reads the tenant's active catalog release.</summary>
internal static class TenantCatalogStore
{
    /// <summary>
    /// The bundle of the tenant's single Active release, read leniently (<see cref="TenantCatalogSchema.TryParseLenient"/>):
    /// an item that no longer validates is set aside on its own (one warning per item is logged) and the other items stay
    /// usable. Null when there is no active release, or when the stored bundle's structure no longer parses (logged too).
    /// </summary>
    public static async Task<CatalogBundle?> ActiveAsync(TenantDbContext db, Guid tenant, ErpOperationLookup lookup, CancellationToken ct) =>
        (await ActiveReleaseAsync(db, tenant, lookup, ct))?.Bundle;

    /// <summary><see cref="ActiveAsync"/> together with the release id and version (one read of the Active row).</summary>
    public static async Task<ActiveCatalogRelease?> ActiveReleaseAsync(TenantDbContext db, Guid tenant, ErpOperationLookup lookup, CancellationToken ct)
    {
        var release = await db.TenantCatalogReleases.AsNoTracking()
            .Where(x => x.TenantId == tenant && x.Status == "Active")
            .Select(x => new { x.Id, x.Version, x.SourcePath, x.BundleJson })
            .FirstOrDefaultAsync(ct);
        if (release is null) return null;
        var parsed = TenantCatalogSchema.TryParseLenient(release.BundleJson, lookup, out var bundle, out var problems, out var error);
        if (parsed && problems.Count == 0) return new ActiveCatalogRelease(release.Id, release.Version, release.SourcePath, bundle!);
        var logger = db.GetService<ILoggerFactory>().CreateLogger(typeof(TenantCatalogStore).FullName!);
        if (!parsed)
        {
            logger.LogWarning("Active catalog release {ReleaseId} ({Version}) of tenant {TenantId} no longer validates: {Error}",
                release.Id, release.Version, tenant, error);
            return null;
        }
        foreach (var problem in problems)
            logger.LogWarning("Active catalog release {ReleaseId} ({Version}) of tenant {TenantId} has an item that no longer validates: {Error}",
                release.Id, release.Version, tenant, problem);
        return new ActiveCatalogRelease(release.Id, release.Version, release.SourcePath, bundle!);
    }

    /// <summary>
    /// Whether a page query's catalog reference still fits the item: the item exists, is of the referenced item kind
    /// (<c>dataSource</c> / <c>action</c>) and query kind, and, for a SQL item, the page declares exactly the item's
    /// parameter names (compared Ordinal, the same rule as page save) with the same types. Used by the runtime and, together
    /// with a full page validation against the new bundle, by the activation guard. For an operation-backed item the page's
    /// parameters are not re-checked here: the activation guard validates them with the ERP operation rules, and the ERP
    /// endpoint the runtime calls validates its own input.
    /// </summary>
    internal static bool Fits(CatalogItem? item, string itemKind, PageQuery query) =>
        item is not null && item.ItemKind == itemKind && item.QueryKind == query.Kind
        && (item.Sql is null || SameParameters(query.Parameters, item.Parameters));

    private static bool SameParameters(IReadOnlyList<PageQueryParameter> page, IReadOnlyList<CatalogParameter> item)
    {
        if (page.Count != item.Count) return false;
        var types = item.ToDictionary(x => x.Name, x => x.Type, StringComparer.Ordinal);
        return page.All(x => types.TryGetValue(x.Name, out var type) && type == x.Type);
    }
}
