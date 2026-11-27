using System.Text;
using AIERP.Api;
using AIERP.Platform.Application;
using System.Text.Json.Nodes;
using Xunit;

/// <summary>
/// "Stok Kartları" standard (inventory-stock, Liste kalıbı, version 2): the embedded envelope, as loaded by
/// <see cref="SystemPageStandards"/>, pins the ids, bindings and workflow of the screen: four indicators, one filter bar, the list
/// with its card group, the state commands, and the "Hareket gir" window (entry only; history and reversal live on
/// inventory-stock-movements).
/// </summary>
public sealed class InventoryStockStandardTests
{
    private const string Key = "inventory-stock";

    [Fact]
    public void Header_is_preview_version_2_list_template()
    {
        var standard = SystemPageStandards.All[Key];
        Assert.Equal(2, standard.Version);
        Assert.Equal("preview", standard.Stage);
        Assert.Equal("Stok Kartları", standard.Title);
        Assert.Equal("Stok & Depo", standard.Module);
        Assert.Equal("list", (string)Definition()["template"]!["name"]!);
        Assert.True(TenantCustomPageSchema.Validate(standard.DefinitionJson, out var error), error);
        Assert.All(standard.Items, x => Assert.True(x.Since == 1 && x.Label.Length is > 0 and <= 80, x.Key));
    }

    [Fact]
    public void List_is_server_paged_on_balances()
    {
        var props = Props("liste");
        Assert.Equal("bakiye", (string)props["query"]!);
        Assert.Equal("server", (string)props["paging"]!);
        Assert.Equal(25, (int)props["pageSize"]!);
        Assert.Equal("list", (string)props["slot"]!);
        Assert.Equal("Stok kartları", (string)props["title"]!);
        // The toggle and the width switch of the old detail panel are gone: the card group is always on the right.
        Assert.Null(props["detailToggleInput"]);
        Assert.Null(props["widthWhen"]);
        Assert.Equal(new[] { "belowMinimumCount=Minimum altı" }, Strings(props["footerMeta"]));

        Assert.Equal("stok.bakiye.sayfa", (string)Query("bakiye")["operation"]!);
        Assert.Equal("load", (string)Query("bakiye")["runOn"]!);
        var expected = new Dictionary<string, string>
        {
            ["warehouseId"] = "{{suzgec.warehouseId}}", ["q"] = "{{suzgec.q}}", ["belowMinimumOnly"] = "{{suzgec.belowMinimumOnly}}",
            ["includeInactive"] = "{{suzgec.includeInactive}}", ["page"] = "{{liste.sayfa}}", ["pageSize"] = "{{liste.sayfaBoyutu}}"
        };
        Assert.Equal(expected.Count, Query("bakiye")["parameters"]!.AsArray().Count);
        foreach (var (parameter, binding) in expected) Assert.Equal(binding, Binding("bakiye", parameter));
    }

    [Fact]
    public void List_columns_follow_screen_view_mapping()
    {
        var standard = SystemPageStandards.All[Key];
        var view = Assert.Single(standard.ScreenViews);
        Assert.Equal(Key, view.Key);
        Assert.Equal("liste", view.Component);
        Assert.True(TenantScreenViewEndpoints.TryGetCatalogFields(Key, out var fields));
        var mapped = fields.Where(x => view.Fields.ContainsKey(x.Key)).Select(x => view.Fields[x.Key]).ToArray();
        Assert.Equal(view.Fields.Count, mapped.Length);
        Assert.Equal(mapped, Strings(Props("liste")["columns"]));
        // Only the fixed actions field is unmapped.
        Assert.Equal(new[] { "actions" }, fields.Where(x => !view.Fields.ContainsKey(x.Key)).Select(x => x.Key));
    }

