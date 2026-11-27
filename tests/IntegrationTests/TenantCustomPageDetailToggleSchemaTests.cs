using System.Text.Json;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>
/// dataTable <c>detailToggleInput</c> (schema v2, draft 21): the list toolbar's "Detay paneli" button toggles a page checkbox
/// input, which the table then owns (it is not drawn on its own). The input must exist, be a checkbox and have no other owner;
/// the prop is accepted on dataTable only. The list standards use it on their main list and keep the filter row on one line.
/// </summary>
public sealed class TenantCustomPageDetailToggleSchemaTests
{
    private static object List() => new { id = "cariler", name = "cariler", kind = "read", operation = "cari.listele", parameters = Array.Empty<object>(), runOn = "load" };

    private static object Checkbox(string id = "detayPaneli", string inputType = "checkbox") =>
        new { id, type = "input", name = id, props = new { inputType, label = "Detay paneli" } };

    private static object Table(object props, string id = "liste") => new { id, type = "dataTable", name = id, props };

    private static string Page(params object[] components) => JsonSerializer.Serialize(new
    {
        schemaVersion = 2,
        queries = new[] { List() },
        components
    });

    private static void AssertRejected(string json, string contains)
    {
        Assert.False(TenantCustomPageSchema.Validate(json, out var error));
        Assert.Contains(contains, error);
    }

    [Fact]
    public void A_table_may_toggle_a_page_checkbox_from_its_toolbar() =>
        Assert.True(TenantCustomPageSchema.Validate(Page(Checkbox(), Table(new { query = "cariler", detailToggleInput = "detayPaneli" })), out var error), error);

    [Fact]
    public void The_toggle_needs_an_existing_checkbox_input()
    {
        AssertRejected(Page(Checkbox(), Table(new { query = "cariler", detailToggleInput = "yok" })), "'detailToggleInput' sayfadaki bir onay kutusu girişi olmalıdır: yok");
        AssertRejected(Page(Checkbox(inputType: "text"), Table(new { query = "cariler", detailToggleInput = "detayPaneli" })), "'detailToggleInput' sayfadaki bir onay kutusu girişi olmalıdır");
        AssertRejected(Page(Checkbox(), Table(new { query = "cariler", detailToggleInput = 1 })), "'detailToggleInput' sayfadaki bir onay kutusu girişinin kimliği olmalıdır");
        AssertRejected(Page(Checkbox(), Table(new { query = "cariler", detailToggleInput = "" })), "'detailToggleInput' sayfadaki bir onay kutusu girişinin kimliği olmalıdır");
    }

    [Fact]
    public void The_toggle_is_a_table_prop_only()
    {
        AssertRejected(Page(Checkbox(), new { id = "metin", type = "text", props = new { text = "Metin", detailToggleInput = "detayPaneli" } }),
            "'detailToggleInput' özelliği bu bileşen türünde kullanılamaz");
        AssertRejected(Page(new { id = "detayPaneli", type = "input", name = "detayPaneli", props = new { inputType = "checkbox", detailToggleInput = "detayPaneli" } }),
            "'detailToggleInput' özelliği bu bileşen türünde kullanılamaz");
    }

    [Fact]
    public void The_toggle_needs_a_full_query_bound_grid()
    {
        // The button lives on the advanced grid's toolbar: compact panel variants and report-source lists have none.
        AssertRejected(Page(Checkbox(), Table(new { source = "customers", detailToggleInput = "detayPaneli" })), "yalnız sorguya bağlı, tam (gelişmiş ızgaralı) veri listesinde");
        AssertRejected(Page(Checkbox(), Table(new { query = "cariler", variant = "list", detailToggleInput = "detayPaneli" })), "yalnız sorguya bağlı, tam (gelişmiş ızgaralı) veri listesinde");
        AssertRejected(Page(Checkbox(), Table(new { query = "cariler", variant = "bars", detailToggleInput = "detayPaneli" })), "yalnız sorguya bağlı, tam (gelişmiş ızgaralı) veri listesinde");
    }

    [Fact]
    public void The_toggled_input_has_one_owner()
    {
        // The table owns the input: a form card (the old "Görünüm" card) or a second table cannot also take it.
        var card = new { id = "gorunumKarti", type = "formCard", name = "gorunumKarti", props = new { title = "Görünüm", layout = "inline", inputs = new[] { "detayPaneli" } } };
        AssertRejected(Page(Checkbox(), card, Table(new { query = "cariler", detailToggleInput = "detayPaneli" })), "'detayPaneli' birden fazla sekmede veya yerleşimde kullanılamaz");
        AssertRejected(Page(Checkbox(), Table(new { query = "cariler", detailToggleInput = "detayPaneli" }), Table(new { query = "cariler", detailToggleInput = "detayPaneli" }, "ikinci")),
            "'detayPaneli' birden fazla sekmede veya yerleşimde kullanılamaz");
    }

