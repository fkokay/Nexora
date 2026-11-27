using System.Text.Json;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>Ortak kalıp özellikleri: Kayıt kartında ve pencerede özel alan bloğu, pencerede satır tablosu (spec 2026-11-28).</summary>
public sealed class TenantCustomPageSchemaTemplateExtrasTests
{
    private const string OzelAlanYeri = "Özel alan bloğu yalnız Kayıt kartında 'customFields' yerinde ve pencerenin içinde durabilir.";
    private const string OzelAlanIki = "Bir sayfada ve bir pencerede en fazla bir özel alan bloğu olabilir.";
    private const string BlokSekmede = "Kayıt kartında her bölüm, tablo ve açıklama tam bir sekmede yer almalı.";
    private const string SatirYeri = "Satır tablosu (editableGrid) yalnız pencerenin içinde kullanılabilir.";
    private const string SatirIki = "Bir pencerede en fazla bir satır tablosu olabilir.";
    private const string SatirKip = "Pencerede satır tablosu yalnız 'list' kipinde kullanılabilir.";
    private const string SatirSinir = "Pencerede satır tablosu için 'maxRows' 1–200 olmalıdır.";
    private const string SatirEylem = "Satır tablosu olan pencerenin bir kayıt eylemi olmalı.";
    private static string BlokKayit(string name) => $"Özel alan bloğunun değerleri kaydedilmiyor: kayıt adımlarından birinde '{{{{{name}.degerler}}}}' bağlanmalı.";
    private static string SatirKayit(string name) => $"Satır tablosunun satırları kaydedilmiyor: pencerenin kayıt adımlarından birinde '{{{{{name}.satirlar}}}}' bağlanmalı.";

    private static object P(string name, string binding, string type) => new { name, binding, type };

    /// <summary>The page's queries: the block's value source and save query exist only with a block, the lot/serial save only with the grid.</summary>
    private static object[] Queries(bool block, bool grid) =>
    [
        new { id = "liste", name = "liste", kind = "read", sql = "SELECT 1 AS x", parameters = Array.Empty<object>(), runOn = "load" },
        new { id = "duz", name = "duz", kind = "insert", sql = "INSERT INTO Notlar (Metin) VALUES ('x')", parameters = Array.Empty<object>(), runOn = "manual" },
        .. block ? new object[]
        {
            new { id = "ozelTanimlar", name = "ozelTanimlar", kind = "read", operation = "cari.ozelAlanTanimlari", parameters = Array.Empty<object>(), runOn = "load" },
            new { id = "ozelDegerler", name = "ozelDegerler", kind = "read", operation = "cari.ozelAlanDegerleri", runOn = "load", parameters = new[] { P("id", "{{liste.rows[0].x}}", "guid") } },
            new { id = "ozelKaydet", name = "ozelKaydet", kind = "update", operation = "cari.ozelAlanKaydet", runOn = "manual",
                  parameters = new[] { P("id", "{{liste.rows[0].x}}", "guid"), P("values", "{{ozelAlanlar.degerler}}", "map") } }
        } : Array.Empty<object>(),
        .. grid ? new object[]
        {
            new { id = "hareketEkle", name = "hareketEkle", kind = "insert", operation = "stok.hareket.ekle", runOn = "manual",
                  parameters = new[]
                  {
                      P("warehouseId", "{{liste.rows[0].x}}", "guid"), P("stockItemId", "{{liste.rows[0].x}}", "guid"), P("entryDate", "{{tarih.value}}", "date"),
                      P("direction", "{{yon.value}}", "text"), P("quantity", "{{miktar.value}}", "decimal"), P("description", "{{aciklama.value}}", "text"),
                      P("tracking", "{{izlemeSatirlari.satirlar}}", "list")
                  } }
        } : Array.Empty<object>()
    ];

    private static string Page(string template, object[] components, bool? block = null, bool? grid = null)
    {
        var components_ = JsonSerializer.Serialize(components);
        return JsonSerializer.Serialize(new Dictionary<string, object?>
        {
            ["schemaVersion"] = 2,
            ["template"] = new { name = template },
            ["queries"] = Queries(block ?? components_.Contains("\"id\":\"ozelAlanlar\""), grid ?? components_.Contains("\"id\":\"izlemeSatirlari\"")),
            ["components"] = components
        });
    }

    private static Dictionary<string, object?> Props(string? slot, object? extra)
    {
        var props = new Dictionary<string, object?>();
        if (slot is not null) props["slot"] = slot;
        if (extra is IDictionary<string, object?> dictionary)
            foreach (var (key, value) in dictionary) props[key] = value;
        else if (extra is not null)
            foreach (var property in extra.GetType().GetProperties()) props[property.Name] = property.GetValue(extra);
        return props;
    }

