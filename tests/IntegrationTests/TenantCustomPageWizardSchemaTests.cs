using System.Text.Json;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>
/// Step-by-step pages (schema v2): the setInput button action with its assignments, a dataTable's rowOpenAction, hidden
/// inputs and the presentational steps and recordHeader components. setInput writes nothing to the server.
/// </summary>
public sealed class TenantCustomPageWizardSchemaTests
{
    private static string V2(params object[] components) =>
        JsonSerializer.Serialize(new { schemaVersion = 2, queries = new[] { Liste() }, components });

    private static object Liste() => new { id = "kayitlar", name = "kayitlar", kind = "read", sql = "SELECT 'x' AS id, 'K-1' AS code", parameters = Array.Empty<object>(), runOn = "load" };
    private static object C(string id, string type, object props) => new { id, type, props };
    private static object N(string id, string type, object props) => new { id, type, name = id, props };

    private static object Secim(object? extra = null) => N("secim", "input", Merge(new { inputType = "text", label = "Seçim", hidden = true }, extra));
    private static object Sec(object? extra = null) => C("sec", "button", Merge(new { text = "Seç", actionType = "setInput", assignments = new[] { "secim={{liste.seciliSatir.id}}" } }, extra));
    private static object Temizle(object? extra = null) => C("temizle", "button", Merge(new { text = "Değiştir", actionType = "setInput", assignments = new[] { "secim=" } }, extra));
    private static object Tablo(object? extra = null) => N("liste", "dataTable", Merge(new { query = "kayitlar", rowActions = new[] { "sec" }, rowOpenAction = "sec" }, extra));
    private static object Adimlar(object? extra = null) => N("adimlar", "steps", Merge(new { steps = new[] { "Seç", "Ayrıntı" }, activeWhen = new[] { "secim.value == null", "secim.value != null" } }, extra));
    private static object Ozet(object? extra = null) => N("ozet", "recordHeader", Merge(new
    {
        icon = "box", title = "{{kayitlar.rows[0].code}}", subtitle = "Kod {{kayitlar.rows[0].code}}", visibleWhen = "secim.value != null",
        fields = new[] { "Mevcut={{kayitlar.rows[0].id}}", "Değer={{kayitlar.rows[0].code}}" },
        fieldFormats = new[] { "Mevcut=number", "Değer=money" }, fieldUnits = new[] { "Mevcut={{kayitlar.rows[0].code}}" },
        buttons = new[] { "temizle" }
    }, extra));

    private static object[] Wizard(object? secim = null, object? sec = null, object? temizle = null, object? tablo = null, object? adimlar = null, object? ozet = null) =>
        [Adimlar(adimlar), Secim(secim), Sec(sec), Tablo(tablo), Temizle(temizle), Ozet(ozet)];

    private static Dictionary<string, object?> Merge(object first, object? second)
    {
        var result = JsonSerializer.Deserialize<Dictionary<string, object?>>(JsonSerializer.Serialize(first))!;
        if (second is not null)
            foreach (var (key, value) in JsonSerializer.Deserialize<Dictionary<string, object?>>(JsonSerializer.Serialize(second))!) result[key] = value;
        return result;
    }

    private static void AssertAccepted(string json) => Assert.True(TenantCustomPageSchema.Validate(json, out var error), error);

    private static void AssertRejected(string json, string contains)
    {
        Assert.False(TenantCustomPageSchema.Validate(json, out var error));
        Assert.NotNull(error);
        Assert.Contains(contains, error);
    }

    [Fact]
    public void Two_step_page_is_accepted() => AssertAccepted(V2(Wizard()));

    // ---- setInput ----

    [Fact]
    public void Set_input_accepts_several_targets_templates_and_clearing()
    {
        var extra = N("not", "input", new { inputType = "checkbox", label = "Not" });
        AssertAccepted(V2([.. Wizard(sec: new { assignments = new[] { "secim={{liste.seciliSatir.id}}", "not=", "secim=K-{{liste.seciliSatir.code}} {{bugun}}" } }), extra]));
        // A top-level setInput button outside any owner.
        AssertAccepted(V2(Secim(), C("b1", "button", new { text = "Sıfırla", actionType = "setInput", assignments = new[] { "secim=" } })));
    }

