using System.Linq.Expressions;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

internal static class PermissionStatusFilter
{
    public static async Task<IQueryable<TEntity>?> ApplyAsync<TEntity, TStatus>(PlatformDbContext db, Guid tenantId,
        Guid userId, string role, string permissionCode, string resourceType, IQueryable<TEntity> query,
        Expression<Func<TEntity, TStatus>> statusSelector, Expression<Func<TEntity, Guid>>? customerSelector = null,
        Expression<Func<TEntity, Guid>>? supplierSelector = null, Expression<Func<TEntity, Guid>>? ownerSelector = null,
        CancellationToken cancellationToken = default)
        where TStatus : struct, Enum
    {
        if (string.Equals(role, "TenantAdmin", StringComparison.Ordinal)) return null;
        var rules = await db.TenantPermissionRules.AsNoTracking()
            .Where(x => x.TenantId == tenantId && x.IsActive && x.PermissionCode == permissionCode
                && (x.SubjectUserId == userId || x.SubjectRole == role))
            .ToListAsync(cancellationToken);
        var scopedRules = rules.Where(rule => rule.ResourceType is null
            || string.Equals(rule.ResourceType, resourceType, StringComparison.OrdinalIgnoreCase)).ToList();
        var resourceRules = scopedRules.Where(rule => rule.AttributeName is not null
            && rule.AttributeName.StartsWith("resource.", StringComparison.OrdinalIgnoreCase)
            && !rule.AttributeName.StartsWith("resource.route.", StringComparison.OrdinalIgnoreCase)).ToList();
        if (resourceRules.Count == 0) return null;

        // A resource condition this collection cannot resolve must never broaden access.
        if (resourceRules.Any(rule =>
            string.Equals(rule.AttributeName, "resource.status", StringComparison.OrdinalIgnoreCase) ? false
            : string.Equals(rule.AttributeName, "resource.customerId", StringComparison.OrdinalIgnoreCase) ? customerSelector is null
            : string.Equals(rule.AttributeName, "resource.supplierId", StringComparison.OrdinalIgnoreCase) ? supplierSelector is null
            : string.Equals(rule.AttributeName, "resource.ownerUserId", StringComparison.OrdinalIgnoreCase) ? ownerSelector is null
            : true)) return query.Where(_ => false);

        var baseAttributes = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["subject.userId"] = userId.ToString("D"),
            ["subject.role"] = role,
            ["resource.type"] = resourceType,
            ["resource.tenantId"] = tenantId.ToString("D"),
            ["request.method"] = "GET",
            ["request.action"] = "read"
        };
        var parameter = Expression.Parameter(typeof(TEntity), "row");
        var allow = CombineRules(scopedRules.Where(x => x.Effect == TenantPermissionEffect.Allow), parameter,
            baseAttributes, statusSelector, customerSelector, supplierSelector, ownerSelector);
        var deny = CombineRules(scopedRules.Where(x => x.Effect == TenantPermissionEffect.Deny), parameter,
            baseAttributes, statusSelector, customerSelector, supplierSelector, ownerSelector);
        var predicate = Expression.Lambda<Func<TEntity, bool>>(
            Expression.AndAlso(allow, Expression.Not(deny)), parameter);
        return query.Where(predicate);
    }

    private static Expression CombineRules<TEntity, TStatus>(IEnumerable<TenantPermissionRule> rules,
        ParameterExpression parameter, IReadOnlyDictionary<string, string> baseAttributes,
        Expression<Func<TEntity, TStatus>> statusSelector, Expression<Func<TEntity, Guid>>? customerSelector,
        Expression<Func<TEntity, Guid>>? supplierSelector, Expression<Func<TEntity, Guid>>? ownerSelector)
        where TStatus : struct, Enum
    {
        Expression? combined = null;
        foreach (var rule in rules)
        {
            var expression = BuildRule<TEntity, TStatus>(rule, parameter, baseAttributes,
                statusSelector, customerSelector, supplierSelector, ownerSelector);
            combined = combined is null ? expression : Expression.OrElse(combined, expression);
        }
        return combined ?? Expression.Constant(false);
    }

    private static Expression BuildRule<TEntity, TStatus>(TenantPermissionRule rule, ParameterExpression parameter,
        IReadOnlyDictionary<string, string> baseAttributes, Expression<Func<TEntity, TStatus>> statusSelector,
        Expression<Func<TEntity, Guid>>? customerSelector, Expression<Func<TEntity, Guid>>? supplierSelector,
        Expression<Func<TEntity, Guid>>? ownerSelector) where TStatus : struct, Enum
    {
        if (rule.AttributeName is null) return Expression.Constant(true);
        if (!rule.AttributeName.StartsWith("resource.", StringComparison.OrdinalIgnoreCase))
            return Expression.Constant(MatchesAttribute(rule, baseAttributes));
        var operatorValue = rule.AttributeOperator;
        var raw = rule.AttributeValue;
        if (operatorValue is null || raw is null || !Enum.IsDefined(operatorValue.Value)) return Expression.Constant(false);
        if (string.Equals(rule.AttributeName, "resource.status", StringComparison.OrdinalIgnoreCase))
        {
            var matchingStatuses = Enum.GetValues<TStatus>().Where(status => MatchesValue(status.ToString(), operatorValue.Value, raw)).ToArray();
            if (matchingStatuses.Length == 0) return Expression.Constant(false);
            var body = ReplaceParameter(statusSelector.Body, statusSelector.Parameters[0], parameter);
            return Expression.Call(typeof(Enumerable), nameof(Enumerable.Contains), [typeof(TStatus)],
                Expression.Constant(matchingStatuses), body);
        }
        var selector = rule.AttributeName.ToLowerInvariant() switch
        {
            "resource.customerid" => customerSelector,
            "resource.supplierid" => supplierSelector,
            "resource.owneruserid" => ownerSelector,
            _ => null
        };
        if (selector is null) return Expression.Constant(false);
        var ids = operatorValue == TenantPermissionConditionOperator.In
            ? raw.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries).Select(ParseGuid).ToArray()
            : [ParseGuid(raw)];
        if (ids.Length == 0 || ids.Any(x => x is null)) return Expression.Constant(false);
        var value = ReplaceParameter(selector.Body, selector.Parameters[0], parameter);
        var comparisons = ids.Select(id => (Expression)Expression.Equal(value, Expression.Constant(id!.Value))).ToArray();
        Expression match = comparisons.Aggregate(Expression.OrElse);
        return operatorValue == TenantPermissionConditionOperator.NotEquals ? Expression.Not(match) : match;
    }

    private static Guid? ParseGuid(string value) => Guid.TryParse(value, out var id) ? id : null;

    private static Expression ReplaceParameter(Expression body, ParameterExpression source, ParameterExpression target) =>
        new ParameterReplaceVisitor(source, target).Visit(body)!;

    private sealed class ParameterReplaceVisitor(ParameterExpression source, ParameterExpression target) : ExpressionVisitor
    {
        protected override Expression VisitParameter(ParameterExpression node) => node == source ? target : base.VisitParameter(node);
    }

    private static bool MatchesAttribute(TenantPermissionRule rule, IReadOnlyDictionary<string, string> attributes)
    {
        if (rule.AttributeName is null) return true;
        if (rule.AttributeOperator is null || rule.AttributeValue is null
            || !attributes.TryGetValue(rule.AttributeName, out var actual)) return false;
        return MatchesValue(actual, rule.AttributeOperator.Value, rule.AttributeValue);
    }

    private static bool MatchesValue(string actual, TenantPermissionConditionOperator condition, string expected) => condition switch
    {
        TenantPermissionConditionOperator.Equals => string.Equals(actual, expected, StringComparison.OrdinalIgnoreCase),
        TenantPermissionConditionOperator.NotEquals => !string.Equals(actual, expected, StringComparison.OrdinalIgnoreCase),
        TenantPermissionConditionOperator.In => expected.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)
            .Any(value => string.Equals(actual, value, StringComparison.OrdinalIgnoreCase)),
        _ => false
    };
}
