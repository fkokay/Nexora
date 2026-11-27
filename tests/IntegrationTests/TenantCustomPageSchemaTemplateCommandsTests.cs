using System.Text.Json;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>5b-2a Görev 1: kalıplı sayfanın komutları — üst düzey, 'commands' yerindeki tek işlem çubuğu (actionBar).</summary>
public sealed class TenantCustomPageSchemaTemplateCommandsTests
{
    private const string KomutYeri = "Kalıplı sayfada işlem çubuğu yalnız üst düzeyde, 'commands' yerinde ve bir kez kullanılır; düğmeler 'actions' yerine konur.";
    private const string IkiKaydet = "Kayıt kartında Kaydet ya Komutlar'da ya da Kaydet düğmesinde tanımlanır; ikisi birden olamaz.";
    private const string IkiSil = "Kayıt kartında Sil ya Komutlar'da ya da Sil düğmesinde tanımlanır; ikisi birden olamaz.";
    private const string KayitSayisi = "Kayıt kartında başlıkta kayıt sayısı (titleCount) kullanılmaz.";
    private const string BelgeKomut = "Belge kalıbında komutlar belge modelinden gelir; işlem çubuğu (actionBar) kullanılamaz.";

    private static readonly object[] Queries =
    [
        new { id = "liste", name = "liste", kind = "read", sql = "SELECT 1 AS x", parameters = Array.Empty<object>(), runOn = "load" },
        new { id = "kaydet", name = "kaydet", kind = "insert", sql = "INSERT INTO Notlar (Metin) VALUES ('x')", parameters = Array.Empty<object>(), runOn = "manual" },
        new { id = "sil", name = "sil", kind = "delete", operation = "stok.kart.sil", runOn = "manual", parameters = new object[] { new { name = "id", binding = "{{bugun}}", type = "guid" } } }
    ];

    private static string Page(string? template, object[] components, object? templateObject = null) => JsonSerializer.Serialize(new Dictionary<string, object?>
    {
        ["schemaVersion"] = 2,
        ["template"] = templateObject ?? (template is null ? null : new { name = template }),
        ["queries"] = Queries,
        ["components"] = components
    }.Where(x => x.Value is not null).ToDictionary(x => x.Key, x => x.Value));

    private static Dictionary<string, object?> Merge(Dictionary<string, object?> props, object? extra)
    {
        if (extra is IDictionary<string, object?> dictionary)
            foreach (var (key, value) in dictionary) props[key] = value;
        else if (extra is not null)
            foreach (var property in extra.GetType().GetProperties()) props[property.Name] = property.GetValue(extra);
        return props;
    }

    private static object Bar(object? extra = null, string slot = "commands", string id = "komutlar") =>
        new { id, type = "actionBar", name = id, props = Merge(new Dictionary<string, object?> { ["slot"] = slot }, extra) };

    private static object Button(string id, string slot = "actions", object? extra = null) =>
        new { id, type = "button", name = id, props = Merge(new Dictionary<string, object?> { ["slot"] = slot, ["label"] = id, ["actionType"] = "erpPage", ["pageKey"] = "sales-invoices" }, extra) };

    private static object SaveButton(string id = "kaydetDugmesi") =>
        new { id, type = "button", name = id, props = new { slot = "actions", label = "Kaydet", actionType = "sequence", saveSequence = new[] { "kaydet" } } };

    private static object DeleteButton(string id = "silDugmesi") =>
        new { id, type = "button", name = id, props = new { slot = "actions", label = "Sil", variant = "danger", actionType = "query", queryId = "sil" } };

    // Liste
    private static object Filter() => new { id = "suzgec", type = "filterBar", name = "suzgec", props = new { slot = "filters", table = "tablo", search = true } };
    private static object ListTable() => new { id = "tablo", type = "dataTable", name = "tablo", props = new { slot = "list", query = "liste" } };

    // Kayıt kartı
    private static object[] RecordBody() =>
    [
        new { id = "ozet", type = "recordHeader", name = "ozet", props = new { slot = "summary", title = "Kart" } },
        new { id = "sekmeler", type = "tabs", name = "sekmeler", props = new { slot = "tabs", tabs = new[] { "Genel=b1" } } },
        new { id = "b1", type = "formCard", name = "b1", props = new { slot = "section", inputs = new[] { "ad" } } },
        new { id = "ad", type = "input", name = "ad", props = new { slot = "field", label = "Ad" } }
    ];

    // Serbest
    private static object Block(string id = "b1", string[]? members = null) =>
        new { id, type = "section", name = id, props = new { slot = "block", title = "Bölüm", members = members ?? Array.Empty<string>() } };

