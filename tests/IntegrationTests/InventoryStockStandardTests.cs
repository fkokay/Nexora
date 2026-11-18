using System.Text;
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
        Assert.Equal("aramaKutusu", (string)props["searchInput"]!);
        Assert.Equal("Stok kartları", (string)props["title"]!);
        Assert.Equal(new[] { "belowMinimumCount=Minimum altı" }, Strings(props["footerMeta"]));

        Assert.Equal("stok.bakiye.sayfa", (string)Query("bakiye")["operation"]!);
        Assert.Equal("load", (string)Query("bakiye")["runOn"]!);
        var expected = new Dictionary<string, string>
        {
            ["warehouseId"] = "{{depoSecimi.value}}", ["q"] = "{{aramaKutusu.value}}", ["belowMinimumOnly"] = "{{minimumAlti.value}}",
            ["includeInactive"] = "{{pasifler.value}}", ["page"] = "{{liste.sayfa}}", ["pageSize"] = "{{liste.sayfaBoyutu}}"
        };
        Assert.Equal(expected.Count, Query("bakiye")["parameters"]!.AsArray().Count);
        foreach (var (parameter, binding) in expected) Assert.Equal(binding, Binding("bakiye", parameter));

        var search = Props("aramaKutusu");
        Assert.Equal("text", (string)search["inputType"]!);
        Assert.Equal("Ara", (string)search["label"]!);
        Assert.Equal("Kod, ad, barkod veya kategori", (string)search["placeholder"]!);
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
    }

    [Fact]
    public void Warehouse_lookup_offers_all_warehouses()
    {
        var props = Props("depoSecimi");
        Assert.Equal("lookup", (string)props["inputType"]!);
        Assert.Equal(new[] { "=Tüm depolar" }, Strings(props["staticOptions"]));
        Assert.Equal("depolar", (string)props["optionsQuery"]!);
        Assert.Equal("id", (string)props["optionValueColumn"]!);
        Assert.Equal("name", (string)props["optionLabelColumn"]!);
        Assert.Equal("code", (string)props["optionDescriptionColumn"]!);
        Assert.Equal(0, (int)props["minChars"]!);
        Assert.True((bool)props["allowClear"]!);
        Assert.Equal("depo.listele", (string)Query("depolar")["operation"]!);
        Assert.Equal(new[] { "depoSecimi", "minimumAlti", "pasifler" }, Strings(Props("suzgecKarti")["inputs"]));
        Assert.Equal("Minimum altı ({{bakiye.meta.belowMinimumCount}})", (string)Props("minimumAlti")["label"]!);
        Assert.Equal("checkbox", (string)Props("pasifler")["inputType"]!);
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
        var metrics = AllComponents().Where(x => (string)x["type"]! == "metric").Select(x => (string)x["id"]!).ToArray();
        Assert.Equal(expected.Select(x => x.Id), metrics);
        foreach (var (id, value, format, visibleWhen) in expected)
        {
            var props = Props(id);
            Assert.Equal(value, (string)props["value"]!);
            Assert.Equal(format, (string)props["format"]!);
            Assert.Equal(visibleWhen, (string?)props["visibleWhen"]);
            Assert.Null(props["query"]);
        }
        Assert.Equal("Bu sayfa · {{bakiye.meta.baseCurrencyCode}}", (string)Props("stokDegeriGostergesi")["description"]!);
        Assert.Equal("Bu sayfa · {{bakiye.meta.pageUnitCode}}", (string)Props("kullanilabilirGostergesi")["description"]!);
        var minimum = Props("minimumAltiGostergesi");
        Assert.Equal("minimumAlti", (string)minimum["filterInput"]!);
        Assert.Equal("true", (string)minimum["filterValue"]!);
        Assert.Equal("danger", (string)minimum["variant"]!);
        Assert.Equal("Seçili kapsam (arama hariç)", (string)minimum["description"]!);
    }

    [Fact]
    public void Detail_tabs_show_summary_warehouses_and_last_movements()
    {
        var tabs = Props("detaySekmeleri");
        Assert.Equal(new[] { "Özet=ozetPaneli", "Depolar=kartDepoTablosu", "Hareketler=sonHareketTablosu" }, Strings(tabs["tabs"]));
        Assert.Equal("liste.seciliSatir.stockItem.id != null", (string)tabs["visibleWhen"]!);

        var panel = Props("ozetPaneli");
        Assert.Equal("liste", (string)panel["table"]!);
        Assert.Equal("{{liste.seciliSatir.balance.code}} · {{liste.seciliSatir.balance.name}}", (string)panel["title"]!);
        Assert.Equal(new[]
        {
            "balance.quantityOnHand=Bakiye", "balance.availableQuantity=Kullanılabilir", "balance.reservedQuantity=Rezerve",
            "balance.minimumStock=Minimum", "balance.valuationAmountBase=Stok değeri", "balance.unvaluedQuantity=Maliyetsiz",
            "stockItem.category=Kategori", "balance.unitCode=Birim", "stockItem.trackingMode=Lot / seri", "status=Durum"
        }, Strings(panel["fields"]));

        var warehouses = Props("kartDepoTablosu");
        Assert.Equal("kartDepolari", (string)warehouses["query"]!);
        Assert.Equal(new[] { "warehouseCode", "warehouseName", "quantityOnHand", "reservedQuantity", "availableQuantity", "valuationAmountBase", "unvaluedQuantity" },
            Strings(warehouses["columns"]));
        Assert.Equal("{{liste.seciliSatir.stockItem.id}}", Binding("kartDepolari", "id"));

        var movements = Props("sonHareketTablosu");
        Assert.Equal("sonHareketler", (string)movements["query"]!);
        Assert.Equal(5, (int)movements["limit"]!);
        Assert.Equal(new[] { "entryDate", "warehouseCode", "direction", "quantity", "description" }, Strings(movements["columns"]));
        Assert.Equal("stok.kart.hareketleri", (string)Query("sonHareketler")["operation"]!);
        var parameter = Assert.Single(Query("sonHareketler")["parameters"]!.AsArray());
        Assert.Equal("stockItemId", (string)parameter!["name"]!);
        Assert.Equal("{{liste.seciliSatir.stockItem.id}}", Binding("sonHareketler", "stockItemId"));
    }

    [Fact]
    public void State_commands_are_menu_buttons()
    {
        Assert.Equal(new[] { "devreDisiBirak", "etkinlestir" }, Strings(Props("komutlar")["moreButtons"]));
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
        Assert.Equal("aramaKutusu", (string)props["focusInput"]!);
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
        Assert.True(components.Length <= 90, $"Bileşen sayısı {components.Length} > 90");
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