    [Fact]
    public void Set_input_needs_valid_assignments()
    {
        const string format = "'assignments' 1–8 adet";
        AssertRejected(V2(Secim(), C("b1", "button", new { text = "x", actionType = "setInput" })), format);
        AssertRejected(V2(Secim(), C("b1", "button", new { text = "x", actionType = "setInput", assignments = Array.Empty<string>() })), format);
        AssertRejected(V2(Secim(), C("b1", "button", new { text = "x", actionType = "setInput", assignments = Enumerable.Repeat("secim=", 9).ToArray() })), format);
        foreach (var item in new[] { "=x", "secim", "sec im=x", "secim=" + new string('a', 501), "secim=<b>x</b>", "secim={{bad path!}}", "secim=javascript:x" })
            AssertRejected(V2(Secim(), C("b1", "button", new { text = "x", actionType = "setInput", assignments = new[] { item } })), format);
        AssertRejected(V2(Secim(), C("b1", "button", new { text = "x", actionType = "setInput", assignments = new[] { 1 } })), format);
        // 500 characters is the template limit.
        AssertAccepted(V2(Secim(), C("b1", "button", new { text = "x", actionType = "setInput", assignments = new[] { "secim=" + new string('a', 500) } })));
    }

    [Fact]
    public void Set_input_targets_must_be_inputs_on_the_page()
    {
        AssertRejected(V2(Secim(), C("b1", "button", new { text = "x", actionType = "setInput", assignments = new[] { "yok=1" } })), "giriş sayfada yok: yok");
        AssertRejected(V2(Secim(), C("h1", "heading", new { text = "x" }), C("b1", "button", new { text = "x", actionType = "setInput", assignments = new[] { "h1=1" } })),
            "giriş sayfada yok: h1");
        // The input may be declared after the button.
        AssertAccepted(V2(C("b1", "button", new { text = "x", actionType = "setInput", assignments = new[] { "secim=1" } }), Secim()));
    }

    [Fact]
    public void Assignments_belong_to_set_input_buttons_only()
    {
        AssertRejected(V2(Secim(), C("b1", "button", new { text = "x", actionType = "query", queryId = "kayitlar", assignments = new[] { "secim=1" } })),
            "'assignments' yalnız değer atayan (setInput) düğmede");
        AssertRejected(V2(Secim(), C("b1", "button", new { text = "x", assignments = new[] { "secim=1" } })), "'assignments' yalnız değer atayan (setInput) düğmede");
        AssertRejected(V2(Secim(), C("h1", "heading", new { text = "x", assignments = new[] { "secim=1" } })), "'assignments' özelliği bu bileşen türünde kullanılamaz");
    }

    [Fact]
    public void Set_input_writes_nothing()
    {
        AssertRejected(V2(Secim(), C("b1", "button", new { text = "x", actionType = "setInput", assignments = new[] { "secim=1" }, queryId = "kayitlar" })),
            "'queryId' değer atayan");
        AssertRejected(V2(Secim(), C("b1", "button", new { text = "x", actionType = "setInput", assignments = new[] { "secim=1" }, refreshQueries = new[] { "kayitlar" } })),
            "'refreshQueries' değer atayan");
        AssertRejected(V2(Secim(), C("b1", "button", new { text = "x", actionType = "setInput", assignments = new[] { "secim=1" }, href = "https://a.example.com/" })),
            "'href' yalnız");
    }

    [Fact]
    public void Set_input_is_v2_only()
    {
        var json = JsonSerializer.Serialize(new { schemaVersion = 1, components = new[] { C("b1", "button", new { text = "x", actionType = "setInput" }) } });
        AssertRejected(json, "yalnızca yayımlanmış iş akışı");
    }

    // ---- rowOpenAction ----