    private static void Accepted(string json) => Assert.True(TenantCustomPageSchema.Validate(json, out var error), error);

    private static void Rejected(string json, string contains)
    {
        Assert.False(TenantCustomPageSchema.Validate(json, out var error));
        Assert.Contains(contains, error);
    }

    /// <summary>The customers standard's bar settings (Liste) plus the "commands" slot.</summary>
    private static object CustomersBar(object? extra = null) => Bar(Merge(new Dictionary<string, object?>
    {
        ["deleteQuery"] = "sil", ["deleteConfirmText"] = "{{tablo.seciliSatir.name}} silinsin mi?", ["focusInput"] = "suzgec", ["exportTable"] = "tablo",
        ["titleCount"] = "{{liste.meta.totalCount}}", ["newAction"] = "page", ["newPageCode"] = "@customer-create", ["newTarget"] = "newTab",
        ["openAction"] = "page", ["openPageCode"] = "@customer-create", ["openTarget"] = "newTab", ["openTable"] = "tablo",
        ["openParams"] = new[] { "customerId={{tablo.seciliSatir.id}}" }, ["moreButtons"] = new[] { "yeniTeklif", "yeniFatura" },
        ["hiddenCommands"] = new[] { "save", "print" }
    }, extra));

    [Fact]
    public void List_page_with_commands_bar_is_valid()
    {
        Accepted(Page("list", [CustomersBar(), Filter(), ListTable(), Button("yeniTeklif"), Button("yeniFatura")]));
        Accepted(Page("list", [CustomersBar(new { commandWhen = new[] { "delete=tablo.seciliSatir.id != null" } }), Filter(), ListTable(), Button("yeniTeklif"), Button("yeniFatura")]));
    }

    [Fact]
    public void Record_and_free_page_with_commands_bar_are_valid()
    {
        Accepted(Page("record", [Bar(new { saveSequence = new[] { "kaydet" }, stopOnError = true, deleteQuery = "sil", afterSaveAction = "page", afterSavePageCode = "@customers", saveAndNew = true, newAction = "page", newPageCode = "@customer-create" }), .. RecordBody()]));
        Accepted(Page("record", [Bar(new { hiddenCommands = new[] { "print" } }), SaveButton(), DeleteButton(), .. RecordBody()]));
        Accepted(Page("free", [Bar(new { moreButtons = new[] { "yeniTeklif" }, hiddenCommands = new[] { "save" } }), Button("yeniTeklif"), Block()]));
    }

    [Fact]
    public void Commands_bar_outside_commands_slot_or_nested_or_twice_is_rejected()
    {
        // In another slot.
        Rejected(Page("list", [Bar(slot: "actions"), ListTable()]), KomutYeri);
        Rejected(Page("list", [Bar(slot: "above"), ListTable()]), KomutYeri);
        // Nested.
        var card = new { id = "kart", type = "card", name = "kart", props = new { slot = "above" }, children = new[] { Bar(slot: "commands", id: "ic") } };
        Rejected(Page("list", [ListTable(), card]), KomutYeri);
        // Twice.
        Rejected(Page("list", [Bar(), Bar(id: "komutlar2"), ListTable()]), KomutYeri);
        Rejected(Page("record", [Bar(), Bar(id: "komutlar2"), .. RecordBody()]), KomutYeri);
        Rejected(Page("free", [Bar(), Bar(id: "komutlar2"), Block()]), KomutYeri);
    }

    [Fact]
    public void Commands_slot_with_button_is_rejected()
    {
        Rejected(Page("list", [Button("b", slot: "commands"), ListTable()]), "'commands' yerine 'button' bileşeni konamaz; bu yere yalnız 'actionBar' konabilir.");
        Rejected(Page("record", [Button("b", slot: "commands"), .. RecordBody()]), "'commands' yerine 'button' bileşeni konamaz; bu yere yalnız 'actionBar' konabilir.");
        Rejected(Page("free", [Button("b", slot: "commands"), Block()]), "'commands' yerine 'button' bileşeni konamaz; bu yere yalnız 'actionBar' konabilir.");
    }

