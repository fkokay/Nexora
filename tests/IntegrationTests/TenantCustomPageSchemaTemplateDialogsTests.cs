using System.Text.Json;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>5b-2 adım 2 Görev 1: kalıplı sayfada pencere (dialog, 'dialogs' yeri), içeriği ('dialog' yeri) ve tek katlı gruplar.</summary>
public sealed class TenantCustomPageSchemaTemplateDialogsTests
{
    private const string PencereYeri = "Kalıplı sayfada pencere (dialog) yalnız üst düzeyde, 'dialogs' yerinde durur.";
    private const string PencereBelge = "Belge kalıbında pencere (dialog) kullanılamaz.";
    private const string PencereSunum = "Kalıplı sayfada pencere yalnız 'dialog' sunumuyla ve sm, md, lg ya da xl boyutunda olur.";
    private static string PencereIcerigi(string id) => $"Pencerenin içeriği tam bir pencereye ait olmalı ve 'dialog' yerinde durmalı: {id}.";
    private static string PencereTuru(string type) => $"{type} pencerenin içinde kullanılamaz.";
    private const string PencereOzet = "Bir pencerede en fazla bir kayıt özeti (recordHeader) olabilir.";
    private const string PencereSekme = "Bir pencerede en fazla bir sekme bileşeni (tabs) olabilir.";
    private const string GrupYeri = "İç içe bileşenler (children) yalnız pencerenin içindeki ya da Liste detayındaki bölüm ve kartta olabilir.";
    private const string GrupIcIce = "Grubun içine grup ya da pencere konamaz.";
    private static string GrupTuru(string type) => $"{type} grubun içinde kullanılamaz.";
    private const string TekDetay = "Liste kalıbında detay yerinde en fazla bir bileşen (detay paneli ya da kart) olabilir.";
    private const string NoWidth = "Kalıplı sayfada genişlik ayarı kullanılmaz.";
    private const string FreeNoChildren = "Serbest gövdede iç içe bileşen (children) kullanılmaz; bileşenler bölümün üyeleri olarak eklenir.";

    private static readonly object[] Queries =
    [
        new { id = "liste", name = "liste", kind = "read", sql = "SELECT 1 AS x", parameters = Array.Empty<object>(), runOn = "load" },
        new { id = "kalemler", name = "kalemler", kind = "read", sql = "SELECT 1 AS y", parameters = Array.Empty<object>(), runOn = "load" },
        new { id = "teslimSorgusu", name = "teslimSorgusu", kind = "insert", sql = "INSERT INTO Notlar (Metin) VALUES ('x')", parameters = Array.Empty<object>(), runOn = "manual" }
    ];

    private static string Page(string? template, object[] components, object? templateObject = null) => JsonSerializer.Serialize(new Dictionary<string, object?>
    {
        ["schemaVersion"] = 2,
        ["template"] = templateObject ?? (template is null ? null : new { name = template }),
        ["queries"] = Queries,
        ["components"] = components
    }.Where(x => x.Value is not null).ToDictionary(x => x.Key, x => x.Value));

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
    private static object G(string id, string type, string? slot, object[] children, object? extra = null) =>
        new { id, type, name = id, props = Props(slot, extra), children };

    private static object Dialog(string[] contains, string slot = "dialogs", string id = "pencere", object? extra = null) =>
        C(id, "dialog", slot, Merge(new { title = "Sipariş", presentation = "dialog", size = "xl", contains }, extra));

    private static object Merge(object first, object? second)
    {
        var props = Props(null, first);
        if (second is not null) foreach (var (key, value) in Props(null, second)) props[key] = value;
        return props;
    }

    private static object OpenButton(string slot = "actions", string dialogId = "pencere") =>
        C("acDugmesi", "button", slot, new { label = "Aç", actionType = "openDialog", dialogId });

    private static object ListTable() => C("tablo", "dataTable", "list", new { query = "liste" });
    private static object Text(string id, string slot = "dialog") => C(id, "text", slot, new { text = "Metin" });
    private static object Header(string id = "ozet") => C(id, "recordHeader", "dialog", new { title = "Sipariş" });

