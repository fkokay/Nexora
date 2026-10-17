using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace AIERP.Platform.Application;

public sealed record TenantBusinessRuleCondition(string Field, string Operator, string Value);
public sealed record TenantBusinessRuleField(string Code, string Label, string Type);
public sealed record TenantBusinessRuleTrigger(string Code, string Label, string Description, IReadOnlyList<TenantBusinessRuleField> Fields);
public sealed record TenantBusinessRuleValidationResult(IReadOnlyList<TenantBusinessRuleCondition> Conditions, IReadOnlyList<string> Errors)
{
    public bool IsValid => Errors.Count == 0;
}

public static partial class TenantBusinessRuleEngine
{
    public const string PurchaseRequestSubmitted = "purchase-request.submitted";
    public const string SalesQuoteAccepted = "sales-quote.accepted";
    private static readonly IReadOnlyList<TenantBusinessRuleTrigger> Triggers =
    [
        new(PurchaseRequestSubmitted, "Satın alma talebi gönderildi", "Talep kaydedilip gönderildiğinde değerlendirilir.",
        [
            new("code", "Talep kodu", "text"), new("description", "Açıklama", "text"), new("requesterUserId", "Talep sahibi kullanıcı kodu", "text"),
            new("lineCount", "Satır sayısı", "number"), new("requestDate", "Talep tarihi", "date"), new("neededByDate", "İhtiyaç tarihi", "date")
        ]),
        new(SalesQuoteAccepted, "Satış teklifi kabul edildi", "Kabul edilen teklif, siparişe dönüştürülmeden önce onaya yönlendirilebilir.",
        [
            new("code", "Teklif kodu", "text"), new("customerId", "Cari kullanıcı kodu", "text"), new("currencyCode", "Para birimi", "text"),
            new("lineCount", "Satır sayısı", "number"), new("grandTotal", "Genel toplam", "number"),
            new("quoteDate", "Teklif tarihi", "date"), new("validUntil", "Geçerlilik tarihi", "date")
        ])
    ];

    public static IReadOnlyList<TenantBusinessRuleTrigger> SupportedTriggers => Triggers;
    public static bool IsSupportedTrigger(string? trigger) => Triggers.Any(x => string.Equals(x.Code, trigger, StringComparison.Ordinal));

