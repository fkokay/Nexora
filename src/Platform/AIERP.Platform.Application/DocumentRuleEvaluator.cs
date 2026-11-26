using System.Globalization;

namespace AIERP.Platform.Application;

/// <summary>Matched rules of a transition, in rule order: Block first decides, then Approval, then Warn (spec §5.5).</summary>
public sealed record DocumentRuleOutcome(IReadOnlyList<DocumentRule> Matched)
{
    public IReadOnlyList<DocumentRule> Blocks => Matched.Where(x => x.Action == DocumentRuleAction.Block).ToList();
    public IReadOnlyList<DocumentRule> Approvals => Matched.Where(x => x.Action == DocumentRuleAction.Approval).ToList();
    public IReadOnlyList<DocumentRule> Warnings => Matched.Where(x => x.Action == DocumentRuleAction.Warn).ToList();
}

/// <summary>
/// Applies enabled rules to a transition's facts with the existing business rule engine's operators. Facts are decimals (numbers),
/// strings (text, compared ignoring case) or <see cref="DateOnly"/> (dates); a missing or null fact only matches IsEmpty.
/// </summary>
public static class DocumentRuleEvaluator
{
    public static DocumentRuleOutcome Evaluate(IReadOnlyList<DocumentRule> rules, IReadOnlyDictionary<string, object?> facts) =>
        new(rules.Where(x => x.Enabled).OrderBy(x => x.Order).Where(rule => rule.Always || Matches(rule, facts)).ToList());

    private static bool Matches(DocumentRule rule, IReadOnlyDictionary<string, object?> facts)
    {
        facts.TryGetValue(rule.Field ?? "", out var fact);
        var empty = fact is null || fact is string s && string.IsNullOrWhiteSpace(s);
        switch (rule.Op)
        {
            case "IsEmpty": return empty;
            case "IsNotEmpty": return !empty;
        }
        if (empty) return false;
        var value = rule.Value ?? "";
        switch (fact)
        {
            case decimal number:
                if (!decimal.TryParse(value, NumberStyles.Number, CultureInfo.InvariantCulture, out var limit)) return false;
                return rule.Op switch
                {
                    "Equals" => number == limit, "NotEquals" => number != limit, "GreaterThan" => number > limit,
                    "GreaterThanOrEqual" => number >= limit, "LessThan" => number < limit, "LessThanOrEqual" => number <= limit, _ => false
                };
            case DateOnly date:
                if (!DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var day)) return false;
                return rule.Op switch
                {
                    "Equals" => date == day, "NotEquals" => date != day, "Before" => date < day, "OnOrBefore" => date <= day,
                    "After" => date > day, "OnOrAfter" => date >= day, _ => false
                };
            default:
                var text = Convert.ToString(fact, CultureInfo.InvariantCulture) ?? "";
                return rule.Op switch
                {
                    "Equals" => string.Equals(text.Trim(), value.Trim(), StringComparison.CurrentCultureIgnoreCase),
                    "NotEquals" => !string.Equals(text.Trim(), value.Trim(), StringComparison.CurrentCultureIgnoreCase),
                    "Contains" => text.Contains(value.Trim(), StringComparison.CurrentCultureIgnoreCase),
                    _ => false
                };
        }
    }
}