    /// <summary>The sales-orders shape: header, status group, actions group and tabs pointing at a table and a conditional group.</summary>
    private static object[] SalesOrdersDialog() =>
    [
        Dialog(["ozet", "durum", "islemler", "sekmeler"]),
        Header(),
        G("durum", "section", "dialog", [C("rozet", "badge", null, new { text = "Taslak" }), C("zincir", "text", null, new { text = "Teklif → Sipariş" })]),
        G("islemler", "section", "dialog", [C("yenile", "button", null, new { label = "Yenile", actionType = "query", queryId = "kalemler" })]),
        C("sekmeler", "tabs", "dialog", new { tabs = new[] { "Sipariş Bilgileri=kalemTablosu,teslimBolumu" } }),
        C("kalemTablosu", "dataTable", "dialog", new { query = "kalemler" }),
        G("teslimBolumu", "section", "dialog",
            [C("teslimFormu", "formCard", null, new { inputs = new[] { "teslimTarihi" } }), C("teslimKaydet", "button", null, new { label = "Kaydet", actionType = "query", queryId = "teslimSorgusu" })],
            new { title = "Teslim tarihi", visibleWhen = "liste.rows[0].x == 1" }),
        // An input a dialog form card owns is not dialog content (contains ∪ dialog tabs); on Liste it stays below the body.
        C("teslimTarihi", "input", "below", new { label = "Teslim tarihi", inputType = "date" })
    ];

    private static object[] RecordBody() =>
    [
        C("kart", "recordHeader", "summary", new { title = "Kart" }),
        C("kartSekmeleri", "tabs", "tabs", new { tabs = new[] { "Genel=b1" } }),
        C("b1", "formCard", "section", new { inputs = new[] { "ad" } }),
        C("ad", "input", "field", new { label = "Ad" })
    ];

    private static object FreeBlock() => C("blok", "section", "block", new { title = "Bölüm", members = Array.Empty<string>() });

    private static void Accepted(string json) => Assert.True(TenantCustomPageSchema.Validate(json, out var error), error);

    private static void Rejected(string json, string expected)
    {
        Assert.False(TenantCustomPageSchema.Validate(json, out var error));
        Assert.Equal(expected, error);
    }

    [Fact]
    public void List_with_dialog_in_dialogs_and_contents_in_dialog_is_valid() =>
        Accepted(Page("list", [OpenButton(), ListTable(), .. SalesOrdersDialog()]));

    [Fact]
    public void Record_and_free_accept_dialogs()
    {
        Accepted(Page("record", [.. RecordBody(), OpenButton(), Dialog(["metin"]), Text("metin")]));
        Accepted(Page("free", [FreeBlock(), OpenButton(), Dialog(["metin"]), Text("metin")]));
        // Dialog contents do not count toward the template's own body rules: a second summary / tabs inside the dialog.
        Accepted(Page("record", [.. RecordBody(), Dialog(["ozet", "sekmeler"]), Header(), C("sekmeler", "tabs", "dialog", new { tabs = new[] { "Bir=metin" } }), Text("metin")]));
        Accepted(Page("free", [FreeBlock(), Dialog(["sekmeler"]), C("sekmeler", "tabs", "dialog", new { tabs = new[] { "Bir=metin" } }), Text("metin")]));
        // A list table inside the dialog is not the Liste body's single list.
        Accepted(Page("list", [ListTable(), Dialog(["kalemTablosu"]), C("kalemTablosu", "dataTable", "dialog", new { query = "kalemler" })]));
    }

    [Fact]
    public void Belge_rejects_dialog()
    {
        var belge = new { name = "belge", document = "satis.siparis" };
        Rejected(Page(null, [.. TenantCustomPageSchemaBelgeTemplateTests.Minimal(), Dialog(["metin"]), Text("metin", "above")], belge), PencereBelge);
    }