    [Fact]
    public void Each_unmappable_setting_is_rejected()
    {
        Rejected(Page("list", [Bar(new { barLook = new[] { "align=end" } }), ListTable()]), "Kalıplı sayfanın komutlarında 'barLook' kullanılamaz.");
        Rejected(Page("list", [Bar(new { printEnabled = true }), ListTable()]), "Kalıplı sayfanın komutlarında 'printEnabled' kullanılamaz.");
        Rejected(Page("list", [Bar(new { exportCsv = false, exportTable = "tablo" }), ListTable()]), "Kalıplı sayfanın komutlarında 'exportCsv' kullanılamaz.");
        Rejected(Page("list", [Bar(new { visibleWhen = "tablo.seciliSatir.id != null" }), ListTable()]), "Kalıplı sayfanın komutlarında 'visibleWhen' kullanılamaz.");
        // disabledWhen is refused on every action bar (templated or not) by the earlier generic rule.
        Rejected(Page("list", [Bar(new { disabledWhen = "tablo.seciliSatir.id != null" }), ListTable()]), "'disabledWhen' yalnız düğme ve giriş");
        var dialog = new { id = "pencere", type = "dialog", name = "pencere", props = new { slot = "above", title = "Kayıt" } };
        Rejected(Page("list", [Bar(new { formDialog = "pencere" }), ListTable(), dialog]), "Kalıplı sayfanın komutlarında 'formDialog' kullanılamaz.");
        // Same on the other templates.
        Rejected(Page("record", [Bar(new { printEnabled = true }), .. RecordBody()]), "Kalıplı sayfanın komutlarında 'printEnabled' kullanılamaz.");
        Rejected(Page("free", [Bar(new { barLook = new[] { "align=end" } }), Block()]), "Kalıplı sayfanın komutlarında 'barLook' kullanılamaz.");
    }

    [Fact]
    public void New_action_dialog_is_rejected_on_template_page()
    {
        Rejected(Page("list", [Bar(new { newAction = "dialog" }), ListTable()]), "Kalıplı sayfanın komutlarında 'newAction' kullanılamaz.");
        Rejected(Page("list", [Bar(new { openAction = "dialog" }), ListTable()]), "Kalıplı sayfanın komutlarında 'openAction' kullanılamaz.");
        // The other values stay valid.
        Accepted(Page("list", [Bar(new { newAction = "off", openAction = "off" }), ListTable()]));
    }

    [Fact]
    public void Bar_button_outside_actions_slot_is_rejected()
    {
        Rejected(Page("list", [Bar(new { moreButtons = new[] { "yeniTeklif" } }), ListTable(), Button("yeniTeklif", slot: "above")]),
            "Komutların bağladığı düğme 'actions' yerinde olmalı: yeniTeklif.");
        // On Liste a bar-run button may also sit in 'rowActions' (M1); not on the other templates.
        Rejected(Page("record", [Bar(new { moreButtons = new[] { "yeniTeklif" } }), .. RecordBody(), Button("yeniTeklif", slot: "above")]),
            "Komutların bağladığı düğme 'actions' yerinde olmalı: yeniTeklif.");
        Rejected(Page("list", [Bar(new { newButton = "yeniTeklif" }), ListTable(), Button("yeniTeklif", slot: "below")]),
            "Komutların bağladığı düğme 'actions' yerinde olmalı: yeniTeklif.");
        // Nested in a card.
        var card = new { id = "kart", type = "card", name = "kart", props = new { slot = "above" }, children = new[] { new { id = "yeniTeklif", type = "button", name = "yeniTeklif", props = new { label = "Teklif", actionType = "erpPage", pageKey = "sales-quotes" } } } };
        Rejected(Page("list", [Bar(new { openButton = "yeniTeklif" }), ListTable(), card]), "Komutların bağladığı düğme 'actions' yerinde olmalı: yeniTeklif.");
        Rejected(Page("record", [Bar(new { saveQuery = "kaydet", afterSaveButton = "yeniTeklif" }), .. RecordBody(), Button("yeniTeklif", slot: "above")]),
            "Komutların bağladığı düğme 'actions' yerinde olmalı: yeniTeklif.");
    }

    [Fact]
    public void Record_with_bar_save_and_sequence_button_is_rejected()
    {
        Rejected(Page("record", [Bar(new { saveSequence = new[] { "kaydet" } }), SaveButton(), .. RecordBody()]), IkiKaydet);
        Rejected(Page("record", [Bar(new { saveQuery = "kaydet" }), SaveButton(), .. RecordBody()]), IkiKaydet);
    }

    [Fact]
    public void Record_with_bar_delete_and_delete_button_is_rejected() =>
        Rejected(Page("record", [Bar(new { deleteQuery = "sil" }), DeleteButton(), .. RecordBody()]), IkiSil);

