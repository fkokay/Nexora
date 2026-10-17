using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using Microsoft.EntityFrameworkCore;

namespace AIERP.Platform.Infrastructure;

public sealed class PlatformPermissionAuthorizer(PlatformDbContext db) : IPlatformPermissionAuthorizer
{
    public async Task<bool> IsAllowedAsync(Guid tenantId, Guid userId, string role,
        ResolvedPlatformPermission permission, CancellationToken cancellationToken = default)
    {
        var membership = await db.TenantMemberships.AsNoTracking()
            .Where(x => x.TenantId == tenantId && x.UserId == userId)
            .Select(x => new { x.Role, UserIsActive = x.User.IsActive, TenantIsActive = x.Tenant.IsActive })
            .SingleOrDefaultAsync(cancellationToken);
        if (membership is null || !membership.UserIsActive || !membership.TenantIsActive
            || !string.Equals(membership.Role, role, StringComparison.Ordinal)) return false;
        // TenantAdmin remains the existing tenant-wide administrator role and cannot be locked out by policy edits.
        if (string.Equals(role, "TenantAdmin", StringComparison.Ordinal)) return true;

        var rules = await db.TenantPermissionRules.AsNoTracking()
            .Where(x => x.TenantId == tenantId && x.IsActive && x.PermissionCode == permission.Permission.Code
                && (x.SubjectUserId == userId || x.SubjectRole == role))
            .ToListAsync(cancellationToken);
        if (permission.Attributes.TryGetValue("resource.collectionRowsFiltered", out var rowFilteredCollection)
            && string.Equals(rowFilteredCollection, "true", StringComparison.OrdinalIgnoreCase))
        {
            var scopedRules = rules.Where(rule => rule.ResourceType is null
                || string.Equals(rule.ResourceType, permission.Permission.ResourceType, StringComparison.OrdinalIgnoreCase)).ToList();
            var rowAttributes = new[] { "resource.status", "resource.customerId", "resource.supplierId", "resource.ownerUserId" };
            var routeMatched = scopedRules.Where(rule => !rowAttributes.Contains(rule.AttributeName, StringComparer.OrdinalIgnoreCase)
                && MatchesAttribute(rule, permission.Attributes)).ToList();
            if (routeMatched.Any(x => x.Effect == TenantPermissionEffect.Deny)) return false;
            return routeMatched.Any(x => x.Effect == TenantPermissionEffect.Allow)
                || scopedRules.Any(x => x.Effect == TenantPermissionEffect.Allow
                    && rowAttributes.Contains(x.AttributeName, StringComparer.OrdinalIgnoreCase));
        }
        var matched = rules.Where(rule =>
            (rule.ResourceType is null || string.Equals(rule.ResourceType, permission.Permission.ResourceType, StringComparison.OrdinalIgnoreCase))
            && MatchesAttribute(rule, permission.Attributes)).ToList();
        if (matched.Any(x => x.Effect == TenantPermissionEffect.Deny)) return false;
        return matched.Any(x => x.Effect == TenantPermissionEffect.Allow);
    }

    private static bool MatchesAttribute(TenantPermissionRule rule, IReadOnlyDictionary<string, string> attributes)
    {
        if (rule.AttributeName is null) return true;
        if (rule.AttributeOperator is null || rule.AttributeValue is null
            || !attributes.TryGetValue(rule.AttributeName, out var actual)) return false;
        return rule.AttributeOperator.Value switch
        {
            TenantPermissionConditionOperator.Equals => string.Equals(actual, rule.AttributeValue, StringComparison.OrdinalIgnoreCase),
            TenantPermissionConditionOperator.NotEquals => !string.Equals(actual, rule.AttributeValue, StringComparison.OrdinalIgnoreCase),
            TenantPermissionConditionOperator.In => rule.AttributeValue.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)
                .Any(value => string.Equals(actual, value, StringComparison.OrdinalIgnoreCase)),
            _ => false
        };
    }
}
