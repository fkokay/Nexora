using System.Text.Json;
using System.Text.Json.Nodes;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>
/// Boş değer yedekleri: girişin <c>emptyDefault</c> özelliği (varsayılan boş çözülünce sabit değer), metin bileşeninin
/// <c>parts</c> listesi (boş bağlamalı parça düşer) ve İşlem Çubuğu Sil onayının <c>deleteConfirmText</c> metni; Cari
/// standartları bunları kullanır.
/// </summary>
public sealed class TenantCustomPageSchemaTextFallbackTests
{
    private static string V2(object[] queries, params object[] components) => JsonSerializer.Serialize(new { schemaVersion = 2, queries, components });
    private static readonly object Card = new { id = "q1", name = "kart", kind = "read", runOn = "load", parameters = Array.Empty<object>(), sql = "SELECT Code, CurrencyCode FROM CustomerAccounts" };
    private static readonly object Delete = new
    {
        id = "q2", name = "kartSil", kind = "delete", runOn = "manual", sql = "DELETE FROM CustomerAccounts WHERE Code = @code",
        parameters = new[] { new { name = "code", binding = "{{liste.seciliSatir.Code}}", type = "text" } },
    };
    private static readonly object Table = new { id = "t1", type = "dataTable", name = "liste", props = new { query = "q1", columns = new[] { "Code" } } };
    private static object Input(object props) => new { id = "i1", type = "input", name = "doviz", props };
    private static object Text(object props) => new { id = "x1", type = "text", name = "ozet", props };
    private static object Metric(object props) => new { id = "m1", type = "metric", name = "gosterge", props };
    private static object Bar(object props) => new { id = "ab", type = "actionBar", name = "komutlar", props };

    private static void AssertValid(string json) => Assert.True(TenantCustomPageSchema.Validate(json, out var error), error);
    private static void AssertRejected(string json, string contains)
    {
        Assert.False(TenantCustomPageSchema.Validate(json, out var error));
        Assert.Contains(contains, error);
    }

    [Fact]
    public void Accepts_empty_default_on_text_and_number_inputs()
    {
        AssertValid(V2([Card], Input(new { inputType = "text", required = true, defaultValue = "{{kart.rows[0].CurrencyCode}}", emptyDefault = "TRY" })));
        AssertValid(V2([Card], Input(new { inputType = "number", defaultValue = "{{kart.rows[0].Code}}", emptyDefault = "0" })));
        AssertValid(V2([Card], Input(new { inputType = "number", emptyDefault = "12.5" })));
        AssertValid(V2([Card], Input(new { emptyDefault = "" })));
    }

    [Fact]
    public void Rejects_empty_default_on_other_types_bindings_or_bad_numbers()
    {
        AssertRejected(V2([Card], Input(new { inputType = "select", staticOptions = new[] { "a=A" }, emptyDefault = "a" })), "'emptyDefault' yalnız metin, sayı ve tarih");
        AssertRejected(V2([Card], Input(new { inputType = "checkbox", emptyDefault = "true" })), "'emptyDefault' yalnız metin, sayı ve tarih");
        AssertRejected(V2([Card], Text(new { text = "x", emptyDefault = "TRY" })), "'emptyDefault' yalnız metin, sayı ve tarih");
        AssertRejected(V2([Card], Input(new { inputType = "number", emptyDefault = "sıfır" })), "geçerli bir sayı");
        AssertRejected(V2([Card], Input(new { inputType = "text", emptyDefault = 3 })), "'emptyDefault' en fazla");
        AssertRejected(V2([Card], Input(new { inputType = "text", emptyDefault = new string('A', 201) })), "'emptyDefault' en fazla");
        // Sabit değerdir: bağlama taşıyamaz.
        Assert.False(TenantCustomPageSchema.Validate(V2([Card], Input(new { inputType = "text", emptyDefault = "{{kart.rows[0].Code}}" })), out _));
    }

    [Fact]
    public void Metric_description_format_is_number_or_money_on_metrics_only()
    {
        AssertValid(V2([Card], Metric(new { title = "İskonto", value = "{{kart.rows[0].Code}}", format = "money", description = "matrah {{kart.rows[0].Code}}", descriptionFormat = "money" })));
        AssertValid(V2([Card], Metric(new { title = "Adet", descriptionFormat = "number" })));
        AssertValid(V2([Card], Metric(new { title = "Adet", descriptionFormat = "" })));
        AssertRejected(V2([Card], Metric(new { title = "Adet", descriptionFormat = "date" })), "'descriptionFormat' yalnız göstergede");
        AssertRejected(V2([Card], Text(new { text = "x", descriptionFormat = "money" })), "'descriptionFormat' yalnız göstergede");
    }

