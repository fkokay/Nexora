using System.Globalization;
using System.Text.Json;

namespace AIERP.Platform.Application;

public enum DocumentRuleAction { Approval, Warn, Block }

/// <summary>
/// One consultant rule (belge kuralları): <c>Eğer [field] [op] [value] ise [action]</c>, or <c>Her zaman [action]</c> when <see cref="Always"/>.
/// Approval names the deciding users; Warn and Block carry the message the user sees.
/// </summary>
public sealed record DocumentRule(string Code, int Order, bool Enabled, bool Always, string? Field, string? Op, string? Value,
    DocumentRuleAction Action, IReadOnlyList<Guid> ApproverUserIds, string? Message);

public sealed record DocumentRuleField(string Code, string Label, string Kind);

/// <summary>Validation of a document rule set (the JSON array stored in TenantDocumentRuleSets.RulesJson).</summary>
public static class DocumentRuleSchema
{
    /// <summary>The only transition rules attach to in this series (spec §5.5): satış siparişi Onayla.</summary>
    public const string SalesOrderApprove = "satis.siparis/onayla";
    public const int MaxRules = 20;
    public const int MaxApprovers = 5;
    public const int MaxMessage = 200;

    private static readonly IReadOnlyList<DocumentRuleField> SalesOrderFields =
    [
        new("grandTotal", "Genel toplam", "number"), new("subtotal", "Ara toplam", "number"), new("discountTotal", "İskonto toplamı", "number"),
        new("lineCount", "Satır sayısı", "number"), new("maxLineDiscount", "En yüksek satır iskontosu", "number"),
        new("customer", "Cari", "text"), new("customerGroup", "Cari grubu", "text"), new("currency", "Döviz", "text"),
        new("salesperson", "Plasiyer", "text"), new("orderDate", "Sipariş tarihi", "date"), new("deliveryDate", "Teslim tarihi", "date")
    ];

    /// <summary>The operators of the existing business rule engine, by field kind.</summary>
    public static readonly IReadOnlyDictionary<string, IReadOnlyList<string>> Operators = new Dictionary<string, IReadOnlyList<string>>
    {
        ["number"] = ["Equals", "NotEquals", "GreaterThan", "GreaterThanOrEqual", "LessThan", "LessThanOrEqual", "IsEmpty", "IsNotEmpty"],
        ["text"] = ["Equals", "NotEquals", "Contains", "IsEmpty", "IsNotEmpty"],
        ["date"] = ["Equals", "NotEquals", "Before", "OnOrBefore", "After", "OnOrAfter", "IsEmpty", "IsNotEmpty"]
    };

    /// <summary>The facts a transition's rules may read; empty for transitions without rules.</summary>
    public static IReadOnlyList<DocumentRuleField> FieldsOf(string transition) => transition == SalesOrderApprove ? SalesOrderFields : [];

    public static bool Validate(string transition, string json, out IReadOnlyList<DocumentRule> rules, out string? error)
    {
        rules = [];
        var fields = FieldsOf(transition);
        if (fields.Count == 0) return Fail($"'{transition}' geçişine kural bağlanmaz.", out error);
        JsonDocument document;
        try { document = JsonDocument.Parse(json); }
        catch (JsonException) { return Fail("Kural listesi geçerli JSON değil.", out error); }
        using (document)
        {
            if (document.RootElement.ValueKind != JsonValueKind.Array) return Fail("Kural listesi bir dizi olmalı.", out error);
            if (document.RootElement.GetArrayLength() > MaxRules) return Fail($"En fazla {MaxRules} kural olabilir.", out error);
            var parsed = new List<DocumentRule>();
            foreach (var item in document.RootElement.EnumerateArray())
            {
                if (!TryRule(item, fields, out var rule, out error)) return false;
                if (parsed.Any(x => x.Code == rule!.Code)) return Fail($"'{rule!.Code}' kodu iki kez kullanılmış.", out error);
                parsed.Add(rule!);
            }
            rules = parsed.OrderBy(x => x.Order).ToList();
            error = null;
            return true;
        }
    }

    private static bool TryRule(JsonElement item, IReadOnlyList<DocumentRuleField> fields, out DocumentRule? rule, out string? error)
    {
        rule = null;
        if (item.ValueKind != JsonValueKind.Object) return Fail("Kural biçimi geçersiz.", out error);
        var code = Str(item, "code");
        if (code is null || code.Length is < 1 or > 40 || !code.All(c => char.IsAsciiLetterOrDigit(c) || c is '-' or '_'))
            return Fail("Kural kodu 1–40 harf, rakam, - ya da _ olmalı.", out error);
        var action = Str(item, "action") switch
        {
            "approval" => DocumentRuleAction.Approval, "warn" => DocumentRuleAction.Warn, "block" => DocumentRuleAction.Block,
            _ => (DocumentRuleAction?)null
        };
        if (action is null) return Fail($"Bilinmeyen eylem: '{code}'.", out error);
        var always = item.TryGetProperty("always", out var a) && a.ValueKind == JsonValueKind.True;
        string? field = null, op = null, value = null;
        if (!always)
        {
            field = Str(item, "field");
            var definition = fields.FirstOrDefault(x => x.Code == field);
            if (definition is null) return Fail($"'{field}' bu geçişin alanı değil.", out error);
            op = Str(item, "op");
            if (op is null || !Operators[definition.Kind].Contains(op)) return Fail($"'{op}' işleci '{definition.Label}' alanında kullanılamaz.", out error);
            value = Str(item, "value") ?? "";
            if (op is not ("IsEmpty" or "IsNotEmpty"))
            {
                if (value.Trim().Length is 0 or > 120) return Fail($"'{definition.Label}' için bir değer yazın (en çok 120 karakter).", out error);
                if (definition.Kind == "number" && !decimal.TryParse(value, NumberStyles.Number, CultureInfo.InvariantCulture, out _))
                    return Fail($"'{definition.Label}' için sayı yazın.", out error);
                if (definition.Kind == "date" && !DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _))
                    return Fail($"'{definition.Label}' için tarih yazın (yyyy-aa-gg).", out error);
            }
        }
        var people = new List<Guid>();
        if (item.TryGetProperty("approverUserIds", out var list) && list.ValueKind == JsonValueKind.Array)
            foreach (var person in list.EnumerateArray())
                if (person.ValueKind == JsonValueKind.String && Guid.TryParse(person.GetString(), out var id) && !people.Contains(id)) people.Add(id);
                else return Fail("Onaylayacak kişi kimliği geçersiz.", out error);
        var message = Str(item, "message");
        if (action == DocumentRuleAction.Approval && people.Count is < 1 or > MaxApprovers) return Fail($"Onay iste kuralı 1–{MaxApprovers} kişi ister.", out error);
        if (action != DocumentRuleAction.Approval && (message is null || message.Trim().Length is 0 || message.Length > MaxMessage))
            return Fail($"Mesaj 1–{MaxMessage} karakter olmalı.", out error);
        var order = item.TryGetProperty("order", out var o) && o.TryGetInt32(out var n) ? n : 0;
        var enabled = !item.TryGetProperty("enabled", out var e) || e.ValueKind != JsonValueKind.False;
        rule = new DocumentRule(code, order, enabled, always, field, op, value, action.Value,
            action == DocumentRuleAction.Approval ? people : [], action == DocumentRuleAction.Approval ? null : message!.Trim());
        error = null;
        return true;
    }

    private static string? Str(JsonElement item, string name) =>
        item.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;

    private static bool Fail(string message, out string? error) { error = message; return false; }
}