    [Fact]
    public void Status_column_has_tone_map_and_format()
    {
        var props = Props("liste");
        Assert.Equal(new[] { "Minimum altı=danger", "Maliyetsiz=warning", "Yeterli=success", "Pasif=info" }, Strings(props["toneMap"]));
        var formats = Strings(props["columnFormats"]);
        Assert.Contains("status=status", formats);
        Assert.Contains("balance.code=code", formats);
        Assert.Contains("balance.valuationAmountBase=money", formats);
        foreach (var column in new[] { "quantityOnHand", "reservedQuantity", "availableQuantity", "minimumStock", "unvaluedQuantity" })
            Assert.Contains($"balance.{column}=number", formats);
        Assert.Equal(8, formats.Length);
        Assert.Equal(new[]
        {
            "balance.code=Stok kodu", "balance.name=Stok adı", "stockItem.category=Kategori", "balance.quantityOnHand=Depo bakiyesi",
            "balance.reservedQuantity=Rezerve", "balance.availableQuantity=Kullanılabilir", "balance.minimumStock=Minimum",
            "balance.valuationAmountBase=Stok değeri", "balance.unvaluedQuantity=Maliyetsiz miktar", "status=Durum"
        }, Strings(props["columnLabels"]));
        Assert.Equal(new[] { "stockItem.trackingMode:None=Yok", "stockItem.trackingMode:Lot=Lot", "stockItem.trackingMode:Serial=Seri" },
            Strings(props["valueLabels"]));
    }

    [Fact]
    public void One_filter_bar_carries_search_depot_inactive_and_below_minimum()
    {
        var bar = Props("suzgec");
        Assert.Equal("filterBar", (string)Component("suzgec")["type"]!);
        Assert.Equal(("liste", true, "q", "filters"), ((string)bar["table"]!, (bool)bar["search"]!, (string)bar["searchParam"]!, (string)bar["slot"]!));
        Assert.Equal("Kod veya stok adıyla ara", (string)bar["searchPlaceholder"]!);
        Assert.Null(bar["searchColumns"]);
        Assert.Equal(new[]
        {
            "warehouseId|select|row|warehouseId|Depo|depolar:id:name", "includeInactive|toggle|row|includeInactive|Pasif kartları da göster",
            "belowMinimumOnly|toggle|row|belowMinimumOnly|Minimum altı"
        }, Strings(bar["filters"]));
        Assert.Equal("depo.listele", (string)Query("depolar")["operation"]!);
        // The old side inputs (Görünüm card, Minimum altı checkbox, Detay paneli toggle) are gone.
        foreach (var id in new[] { "gorunumKarti", "minimumAlti", "detayPaneli" })
            Assert.DoesNotContain(AllComponents(), x => (string)x["id"]! == id);
    }

    [Fact]
    public void Four_indicators_bind_page_meta()
    {
        var expected = new (string Id, string Value, string Format, string? VisibleWhen)[]
        {
            ("stokDegeriGostergesi", "{{bakiye.meta.pageValuationAmountBase}}", "money", null),
            ("kullanilabilirGostergesi", "{{bakiye.meta.pageAvailableQuantity}}", "number", "bakiye.meta.pageUnitCode != null"),
            ("minimumAltiGostergesi", "{{bakiye.meta.belowMinimumCount}}", "number", null),
            ("maliyetsizGostergesi", "{{bakiye.meta.pageUnvaluedCount}}", "number", null)
        };
        var metrics = Definition()["components"]!.AsArray().OfType<JsonObject>().Where(x => (string)x["type"]! == "metric").Select(x => (string)x["id"]!).ToArray();
        Assert.Equal(expected.Select(x => x.Id), metrics);
        foreach (var (id, value, format, visibleWhen) in expected)
        {
            var props = Props(id);
            Assert.Equal((value, format, "indicators"), ((string)props["value"]!, (string)props["format"]!, (string)props["slot"]!));
            Assert.Equal(visibleWhen, (string?)props["visibleWhen"]);
            Assert.Null(props["query"]);
        }
        Assert.DoesNotContain(AllComponents(), x => (string)x["id"]! == "kullanilabilirKartGostergesi");
        Assert.Equal("danger", (string)Props("minimumAltiGostergesi")["variant"]!);
    }

