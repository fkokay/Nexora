using AIERP.Platform.Application;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace AIERP.Api;

/// <summary>
/// Gate for the catalog developer actions: creating and activating a release, storing and running a preview, and seeing SQL
/// text in the catalog view. Allowed for a verified TenantAdmin and for a member whose Studio work role is Developer.
/// </summary>
/// <remarks>
/// Everything is read from the caller's membership row: the user and tenant must be active and the role claim must match
/// the row's role (a promoted user gets the right after re-selecting the tenant; a demoted one loses it at once). The work
/// role then comes from <see cref="StudioAccessResolver"/> with <c>hasProjectGrant: false</c>: the ERP API has no
/// per-request access to the Studio database, so a project grant is never seen here. A member who is Developer only by
/// default through a Studio project grant (TenantUser, StudioRole null) is therefore treated as Consultant and refused;
/// such a member needs StudioRole = Developer set explicitly. TenantAdmin is always allowed (StudioRole None included).
/// </remarks>
internal static class CatalogDeveloperAccess
{
    public static async Task<bool> IsAllowedAsync(PlatformDbContext db, Guid tenant, Guid userId, string roleClaim, CancellationToken ct)
    {
        var membership = await db.TenantMemberships.AsNoTracking()
            .Where(x => x.TenantId == tenant && x.UserId == userId)
            .Select(x => new { x.Role, x.StudioRole, UserIsActive = x.User.IsActive, TenantIsActive = x.Tenant.IsActive })
            .SingleOrDefaultAsync(ct);
        if (membership is null || !membership.UserIsActive || !membership.TenantIsActive
            || !string.Equals(membership.Role, roleClaim, StringComparison.Ordinal)) return false;
        return StudioAccessResolver.Resolve(membership.Role, membership.StudioRole, hasProjectGrant: false).CanWriteCode;
    }
}
