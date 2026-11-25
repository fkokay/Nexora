using AIERP.Platform.Application;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace AIERP.AIService;

public static class StudioAccessLookup
{
    /// <summary>
    /// Resolves the caller's Studio access from the database (never from the token).
    /// Returns null when there is no active membership or the user or tenant is inactive.
    /// </summary>
    public static async Task<StudioAccess?> ForUserAsync(PlatformDbContext platformDb, AIStudioDbContext studioDb,
        Guid tenantId, Guid userId, CancellationToken ct)
    {
        var membership = await platformDb.TenantMemberships.AsNoTracking()
            .Where(x => x.TenantId == tenantId && x.UserId == userId && x.User.IsActive && x.Tenant.IsActive)
            .Select(x => new { x.Role, x.StudioRole })
            .SingleOrDefaultAsync(ct);
        if (membership is null) return null;
        var hasGrant = await studioDb.DevelopmentProjectAccesses.AsNoTracking()
            .AnyAsync(x => x.TenantId == tenantId && x.UserId == userId && x.Project.IsActive && x.Project.TenantId == tenantId, ct);
        return StudioAccessResolver.Resolve(membership.Role, membership.StudioRole, hasGrant);
    }
}