    // crm-opportunities, customers (Satış & cari 1. dalga), fixed-assets (Finans 2. dalga) ve inventory-stock (Stok & Depo 1. dalga) ve sales-purchase-quotes / -receipts / -invoices (Satın alma 1. dalga) Liste kalıbına çizildi: detay kartı yanda hep açık, panel anahtarı yok.
    private static readonly string[] ToggleStandards =
    [
        "foreign-trade", "hr-leave-requests",
        "manufacturing-orders", "sales-purchase-delivery-notes", "sales-purchase-invoice-drafts",
        "sales-purchase-returns", "sales-purchasing", "sales-requests",
    ];

    private static JsonElement Definition(string screenKey) =>
        JsonDocument.Parse(SystemPageStandards.EmbeddedFiles().Single(x => x.FileName == screenKey + ".json").Json).RootElement.GetProperty("definition");

    [Fact]
    public void Every_standard_with_a_detail_panel_puts_its_toggle_on_the_main_list_toolbar()
    {
        // Every standard whose page has the detayPaneli checkbox is in the list (a new one must take the toolbar toggle too).
        var withPanel = SystemPageStandards.EmbeddedFiles()
            .Where(x => JsonDocument.Parse(x.Json).RootElement.GetProperty("definition").GetProperty("components").EnumerateArray()
                .Any(c => c.GetProperty("id").GetString() == "detayPaneli"))
            .Select(x => x.FileName[..^".json".Length]).Order(StringComparer.Ordinal).ToArray();
        Assert.Equal(ToggleStandards.Order(StringComparer.Ordinal), withPanel);
        foreach (var key in ToggleStandards)
        {
            var components = Definition(key).GetProperty("components").EnumerateArray().ToList();
            var list = components.Single(x => x.GetProperty("id").GetString() == "liste").GetProperty("props");
            Assert.Equal("detayPaneli", list.GetProperty("detailToggleInput").GetString());
            var input = components.Single(x => x.GetProperty("id").GetString() == "detayPaneli").GetProperty("props");
            Assert.Equal(("checkbox", "Detay paneli"), (input.GetProperty("inputType").GetString(), input.GetProperty("label").GetString()));
            // The old "Görünüm" card no longer holds the toggle.
            foreach (var card in components.Where(x => x.GetProperty("type").GetString() == "formCard"))
                if (card.GetProperty("props").TryGetProperty("inputs", out var inputs))
                    Assert.DoesNotContain("detayPaneli", inputs.EnumerateArray().Select(x => x.GetString()));
            Assert.DoesNotContain(components, x => x.GetProperty("id").GetString() == "gorunumKarti");
            // Only the main list carries the toggle.
            Assert.Single(components, x => x.GetProperty("type").GetString() == "dataTable" && x.GetProperty("props").TryGetProperty("detailToggleInput", out _));
        }
    }

    [Fact]
    public void Each_standard_filter_row_fits_one_line_of_twelve_columns()
    {
        foreach (var key in ToggleStandards)
        {
            var components = Definition(key).GetProperty("components").EnumerateArray().ToList();
            var byId = components.ToDictionary(x => x.GetProperty("id").GetString()!);
            // The filter row: the filter bar (it starts its own grid row) and the inline form cards right after it. Inputs owned by
            // those cards (or by the table) sit between them in the definition but are not drawn on their own.
            var start = components.FindIndex(x => x.GetProperty("type").GetString() == "filterBar");
            Assert.True(start >= 0, key);
            var widths = new List<int> { components[start].GetProperty("props").GetProperty("width").GetInt32() };
            foreach (var component in components.Skip(start + 1))
            {
                var type = component.GetProperty("type").GetString();
                if (type == "input") continue;
                var props = component.GetProperty("props");
                if (type != "formCard" || !props.TryGetProperty("layout", out var layout) || layout.GetString() != "inline")
                {
                    // The next drawn component starts a row of its own (chips, counts or the list itself at full width).
                    Assert.Equal(12, props.GetProperty("width").GetInt32());
                    break;
                }
                var width = props.GetProperty("width").GetInt32();
                widths.Add(width);
                // Every select (or picker) of the selections gets at least two of the twelve columns.
                var choices = props.GetProperty("inputs").EnumerateArray()
                    .Count(x => byId[x.GetString()!].GetProperty("props").GetProperty("inputType").GetString() is "select" or "lookup");
                Assert.True(width >= 2 * choices, $"{key}: {component.GetProperty("id").GetString()} width {width} for {choices} selections");
            }
            Assert.True(widths.Sum() <= 12, $"{key}: filter row widths {string.Join(" + ", widths)} exceed 12");
        }
    }

    [Fact]
    public void Foreign_trade_filter_row_is_search_six_and_both_selections_six()
    {
        var components = Definition("foreign-trade").GetProperty("components").EnumerateArray().ToDictionary(x => x.GetProperty("id").GetString()!);
        Assert.Equal(6, components["suzgec"].GetProperty("props").GetProperty("width").GetInt32());
        var selections = components["suzgecSecimleri"].GetProperty("props");
        Assert.Equal(6, selections.GetProperty("width").GetInt32());
        Assert.Equal<IEnumerable<string?>>(new[] { "yonSecimi", "durumSecimi" }, selections.GetProperty("inputs").EnumerateArray().Select(x => x.GetString()));
    }
}