    [Fact]
    public void Card_group_shows_the_selected_card_without_depot_distribution_or_history()
    {
        var card = Props("detayKarti");
        Assert.Equal(("card", "panel", "detail"), ((string)Component("detayKarti")["type"]!, (string)card["variant"]!, (string)card["slot"]!));
        Assert.Equal(("{{liste.seciliSatir.balance.name}}", "{{liste.seciliSatir.balance.code}}"), ((string)card["title"]!, (string)card["description"]!));
        var children = Component("detayKarti")["children"]!.AsArray().Select(x => (string)x!["id"]!).ToArray();
        Assert.Equal(new[]
        {
            "detayDurum", "detayLot", "detaySeri", "detayBos", "ozetBakiye", "ozetKullanilabilir", "ozetPaneli", "detayHareketGir", "detayHareketler",
            "detayDevreDisi", "detayEtkinlestir"
        }, children);
        Assert.Equal(new[]
        {
            "balance.reservedQuantity=Rezerve", "balance.minimumStock=Minimum", "balance.valuationAmountBase=Stok değeri",
            "balance.unvaluedQuantity=Maliyetsiz miktar", "stockItem.category=Kategori", "balance.unitCode=Birim"
        }, Strings(Props("ozetPaneli")["fields"]));
        // Depot distribution, last movements and the tabs left the card; the movements screen has the history.
        foreach (var id in new[] { "detaySekmeleri", "kartDepoTablosu", "sonHareketTablosu" })
            Assert.DoesNotContain(AllComponents(), x => (string)x["id"]! == id);
        foreach (var id in new[] { "kartDepolari", "sonHareketler", "hareketler", "tersKayit" })
            Assert.DoesNotContain(Definition()["queries"]!.AsArray().OfType<JsonObject>(), x => (string)x["id"]! == id);
        Assert.Equal(("page", "@inventory-stock-movements", "newTab"),
            ((string)Props("detayHareketler")["actionType"]!, (string)Props("detayHareketler")["pageCode"]!, (string)Props("detayHareketler")["target"]!));
        Assert.Equal(new[] { "stockItemId={{liste.seciliSatir.stockItem.id}}", "warehouseId={{suzgec.warehouseId}}" }, Strings(Props("detayHareketler")["params"]));
    }

    [Fact]
    public void State_commands_are_menu_buttons()
    {
        Assert.Equal(new[] { "devreDisiBirak", "etkinlestir", "hareketGirDugmesi", "hareketlerDugmesi" }, Strings(Props("komutlar")["moreButtons"]));
        var deactivate = Props("devreDisiBirak");
        Assert.Equal("Devre dışı bırak", (string)deactivate["text"]!);
        Assert.Equal("query", (string)deactivate["actionType"]!);
        Assert.Equal("pasifeAl", (string)deactivate["queryId"]!);
        Assert.True((bool)deactivate["confirmEnabled"]!);
        Assert.Equal("liste.seciliSatir.stockItem.isActive == true", (string)deactivate["visibleWhen"]!);
        Assert.Equal(new[] { "bakiye" }, Strings(deactivate["refreshQueries"]));
        Assert.Equal("Stok kartı devre dışı bırakıldı.", (string)deactivate["successMessage"]!);

        var activate = Props("etkinlestir");
        Assert.Equal("Etkinleştir", (string)activate["text"]!);
        Assert.Equal("aktifEt", (string)activate["queryId"]!);
        Assert.True((bool)activate["confirmEnabled"]!);
        Assert.Equal("liste.seciliSatir.stockItem.isActive == false", (string)activate["visibleWhen"]!);
        Assert.Equal(new[] { "bakiye" }, Strings(activate["refreshQueries"]));

        Assert.Equal("stok.kart.pasifeAl", (string)Query("pasifeAl")["operation"]!);
        Assert.Equal("stok.kart.aktifEt", (string)Query("aktifEt")["operation"]!);
        Assert.Equal("{{kart.rows[0].id}}", Binding("pasifeAl", "id"));
        Assert.Equal("{{kart.rows[0].id}}", Binding("aktifEt", "id"));
        Assert.Single(Query("pasifeAl")["parameters"]!.AsArray());
        Assert.Single(Query("aktifEt")["parameters"]!.AsArray());
        Assert.Equal("stok.kart.getir", (string)Query("kart")["operation"]!);
        Assert.Equal("{{liste.seciliSatir.stockItem.id}}", Binding("kart", "id"));
    }

    [Fact]
    public void Screen_view_import_hides_mapped_columns()
    {
        var standard = SystemPageStandards.All[Key];
        Assert.True(TenantScreenViewEndpoints.TryGetCatalogFields(Key, out var fields));
        var states = fields.Select(x => new ScreenViewFieldState(x.Key, x.Label, x.Key is not ("status" or "category"), false)).ToArray();
        var result = SystemPageMerge.ImportScreenViews(standard, new Dictionary<string, IReadOnlyList<ScreenViewFieldState>> { [Key] = states });

        Assert.Empty(result.Notes);
        var props = JsonNode.Parse(result.DefinitionJson)!["components"]!.AsArray().OfType<JsonObject>()
            .Single(x => (string)x["id"]! == "liste")["props"]!;
        var columns = Strings(props["columns"]);
        Assert.DoesNotContain("status", columns);
        Assert.DoesNotContain("stockItem.category", columns);
        Assert.Equal(8, columns.Length);
        var formats = Strings(props["columnFormats"]);
        Assert.DoesNotContain(formats, x => x.StartsWith("status=", StringComparison.Ordinal) || x.StartsWith("stockItem.category=", StringComparison.Ordinal));
        Assert.Equal(7, formats.Length);
        Assert.True(TenantCustomPageSchema.Validate(result.DefinitionJson, out var error), error);
    }

