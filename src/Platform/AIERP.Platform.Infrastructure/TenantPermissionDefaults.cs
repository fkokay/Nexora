using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using Microsoft.EntityFrameworkCore;

namespace AIERP.Platform.Infrastructure;

public static class TenantPermissionDefaults
{
    /// <summary>Membership roles that receive the default Allow role-rule baseline. TenantAdmin bypasses rules instead.</summary>
    public static bool HasRoleBaseline(string? role) => role is "TenantUser" or "TenantDeveloper";

    /// <summary>
    /// Backfills newly introduced baseline permissions for existing tenant users without
    /// changing any role-level permission that an administrator has already configured.
    /// </summary>
    public static Task<int> AddMissingTenantUserBaselineAsync(PlatformDbContext db, Guid tenantId,
        Guid? actorUserId = null, CancellationToken cancellationToken = default) =>
        AddMissingRoleBaselineAsync(db, tenantId, "TenantUser", actorUserId, cancellationToken);

    /// <summary>
    /// Adds the default Allow role-rules for <paramref name="role"/> (TenantUser or TenantDeveloper; both get the same
    /// permission set) for every baseline permission that has no role-level rule for that role yet. Existing rules,
    /// including administrator Deny rules and inactive rules, are never changed or removed.
    /// Seeded rules carry no <c>CreatedByUserId</c> (same as the migration seed), so the logging-in user is not shown as
    /// their author. When at least one rule is added, one <c>permission.baseline.seeded</c> audit event is added to the
    /// context (attributed to <paramref name="actorUserId"/>, the user whose login triggered it). The caller saves.
    /// Returns the number of rules added.
    /// </summary>
    public static async Task<int> AddMissingRoleBaselineAsync(PlatformDbContext db, Guid tenantId, string role,
        Guid? actorUserId = null, CancellationToken cancellationToken = default)
    {
        if (!HasRoleBaseline(role)) throw new ArgumentOutOfRangeException(nameof(role), role, "Only TenantUser and TenantDeveloper have a baseline.");
        var definitions = await db.PermissionDefinitions.AsNoTracking().ToListAsync(cancellationToken);
        var configuredCodes = await db.TenantPermissionRules.AsNoTracking()
            .Where(x => x.TenantId == tenantId && x.SubjectType == TenantPermissionSubjectType.Role
                && x.SubjectRole == role)
            .Select(x => x.PermissionCode)
            .ToHashSetAsync(cancellationToken);
        var createdAt = DateTimeOffset.UtcNow;
        var missing = definitions.Where(x => IsBaselinePermission(x) && !configuredCodes.Contains(x.Code))
            .Select(x => BaselineRule(tenantId, role, x.Code, null, createdAt)).ToArray();
        if (missing.Length == 0) return 0;
        db.TenantPermissionRules.AddRange(missing);
        db.AuditEvents.Add(new AuditEvent
        {
            UserId = actorUserId,
            TenantId = tenantId,
            Action = "permission.baseline.seeded",
            Resource = AuditResourceSanitizer.Sanitize($"{role}:added={missing.Length}")
        });
        return missing.Length;
    }

    public static async Task AddTenantUserBaselineAsync(PlatformDbContext db, Guid tenantId, Guid? actorUserId = null,
        CancellationToken cancellationToken = default)
    {
        var definitions = await db.PermissionDefinitions.AsNoTracking().ToListAsync(cancellationToken);
        var createdAt = DateTimeOffset.UtcNow;
        db.TenantPermissionRules.AddRange(definitions.Where(IsBaselinePermission)
            .Select(x => BaselineRule(tenantId, "TenantUser", x.Code, actorUserId, createdAt)));
    }

    // New admin-only resources MUST be added here: the baseline (TenantUser and TenantDeveloper) grants every
    // PermissionDefinition that is not excluded, including permissions introduced later via the login backfill.
    private static readonly HashSet<string> ExcludedResourceTypes = new(StringComparer.Ordinal)
    {
        "erp.access-control", "erp.audit-events", "erp.audit-retention", "erp.payroll-compensation"
    };

    private static bool IsBaselinePermission(PermissionDefinition x) => !ExcludedResourceTypes.Contains(x.ResourceType)
        && (x.ResourceType != "erp.finance.credit-facilities" || x.Action == "read")
        && (x.ResourceType != "erp.finance-cash-budgets" || x.Action == "read");

    private static TenantPermissionRule BaselineRule(Guid tenantId, string role, string code, Guid? actorUserId,
        DateTimeOffset createdAt) => new()
    {
        TenantId = tenantId,
        SubjectType = TenantPermissionSubjectType.Role,
        SubjectRole = role,
        PermissionCode = code,
        Effect = TenantPermissionEffect.Allow,
        CreatedByUserId = actorUserId,
        CreatedAt = createdAt
    };
}
