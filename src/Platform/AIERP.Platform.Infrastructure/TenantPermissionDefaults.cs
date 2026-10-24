using AIERP.Platform.Domain;
using Microsoft.EntityFrameworkCore;

namespace AIERP.Platform.Infrastructure;

public static class TenantPermissionDefaults
{
    /// <summary>
    /// Backfills newly introduced baseline permissions for existing tenant users without
    /// changing any role-level permission that an administrator has already configured.
    /// </summary>
    public static async Task AddMissingTenantUserBaselineAsync(PlatformDbContext db, Guid tenantId,
        Guid? actorUserId = null, CancellationToken cancellationToken = default)
    {
        var definitions = await db.PermissionDefinitions.AsNoTracking().ToListAsync(cancellationToken);
        var excluded = new HashSet<string>(StringComparer.Ordinal)
        {
            "erp.access-control", "erp.audit-events", "erp.audit-retention"
        };
        var configuredCodes = await db.TenantPermissionRules.AsNoTracking()
            .Where(x => x.TenantId == tenantId && x.SubjectType == TenantPermissionSubjectType.Role
                && x.SubjectRole == "TenantUser")
            .Select(x => x.PermissionCode)
            .ToHashSetAsync(cancellationToken);
        var createdAt = DateTimeOffset.UtcNow;
        var missing = definitions.Where(x => !excluded.Contains(x.ResourceType)
            && (x.ResourceType != "erp.finance.credit-facilities" || x.Action == "read")
            && !configuredCodes.Contains(x.Code)).Select(x => new TenantPermissionRule
        {
            TenantId = tenantId,
            SubjectType = TenantPermissionSubjectType.Role,
            SubjectRole = "TenantUser",
            PermissionCode = x.Code,
            Effect = TenantPermissionEffect.Allow,
            CreatedByUserId = actorUserId,
            CreatedAt = createdAt
        }).ToArray();
        if (missing.Length > 0) db.TenantPermissionRules.AddRange(missing);
    }

    public static async Task AddTenantUserBaselineAsync(PlatformDbContext db, Guid tenantId, Guid? actorUserId = null,
        CancellationToken cancellationToken = default)
    {
        var definitions = await db.PermissionDefinitions.AsNoTracking().ToListAsync(cancellationToken);
        var excluded = new HashSet<string>(StringComparer.Ordinal)
        {
            "erp.access-control", "erp.audit-events", "erp.audit-retention"
        };
        var createdAt = DateTimeOffset.UtcNow;
        db.TenantPermissionRules.AddRange(definitions.Where(x => !excluded.Contains(x.ResourceType)
            && (x.ResourceType != "erp.finance.credit-facilities" || x.Action == "read")).Select(x => new TenantPermissionRule
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