    private static object C(string id, string type, string? slot, object? extra = null) => new { id, type, name = id, props = Props(slot, extra) };
    private static object Block(string id = "ozelAlanlar", string slot = "customFields", object? extra = null) =>
        C(id, "customFieldsBlock", slot, Merge(new { title = "Özel alanlar", definitionsQuery = "ozelTanimlar", valuesQuery = "ozelDegerler" }, extra));
    private static object Grid(string slot = "dialog", object? extra = null, string id = "izlemeSatirlari") =>
        C(id, "editableGrid", slot, Merge(new
        {
            gridMode = "list", title = "Lot / seri satırları",
            gridColumns = new[] { "trackingCode|Lot / seri kodu|text|required,unique,maxLength:80", "quantity|Miktar|number|required,min:0.0001", "expiryDate|Son kullanma tarihi|date" },
            maxRows = 200
        }, extra));

    private static object Merge(object first, object? second)
    {
        var props = Props(null, first);
        if (second is not null) foreach (var (key, value) in Props(null, second)) props[key] = value;
        return props;
    }

    private static object Window(string[] contains, object? extra = null, string id = "pencere") =>
        C(id, "dialog", "dialogs", Merge(new { title = "Hareket", presentation = "dialog", size = "lg", contains }, extra));

    private static object Bar(object? extra = null) => C("komutlar", "actionBar", "commands", extra ?? new { saveSequence = new[] { "ozelKaydet" } });

    private static object[] Record(object[] more, string tab = "Genel=b1,ozelAlanlar") =>
    [
        C("kart", "recordHeader", "summary", new { title = "Kart" }), C("sekmeler", "tabs", "tabs", new { tabs = new[] { tab } }),
        C("b1", "formCard", "section", new { inputs = new[] { "a1" } }), C("a1", "input", "field", new { label = "Ad" }), .. more
    ];

    private static object[] ListPage(object[] more) => [C("tablo", "dataTable", "list", new { query = "liste" }), .. more];

    private static object[] WindowInputs() =>
    [
        C("yon", "input", "dialog", new { label = "Yön", inputType = "text" }), C("tarih", "input", "dialog", new { label = "Tarih", inputType = "date" }),
        C("miktar", "input", "dialog", new { label = "Miktar", inputType = "number" }), C("aciklama", "input", "dialog", new { label = "Açıklama", inputType = "text" })
    ];

    private static void Accepted(string json) => Assert.True(TenantCustomPageSchema.Validate(json, out var error), error);

    private static void Rejected(string json, string expected)
    {
        Assert.False(TenantCustomPageSchema.Validate(json, out var error));
        Assert.True(expected == error, $"beklenen [{expected}] gelen [{error}]");
    }

    // ---- Özel alan bloğu: Kayıt kartı ----

    [Fact]
    public void Record_accepts_block_in_one_tab_with_a_save_step() =>
        Accepted(Page("record", Record([Block(), Bar()])));

    [Fact]
    public void Record_block_must_be_in_the_customFields_slot_and_in_a_tab()
    {
        Rejected(Page("record", Record([Block(slot: "below"), Bar()])), OzelAlanYeri);
        Rejected(Page("record", Record([Block(), Bar()], tab: "Genel=b1")), BlokSekmede);
    }

    [Fact]
    public void Record_allows_only_one_block_and_it_needs_a_binding_save_step()
    {
        Rejected(Page("record", Record([Block(), Block("ozelAlanlar2"), Bar()], tab: "Genel=b1,ozelAlanlar,ozelAlanlar2")), OzelAlanIki);
        Rejected(Page("record", Record([Block(), Bar(new { saveSequence = new[] { "duz" } })])), BlokKayit("ozelAlanlar"));
        Rejected(Page("record", Record([Block()])), BlokKayit("ozelAlanlar"));
    }

    [Fact]
    public void Customfields_slot_holds_only_the_block_and_other_templates_refuse_it()
    {
        Rejected(Page("record", Record([C("not", "text", "customFields", new { text = "x" })], tab: "Genel=b1")), "'customFields' yerine 'text' bileşeni konamaz; bu yere yalnız 'customFieldsBlock' konabilir.");
        Rejected(Page("list", ListPage([Block()])), OzelAlanYeri);
        Rejected(Page("list", ListPage([Block(slot: "below")])), OzelAlanYeri);
    }

    // ---- Özel alan bloğu: pencere ----