    [Fact]
    public void Row_open_action_runs_a_page_button()
    {
        // Not a row action: the table still owns it.
        AssertAccepted(V2(Secim(), Sec(), N("liste", "dataTable", new { query = "kayitlar", rowOpenAction = "sec" })));
        foreach (var button in new object[]
        {
            new { text = "x", actionType = "page", pageCode = "@inventory-stock", @params = new[] { "id={{liste.seciliSatir.id}}" } },
            new { text = "x", actionType = "link", href = "https://a.example.com/x/{{liste.seciliSatir.id}}" },
            new { text = "x", actionType = "query", queryId = "kayitlar" },
        })
            AssertAccepted(V2(C("ac", "button", button), N("liste", "dataTable", new { query = "kayitlar", rowOpenAction = "ac" })));
    }

    [Fact]
    public void Row_open_action_is_refused_for_other_buttons_and_tables()
    {
        const string invalid = "'rowOpenAction' sayfadaki bir değer atama";
        AssertRejected(V2(N("liste", "dataTable", new { query = "kayitlar", rowOpenAction = "yok" })), invalid);
        AssertRejected(V2(C("h1", "heading", new { text = "x" }), N("liste", "dataTable", new { query = "kayitlar", rowOpenAction = "h1" })), invalid);
        AssertRejected(V2(C("ac", "button", new { text = "x" }), N("liste", "dataTable", new { query = "kayitlar", rowOpenAction = "ac" })), invalid);
        AssertRejected(V2(Secim(), Sec(), C("liste", "dataTable", new { query = "kayitlar", rowOpenAction = "sec" })), "Satır açma eylemi için veri listesinin adı");
        AssertRejected(V2(Secim(), Sec(), N("liste", "dataTable", new { rowOpenAction = "sec" })), "Satır açma eylemi yalnız sorguya bağlı");
        AssertRejected(V2(Secim(), Sec(), N("liste", "dataTable", new { query = "kayitlar", rowOpenAction = 1 })), "'rowOpenAction' sayfadaki bir düğme kimliği");
        AssertRejected(V2(Secim(), C("h1", "heading", new { text = "x", rowOpenAction = "sec" }), Sec()), "'rowOpenAction' özelliği bu bileşen türünde kullanılamaz");
    }

    [Fact]
    public void Row_open_action_button_has_one_owner()
    {
        // Another table's row action, a record header button or a tab may not also own it.
        AssertRejected(V2([.. Wizard(), N("ikinci", "dataTable", new { query = "kayitlar", rowActions = new[] { "temizle" }, rowOpenAction = "sec" })]),
            "birden fazla sekmede veya yerleşimde");
        AssertRejected(V2([.. Wizard(), N("ikinci", "dataTable", new { query = "kayitlar", rowOpenAction = "temizle" })]), "'temizle' birden fazla");
    }

    // ---- hidden input ----

    [Fact]
    public void Hidden_is_a_flag_of_inputs_and_code()
    {
        AssertAccepted(V2(Secim(new { defaultValue = "{{sayfa.parametre.id}}", required = true })));
        AssertAccepted(V2(C("c1", "code", new { hidden = true })));
        AssertRejected(V2(Secim(new { hidden = "evet" })), "'hidden' yalnızca kod ve giriş bileşeninde");
        AssertRejected(V2(C("t1", "text", new { text = "x", hidden = true })), "'hidden' yalnızca kod ve giriş bileşeninde");
    }

    // ---- steps ----

    [Fact]
    public void Steps_need_two_to_six_labels_and_one_condition_each()
    {
        const string labels = "'steps' 2–6 adet 1–40 karakterlik";
        AssertAccepted(V2(Secim(), Adimlar(new { steps = new[] { "1", "2", "3", "4", "5", "6" }, activeWhen = Enumerable.Repeat("secim.value != null", 6).ToArray() })));
        AssertRejected(V2(Secim(), Adimlar(new { steps = new[] { "Tek" }, activeWhen = new[] { "true" } })), labels);
        AssertRejected(V2(Secim(), Adimlar(new { steps = Enumerable.Repeat("x", 7).ToArray(), activeWhen = Enumerable.Repeat("true", 7).ToArray() })), labels);
        AssertRejected(V2(Secim(), Adimlar(new { steps = new[] { "Seç", new string('a', 41) } })), labels);
        AssertRejected(V2(Secim(), Adimlar(new { steps = new[] { "Seç", " " } })), labels);
        AssertRejected(V2(Secim(), N("adimlar", "steps", new { activeWhen = new[] { "true", "false" } })), labels);
        AssertRejected(V2(Secim(), N("adimlar", "steps", new { steps = new[] { "a", "b" } })), "'activeWhen' her adım için");
        AssertRejected(V2(Secim(), Adimlar(new { activeWhen = new[] { "true" } })), "'activeWhen' her adım için");
        AssertRejected(V2(Secim(), C("adimlar", "steps", new { })), labels);
        AssertRejected(V2(Secim(), new { id = "adimlar", type = "steps" }), "'steps' bileşeni için props gerekli");
    }

