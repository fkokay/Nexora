using System.Text.Json;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>
/// Proje 4 list-look props: one-row formCard (<c>layout</c>), conditional width (<c>widthWhen</c>), static options on a
/// select, and dataTable column headings/units/value labels (<c>columnLabels</c>, <c>columnUnits</c>, <c>valueLabels</c>).
/// </summary>
public sealed class TenantCustomPageSchemaListLookTests
{
    private static string V2(params object[] components) => JsonSerializer.Serialize(new
    {
        schemaVersion = 2,
        queries = new object[] { new { id = "q1", name = "veri", kind = "read", sql = "SELECT 1 AS x", parameters = Array.Empty<object>(), runOn = "load" } },
        components
    });

    private static object Input(string id, object props) => new { id, type = "input", name = id, props };
    private static object Table(object props) => new { id = "t1", type = "dataTable", name = "liste", props };

    private static void Accepted(string json) => Assert.True(TenantCustomPageSchema.Validate(json, out var error), error);

    private static void Rejected(string json, string contains)
    {
        Assert.False(TenantCustomPageSchema.Validate(json, out var error));
        Assert.Contains(contains, error);
    }

    [Fact]
    public void FormCard_layout_is_grid_or_inline_on_form_cards_only()
    {
        var search = Input("ara", new { inputType = "text" });
        Accepted(V2(search, new { id = "f1", type = "formCard", name = "f1", props = new { layout = "inline", inputs = new[] { "ara" } } }));
        Accepted(V2(search, new { id = "f1", type = "formCard", name = "f1", props = new { layout = "grid", columns = 3, inputs = new[] { "ara" } } }));
        Rejected(V2(search, new { id = "f1", type = "formCard", name = "f1", props = new { layout = "row", inputs = new[] { "ara" } } }), "'layout'");
        Rejected(V2(search, new { id = "f1", type = "formCard", name = "f1", props = new { layout = true, inputs = new[] { "ara" } } }), "'layout'");
        Rejected(V2(new { id = "h1", type = "heading", props = new { text = "x", layout = "inline" } }), "'layout' özelliği bu bileşen türünde kullanılamaz.");
    }

    [Fact]
    public void WidthWhen_needs_a_width_and_a_valid_condition()
    {
        var toggle = Input("panel", new { inputType = "checkbox" });
        Accepted(V2(toggle, Table(new { query = "q1", width = 12, widthWhen = "8=panel.value == true && liste.seciliSatir.x != null" })));
        Accepted(V2(toggle, new { id = "h1", type = "heading", props = new { text = "x", widthWhen = "12=panel.value == true" } }));
        Rejected(V2(toggle, Table(new { query = "q1", widthWhen = "13=panel.value == true" })), "'widthWhen' genişlik=koşul");
        Rejected(V2(toggle, Table(new { query = "q1", widthWhen = "panel.value == true" })), "'widthWhen' genişlik=koşul");
        Rejected(V2(toggle, Table(new { query = "q1", widthWhen = 8 })), "'widthWhen' genişlik=koşul");
        Rejected(V2(toggle, Table(new { query = "q1", widthWhen = "8=yok.value == true" })), "yok");
    }

    [Fact]
    public void Select_accepts_static_options_but_not_other_lookup_props()
    {
        Accepted(V2(Input("takip", new { inputType = "select", staticOptions = new[] { "None=Yok", "Lot=Lot", "Serial=Seri" } })));
        Accepted(V2(Input("kategori", new { inputType = "select", optionsQuery = "q1", staticOptions = new[] { "=Tümü" } })));
        Rejected(V2(Input("takip", new { inputType = "select", staticOptions = new[] { "Yok" } })), "'staticOptions' öğeleri değer=Etiket");
        Rejected(V2(Input("takip", new { inputType = "select", staticOptions = Enumerable.Range(0, 21).Select(i => $"{i}=S{i}").ToArray() })), "'staticOptions'");
        Rejected(V2(Input("takip", new { inputType = "select", staticOptions = new[] { "a=A" }, minChars = 0 })), "'minChars' yalnız arama kutusu");
        Rejected(V2(Input("takip", new { inputType = "text", staticOptions = new[] { "a=A" } })), "'staticOptions' yalnız arama kutusu");
    }

    [Fact]
    public void Table_column_maps_are_validated_and_table_only()
    {
        Accepted(V2(Table(new
        {
            query = "q1",
            columnLabels = new[] { "balance.code=Stok kodu" },
            columnUnits = new[] { "balance.quantityOnHand=balance.unitCode" },
            valueLabels = new[] { "stockItem.trackingMode:None=Yok", "kolon:=Boş" }
        })));
        Rejected(V2(Table(new { query = "q1", columnLabels = new[] { "balance.code" } })), "'columnLabels'");
        Rejected(V2(Table(new { query = "q1", columnLabels = Array.Empty<string>() })), "'columnLabels'");
        Rejected(V2(Table(new { query = "q1", columnUnits = new[] { "a=b=c" } })), "'columnUnits'");
        Rejected(V2(Table(new { query = "q1", valueLabels = new[] { "kolonsuz=Yok" } })), "'valueLabels'");
        Rejected(V2(Table(new { query = "q1", valueLabels = Enumerable.Range(0, 41).Select(i => $"k:{i}=E{i}").ToArray() })), "'valueLabels'");
        Rejected(V2(new { id = "h1", type = "heading", props = new { text = "x", valueLabels = new[] { "k:a=A" } } }), "'valueLabels' özelliği bu bileşen türünde kullanılamaz.");
        Rejected(V2(new { id = "h1", type = "heading", props = new { text = "x", columnLabels = new[] { "k=A" } } }), "'columnLabels' özelliği bu bileşen türünde kullanılamaz.");
    }

    [Fact]
    public void Grid_tool_flags_are_booleans_on_data_tables_only()
    {
        Accepted(V2(Table(new { query = "q1", showGridSearch = false, showColumnFilters = false, showColumnChooser = true, showExport = false, showPivot = false })));
        Rejected(V2(Table(new { query = "q1", showPivot = "hayır" })), "'showPivot' true veya false olmalıdır.");
        Rejected(V2(new { id = "h1", type = "heading", props = new { text = "x", showExport = false } }), "'showExport' özelliği bu bileşen türünde kullanılamaz.");
    }
}
