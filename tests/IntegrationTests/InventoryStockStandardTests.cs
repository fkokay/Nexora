using System.Text;
using AIERP.Api;
using AIERP.Platform.Application;
using System.Text.Json.Nodes;
using Xunit;

/// <summary>
/// Proje 4 "Stok Kartları" standard (inventory-stock): the embedded envelope, as loaded by <see cref="SystemPageStandards"/>,
/// pins the ids, bindings and copy of the wire contract. <c>Budget_leaves_headroom</c> is re-run as later tasks extend it.
/// </summary>
public sealed class InventoryStockStandardTests
{
    private const string Key = "inventory-stock";

    [Fact]
    public void Header_is_preview_version_1()
    {
        var standard = SystemPageStandards.All[Key];
        Assert.Equal(1, standard.Version);
        Assert.Equal("preview", standard.Stage);
        Assert.Equal("Stok Kartları", standard.Title);
        Assert.Equal("Stok & Depo", standard.Module);
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
        // The search box sits in the toolbar row (the list's filterBar), not in the list header.
        Assert.Null(props["searchInput"]);
        Assert.Equal("Stok kartları", (string)props["title"]!);
        // Full width; narrows to 8 only while the right-side detail panel is shown.
        Assert.Equal(12, (int)props["width"]!);
        Assert.Equal("8=detayPaneli.value == true && liste.seciliSatir.stockItem.id != null", (string)props["widthWhen"]!);
        Assert.Equal(new[] { "belowMinimumCount=Minimum altı" }, Strings(props["footerMeta"]));

        Assert.Equal("stok.bakiye.sayfa", (string)Query("bakiye")["operation"]!);
        Assert.Equal("load", (string)Query("bakiye")["runOn"]!);
        var expected = new Dictionary<string, string>
        {
            ["warehouseId"] = "{{suzgec.warehouseId}}", ["q"] = "{{suzgec.q}}", ["belowMinimumOnly"] = "{{minimumAlti.value}}",
            ["includeInactive"] = "{{suzgec.includeInactive}}", ["page"] = "{{liste.sayfa}}", ["pageSize"] = "{{liste.sayfaBoyutu}}"
        };
        Assert.Equal(expected.Count, Query("bakiye")["parameters"]!.AsArray().Count);
        foreach (var (parameter, binding) in expected) Assert.Equal(binding, Binding("bakiye", parameter));

        var bar = Props("suzgec");
        Assert.Equal("filterBar", (string)Component("suzgec")["type"]!);
        Assert.Equal(("liste", true, "q"), ((string)bar["table"]!, (bool)bar["search"]!, (string)bar["searchParam"]!));
        Assert.Equal("Kod veya stok adıyla ara", (string)bar["searchPlaceholder"]!);
        // Server-side search: no client-side search columns.
        Assert.Null(bar["searchColumns"]);
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
        Assert.Equal(new[]
        {
            "balance.quantityOnHand=balance.unitCode", "balance.reservedQuantity=balance.unitCode", "balance.availableQuantity=balance.unitCode",
            "balance.unvaluedQuantity=balance.unitCode", "balance.valuationAmountBase=balance.baseCurrencyCode"
        }, Strings(props["columnUnits"]));
        Assert.Equal(new[] { "stockItem.trackingMode:None=Yok", "stockItem.trackingMode:Lot=Lot", "stockItem.trackingMode:Serial=Seri" },
            Strings(props["valueLabels"]));
    }

