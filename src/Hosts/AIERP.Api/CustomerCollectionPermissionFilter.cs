using System.Linq.Expressions;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

/// <summary>
/// Applies row-level permission conditions before customer search and pagination.
/// CounterpartyType.Both is treated as the literal Both value. A Customer or Supplier
/// rule does not implicitly include Both; callers must explicitly allow Both when needed.
/// </summary>
internal static class CustomerCollectionPermissionFilter
{
    // These attributes are supplied by the authenticated request context and are
    // constant for every row in this tenant-scoped collection query.
    private static readonly string[] RequestAttributes =
        ["resource.type", "resource.tenantid"];

    // These attributes are projected from each customer row and can be translated
    // into SQL predicates.
    private static readonly string[] RowAttributes =
        ["resource.customerid", "resource.customertype", "resource.customeractive"];

    public static async Task<IQueryable<CustomerAccount>> ApplyAsync(PlatformDbContext platformDb,
        Guid tenantId, Guid userId, string role, IQueryable<CustomerAccount> query,
        CancellationToken cancellationToken = default)
    {
        if (string.Equals(role, "TenantAdmin", StringComparison.Ordinal)) return query;

        var rules = await platformDb.TenantPermissionRules.AsNoTracking()
            .Where(x => x.TenantId == tenantId && x.IsActive && x.PermissionCode == "erp.customers.read"
                && (x.SubjectUserId == userId || x.SubjectRole == role))
            .ToListAsync(cancellationToken);
        var scopedRules = rules.Where(rule => rule.ResourceType is null
            || string.Equals(rule.ResourceType, "erp.customers", StringComparison.OrdinalIgnoreCase)).ToArray();

        // Unknown row attributes cannot be evaluated by this collection query. Fail closed
        // rather than return an unfiltered page or an incomplete count.
        if (scopedRules.Any(rule => IsResourceAttribute(rule.AttributeName)
            && !IsSupportedResourceAttribute(rule.AttributeName!)))
            return query.Where(_ => false);

        var baseAttributes = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["subject.userId"] = userId.ToString("D"),
            ["subject.role"] = role,
            ["resource.type"] = "erp.customers",
            ["resource.tenantId"] = tenantId.ToString("D"),
            ["request.method"] = "GET",
            ["request.action"] = "read"
        };

        var allow = Combine(scopedRules.Where(x => x.Effect == TenantPermissionEffect.Allow), baseAttributes);
        var deny = Combine(scopedRules.Where(x => x.Effect == TenantPermissionEffect.Deny), baseAttributes);
        var parameter = Expression.Parameter(typeof(CustomerAccount), "customer");
        var predicate = Expression.Lambda<Func<CustomerAccount, bool>>(
            Expression.AndAlso(allow(parameter), Expression.Not(deny(parameter))), parameter);
        return query.Where(predicate);
    }

    private static Func<ParameterExpression, Expression> Combine(IEnumerable<TenantPermissionRule> rules,
        IReadOnlyDictionary<string, string> baseAttributes)
    {
        var expressions = rules.Select(rule => BuildRule(rule, baseAttributes)).ToArray();
        return parameter => expressions.Length == 0
            ? Expression.Constant(false)
            : expressions.Select(expression => expression(parameter)).Aggregate(Expression.OrElse);
    }

    private static Func<ParameterExpression, Expression> BuildRule(TenantPermissionRule rule,
        IReadOnlyDictionary<string, string> baseAttributes)
    {
        if (rule.AttributeName is null) return _ => Expression.Constant(true);
        if (!rule.AttributeName.StartsWith("resource.", StringComparison.OrdinalIgnoreCase))
            return _ => Expression.Constant(MatchesAttribute(rule, baseAttributes));
        // Match request-level resource attributes with the same semantics as the
        // shared authorizer. They are safe to evaluate once because the query is
        // already constrained to this authenticated tenant and resource type.
        if (RequestAttributes.Contains(rule.AttributeName, StringComparer.OrdinalIgnoreCase))
            return _ => Expression.Constant(MatchesAttribute(rule, baseAttributes));
        if (rule.AttributeOperator is null || rule.AttributeValue is null || !Enum.IsDefined(rule.AttributeOperator.Value))
            return _ => Expression.Constant(false);

        var op = rule.AttributeOperator.Value;
        var expected = rule.AttributeValue;
        var normalizedName = rule.AttributeName.ToLowerInvariant();
        if (normalizedName == "resource.customerid")
        {
            var ids = op == TenantPermissionConditionOperator.In
                ? expected.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries).Select(ParseGuid).ToArray()
                : [ParseGuid(expected)];
            if (ids.Length == 0 || ids.Any(id => id is null)) return _ => Expression.Constant(false);
            return parameter => BuildEquality(parameter, nameof(CustomerAccount.Id), ids.Select(id => (object)id!.Value).ToArray(), op);
        }
        if (normalizedName == "resource.customertype")
        {
            var values = op == TenantPermissionConditionOperator.In
                ? expected.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)
                : [expected];
            var types = values.Select(value => Enum.TryParse<CounterpartyType>(value, true, out var parsed)
                && Enum.IsDefined(parsed) ? (CounterpartyType?)parsed : null).ToArray();
            if (types.Length == 0 || types.Any(type => type is null)) return _ => Expression.Constant(false);
            return parameter => BuildEquality(parameter, nameof(CustomerAccount.Type), types.Select(type => (object)type!.Value).ToArray(), op);
        }
        if (normalizedName == "resource.customeractive")
        {
            var values = op == TenantPermissionConditionOperator.In
                ? expected.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)
                : [expected];
            var activeValues = values.Select(value => bool.TryParse(value, out var parsed) ? (bool?)parsed : null).ToArray();
            if (activeValues.Length == 0 || activeValues.Any(value => value is null)) return _ => Expression.Constant(false);
            return parameter => BuildEquality(parameter, nameof(CustomerAccount.IsActive), activeValues.Select(value => (object)value!.Value).ToArray(), op);
        }
        return _ => Expression.Constant(false);
    }

    private static Expression BuildEquality(ParameterExpression parameter, string propertyName, object[] values,
        TenantPermissionConditionOperator op)
    {
        var member = Expression.Property(parameter, propertyName);
        var matches = values.Select(value => (Expression)Expression.Equal(member, Expression.Constant(value, member.Type))).Aggregate(Expression.OrElse);
        return op == TenantPermissionConditionOperator.NotEquals ? Expression.Not(matches) : matches;
    }

    private static Guid? ParseGuid(string value) => Guid.TryParse(value, out var id) ? id : null;

    private static bool IsResourceAttribute(string? name) => name?.StartsWith("resource.", StringComparison.OrdinalIgnoreCase) == true;

    private static bool IsSupportedResourceAttribute(string name) =>
        RequestAttributes.Contains(name, StringComparer.OrdinalIgnoreCase)
        || RowAttributes.Contains(name, StringComparer.OrdinalIgnoreCase);

    private static bool MatchesAttribute(TenantPermissionRule rule, IReadOnlyDictionary<string, string> attributes)
    {
        if (rule.AttributeName is null) return true;
        if (rule.AttributeOperator is null || rule.AttributeValue is null
            || !Enum.IsDefined(rule.AttributeOperator.Value)
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