    [Fact]
    public void Record_bar_owned_save_and_delete_buttons_do_not_count_as_record_buttons() =>
        // A sequence or delete button in the bar's "⋯" menu is a menu item, not the card's Kaydet / Sil.
        Accepted(Page("record", [Bar(new { saveSequence = new[] { "kaydet" }, deleteQuery = "sil", moreButtons = new[] { "kaydetDugmesi", "silDugmesi" } }),
            SaveButton(), DeleteButton(), .. RecordBody()]));

    [Fact]
    public void Record_bar_titleCount_is_rejected() =>
        Rejected(Page("record", [Bar(new { titleCount = "{{liste.meta.totalCount}}" }), .. RecordBody()]), KayitSayisi);

    [Fact]
    public void Belge_with_action_bar_is_rejected()
    {
        var belge = new { name = "belge", document = "satis.siparis" };
        Rejected(Page(null, [Bar()], belge), BelgeKomut);
        Rejected(Page(null, [Bar(new { barLook = new[] { "align=end" } }, slot: "actions")], belge), BelgeKomut);
        var card = new { id = "kart", type = "card", name = "kart", props = new { slot = "above" }, children = new[] { Bar(slot: "above", id: "ic") } };
        Rejected(Page(null, [card], belge), BelgeKomut);
    }

    [Fact]
    public void List_bar_button_in_rowActions_is_valid()
    {
        var table = new { id = "tablo", type = "dataTable", name = "tablo", props = new { slot = "list", query = "liste", rowActions = new[] { "yeniTeklif" } } };
        // (A row action may not be a "⋯" menu button — the schema's own rule — but the open command's button may.)
        Accepted(Page("list", [Bar(new { openButton = "yeniTeklif" }), table, Button("yeniTeklif", slot: "rowActions")]));
        Accepted(Page("list", [Bar(new { openButton = "yeniTeklif" }), ListTable(), Button("yeniTeklif")]));
    }

    [Fact]
    public void Free_menu_buttons_count_toward_eight_when_more_is_hidden()
    {
        var owned = Enumerable.Range(1, 9).Select(i => $"menu{i}").ToArray();
        Rejected(Page("free", [Bar(new { moreButtons = owned, hiddenCommands = new[] { "more" } }), .. owned.Select(id => Button(id)), Block()]),
            "Serbest gövdede en fazla 8 düğme olabilir.");
        var eight = owned.Take(8).ToArray();
        Accepted(Page("free", [Bar(new { moreButtons = eight, hiddenCommands = new[] { "more" } }), .. eight.Select(id => Button(id)), Block()]));
    }

    [Fact]
    public void Record_bar_owns_save_or_delete_only_with_a_non_empty_value()
    {
        // The schema rejects the empty values first; the template rule itself treats them as "no bar Kaydet / Sil".
        foreach (var bar in new[] { Bar(new { saveQuery = "" }), Bar(new { saveSequence = Array.Empty<string>() }) })
        {
            using var doc = JsonDocument.Parse(Page("record", [bar, SaveButton(), .. RecordBody()]));
            var root = doc.RootElement;
            Assert.Null(PageTemplateRules.ValidateTemplate(root, root.GetProperty("components"), root.GetProperty("queries")));
        }
        using (var doc = JsonDocument.Parse(Page("record", [Bar(new { deleteQuery = "" }), DeleteButton(), .. RecordBody()])))
        {
            var root = doc.RootElement;
            Assert.Null(PageTemplateRules.ValidateTemplate(root, root.GetProperty("components"), root.GetProperty("queries")));
        }
    }

    [Fact]
    public void Free_bar_owned_buttons_do_not_count_toward_eight()
    {
        var owned = Enumerable.Range(1, 9).Select(i => $"menu{i}").ToArray();
        Accepted(Page("free", [Bar(new { moreButtons = owned }), .. owned.Select(id => Button(id)), Button("serbest"), Block()]));
        var unbound = Enumerable.Range(1, 9).Select(i => Button($"d{i}")).ToArray();
        Rejected(Page("free", [Bar(), .. unbound, Block()]), "Serbest gövdede en fazla 8 düğme olabilir.");
    }

    [Fact]
    public void Legacy_action_bar_rules_unchanged()
    {
        var bar = new { id = "komutlar", type = "actionBar", name = "komutlar", props = new { barLook = new[] { "align=end" }, printEnabled = true, exportCsv = false, exportTable = "tablo", titleCount = "{{liste.meta.totalCount}}" } };
        var table = new { id = "tablo", type = "dataTable", name = "tablo", props = new { query = "liste" } };
        Accepted(Page(null, [bar, table]));
    }
}