    [Fact]
    public void Dialog_outside_dialogs_slot_is_rejected()
    {
        Rejected(Page("list", [ListTable(), Dialog(["metin"], slot: "below"), Text("metin")]), PencereYeri);
        Rejected(Page("record", [.. RecordBody(), Dialog(["metin"], slot: "above"), Text("metin")]), PencereYeri);
        Rejected(Page("list", [ListTable(), Dialog(["metin"], slot: "dialog"), Text("metin")]), PencereYeri);
        // Only a dialog goes in 'dialogs'.
        Rejected(Page("list", [ListTable(), Text("metin", "dialogs")]), "'dialogs' yerine 'text' bileşeni konamaz; bu yere yalnız 'dialog' konabilir.");
    }

    [Fact]
    public void Dialog_drawer_or_full_size_is_rejected()
    {
        Rejected(Page("list", [ListTable(), Dialog(["metin"], extra: new { presentation = "drawer" }), Text("metin")]), PencereSunum);
        Rejected(Page("list", [ListTable(), Dialog(["metin"], extra: new { size = "full" }), Text("metin")]), PencereSunum);
    }

    [Fact]
    public void Dialog_content_in_two_dialogs_or_outside_dialog_slot_is_rejected()
    {
        // Two dialogs owning the same id: the generic layout rule refuses it before the template rules run.
        Rejected(Page("list", [ListTable(), Dialog(["x"]), Dialog(["x"], id: "ikinci"), Text("x")]), "'x' birden fazla sekmede veya yerleşimde kullanılamaz.");
        // Dialog contents outside the 'dialog' slot.
        Rejected(Page("list", [ListTable(), Dialog(["x"]), Text("x", "below")]), PencereIcerigi("x"));
        // A tab of the dialog's tabs points at a component outside the 'dialog' slot.
        Rejected(Page("list", [ListTable(), Dialog(["sekmeler"]), C("sekmeler", "tabs", "dialog", new { tabs = new[] { "Bir=x" } }), Text("x", "below")]), PencereIcerigi("x"));
        // In the 'dialog' slot but no dialog owns it.
        Rejected(Page("list", [ListTable(), Dialog(["metin"]), Text("metin"), Text("x")]), PencereIcerigi("x"));
    }

    [Fact]
    public void Dialog_owners_resolve_contains_and_dialog_tabs_and_drop_shared_ids()
    {
        using var document = JsonDocument.Parse(Page("list", [ListTable(), .. SalesOrdersDialog()]));
        var owners = PageTemplateRules.DialogOwners(document.RootElement.GetProperty("components"));
        Assert.Equal(["durum", "islemler", "kalemTablosu", "ozet", "sekmeler", "teslimBolumu"], owners.Keys.Order(StringComparer.Ordinal));
        Assert.All(owners.Values, x => Assert.Equal("pencere", x));

        using var shared = JsonDocument.Parse(Page("list", [Dialog(["x", "y"]), Dialog(["x"], id: "ikinci"), Text("x"), Text("y")]));
        var sharedOwners = PageTemplateRules.DialogOwners(shared.RootElement.GetProperty("components"), out var error);
        Assert.False(sharedOwners.ContainsKey("x"));
        Assert.Equal("pencere", sharedOwners["y"]);
        Assert.Equal(PencereIcerigi("x"), error);
    }

    [Fact]
    public void Dialog_with_editableGrid_steps_or_two_summaries_is_rejected()
    {
        var grid = C("izgara", "editableGrid", "dialog", new { title = "Kalemler", gridMode = "list", gridColumns = new[] { "ad|Ad|text" } });
        Rejected(Page("list", [ListTable(), Dialog(["izgara"]), grid]), PencereTuru("editableGrid"));
        var steps = C("adimlar", "steps", "dialog", new { steps = new[] { "Bir", "İki" }, activeWhen = new[] { "liste.rows[0].x == 1", "liste.rows[0].x == 2" } });
        Rejected(Page("list", [ListTable(), Dialog(["adimlar"]), steps]), PencereTuru("steps"));
        Rejected(Page("list", [ListTable(), Dialog(["ozet", "ozet2"]), Header(), Header("ozet2")]), PencereOzet);
        Rejected(Page("list", [ListTable(), Dialog(["s1", "s2"]), C("s1", "tabs", "dialog", new { tabs = new[] { "Bir=m1" } }),
            C("s2", "tabs", "dialog", new { tabs = new[] { "İki=m2" } }), Text("m1"), Text("m2")]), PencereSekme);
        // One summary per dialog: two dialogs with one summary each are fine.
        Accepted(Page("list", [ListTable(), Dialog(["ozet"]), Header(), Dialog(["ozet2"], id: "ikinci"), Header("ozet2")]));
    }