    [Fact]
    public void Step_conditions_are_checked_like_visible_when()
    {
        AssertAccepted(V2(Secim(), Adimlar(new { activeWhen = new[] { "true", "secim.value > 0" } })));
        AssertRejected(V2(Secim(), Adimlar(new { activeWhen = new[] { "true", "secim.value ==" } })), "'activeWhen' koşulu geçersiz");
        AssertRejected(V2(Secim(), Adimlar(new { activeWhen = new[] { "true", "yok.value != null" } })), "'activeWhen' koşulu sayfada olmayan bir ada başvuruyor: yok");
        AssertRejected(V2(Secim(), C("h1", "heading", new { text = "x", activeWhen = new[] { "true" } })), "'activeWhen' özelliği bu bileşen türünde kullanılamaz");
        AssertRejected(V2(Secim(), C("h1", "heading", new { text = "x", steps = new[] { "a", "b" } })), "'steps' özelliği bu bileşen türünde kullanılamaz");
    }

    // ---- recordHeader ----

    [Fact]
    public void Record_header_accepts_bare_and_empty_lists()
    {
        AssertAccepted(V2(N("ozet", "recordHeader", new { title = "Kayıt" })));
        AssertAccepted(V2(N("ozet", "recordHeader", new { fields = Array.Empty<string>(), fieldFormats = Array.Empty<string>(), fieldUnits = Array.Empty<string>(), buttons = Array.Empty<string>() })));
        AssertAccepted(V2(C("ozet", "recordHeader", new { title = "x", fields = new[] { "Boş=" } })));
    }

    [Fact]
    public void Record_header_fields_are_label_template_pairs()
    {
        AssertRejected(V2([.. Wizard(ozet: new { fields = Enumerable.Range(1, 7).Select(i => $"A{i}=x").ToArray(), fieldFormats = Array.Empty<string>(), fieldUnits = Array.Empty<string>() })]), "'fields' en fazla 6");
        foreach (var item in new[] { "=x", "Etiket", " =x", new string('a', 61) + "=x", "A=" + new string('a', 501), "A=<b>", "A={{bad path!}}" })
            AssertRejected(V2([.. Wizard(ozet: new { fields = new[] { item }, fieldFormats = Array.Empty<string>(), fieldUnits = Array.Empty<string>() })]), "'fields' en fazla 6");
        AssertRejected(V2([.. Wizard(ozet: new { fields = new[] { "A=1", "A=2" }, fieldFormats = Array.Empty<string>(), fieldUnits = Array.Empty<string>() })]), "'fields' en fazla 6");
        // fields of other components keep their own rules: a contextPanel's sütun=Etiket items take no template.
        AssertRejected(V2(N("liste", "dataTable", new { query = "kayitlar" }), C("p1", "contextPanel", new { table = "liste", fields = new[] { "id={{x.y}}" } })), "'fields'");
        AssertRejected(V2(C("h1", "heading", new { text = "x", fields = new[] { "A=1" } })), "'fields' özelliği bu bileşen türünde kullanılamaz");
    }

