using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;

namespace AIERP.Api;

/// <summary>Reads the tenant's active catalog release.</summary>
internal static class TenantCatalogStore
{
    /// <summary>
    /// The bundle of the tenant's single Active release, parsed with today's rules. Null when there is no active release,
    /// or when the stored bundle no longer parses (a warning is logged; pages then treat the catalog as absent).
    /// </summary>
    public static async Task<CatalogBundle?> ActiveAsync(TenantDbContext db, Guid tenant, ErpOperationLookup lookup, CancellationToken ct)
    {
        var release = await db.TenantCatalogReleases.AsNoTracking()
            .Where(x => x.TenantId == tenant && x.Status == "Active")
            .Select(x => new { x.Id, x.Version, x.BundleJson })
            .FirstOrDefaultAsync(ct);
        if (release is null) return null;
        if (TenantCatalogSchema.TryParse(release.BundleJson, lookup, out var bundle, out var error)) return bundle;
        var logger = db.GetService<ILoggerFactory>().CreateLogger(typeof(TenantCatalogStore).FullName!);
        logger.LogWarning("Active catalog release {ReleaseId} ({Version}) of tenant {TenantId} no longer validates: {Error}",
            release.Id, release.Version, tenant, error);
        return null;
    }
}