    [Fact]
    public void Group_rules()
    {
        object Badge(string id = "rozet") => C(id, "badge", null, new { text = "Taslak" });
        // A group outside the dialog contents and the Liste detail.
        Rejected(Page("list", [ListTable(), G("grup", "section", "below", [Badge()])]), GrupYeri);
        Rejected(Page("record", [.. RecordBody(), G("grup", "card", "above", [Badge()])]), GrupYeri);
        Rejected(Page("free", [FreeBlock(), G("grup", "card", "item", [Badge()])]), FreeNoChildren);
        // Nested group or dialog in a group.
        Rejected(Page("list", [ListTable(), Dialog(["grup"]), G("grup", "section", "dialog", [C("ic", "section", null, new { title = "İç" })])]), GrupIcIce);
        Rejected(Page("list", [ListTable(), Dialog(["grup"]), G("grup", "section", "dialog", [G("ic", "card", null, [Badge()])])]), GrupIcIce);
        // A child type the group does not take.
        var steps = C("adimlar", "steps", null, new { steps = new[] { "Bir", "İki" }, activeWhen = new[] { "liste.rows[0].x == 1", "liste.rows[0].x == 2" } });
        Rejected(Page("list", [ListTable(), Dialog(["grup"]), G("grup", "section", "dialog", [steps])]), GrupTuru("steps"));
        // widthWhen on a child keeps the generic width rule.
        Rejected(Page("list", [ListTable(), Dialog(["grup"]), G("grup", "section", "dialog", [C("rozet", "badge", null, new { text = "Taslak", widthWhen = "6=liste.rows[0].x == 1" })])]), NoWidth);
        // Groups in the dialog of a record and a free page are fine.
        Accepted(Page("record", [.. RecordBody(), Dialog(["grup"]), G("grup", "card", "dialog", [Badge()])]));
        Accepted(Page("free", [FreeBlock(), Dialog(["grup"]), G("grup", "card", "dialog", [Badge()])]));
    }

    [Fact]
    public void List_detail_accepts_one_card_group()
    {
        var card = G("detayKarti", "card", "detail", [C("baslik", "heading", null, new { text = "Seçili kayıt" }), C("bilgi", "text", null, new { text = "{{tablo.seciliSatir.x}}" })]);
        Accepted(Page("list", [ListTable(), card]));
        var panel = C("panel", "contextPanel", "detail", new { table = "tablo", fields = new[] { "x=X" } });
        Accepted(Page("list", [ListTable(), panel]));
        Rejected(Page("list", [ListTable(), panel, card]), TekDetay);
        // A section is not a detail card.
        Rejected(Page("list", [ListTable(), G("detayBolumu", "section", "detail", [C("bilgi", "text", null, new { text = "x" })])]),
            "'detail' yerine 'section' bileşeni konamaz; bu yere yalnız 'contextPanel, card' konabilir.");
    }

    [Fact]
    public void Legacy_pages_unchanged()
    {
        // Without a template the dialog keeps every legacy shape (drawer, full size) and groups sit anywhere.
        Accepted(Page(null, [C("tablo", "dataTable", null, new { query = "liste" }),
            C("pencere", "dialog", null, new { title = "Sipariş", presentation = "drawer", size = "full", contains = new[] { "grup" } }),
            G("grup", "section", null, [G("ic", "card", null, [C("rozet", "badge", null, new { text = "Taslak" })])]),
            G("serbest", "card", null, [C("metin", "text", null, new { text = "Metin" })])]));
    }
}