    [Fact]
    public void Date_input_empty_default_is_a_date_or_one_date_scope_binding()
    {
        // Kayıtlı belgenin tarihini düzenleyen kart yeni belgede bugünle başlar.
        AssertValid(V2([Card], Input(new { inputType = "date", required = true, defaultValue = "{{kart.rows[0].Code}}", emptyDefault = "{{bugun}}" })));
        AssertValid(V2([Card], Input(new { inputType = "date", emptyDefault = "{{ tarih.ayBasi }}" })));
        AssertValid(V2([Card], Input(new { inputType = "date", emptyDefault = "2026-01-01" })));
        AssertValid(V2([Card], Input(new { inputType = "date", emptyDefault = "" })));
        // Başka bağlama ya da birden çok bağlama sabit değer denetiminde düşer.
        Assert.False(TenantCustomPageSchema.Validate(V2([Card], Input(new { inputType = "date", emptyDefault = "{{kart.rows[0].Code}}" })), out _));
        Assert.False(TenantCustomPageSchema.Validate(V2([Card], Input(new { inputType = "date", emptyDefault = "{{bugun}} {{bugun}}" })), out _));
        AssertRejected(V2([Card], Input(new { inputType = "date", emptyDefault = "yarın" })), "tek bir tarih bağlaması");
        Assert.False(TenantCustomPageSchema.Validate(V2([Card], Input(new { inputType = "datetime", emptyDefault = "{{bugun}}" })), out _));
        AssertRejected(V2([Card], Input(new { inputType = "datetime", emptyDefault = "2026-01-01" })), "'emptyDefault' yalnız metin, sayı ve tarih");
    }

    [Fact]
    public void Accepts_bindable_text_parts()
    {
        AssertValid(V2([Card], Text(new { parts = new[] { "{{kart.rows[0].Code}}", "Vade {{kart.rows[0].Code}} gün", "Sabit parça" } })));
        AssertValid(V2([Card], Text(new { text = "Yedek", parts = new[] { "{{kart.rows[0].Code}}" } })));
    }

    [Fact]
    public void Rejects_parts_on_other_types_or_with_bad_items()
    {
        AssertRejected(V2([Card], new { id = "h1", type = "heading", props = new { text = "x", parts = new[] { "a" } } }), "'parts' yalnız metin bileşeninde");
        AssertRejected(V2([Card], Text(new { parts = Array.Empty<string>() })), "'parts' 1–12");
        AssertRejected(V2([Card], Text(new { parts = Enumerable.Repeat("a", 13).ToArray() })), "'parts' 1–12");
        AssertRejected(V2([Card], Text(new { parts = new[] { " " } })), "'parts' 1–12");
        AssertRejected(V2([Card], Text(new { parts = new[] { new string('a', 201) } })), "'parts' 1–12");
        AssertRejected(V2([Card], Text(new { parts = "tek metin" })), "'parts' 1–12");
        // Güvensiz metin ve bozuk bağlama genel denetimden geçmez.
        Assert.False(TenantCustomPageSchema.Validate(V2([Card], Text(new { parts = new[] { "<b>x</b>" } })), out _));
        Assert.False(TenantCustomPageSchema.Validate(V2([Card], Text(new { parts = new[] { "{{ kart. }}" } })), out _));
    }

    [Fact]
    public void Accepts_bindable_delete_confirm_text_on_the_action_bar_only()
    {
        AssertValid(V2([Card, Delete], Table, Bar(new { deleteQuery = "q2", deleteConfirmText = "{{liste.seciliSatir.Code}} cari kartı silinsin mi?" })));
        AssertRejected(V2([Card, Delete], Table, new { id = "b1", type = "button", props = new { text = "Sil", deleteConfirmText = "Silinsin mi?" } }),
            "'deleteConfirmText' özelliği yalnızca İşlem Çubuğu");
        AssertRejected(V2([Card, Delete], Table, Bar(new { deleteQuery = "q2", deleteConfirmText = new string('a', 301) })), "'deleteConfirmText' en fazla 300");
        Assert.False(TenantCustomPageSchema.Validate(V2([Card, Delete], Table, Bar(new { deleteQuery = "q2", deleteConfirmText = "<i>sil</i>" })), out _));
    }

    [Fact]
    public void Customer_standards_use_the_fallbacks()
    {
        static JsonObject Props(JsonObject definition, string id) =>
            definition["components"]!.AsArray().OfType<JsonObject>().Single(x => (string)x["id"]! == id)["props"]!.AsObject();
        var create = JsonNode.Parse(SystemPageStandards.All["customer-create"].DefinitionJson)!.AsObject();
        Assert.Equal(("{{kart.rows[0].currencyCode}}", "TRY"), ((string)Props(create, "doviz")["defaultValue"]!, (string)Props(create, "doviz")["emptyDefault"]!));
        Assert.Equal(("{{kart.rows[0].paymentTermDays}}", "0"), ((string)Props(create, "vadeGunu")["defaultValue"]!, (string)Props(create, "vadeGunu")["emptyDefault"]!));
        // Kayıt kartı kalıbında özet bir kayıt özetidir (recordHeader): boş bağlamalı alt satır ve değerler kendiliğinden düşer / "—" olur.
        var summary = Props(create, "kartOzeti");
        Assert.False(summary.ContainsKey("parts"));
        Assert.Equal(("summary", "{{kart.rows[0].code}}"), ((string)summary["slot"]!, (string)summary["subtitle"]!));
        Assert.Equal(new[] { "Bakiye={{bakiye.rows[0].balanceAmount}}", "Vade (gün)={{kart.rows[0].paymentTermDays}}", "Vergi no={{kart.rows[0].taxNumber}}" },
            summary["fields"]!.AsArray().Select(x => (string)x!));
        var customers = JsonNode.Parse(SystemPageStandards.All["customers"].DefinitionJson)!.AsObject();
        Assert.Equal("{{liste.seciliSatir.code}} · {{liste.seciliSatir.name}} cari kartı silinsin mi?", (string)Props(customers, "komutlar")["deleteConfirmText"]!);
        foreach (var key in new[] { "customer-create", "customers", "finance-account-create" })
            Assert.True(TenantCustomPageSchema.Validate(SystemPageStandards.All[key].DefinitionJson, out var error), $"{key}: {error}");
    }
}
