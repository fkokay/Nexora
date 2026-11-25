using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using Microsoft.Data.SqlClient;
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

    /// <summary>Name of the filtered unique index that allows one unconditional role rule per role, permission, effect and active state.</summary>
    public const string UnconditionalRoleRuleIndexName = "UX_TenantPermissionRules_UnconditionalRoleRule";

    private const int MaxSeedAttempts = 5;

    /// <summary>
    /// Adds the default Allow role-rules for <paramref name="role"/> (TenantUser or TenantDeveloper; both get the same
    /// permission set) for every baseline permission that has no role-level rule for that role yet, and <b>saves them</b>.
    /// Existing rules, including administrator Deny rules and inactive rules, are never changed or removed.
    /// Seeded rules carry no <c>CreatedByUserId</c> (same as the migration seed), so the logging-in user is not shown as
    /// their author. When this call inserts at least one rule, one <c>permission.baseline.seeded</c> audit event is saved
    /// with them (attributed to <paramref name="actorUserId"/>, the user whose login triggered it).
    /// <para>
    /// Concurrent logins of the same tenant and role race here. The loser hits the filtered unique index
    /// <see cref="UnconditionalRoleRuleIndexName"/> (SQL Server 2601/2627, or deadlock 1205); its rules and audit event are detached, the
    /// existing rules are read again and only what is still missing is retried. A login that finds everything already
    /// seeded returns 0 and writes no audit event, so the user never sees an error and there is one audit per insert.
    /// </para>
    /// The context must have no other pending changes: this method saves on its own so that a unique violation cannot
    /// discard the caller's unrelated work. Returns the number of rules this call inserted.
    /// </summary>
    public static async Task<int> AddMissingRoleBaselineAsync(PlatformDbContext db, Guid tenantId, string role,
        Guid? actorUserId = null, CancellationToken cancellationToken = default)
    {
        if (!HasRoleBaseline(role)) throw new ArgumentOutOfRangeException(nameof(role), role, "Only TenantUser and TenantDeveloper have a baseline.");
        if (db.ChangeTracker.HasChanges())
            throw new InvalidOperationException("The role baseline is saved on its own; save or discard other pending changes first.");
        // Same insert order in every login keeps concurrent inserts on the unique index from deadlocking each other.
        var definitions = await db.PermissionDefinitions.AsNoTracking().OrderBy(x => x.Code).ToListAsync(cancellationToken);
        for (var attempt = 1; ; attempt++)
        {
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
            var audit = new AuditEvent
            {
                UserId = actorUserId,
                TenantId = tenantId,
                Action = "permission.baseline.seeded",
                Resource = AuditResourceSanitizer.Sanitize($"{role}:added={missing.Length}")
            };
            db.AuditEvents.Add(audit);
            try
            {
                await db.SaveChangesAsync(cancellationToken);
                return missing.Length;
            }
            catch (Exception exception) when (IsSeedConflict(exception))
            {
                // Another login seeded (some of) these rules first. Forget this attempt and look again.
                foreach (var rule in missing) db.Entry(rule).State = EntityState.Detached;
                db.Entry(audit).State = EntityState.Detached;
                if (attempt >= MaxSeedAttempts) throw;
                // Deadlock victims would otherwise retry in lockstep and deadlock again; spread the retries out.
                await Task.Delay(Random.Shared.Next(20, 120) * attempt, cancellationToken);
            }
        }
    }

    // Unique violations surface as DbUpdateException; a deadlock (1205) is "transient", so the SQL Server execution
    // strategy wraps it in an InvalidOperationException. Both mean another login is inserting the same rules.
    private static bool IsSeedConflict(Exception exception) => exception is DbUpdateException or InvalidOperationException
        && HasSqlError(exception, 2601, 2627, 1205);

    private static bool HasSqlError(Exception exception, params int[] numbers)
    {
        for (Exception? current = exception; current is not null; current = current.InnerException)
            if (current is SqlException sql && numbers.Contains(sql.Number)) return true;
        return false;
    }

    /// <summary>True for SQL Server unique-index / unique-constraint violations (2601/2627).</summary>
    public static bool IsUniqueViolation(DbUpdateException exception) => HasSqlError(exception, 2601, 2627);

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