    [Fact]
    public void Filter_bar_offers_warehouses_and_inactive_cards()
    {
        var bar = Props("suzgec");
        // Legacy row: search, Depo (server param warehouseId, options from depolar) and Pasif kartları da göster (server toggle).
        Assert.Equal(new[] { "warehouseId|select|row|warehouseId|Depo|depolar:id:name", "includeInactive|toggle|row|includeInactive|Pasif kartları da göster" },
            Strings(bar["filters"]));
        Assert.Equal("depo.listele", (string)Query("depolar")["operation"]!);
        Assert.Equal(9, (int)bar["width"]!);
        // Minimum altı (live count chip, metric click target) stays an input right of the bar; Detay paneli (not a filter) is the
        // list toolbar's toggle (draft 21), so the filter row fits one line (9 + 3).
        var side = Props("gorunumKarti");
        Assert.Equal(new[] { "minimumAlti" }, Strings(side["inputs"]));
        Assert.Equal(("inline", 3), ((string)side["layout"]!, (int)side["width"]!));
        Assert.Equal("detayPaneli", (string)Props("liste")["detailToggleInput"]!);
        Assert.Null(side["columns"]);
        Assert.Equal(("Minimum altı", "{{bakiye.meta.belowMinimumCount}}"), ((string)Props("minimumAlti")["label"]!, (string)Props("minimumAlti")["description"]!));
        Assert.Equal("panel", (string)Props("detayPaneli")["icon"]!);
        var detail = Props("detayPaneli");
        // Legacy: the panel opens by itself only on a wide list area (DETAIL_ROOM 1440); the toggle overrides it.
        Assert.Equal(("checkbox", "Detay paneli", "sayfa.genis == true"), ((string)detail["inputType"]!, (string)detail["label"]!, (string)detail["defaultWhen"]!));
        Assert.Null(detail["defaultValue"]);
        // The old inputs and their inline form card are gone.
        foreach (var id in new[] { "suzgecKarti", "aramaKutusu", "depoSecimi", "pasifler" })
            Assert.DoesNotContain(AllComponents(), x => (string)x["id"]! == id);
        // Legacy order: action bar -> metrics -> toolbar row (bar, then the side toggles) -> list.
        var order = AllComponents().Select(x => (string)x["id"]!).ToList();
        Assert.True(order.IndexOf("maliyetsizGostergesi") < order.IndexOf("suzgec"));
        Assert.Equal(order.IndexOf("suzgec") + 1, order.IndexOf("gorunumKarti"));
        Assert.True(order.IndexOf("gorunumKarti") < order.IndexOf("liste"));
    }

    [Fact]
    public void Metrics_bind_page_meta()
    {
        var expected = new (string Id, string Value, string Format, string? VisibleWhen)[]
        {
            ("stokDegeriGostergesi", "{{bakiye.meta.pageValuationAmountBase}}", "money", null),
            ("kullanilabilirGostergesi", "{{bakiye.meta.pageAvailableQuantity}}", "number", "bakiye.meta.pageUnitCode != null"),
            ("kullanilabilirKartGostergesi", "{{bakiye.meta.pageAvailableCount}}", "number", "bakiye.meta.pageUnitCode == null"),
            ("minimumAltiGostergesi", "{{bakiye.meta.belowMinimumCount}}", "number", null),
            ("maliyetsizGostergesi", "{{bakiye.meta.pageUnvaluedCount}}", "number", null)
        };
        var metrics = AllComponents().Where(x => (string)x["type"]! == "metric" && !((string)x["id"]!).StartsWith("ozet", StringComparison.Ordinal))
            .Select(x => (string)x["id"]!).ToArray();
        Assert.Equal(expected.Select(x => x.Id), metrics);
        foreach (var (id, value, format, visibleWhen) in expected)
        {
            var props = Props(id);
            Assert.Equal(value, (string)props["value"]!);
            Assert.Equal(format, (string)props["format"]!);
            Assert.Equal(visibleWhen, (string?)props["visibleWhen"]);
            Assert.Null(props["query"]);
        }
        Assert.Equal("bu sayfa · {{bakiye.meta.baseCurrencyCode}}", (string)Props("stokDegeriGostergesi")["description"]!);
        Assert.Equal("bu sayfa · {{bakiye.meta.pageUnitCode}}", (string)Props("kullanilabilirGostergesi")["description"]!);
        var minimum = Props("minimumAltiGostergesi");
        Assert.Equal("minimumAlti", (string)minimum["filterInput"]!);
        Assert.Equal("true", (string)minimum["filterValue"]!);
        Assert.Equal("danger", (string)minimum["variant"]!);
        Assert.Equal("seçili depolarda (arama hariç)", (string)minimum["description"]!);
    }