    [Fact]
    public void Budget_leaves_headroom()
    {
        var standard = SystemPageStandards.All[Key];
        var components = AllComponents().ToArray();
        var queries = Definition()["queries"]!.AsArray().OfType<JsonObject>().ToArray();
        Assert.True(components.Length <= 100, $"Bileşen sayısı {components.Length} > 100");
        Assert.True(queries.Length <= 26, $"Sorgu sayısı {queries.Length} > 26");
        var size = Encoding.UTF8.GetByteCount(standard.DefinitionJson);
        Assert.True(size <= 100 * 1024, $"Tanım boyutu {size} bayt > 100 KiB");
        foreach (var component in components)
            Assert.True((component["props"] as JsonObject)?.Count is null or <= 30, $"'{component["id"]}' 30'dan fazla özellik içeriyor");
        Assert.DoesNotContain(components, x => (string)x["type"]! == "code");
        Assert.All(components, x => Assert.Null(x["props"]?["javascript"]));
        Assert.All(queries, x => Assert.Null(x["sql"]));
        Assert.All(queries, x => Assert.False(string.IsNullOrEmpty((string?)x["operation"])));
    }

    [Fact]
    public void Yeni_and_ac_open_the_card_screen()
    {
        // Yeni (F2) and Aç (Enter / double click) open "Yeni stok kartı" in its own tab; the card form is on inventory-stock-create.
        var props = Props("komutlar");
        Assert.Null(props["newButton"]);
        Assert.Null(props["openButton"]);
        Assert.Equal(("page", "@inventory-stock-create", "newTab"), ((string)props["newAction"]!, (string)props["newPageCode"]!, (string)props["newTarget"]!));
        Assert.Equal(("page", "@inventory-stock-create", "newTab"), ((string)props["openAction"]!, (string)props["openPageCode"]!, (string)props["openTarget"]!));
        Assert.Equal("liste", (string)props["openTable"]!);
        Assert.Equal(new[] { "id={{liste.seciliSatir.stockItem.id}}" }, Strings(props["openParams"]));
        Assert.Equal("kartSil", (string)props["deleteQuery"]!);
        Assert.Equal("{{bakiye.meta.totalCount}}", (string)props["titleCount"]!);
        Assert.Equal("stok.kart.sil", (string)Query("kartSil")["operation"]!);
        Assert.Equal("delete", (string)Query("kartSil")["kind"]!);
        Assert.Equal("{{liste.seciliSatir.stockItem.id}}", Binding("kartSil", "id"));
        Assert.Null(props["saveQuery"]);
        Assert.Null(props["saveSequence"]);
        Assert.DoesNotContain(Definition()["queries"]!.AsArray().OfType<JsonObject>(), x => (string)x["id"]! is "olustur" or "guncelle" or "ozelKaydet");
        Assert.True(SystemPageStandards.TryGet("inventory-stock-create", out _));
    }

    [Fact]
    public void Negative_stock_is_a_conditional_note_above_the_list()
    {
        var expected = new (string Id, string Title, string Variant, string VisibleWhen)[]
        {
            ("negatifStokKorumaAcik", "Negatif stok koruması açık", "success", "negatifStok.rows[0].allowNegativeStock == false"),
            ("negatifStokKorumaKapali", "Negatif stoka izin veriliyor", "warning", "negatifStok.rows[0].allowNegativeStock == true")
        };
        foreach (var (id, title, variant, visibleWhen) in expected)
        {
            Assert.Equal("alert", (string)Component(id)["type"]!);
            var props = Props(id);
            Assert.Equal((title, variant, visibleWhen, "above"), ((string)props["title"]!, (string)props["variant"]!, (string)props["visibleWhen"]!, (string)props["slot"]!));
            Assert.Contains("Değer ağırlıklı ortalama", (string)props["text"]!);
        }
        Assert.Equal("ayar.negatifStok", (string)Query("negatifStok")["operation"]!);
    }