    public static TenantBusinessRuleValidationResult Validate(IReadOnlyList<TenantBusinessRuleCondition>? conditions,
        string trigger = PurchaseRequestSubmitted)
    {
        var definition = Triggers.SingleOrDefault(x => x.Code == trigger);
        if (definition is null) return new([], ["Rule trigger is not supported."]);
        if (conditions is null || conditions.Count is < 1 or > 20)
            return new([], ["Rule must have between 1 and 20 conditions."]);
        var textFields = definition.Fields.Where(x => x.Type == "text").Select(x => x.Code).ToHashSet(StringComparer.Ordinal);
        var decimalFields = definition.Fields.Where(x => x.Type == "number").Select(x => x.Code).ToHashSet(StringComparer.Ordinal);
        var dateFields = definition.Fields.Where(x => x.Type == "date").Select(x => x.Code).ToHashSet(StringComparer.Ordinal);
        var errors = new List<string>();
        var normalized = new List<TenantBusinessRuleCondition>(conditions.Count);
        foreach (var (condition, index) in conditions.Select((item, index) => (item, index)))
        {
            if (condition is null) { errors.Add($"Condition {index + 1} must be an object."); continue; }
            var value = condition.Value ?? "";
            if (value.Length > 200) errors.Add($"Condition {index + 1} value must contain at most 200 characters.");
            var emptyOperator = condition.Operator is "IsEmpty" or "IsNotEmpty";
            if (!emptyOperator && string.IsNullOrWhiteSpace(value)) errors.Add($"Condition {index + 1} requires a comparison value.");
            var allowed = textFields.Contains(condition.Field) ? condition.Operator is "Equals" or "NotEquals" or "Contains" or "IsEmpty" or "IsNotEmpty"
                : decimalFields.Contains(condition.Field) ? condition.Operator is "Equals" or "NotEquals" or "GreaterThan" or "GreaterThanOrEqual" or "LessThan" or "LessThanOrEqual" or "IsEmpty" or "IsNotEmpty"
                : dateFields.Contains(condition.Field) ? condition.Operator is "Equals" or "NotEquals" or "Before" or "OnOrBefore" or "After" or "OnOrAfter" or "IsEmpty" or "IsNotEmpty"
                : false;
            if (!allowed) errors.Add($"Condition {index + 1} uses an unsupported field or operator.");
            else if (!emptyOperator && decimalFields.Contains(condition.Field)
                && !decimal.TryParse(value, NumberStyles.AllowLeadingSign | NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out _))
                errors.Add($"Condition {index + 1} must use an invariant decimal value.");
            else if (!emptyOperator && dateFields.Contains(condition.Field)
                && value.Length > 0 && !DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _))
                errors.Add($"Condition {index + 1} must use YYYY-MM-DD.");
            normalized.Add(condition with { Value = value.Trim() });
        }
        if (errors.Count > 0) return new([], errors);
        if (JsonSerializer.SerializeToUtf8Bytes(normalized).Length > 12 * 1024)
            return new([], ["Rule conditions exceed 12 KiB."]);
        return new(normalized, []);
    }

    public static bool Matches(IReadOnlyList<TenantBusinessRuleCondition> conditions, IReadOnlyDictionary<string, string?> facts)
    {
        if (conditions.Count == 0 || conditions.Count > 20 || conditions.Any(x => x is null)) return false;
        foreach (var condition in conditions)
        {
            if (!facts.TryGetValue(condition.Field, out var raw)) return false;
            if (!MatchesValue(condition.Field, condition.Operator, raw ?? "", condition.Value ?? "")) return false;
        }
        return true;
    }

    private static bool MatchesValue(string field, string op, string actual, string expected)
    {
        if (op == "IsEmpty") return string.IsNullOrWhiteSpace(actual);
        if (op == "IsNotEmpty") return !string.IsNullOrWhiteSpace(actual);
        if (field is "lineCount" or "grandTotal")
        {
            if (!decimal.TryParse(actual, NumberStyles.AllowLeadingSign | NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out var left)
                || !decimal.TryParse(expected, NumberStyles.AllowLeadingSign | NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out var right)) return false;
            return op switch
            {
                "Equals" => left == right, "NotEquals" => left != right, "GreaterThan" => left > right,
                "GreaterThanOrEqual" => left >= right, "LessThan" => left < right, "LessThanOrEqual" => left <= right, _ => false
            };
        }
        if (field is "requestDate" or "neededByDate" or "quoteDate" or "validUntil")
        {
            if (!DateOnly.TryParseExact(actual, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var left)) return false;
            if (expected.Length == 0) return op == "Equals" ? actual.Length == 0 : op == "NotEquals" && actual.Length > 0;
            if (!DateOnly.TryParseExact(expected, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var right)) return false;
            return op switch
            {
                "Equals" => left == right, "NotEquals" => left != right, "Before" => left < right,
                "OnOrBefore" => left <= right, "After" => left > right, "OnOrAfter" => left >= right, _ => false
            };
        }
        var equal = string.Equals(actual, expected, StringComparison.OrdinalIgnoreCase);
        return op switch
        {
            "Equals" => equal, "NotEquals" => !equal, "Contains" => actual.Contains(expected, StringComparison.OrdinalIgnoreCase), _ => false
        };
    }

    public static bool IsValidCode(string? code) => !string.IsNullOrWhiteSpace(code)
        && code.Trim().Length <= 40 && RuleCodeRegex().IsMatch(code.Trim());

    [GeneratedRegex("^[a-z][a-z0-9_-]{0,39}$", RegexOptions.CultureInvariant)]
    private static partial Regex RuleCodeRegex();
}