    [Fact]
    public void Detail_tabs_show_summary_warehouses_and_last_movements()
    {
        // Legacy InventoryStockDetailPanel: a panel card (code, Aç, ×, name, status tags) holding the tabs and "Devre dışı bırak".
        var card = Props("detayKarti");
        Assert.Equal(("card", "panel", "detayPaneli", 4), ((string)Component("detayKarti")["type"]!, (string)card["variant"]!, (string)card["closeInput"]!, (int)card["width"]!));
        Assert.Equal(("{{liste.seciliSatir.balance.name}}", "{{liste.seciliSatir.balance.code}}"), ((string)card["title"]!, (string)card["description"]!));
        Assert.Equal("detayPaneli.value == true && liste.seciliSatir.stockItem.id != null", (string)card["visibleWhen"]!);
        Assert.Equal(new[] { "detayAc", "detayDurum", "detayLot", "detaySeri", "detaySekmeleri", "detayDevreDisi" },
            Component("detayKarti")["children"]!.AsArray().Select(x => (string)x!["id"]!));
        Assert.Equal(("page", "@inventory-stock-create", "open"), ((string)Props("detayAc")["actionType"]!, (string)Props("detayAc")["pageCode"]!, (string)Props("detayAc")["icon"]!));
        Assert.Equal(("pasifeAl", "Devre dışı bırak"), ((string)Props("detayDevreDisi")["queryId"]!, (string)Props("detayDevreDisi")["text"]!));
        var tabs = Props("detaySekmeleri");
        Assert.Equal(new[]
        {
            "Özet=ozetBakiye,ozetKullanilabilir,ozetRezerve,ozetMinimum,ozetPaneli,ozetHareketler",
            "Depolar=kartDepoTablosu", "Hareketler=sonHareketTablosu"
        }, Strings(tabs["tabs"]));
        var order = AllComponents().Select(x => (string)x["id"]!).ToList();
        Assert.Equal(order.IndexOf("liste") + 1, order.IndexOf("detayKarti"));
        foreach (var id in new[] { "ozetPaneli", "kartDepoTablosu", "sonHareketTablosu", "ozetHareketler" }) Assert.Equal(12, (int)Props(id)["width"]!);

        // Özet: the four legacy stat tiles, then the facts list and "Hareketler / ekle".
        var tiles = new (string Id, string Title, string Value)[]
        {
            ("ozetBakiye", "Depo bakiyesi", "{{liste.seciliSatir.balance.quantityOnHand}}"),
            ("ozetKullanilabilir", "Kullanılabilir", "{{liste.seciliSatir.balance.availableQuantity}}"),
            ("ozetRezerve", "Rezerve", "{{liste.seciliSatir.balance.reservedQuantity}}"),
            ("ozetMinimum", "Minimum", "{{liste.seciliSatir.balance.minimumStock}}")
        };
        foreach (var (id, title, value) in tiles)
        {
            var tile = Props(id);
            Assert.Equal((title, value, "number", 6), ((string)tile["title"]!, (string)tile["value"]!, (string)tile["format"]!, (int)tile["width"]!));
        }

        var panel = Props("ozetPaneli");
        Assert.Equal("liste", (string)panel["table"]!);
        Assert.Null(panel["title"]);
        Assert.Equal(new[]
        {
            "balance.valuationAmountBase=Stok değeri", "balance.unvaluedQuantity=Maliyetsiz miktar", "stockItem.category=Kategori", "balance.unitCode=Birim"
        }, Strings(panel["fields"]));
        Assert.Equal(("hareketPenceresi", "suzgec.warehouseId == null", "Hareket için önce bir depo seçin."),
            ((string)Props("ozetHareketler")["dialogId"]!, (string)Props("ozetHareketler")["disabledWhen"]!, (string)Props("ozetHareketler")["disabledReason"]!));

        var warehouses = Props("kartDepoTablosu");
        Assert.Equal("kartDepolari", (string)warehouses["query"]!);
        Assert.Equal(("bars", "Depo dağılımı"), ((string)warehouses["variant"]!, (string)warehouses["title"]!));
        Assert.Equal(new[] { "warehouseName", "quantityOnHand" }, Strings(warehouses["columns"]));
        Assert.Equal("{{liste.seciliSatir.stockItem.id}}", Binding("kartDepolari", "id"));

        var movements = Props("sonHareketTablosu");
        Assert.Equal("sonHareketler", (string)movements["query"]!);
        Assert.Equal(5, (int)movements["limit"]!);
        Assert.Equal(("list", "Son hareketler"), ((string)movements["variant"]!, (string)movements["title"]!));
        Assert.Equal(new[] { "description", "entryDate", "warehouseCode", "direction", "quantity" }, Strings(movements["columns"]));
        Assert.Equal(new[] { "Giriş=success", "Çıkış=danger" }, Strings(movements["toneMap"]));
        Assert.Equal("stok.kart.hareketleri", (string)Query("sonHareketler")["operation"]!);
        var parameter = Assert.Single(Query("sonHareketler")["parameters"]!.AsArray());
        Assert.Equal("stockItemId", (string)parameter!["name"]!);
        Assert.Equal("{{liste.seciliSatir.stockItem.id}}", Binding("sonHareketler", "stockItemId"));
    }