    // ---- Movement entry window ----

    [Fact]
    public void Movement_window_is_entry_only()
    {
        Assert.Equal("dialog", (string)Component("hareketPenceresi")["type"]!);
        var props = Props("hareketPenceresi");
        Assert.Equal(("dialog", "md", "dialogs"), ((string)props["presentation"]!, (string)props["size"]!, (string)props["slot"]!));
        Assert.Equal("Stok hareketi · {{liste.seciliSatir.balance.code}} · {{suzgec.seciliSatir.warehouseId.name}}", (string)props["title"]!);
        Assert.Equal(new[] { "izlemeUyarisi", "hareketFormu" }, Strings(props["contains"]));
        Assert.Equal("hareketEkle", (string)props["saveQuery"]!);
        Assert.True((bool)props["closeOnSave"]!);
        Assert.True((bool)props["resetOnOpen"]!);
        Assert.Equal(new[] { "bakiye" }, Strings(props["refreshQueries"]));

        var form = Props("hareketFormu");
        Assert.Equal("formCard", (string)Component("hareketFormu")["type"]!);
        Assert.Equal(new[] { "hareketYonu", "hareketTarihi", "hareketBirimi", "hareketMiktari", "hareketKonumu", "birimMaliyet", "hareketAciklamasi" },
            Strings(form["inputs"]));
        // History table, reversal and the lot / serial grid are gone from the window.
        foreach (var id in new[] { "hareketTablosu", "tersKayitDugmesi", "izlemeSatirlari" })
            Assert.DoesNotContain(AllComponents(), x => (string)x["id"]! == id);
        // Lot / serial cards cannot be entered here (a list parameter binds only to an editable grid): the window says so.
        var warning = Props("izlemeUyarisi");
        Assert.Equal("alert", (string)Component("izlemeUyarisi")["type"]!);
        Assert.Equal("liste.seciliSatir.stockItem.trackingMode != 'None'", (string)warning["visibleWhen"]!);
    }

    [Fact]
    public void Every_movement_parameter_is_bound_except_the_lot_serial_list()
    {
        var expected = new Dictionary<string, string>
        {
            ["warehouseId"] = "{{suzgec.warehouseId}}", ["stockItemId"] = "{{liste.seciliSatir.stockItem.id}}",
            ["entryDate"] = "{{hareketTarihi.value}}", ["direction"] = "{{hareketYonu.value}}", ["quantity"] = "{{hareketMiktari.value}}",
            ["description"] = "{{hareketAciklamasi.value}}", ["unitCostBase"] = "{{birimMaliyet.value}}", ["unitCode"] = "{{hareketBirimi.value}}",
            ["storageLocationId"] = "{{hareketKonumu.value}}"
        };
        var insert = Query("hareketEkle");
        Assert.Equal(("stok.hareket.ekle", "insert", "manual"), ((string)insert["operation"]!, (string)insert["kind"]!, (string)insert["runOn"]!));
        Assert.True(ErpOperationCatalog.TryGet("stok.hareket.ekle", out var operation));
        // Every catalog parameter but the list-typed tracking one is bound, and nothing else.
        Assert.Equal(operation.Parameters.Where(x => x.Name != "tracking").Select(x => x.Name).Order(StringComparer.Ordinal), expected.Keys.Order(StringComparer.Ordinal));
        Assert.Equal(expected.Count, insert["parameters"]!.AsArray().Count);
        foreach (var (parameter, binding) in expected) Assert.Equal(binding, Binding("hareketEkle", parameter));

        Assert.Equal("depo.konumlari", (string)Query("konumlar")["operation"]!);
        Assert.Equal("{{suzgec.warehouseId}}", Binding("konumlar", "warehouseId"));
        Assert.Single(Query("konumlar")["parameters"]!.AsArray());
    }

