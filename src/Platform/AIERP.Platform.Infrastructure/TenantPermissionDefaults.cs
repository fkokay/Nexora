using AIERP.Platform.Domain;
using Microsoft.EntityFrameworkCore;

namespace AIERP.Platform.Infrastructure;

public static class TenantPermissionDefaults
{
    public static async Task AddTenantUserBaselineAsync(PlatformDbContext db, Guid tenantId, Guid? actorUserId = null,
        CancellationToken cancellationToken = default)
    {
        var definitions = await db.PermissionDefinitions.AsNoTracking().ToListAsync(cancellationToken);
        var excluded = new HashSet<string>(StringComparer.Ordinal)
        {
            "erp.access-control", "erp.audit-events", "erp.audit-retention"
        };
        var createdAt = DateTimeOffset.UtcNow;
        db.TenantPermissionRules.AddRange(definitions.Where(x => !excluded.Contains(x.ResourceType)).Select(x => new TenantPermissionRule
        {
            TenantId = tenantId,
            SubjectType = TenantPermissionSubjectType.Role,
            SubjectRole = "TenantUser",
            PermissionCode = x.Code,
            Effect = TenantPermissionEffect.Allow,
            CreatedByUserId = actorUserId,
            CreatedAt = createdAt
        }));
    }
}
