using System.Text.Json;
using AIERP.Platform.Application;
using Xunit;

namespace AIERP.Platform.UnitTests;

/// <summary>Belge kuralları PR 3, task 1: the rule set of satış siparişi Onayla.</summary>
public sealed class DocumentRuleSchemaTests
{
    private static readonly Guid Mehmet = Guid.Parse("11111111-0000-0000-0000-000000000001");

    private static object Approval(string code = "buyukTutar", int people = 1) => new
    {
        code, order = 1, enabled = true, always = false, field = "grandTotal", op = "GreaterThan", value = "100000", action = "approval",
        approverUserIds = Enumerable.Range(1, people).Select(i => Guid.Parse($"11111111-0000-0000-0000-00000000000{i}")).ToArray()
    };

    private static string Set(params object[] rules) => JsonSerializer.Serialize(rules);

    private static void Valid(string json) => Assert.True(DocumentRuleSchema.Validate(DocumentRuleSchema.SalesOrderApprove, json, out _, out var error), error);

    private static void Invalid(string json, string contains)
    {
        Assert.False(DocumentRuleSchema.Validate(DocumentRuleSchema.SalesOrderApprove, json, out _, out var error));
        Assert.Contains(contains, error);
    }

    [Fact]
    public void Approval_warning_block_and_always_rules_are_valid()
    {
        Valid(Set(
            Approval(),
            new { code = "iskonto", order = 2, enabled = true, always = false, field = "maxLineDiscount", op = "GreaterThan", value = "15", action = "warn", message = "İskonto yüksek." },
            new { code = "karaListe", order = 3, enabled = false, always = false, field = "customerGroup", op = "Equals", value = "Kara liste", action = "block", message = "Onaylanamaz." },
            new { code = "teslim", order = 4, enabled = true, always = false, field = "deliveryDate", op = "Before", value = "2026-12-01", action = "warn", message = "Teslim yakın." },
            new { code = "herZaman", order = 5, enabled = true, always = true, action = "warn", message = "Kontrol edin." }));
        Valid("[]");
    }

    [Fact]
    public void Parsed_rules_keep_order_and_people()
    {
        Assert.True(DocumentRuleSchema.Validate(DocumentRuleSchema.SalesOrderApprove, Set(Approval(people: 2)), out var rules, out _));
        Assert.Equal([Mehmet, Guid.Parse("11111111-0000-0000-0000-000000000002")], rules.Single().ApproverUserIds);
        Assert.Equal(DocumentRuleAction.Approval, rules.Single().Action);
    }

    [Fact]
    public void Unknown_field_and_wrong_operator_are_rejected()
    {
        Invalid(Set(new { code = "a", order = 1, enabled = true, always = false, field = "vergiNo", op = "Equals", value = "1", action = "warn", message = "x" }),
            "'vergiNo' bu geçişin alanı değil.");
        Invalid(Set(new { code = "a", order = 1, enabled = true, always = false, field = "customerGroup", op = "GreaterThan", value = "1", action = "warn", message = "x" }),
            "'GreaterThan' işleci 'Cari grubu' alanında kullanılamaz.");
        Invalid(Set(new { code = "a", order = 1, enabled = true, always = false, field = "grandTotal", op = "GreaterThan", value = "çok", action = "warn", message = "x" }),
            "'Genel toplam' için sayı yazın.");
    }

    [Fact]
    public void Approval_needs_one_to_five_people()
    {
        Invalid(Set(Approval(people: 0)), "Onay iste kuralı 1–5 kişi ister.");
        Invalid(Set(Approval(people: 6)), "Onay iste kuralı 1–5 kişi ister.");
    }

    [Fact]
    public void Warning_and_block_need_a_short_message()
    {
        Invalid(Set(new { code = "a", order = 1, enabled = true, always = true, action = "block", message = "" }), "Mesaj 1–200 karakter olmalı.");
        Invalid(Set(new { code = "a", order = 1, enabled = true, always = true, action = "warn", message = new string('x', 201) }), "Mesaj 1–200 karakter olmalı.");
    }

    [Fact]
    public void Set_limits_codes_and_shape()
    {
        Invalid(Set(Enumerable.Range(1, 21).Select(i => Approval($"k{i}")).ToArray()), "En fazla 20 kural");
        Invalid(Set(Approval("ayni"), Approval("ayni")), "'ayni' kodu iki kez");
        Invalid(Set(new { code = "a", order = 1, enabled = true, always = true, action = "notify", message = "x" }), "Bilinmeyen eylem");
        Invalid("{}", "Kural listesi");
        Invalid("[1]", "Kural biçimi geçersiz");
    }

    [Fact]
    public void Unknown_transition_has_no_rules()
    {
        Assert.False(DocumentRuleSchema.Validate("satis.siparis/sevk", "[]", out _, out var error));
        Assert.Contains("kural bağlanmaz", error);
    }
}