    [Fact]
    public void Record_header_formats_and_units_name_its_fields()
    {
        AssertRejected(V2([.. Wizard(ozet: new { fieldFormats = new[] { "Mevcut=percent" } })]), "'fieldFormats' öğeleri Etiket=number|money|date|datetime|text");
        AssertRejected(V2([.. Wizard(ozet: new { fieldFormats = new[] { "Yok=number" } })]), "'fieldFormats' öğeleri");
        AssertRejected(V2([.. Wizard(ozet: new { fieldFormats = new[] { "Mevcut=number", "Mevcut=text" } })]), "'fieldFormats' öğeleri");
        AssertRejected(V2([.. Wizard(ozet: new { fieldUnits = new[] { "Yok={{kayitlar.rows[0].code}}" } })]), "'fieldUnits' öğeleri");
        AssertRejected(V2([.. Wizard(ozet: new { fieldUnits = new[] { "Mevcut=<i>" } })]), "'fieldUnits' öğeleri");
        AssertRejected(V2(C("h1", "heading", new { text = "x", fieldUnits = new[] { "A=1" } })), "'fieldUnits' özelliği bu bileşen türünde kullanılamaz");
        AssertRejected(V2(C("h1", "heading", new { text = "x", fieldFormats = new[] { "A=number" } })), "'fieldFormats' özelliği bu bileşen türünde kullanılamaz");
    }

    [Fact]
    public void Record_header_text_and_icon_are_limited()
    {
        AssertRejected(V2([.. Wizard(ozet: new { icon = "rocket" })]), "'icon' değeri tanımlı simgelerden biri");
        AssertRejected(V2([.. Wizard(ozet: new { title = new string('a', 301) })]), "'title' değeri en fazla 300");
        AssertRejected(V2([.. Wizard(ozet: new { subtitle = new string('a', 301) })]), "'subtitle' en fazla 300");
        AssertRejected(V2([.. Wizard(ozet: new { subtitle = "<script>" })]), "'subtitle'");
        AssertRejected(V2(C("h1", "heading", new { text = "x", subtitle = "y" })), "'subtitle' özelliği bu bileşen türünde kullanılamaz");
    }

    [Fact]
    public void Record_header_owns_up_to_three_action_buttons()
    {
        static object Btn(string id) => C(id, "button", new { text = id, actionType = "setInput", assignments = new[] { "secim=" } });
        AssertAccepted(V2(Secim(), Btn("b1"), Btn("b2"), Btn("b3"), N("ozet", "recordHeader", new { buttons = new[] { "b1", "b2", "b3" } })));
        AssertRejected(V2(Secim(), Btn("b1"), Btn("b2"), Btn("b3"), Btn("b4"), N("ozet", "recordHeader", new { buttons = new[] { "b1", "b2", "b3", "b4" } })), "0–3 adet");
        AssertRejected(V2(Secim(), Btn("b1"), N("ozet", "recordHeader", new { buttons = new[] { "b1", "b1" } })), "0–3 adet");
        AssertRejected(V2(Secim(), N("ozet", "recordHeader", new { buttons = new[] { "yok" } })), "eylemli");
        AssertRejected(V2(C("b1", "button", new { text = "x" }), N("ozet", "recordHeader", new { buttons = new[] { "b1" } })), "eylemli");
        AssertRejected(V2(C("b1", "button", new { text = "x", actionType = "workflow", workflowId = Guid.NewGuid().ToString() }), N("ozet", "recordHeader", new { buttons = new[] { "b1" } })), "eylemli");
        // Owned once: not also a row action, another header's button or an İşlem Çubuğu menu entry.
        AssertRejected(V2([.. Wizard(ozet: new { buttons = new[] { "sec" } })]), "'sec' birden fazla");
        AssertRejected(V2(Secim(), Btn("b1"), N("o1", "recordHeader", new { buttons = new[] { "b1" } }), N("o2", "recordHeader", new { buttons = new[] { "b1" } })), "'b1' birden fazla");
        AssertRejected(V2(Secim(), Btn("b1"), C("bar", "actionBar", new { moreButtons = new[] { "b1" } }), N("ozet", "recordHeader", new { buttons = new[] { "b1" } })), "İşlem Çubuğu menüsünde");
        AssertRejected(V2(C("h1", "heading", new { text = "x", buttons = new[] { "b1" } })), "'buttons' özelliği bu bileşen türünde kullanılamaz");
    }
}