    [Fact]
    public void Movement_inputs_follow_legacy_rules()
    {
        var direction = Props("hareketYonu");
        Assert.Equal(("lookup", "Yön"), ((string)direction["inputType"]!, (string)direction["label"]!));
        Assert.Equal(new[] { "Receipt=Giriş", "Issue=Çıkış" }, Strings(direction["staticOptions"]));
        Assert.True((bool)direction["required"]!);
        Assert.Equal("Receipt", (string)direction["defaultValue"]!);

        var date = Props("hareketTarihi");
        Assert.Equal(("date", "Tarih"), ((string)date["inputType"]!, (string)date["label"]!));
        Assert.True((bool)date["required"]!);
        Assert.Equal("{{bugun}}", (string)date["defaultValue"]!);

        var unit = Props("hareketBirimi");
        Assert.Equal("birimler", (string)unit["optionsQuery"]!);
        Assert.Equal(("unitCode", "unitCode"), ((string)unit["optionValueColumn"]!, (string)unit["optionLabelColumn"]!));
        Assert.True((bool)unit["allowClear"]!);
        Assert.Null(unit["required"]);
        Assert.Equal("Ana birim ({{liste.seciliSatir.balance.unitCode}})", (string)unit["placeholder"]!);

        var quantity = Props("hareketMiktari");
        Assert.Equal(("number", "Miktar"), ((string)quantity["inputType"]!, (string)quantity["label"]!));
        Assert.True((bool)quantity["required"]!);
        Assert.Equal(0.0001, (double)quantity["min"]!);

        var description = Props("hareketAciklamasi");
        Assert.True((bool)description["required"]!);
        Assert.Equal(240, (int)description["maxLength"]!);

        var location = Props("hareketKonumu");
        Assert.Equal("konumlar", (string)location["optionsQuery"]!);
        Assert.True((bool)location["allowClear"]!);
        Assert.Null(location["required"]);
        Assert.Equal("konumlar.rows[0].id != null", (string)location["visibleWhen"]!);

        var cost = Props("birimMaliyet");
        Assert.Equal(0, (double)cost["min"]!);
        Assert.Equal("hareketYonu.value == 'Receipt'", (string)cost["visibleWhen"]!);
    }

    [Fact]
    public void Movements_button_needs_a_warehouse_and_links_to_the_movements_screen()
    {
        var enter = Props("hareketGirDugmesi");
        Assert.Equal("button", (string)Component("hareketGirDugmesi")["type"]!);
        Assert.Equal(("Hareket gir", "openDialog", "hareketPenceresi"), ((string)enter["text"]!, (string)enter["actionType"]!, (string)enter["dialogId"]!));
        Assert.Equal("liste.seciliSatir.stockItem.id != null", (string)enter["visibleWhen"]!);
        Assert.Equal("suzgec.warehouseId == null", (string)enter["disabledWhen"]!);
        Assert.Equal("Hareket için önce bir depo seçin.", (string)enter["disabledReason"]!);

        var history = Props("hareketlerDugmesi");
        Assert.Equal(("Hareketler", "page", "@inventory-stock-movements"), ((string)history["text"]!, (string)history["actionType"]!, (string)history["pageCode"]!));
        Assert.Equal("liste.seciliSatir.stockItem.id != null", (string)history["visibleWhen"]!);
        var item = SystemPageStandards.All[Key].Items.Single(x => x.Key == "component:komutlar");
        Assert.Contains("component:hareketGirDugmesi", item.Requires);
        Assert.Contains("component:hareketlerDugmesi", item.Requires);
    }

    private static JsonObject Definition() => JsonNode.Parse(SystemPageStandards.All[Key].DefinitionJson)!.AsObject();

    private static IEnumerable<JsonObject> AllComponents()
    {
        var pending = new Stack<JsonObject>(Definition()["components"]!.AsArray().OfType<JsonObject>().Reverse());
        while (pending.Count > 0)
        {
            var component = pending.Pop();
            yield return component;
            if (component["children"] is JsonArray children)
                foreach (var child in children.OfType<JsonObject>().Reverse()) pending.Push(child);
        }
    }

    private static JsonObject Component(string id) =>
        AllComponents().SingleOrDefault(x => (string)x["id"]! == id) ?? throw new Xunit.Sdk.XunitException($"Bileşen yok: {id}");

    private static JsonObject Props(string id) => Component(id)["props"]!.AsObject();

    private static JsonObject Query(string id) =>
        Definition()["queries"]!.AsArray().OfType<JsonObject>().SingleOrDefault(x => (string)x["id"]! == id)
        ?? throw new Xunit.Sdk.XunitException($"Sorgu yok: {id}");

    private static string? Binding(string queryId, string parameter) =>
        (string?)Query(queryId)["parameters"]!.AsArray().OfType<JsonObject>().SingleOrDefault(x => (string)x["name"]! == parameter)?["binding"];

    private static string[] Strings(JsonNode? node) => node!.AsArray().Select(x => (string)x!).ToArray();
}