    [Fact]
    public void Window_accepts_block_with_a_save_step_and_rejects_the_rest()
    {
        Accepted(Page("list", ListPage([Window(["ozelAlanlar"], new { saveQuery = "ozelKaydet" }), Block(slot: "dialog")])));
        Rejected(Page("list", ListPage([Window(["ozelAlanlar"]), Block(slot: "dialog")])), BlokKayit("ozelAlanlar"));
        Rejected(Page("list", ListPage([Window(["ozelAlanlar"], new { saveQuery = "duz" }), Block(slot: "dialog")])), BlokKayit("ozelAlanlar"));
        Rejected(Page("list", ListPage([Window(["ozelAlanlar", "ozelAlanlar2"], new { saveQuery = "ozelKaydet" }), Block(slot: "dialog"), Block("ozelAlanlar2", "dialog")])), OzelAlanIki);
    }

    [Fact]
    public void Block_cannot_be_a_group_child_or_in_free_body()
    {
        var group = new { id = "grup", type = "section", name = "grup", props = Props("dialog", null), children = new[] { Block("icBlok", "x", new { definitionsQuery = "liste", valuesQuery = "liste" }) } };
        Rejected(Page("list", ListPage([Window(["grup"], new { saveQuery = "duz" }), group])), "customFieldsBlock grubun içinde kullanılamaz.");
        Rejected(Page("free", [C("bolum", "section", "block", new { title = "B", members = new[] { "ozelAlanlar" } }), Block(slot: "item")]), OzelAlanYeri);
    }

    // ---- Satır tablosu ----

    /// <summary>A window with the lot/serial grid; <paramref name="plain"/> saves with a query that binds nothing (and drops the lot/serial query).</summary>
    private static string GridWindow(object? grid = null, object? windowExtra = null, bool plain = false) =>
        Page("list", ListPage([Window(["yon", "tarih", "miktar", "aciklama", "izlemeSatirlari"], windowExtra ?? new { saveQuery = plain ? "duz" : "hareketEkle" }),
            .. WindowInputs(), grid ?? Grid()]), block: false, grid: !plain);

    [Fact]
    public void Window_accepts_the_lot_serial_grid() => Accepted(GridWindow());

    [Fact]
    public void Grid_only_in_a_window_and_one_per_window()
    {
        Rejected(Page("list", ListPage([Grid(slot: "below")]), block: false, grid: false), SatirYeri);
        Rejected(Page("record", Record([Grid(slot: "below"), Bar(new { saveSequence = new[] { "duz" } })], tab: "Genel=b1"), block: false, grid: false), SatirYeri);
        Rejected(Page("free", [C("bolum", "section", "block", new { title = "B", members = new[] { "izlemeSatirlari" } }), Grid(slot: "item")], block: false, grid: false), SatirYeri);
        var group = new { id = "grup", type = "section", name = "grup", props = Props("dialog", null), children = new[] { Grid("x", null, "icTablo") } };
        Rejected(Page("list", ListPage([Window(["grup"], new { saveQuery = "duz" }), group]), block: false, grid: false), SatirYeri);
        Rejected(Page("list", ListPage([Window(["izlemeSatirlari", "ikinci"], new { saveQuery = "duz" }), Grid(), Grid(id: "ikinci")]), block: false, grid: false), SatirIki);
    }

    [Fact]
    public void Grid_in_a_window_follows_the_small_set()
    {
        Rejected(GridWindow(Grid(extra: new { gridMode = "stage", sourceQuery = "liste" }), plain: true), SatirKip);
        Rejected(GridWindow(Grid(extra: new { gridColumns = new[] { "kod|Kod|lookup:liste:x:x" } }), plain: true), "Pencerede satır tablosu yalnız metin, sayı, tarih ve onay kutusu sütunlarını alır: kod.");
        Rejected(GridWindow(Grid(extra: new { gridColumns = new[] { "kod|Kod|text|readOnly" } }), plain: true), "'readOnly' pencerede satır tablosunda kullanılamaz.");
        Rejected(GridWindow(Grid(extra: new { fixedRowLabel = "Satır" }), plain: true), "'fixedRowLabel' pencerede satır tablosunda kullanılamaz.");
        Rejected(GridWindow(Grid(extra: new { totals = new[] { "quantity" } }), plain: true), "'totals' pencerede satır tablosunda kullanılamaz.");
        Rejected(GridWindow(Grid(extra: new { maxRows = 201 }), plain: true), SatirSinir);
    }

    [Fact]
    public void Grid_window_needs_a_save_action_that_binds_the_rows()
    {
        Rejected(GridWindow(windowExtra: new { size = "lg" }, plain: true), SatirEylem);
        Rejected(GridWindow(windowExtra: new { saveQuery = "duz" }), SatirKayit("izlemeSatirlari"));
    }
}