    [Fact]
    public void State_commands_are_menu_buttons()
    {
        // Task 6 appends the movements button after the two state commands.
        Assert.Equal(new[] { "devreDisiBirak", "etkinlestir", "hareketlerDugmesi" }, Strings(Props("komutlar")["moreButtons"]));
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
        Assert.Equal("“{{liste.seciliSatir.balance.name}}” yeniden etkinleştirilsin mi?", (string)activate["confirmText"]!);

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
    public void Action_bar_part_1()
    {
        var props = Props("komutlar");
        Assert.Equal("actionBar", (string)Component("komutlar")["type"]!);
        Assert.Equal("kartSil", (string)props["deleteQuery"]!);
        Assert.Equal("liste", (string)props["exportTable"]!);
        Assert.Equal("suzgec", (string)props["focusInput"]!); // Ctrl+F focuses the filter bar's search box.
        Assert.Equal("stok.kart.sil", (string)Query("kartSil")["operation"]!);
        Assert.Equal("delete", (string)Query("kartSil")["kind"]!);
        Assert.Equal("{{liste.seciliSatir.stockItem.id}}", Binding("kartSil", "id"));
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
        // The card form moved to inventory-stock-create (51 components, 11 queries); the action bar opens it for Yeni and Aç.
        Assert.Equal(43, components.Length); // + legacy detail panel (CompactList views, tags, Aç opens the card screen)
        Assert.Equal(14, queries.Length);
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
        // Legacy: the list has no card form; Yeni (F2) and Aç (Enter / double click) open "Yeni stok kartı" in its own tab.
        // The action bar opens the page itself (flat props); there are no hidden Yeni / Aç buttons.
        var props = Props("komutlar");
        Assert.Null(props["newButton"]);
        Assert.Null(props["openButton"]);
        Assert.Equal(("page", "@inventory-stock-create", "newTab"), ((string)props["newAction"]!, (string)props["newPageCode"]!, (string)props["newTarget"]!));
        Assert.Equal(("page", "@inventory-stock-create", "newTab"), ((string)props["openAction"]!, (string)props["openPageCode"]!, (string)props["openTarget"]!));
        Assert.Equal("liste", (string)props["openTable"]!);
        Assert.Equal(new[] { "id={{liste.seciliSatir.stockItem.id}}" }, Strings(props["openParams"]));
        Assert.Null(props["formDialog"]);
        Assert.Null(props["newInputs"]);
        // Legacy title row: "Stok Kartları  N kayıt" above the action bar.
        Assert.Equal("{{bakiye.meta.totalCount}}", (string)props["titleCount"]!);
        Assert.Null(props["saveQuery"]);
        Assert.Null(props["saveSequence"]);
        Assert.DoesNotContain(AllComponents(), x => (string)x["id"]! is "yeniDugme" or "acDugme");
        var requires = SystemPageStandards.All[Key].Items.Single(x => x.Key == "component:komutlar").Requires;
        Assert.Contains("component:liste", requires);
        Assert.DoesNotContain("component:yeniDugme", requires);
        Assert.DoesNotContain(SystemPageStandards.All[Key].Items, x => x.Key is "component:yeniDugme" or "component:acDugme");
        // The card form lives on its own screen.
        Assert.DoesNotContain(AllComponents(), x => (string)x["id"]! is "kartPenceresi" or "kartSekmeleri" or "kod");
        Assert.DoesNotContain(AllComponents(), x => (string)x["type"]! == "formCard" && x["props"]?["recordKey"] is not null);
        Assert.DoesNotContain(Definition()["queries"]!.AsArray().OfType<JsonObject>(), x => (string)x["id"]! is "olustur" or "guncelle" or "ozelKaydet");
        Assert.True(SystemPageStandards.TryGet("inventory-stock-create", out _));
    }

    [Fact]
    public void Negative_stock_strip_sits_below_the_list_for_everyone()
    {
        // Legacy NegativeStockPolicyNote wording: status strip with a shield tile and a right-hand badge.
        var expected = new (string Id, string Title, string Variant, string VisibleWhen, string Icon, string Badge)[]
        {
            ("negatifStokKorumaAcik", "Negatif stok koruması açık", "success", "negatifStok.rows[0].allowNegativeStock == false", "shield", "Etkin"),
            ("negatifStokKorumaKapali", "Negatif stoka izin veriliyor", "warning", "negatifStok.rows[0].allowNegativeStock == true", "shieldAlert", "İzinli")
        };
        var order = AllComponents().Select(x => (string)x["id"]!).ToList();
        foreach (var (id, title, variant, visibleWhen, icon, badge) in expected)
        {
            Assert.Equal("alert", (string)Component(id)["type"]!);
            var props = Props(id);
            Assert.Equal((title, variant, visibleWhen, 12), ((string)props["title"]!, (string)props["variant"]!, (string)props["visibleWhen"]!, (int)props["width"]!));
            Assert.Equal((icon, badge), ((string)props["icon"]!, (string)props["value"]!));
            Assert.Contains("Değer ağırlıklı ortalama", (string)props["text"]!);
            Assert.True(order.IndexOf(id) > order.IndexOf("liste"), id);
            // Not tab- or dialog-owned: visible on the page itself.
            var owned = AllComponents().Where(x => (string)x["type"]! == "tabs").SelectMany(x => Strings(x["props"]!["tabs"]))
                .SelectMany(tab => tab.Split('=', 2)[1].Split(',')).Concat(AllComponents().Where(x => (string)x["type"]! == "dialog").SelectMany(x => Strings(x["props"]!["contains"])));
            Assert.DoesNotContain(id, owned);
        }
    }

    // ---- Task 6: movement dialog, list and reversal ----

    [Fact]
    public void Movement_dialog_contains_form_tracking_and_list()
    {
        Assert.Equal("dialog", (string)Component("hareketPenceresi")["type"]!);
        var props = Props("hareketPenceresi");
        Assert.Equal("dialog", (string)props["presentation"]!);
        Assert.Equal("Stok hareketleri · {{liste.seciliSatir.balance.code}} · {{suzgec.seciliSatir.warehouseId.name}}", (string)props["title"]!);
        Assert.Equal(new[] { "hareketFormu", "izlemeSatirlari", "hareketTablosu" }, Strings(props["contains"]));
        Assert.Equal("hareketEkle", (string)props["saveQuery"]!);
        Assert.Null(props["saveSequence"]);
        Assert.Equal("Hareketi kaydet", (string)props["saveLabel"]!);
        Assert.True((bool)props["closeOnSave"]!);
        Assert.True((bool)props["resetOnOpen"]!);
        Assert.Equal(new[] { "hareketler", "kartDepolari", "sonHareketler", "bakiye" }, Strings(props["refreshQueries"]));

        var form = Props("hareketFormu");
        Assert.Equal("formCard", (string)Component("hareketFormu")["type"]!);
        Assert.Equal("Yeni hareket", (string)form["title"]!);
        Assert.Equal(2, (int)form["columns"]!);
        Assert.Equal(new[] { "hareketYonu", "hareketTarihi", "hareketBirimi", "hareketMiktari", "hareketAciklamasi", "hareketKonumu", "birimMaliyet" },
            Strings(form["inputs"]));
        // A recordKey here would reset the movement entry on every list row change.
        Assert.Null(form["recordKey"]);
        Assert.Null(form["trackChanges"]);

        var grid = Props("izlemeSatirlari");
        Assert.Equal("list", (string)grid["gridMode"]!);
        Assert.Equal("Lot / seri satırları", (string)grid["title"]!);
        Assert.Equal(200, (int)grid["maxRows"]!);
        Assert.Equal(new[]
        {
            "trackingCode|Lot / seri kodu|text|required,unique,maxLength:80", "quantity|Miktar|number|required,min:0.0001",
            "expiryDate|Son kullanma tarihi|date"
        }, Strings(grid["gridColumns"]));
        Assert.Equal("Seri numaralarında miktar 1 olmalı ve son kullanma tarihi boş kalmalıdır; lotlarda son kullanma tarihi zorunludur.",
            (string)grid["description"]!);
        Assert.Null(grid["sourceQuery"]);
    }

    [Fact]
    public void Every_movement_parameter_is_bound()
    {
        var expected = new Dictionary<string, string>
        {
            ["warehouseId"] = "{{suzgec.warehouseId}}", ["stockItemId"] = "{{liste.seciliSatir.stockItem.id}}",
            ["entryDate"] = "{{hareketTarihi.value}}", ["direction"] = "{{hareketYonu.value}}", ["quantity"] = "{{hareketMiktari.value}}",
            ["description"] = "{{hareketAciklamasi.value}}", ["unitCostBase"] = "{{birimMaliyet.value}}", ["unitCode"] = "{{hareketBirimi.value}}",
            ["storageLocationId"] = "{{hareketKonumu.value}}", ["tracking"] = "{{izlemeSatirlari.satirlar}}"
        };
        var insert = Query("hareketEkle");
        Assert.Equal(("stok.hareket.ekle", "insert", "manual"), ((string)insert["operation"]!, (string)insert["kind"]!, (string)insert["runOn"]!));
        Assert.True(ErpOperationCatalog.TryGet("stok.hareket.ekle", out var operation));
        // Every catalog parameter is bound, and nothing else.
        Assert.Equal(operation.Parameters.Select(x => x.Name).Order(StringComparer.Ordinal), expected.Keys.Order(StringComparer.Ordinal));
        Assert.Equal(expected.Count, insert["parameters"]!.AsArray().Count);
        foreach (var (parameter, binding) in expected) Assert.Equal(binding, Binding("hareketEkle", parameter));

        var reversal = new Dictionary<string, string>
        {
            ["warehouseId"] = "{{suzgec.warehouseId}}", ["stockItemId"] = "{{liste.seciliSatir.stockItem.id}}",
            ["entryId"] = "{{hareketTablosu.seciliSatir.id}}", ["reason"] = "{{tersKayitDugmesi.yanit}}"
        };
        var reverse = Query("tersKayit");
        Assert.Equal(("stok.hareket.tersKayit", "insert", "manual"), ((string)reverse["operation"]!, (string)reverse["kind"]!, (string)reverse["runOn"]!));
        Assert.True(ErpOperationCatalog.TryGet("stok.hareket.tersKayit", out var reverseOperation));
        Assert.Equal(reverseOperation.Parameters.Select(x => x.Name).Order(StringComparer.Ordinal), reversal.Keys.Order(StringComparer.Ordinal));
        Assert.Equal(reversal.Count, reverse["parameters"]!.AsArray().Count);
        foreach (var (parameter, binding) in reversal) Assert.Equal(binding, Binding("tersKayit", parameter));

        Assert.Equal("depo.konumlari", (string)Query("konumlar")["operation"]!);
        Assert.Equal("load", (string)Query("konumlar")["runOn"]!);
        Assert.Equal("{{suzgec.warehouseId}}", Binding("konumlar", "warehouseId"));
        Assert.Single(Query("konumlar")["parameters"]!.AsArray());
    }

    [Fact]
    public void Movement_inputs_follow_legacy_rules()
    {
        var direction = Props("hareketYonu");
        Assert.Equal(("lookup", "Yön"), ((string)direction["inputType"]!, (string)direction["label"]!));
        Assert.Equal(new[] { "Receipt=Giriş", "Issue=Çıkış" }, Strings(direction["staticOptions"]));
        Assert.Equal(0, (int)direction["minChars"]!);
        Assert.True((bool)direction["required"]!);
        Assert.Equal("Receipt", (string)direction["defaultValue"]!);

        var date = Props("hareketTarihi");
        Assert.Equal(("date", "Tarih"), ((string)date["inputType"]!, (string)date["label"]!));
        Assert.True((bool)date["required"]!);
        Assert.Equal("{{bugun}}", (string)date["defaultValue"]!);

        var unit = Props("hareketBirimi");
        Assert.Equal(("lookup", "Hareket birimi"), ((string)unit["inputType"]!, (string)unit["label"]!));
        Assert.Equal("birimler", (string)unit["optionsQuery"]!);
        Assert.Equal(("unitCode", "unitCode"), ((string)unit["optionValueColumn"]!, (string)unit["optionLabelColumn"]!));
        Assert.Equal(0, (int)unit["minChars"]!);
        Assert.True((bool)unit["allowClear"]!);
        Assert.Null(unit["required"]);
        Assert.Equal("Ana birim ({{liste.seciliSatir.balance.unitCode}})", (string)unit["placeholder"]!);

        var quantity = Props("hareketMiktari");
        Assert.Equal(("number", "Miktar"), ((string)quantity["inputType"]!, (string)quantity["label"]!));
        Assert.True((bool)quantity["required"]!);
        Assert.Equal(0.0001, (double)quantity["min"]!);
        Assert.Equal(0.0001, (double)quantity["step"]!);

        var description = Props("hareketAciklamasi");
        Assert.Equal(("text", "Açıklama"), ((string)description["inputType"]!, (string)description["label"]!));
        Assert.True((bool)description["required"]!);
        Assert.Equal(240, (int)description["maxLength"]!);

        var location = Props("hareketKonumu");
        Assert.Equal(("lookup", "Depo konumu"), ((string)location["inputType"]!, (string)location["label"]!));
        Assert.Equal("konumlar", (string)location["optionsQuery"]!);
        Assert.Equal(("id", "name", "code"),
            ((string)location["optionValueColumn"]!, (string)location["optionLabelColumn"]!, (string)location["optionDescriptionColumn"]!));
        Assert.True((bool)location["allowClear"]!);
        Assert.Null(location["required"]);
        Assert.Equal("konumlar.rows[0].id != null", (string)location["visibleWhen"]!);

        var cost = Props("birimMaliyet");
        Assert.Equal(("number", "Birim maliyet"), ((string)cost["inputType"]!, (string)cost["label"]!));
        Assert.Equal(0, (double)cost["min"]!);
        Assert.Null(cost["required"]);
        Assert.Equal("hareketYonu.value == 'Receipt'", (string)cost["visibleWhen"]!);

        Assert.Equal("liste.seciliSatir.stockItem.trackingMode != 'None'", (string)Props("izlemeSatirlari")["visibleWhen"]!);
    }

    [Fact]
    public void Movement_list_is_server_paged_by_50()
    {
        var table = Props("hareketTablosu");
        Assert.Equal("dataTable", (string)Component("hareketTablosu")["type"]!);
        Assert.Equal("hareketler", (string)table["query"]!);
        Assert.Equal("server", (string)table["paging"]!);
        Assert.Equal(50, (int)table["pageSize"]!);
        Assert.Equal(new[]
        {
            "entryDate", "direction", "quantity", "enteredQuantity", "enteredUnitCode", "unitCostBase", "storageLocationCode",
            "description", "isReversal", "hasReversal"
        }, Strings(table["columns"]));
        Assert.Equal(new[] { "tersKayitDugmesi" }, Strings(table["rowActions"]));
        Assert.Equal("Bu depoda hareket yok.", (string)table["emptyText"]!);

        var expected = new Dictionary<string, string>
        {
            ["warehouseId"] = "{{suzgec.warehouseId}}", ["stockItemId"] = "{{liste.seciliSatir.stockItem.id}}",
            ["page"] = "{{hareketTablosu.sayfa}}", ["pageSize"] = "{{hareketTablosu.sayfaBoyutu}}"
        };
        Assert.Equal(("stok.hareket.listele", "read", "load"),
            ((string)Query("hareketler")["operation"]!, (string)Query("hareketler")["kind"]!, (string)Query("hareketler")["runOn"]!));
        Assert.Equal(expected.Count, Query("hareketler")["parameters"]!.AsArray().Count);
        foreach (var (parameter, binding) in expected) Assert.Equal(binding, Binding("hareketler", parameter));
    }

    [Fact]
    public void Reversal_asks_for_a_reason_and_skips_reversed_rows()
    {
        var button = Props("tersKayitDugmesi");
        Assert.Equal("button", (string)Component("tersKayitDugmesi")["type"]!);
        Assert.Equal("Ters kayıt", (string)button["text"]!);
        Assert.Equal("query", (string)button["actionType"]!);
        Assert.Equal("tersKayit", (string)button["queryId"]!);
        Assert.Equal("Ters kayıt gerekçesi", (string)button["promptLabel"]!);
        Assert.True((bool)button["promptRequired"]!);
        Assert.Equal("hareketTablosu.seciliSatir.hasReversal || hareketTablosu.seciliSatir.isReversal", (string)button["disabledWhen"]!);
        Assert.Equal("Bu hareket zaten ters kayıtla düzeltilmiş ya da kendisi bir ters kayıt.", (string)button["disabledReason"]!);
        Assert.Equal("Ters kayıt oluşturuldu.", (string)button["successMessage"]!);
        // A bakiye rerun would drop the list selection while the dialog is still open.
        Assert.Equal(new[] { "hareketler", "kartDepolari", "sonHareketler" }, Strings(button["refreshQueries"]));
    }

    [Fact]
    public void Movements_button_needs_a_warehouse()
    {
        var button = Props("hareketlerDugmesi");
        Assert.Equal("button", (string)Component("hareketlerDugmesi")["type"]!);
        Assert.Equal("Hareketler / ekle", (string)button["text"]!);
        Assert.Equal("openDialog", (string)button["actionType"]!);
        Assert.Equal("hareketPenceresi", (string)button["dialogId"]!);
        Assert.Equal("liste.seciliSatir.stockItem.id != null", (string)button["visibleWhen"]!);
        Assert.Equal("suzgec.warehouseId == null", (string)button["disabledWhen"]!);
        Assert.Equal("Hareket için önce bir depo seçin.", (string)button["disabledReason"]!);
        Assert.Contains("hareketlerDugmesi", Strings(Props("komutlar")["moreButtons"]));
        var item = SystemPageStandards.All[Key].Items.Single(x => x.Key == "component:komutlar");
        Assert.Contains("component:hareketlerDugmesi", item.Requires);
    }

    private static JsonObject Definition() =>JsonNode.Parse(SystemPageStandards.All[Key].DefinitionJson)!.AsObject();

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
