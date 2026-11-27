using System.Text.Json.Nodes;
using AIERP.Api;
using Xunit;

/// <summary>
/// "Stok Değerleme" standard (inventory-cost): the embedded envelope pins the legacy screen's list, the cost manager
/// dialog (three independent forms, each with its own write button) and the reversal rules.
/// </summary>
public sealed class InventoryCostStandardTests
{
    private const string Key = "inventory-cost";

    [Fact]
    public void Header_is_preview_version_2_without_screen_views()
    {
        var standard = SystemPageStandards.All[Key];
        // v2: Liste kalıbına taşındı (5b-2 dalga 1); öğeler v1'de kalır.
        Assert.Equal(2, standard.Version);
        Assert.Equal("preview", standard.Stage);
        Assert.Equal("Stok Değerleme", standard.Title);
        Assert.Equal("Ek maliyetleri, stok değerlemelerini ve alternatif birimleri yönetin.", standard.Description);
        Assert.Equal("Stok & Depo", standard.Module);
        Assert.True(TenantCustomPageSchema.Validate(standard.DefinitionJson, out var error), error);
        Assert.All(standard.Items, x => Assert.True(x.Since == 1 && x.Label.Length is > 0 and <= 80, x.Key));
        // The legacy grid has no tenant screen layout (InventoryCostGrid: "this screen has no tenant screen layout").
        Assert.Empty(standard.ScreenViews);
        Assert.False(TenantScreenViewEndpoints.TryGetCatalogFields(Key, out _));
    }

    [Fact]
    public void Every_query_binds_an_operation_of_the_legacy_screen()
    {
        var expected = new Dictionary<string, (string Operation, string RunOn)>
        {
            ["bakiye"] = ("stok.bakiye.sayfa", "load"), ["depolar"] = ("depo.listele", "load"), ["birimler"] = ("stok.kart.birimleri", "load"),
            ["birimEkle"] = ("stok.kart.birimEkle", "manual"), ["birimSil"] = ("stok.kart.birimSil", "manual"),
            ["kayitlar"] = ("stok.maliyet.kayitlari", "load"), ["yenidenDegerle"] = ("stok.maliyet.yenidenDegerle", "manual"),
            ["degerlemeTersKayit"] = ("stok.maliyet.tersKayit", "manual"), ["malKabuller"] = ("satinalma.malKabul.listele", "load"),
            ["ekMaliyetler"] = ("satinalma.malKabul.ekMaliyetler", "load"), ["ekMaliyetDagit"] = ("satinalma.malKabul.ekMaliyetDagit", "manual"),
            ["ekMaliyetTersKayit"] = ("satinalma.malKabul.ekMaliyetTersKayit", "manual"),
        };
        var queries = Definition()["queries"]!.AsArray().OfType<JsonObject>().ToArray();
        Assert.Equal(expected.Keys.Order(StringComparer.Ordinal), queries.Select(x => (string)x["id"]!).Order(StringComparer.Ordinal));
        foreach (var query in queries)
        {
            var (operation, runOn) = expected[(string)query["id"]!];
            Assert.Equal(operation, (string)query["operation"]!);
            Assert.Equal(runOn, (string)query["runOn"]!);
            Assert.Null(query["sql"]);
        }
        // Every write goes to a handler that itself only accepts TenantAdmin.
        foreach (var query in queries.Where(x => (string)x["kind"]! != "read"))
        {
            Assert.True(ErpOperationCatalog.TryGet((string)query["operation"]!, out var op));
            Assert.True(op.RequiresTenantAdmin, op.Name);
        }
    }

    [Fact]
    public void List_follows_the_legacy_cost_grid()
    {
        var props = Props("liste");
        Assert.Equal(("bakiye", "server", 25), ((string)props["query"]!, (string)props["paging"]!, (int)props["pageSize"]!));
        Assert.Equal(new[] { "balance.code", "balance.name", "balance.quantityOnHand", "balance.valuationAmountBase", "balance.unvaluedQuantity" },
            Strings(props["columns"]));
        Assert.Equal(new[] { "balance.code=Stok kodu", "balance.name=Stok adı", "balance.quantityOnHand=Depo miktarı",
            "balance.valuationAmountBase=Stok değeri", "balance.unvaluedQuantity=Maliyetsiz miktar" }, Strings(props["columnLabels"]));
        Assert.Contains("balance.valuationAmountBase=money", Strings(props["columnFormats"]));
        Assert.Contains("balance.valuationAmountBase=balance.baseCurrencyCode", Strings(props["columnUnits"]));
        Assert.Equal(new[] { "yonet" }, Strings(props["rowActions"]));
        Assert.Equal("Yönetilecek stok bakiyesi yok", (string)props["emptyText"]!);
        var expected = new Dictionary<string, string>
        {
            ["warehouseId"] = "{{suzgec.warehouseId}}", ["q"] = "{{suzgec.q}}", ["page"] = "{{liste.sayfa}}", ["pageSize"] = "{{liste.sayfaBoyutu}}"
        };
        Assert.Equal(expected.Count, Query("bakiye")["parameters"]!.AsArray().Count);
        foreach (var (parameter, binding) in expected) Assert.Equal(binding, Binding("bakiye", parameter));

        var filter = Props("suzgec");
        Assert.Equal(new[] { "warehouseId|select|row|warehouseId|Depo|depolar:id:code:name|searchable,defaultFirst" }, Strings(filter["filters"]));
        Assert.Equal("Kod veya stok adıyla ara", (string)filter["searchPlaceholder"]!);
        var unvalued = Props("maliyetsizGostergesi");
        Assert.Equal(("Maliyetsiz", "{{bakiye.meta.pageUnvaluedCount}}", "bu sayfa"),
            ((string)unvalued["title"]!, (string)unvalued["value"]!, (string)unvalued["description"]!));
    }

    [Fact]
    public void Tenant_user_sees_only_the_boundary_note()
    {
        const string admin = "kullanici.rol == 'TenantAdmin'";
        foreach (var id in new[] { "maliyetsizGostergesi", "suzgec", "liste" }) Assert.Equal(admin, (string)Props(id)["visibleWhen"]!);
        var note = Props("yetkiNotu");
        Assert.Equal("kullanici.rol != 'TenantAdmin'", (string)note["visibleWhen"]!);
        Assert.Equal("Stok maliyetleri ve alternatif birimler yalnızca firma yöneticileri tarafından yönetilebilir.", (string)note["text"]!);
    }

    [Fact]
    public void Manage_opens_the_cost_dialog_only_with_a_warehouse()
    {
        foreach (var id in new[] { "yonet", "acDugmesi" })
        {
            var button = Props(id);
            Assert.Equal(("openDialog", "maliyetPenceresi"), ((string)button["actionType"]!, (string)button["dialogId"]!));
            Assert.Contains("suzgec.warehouseId == null", (string)button["disabledWhen"]!);
        }
        Assert.Equal("acDugmesi", (string)Props("komutlar")["openButton"]!);
        // Liste yalnız Aç ile maliyet yöneticisini açar; yazma komutları çubukta gizli.
        Assert.Equal(new[] { "new", "save", "delete", "print" }, Props("komutlar")["hiddenCommands"]!.AsArray().Select(x => (string)x!));
        var dialog = Props("maliyetPenceresi");
        // Taslak 18: xl pencere; üstte seçili stokun özeti, altında her iş için bir sekme.
        Assert.Equal("xl", (string)dialog["size"]!);
        Assert.Equal(new[] { "maliyetOzeti", "maliyetSekmeleri" }, Strings(dialog["contains"]));
        Assert.Equal(new[] { "Birimler {{birimler.rowCount}}=birimBolumu", "Yeniden değerleme=degerlemeBolumu", "Ek maliyet=ekMaliyetBolumu",
            "Kayıtlar {{kayitlar.rowCount}}=kayitBolumu" }, Strings(Props("maliyetSekmeleri")["tabs"]));
        var summary = Props("maliyetOzeti");
        Assert.Equal("{{liste.seciliSatir.balance.code}} · {{liste.seciliSatir.balance.name}}", (string)summary["title"]!);
        Assert.Equal(new[] { "Temel birim", "Depo miktarı", "Stok değeri", "Maliyetsiz miktar" },
            Strings(summary["fields"]).Select(x => x.Split('=')[0]));
        Assert.All(Strings(summary["fields"]), x => Assert.Contains("{{liste.seciliSatir.balance.", x));
        Assert.Contains("Stok değeri=money", Strings(summary["fieldFormats"]));
        // Three independent forms: the dialog has no single save; every section has its own write button.
        Assert.Null(dialog["saveQuery"]);
        Assert.Null(dialog["saveSequence"]);
        Assert.Equal("birimEkle", (string)Props("birimEkleDugmesi")["queryId"]!);
        Assert.Equal("yenidenDegerle", (string)Props("degerlemeDugmesi")["queryId"]!);
        Assert.Equal("ekMaliyetDagit", (string)Props("ekMaliyetDugmesi")["queryId"]!);
    }

    [Fact]
    public void Each_write_binds_only_its_own_section()
    {
        Assert.Equal("{{birimKodu.value}}", Binding("birimEkle", "unitCode"));
        Assert.Equal("{{birimKatsayisi.value}}", Binding("birimEkle", "factorToBase"));
        Assert.Equal("{{degerlemeTarihi.value}}", Binding("yenidenDegerle", "entryDate"));
        Assert.Equal("{{degerFarki.value}}", Binding("yenidenDegerle", "amountBase"));
        Assert.Equal("{{degerlemeAciklamasi.value}}", Binding("yenidenDegerle", "reason"));
        Assert.Equal("{{suzgec.warehouseId}}", Binding("yenidenDegerle", "warehouseId"));
        Assert.Equal("{{ekMaliyetKabul.value}}", Binding("ekMaliyetDagit", "id"));
        Assert.Equal("{{ekMaliyetTarihi.value}}", Binding("ekMaliyetDagit", "entryDate"));
        Assert.Equal("{{ekMaliyetYontemi.value}}", Binding("ekMaliyetDagit", "allocationMethod"));
        Assert.Equal(new[] { "Value=Satır maliyetine göre", "Quantity=Miktara göre", "Equal=Eşit" }, Strings(Props("ekMaliyetYontemi")["staticOptions"]));
        // Only posted receipts take a landed cost (the list has no status filter; the server rejects the rest too).
        Assert.Equal("ekMaliyetKabul.seciliSatir.status != 'Posted'", (string)Props("ekMaliyetDugmesi")["disabledWhen"]!);
        Assert.Equal(240, (int)Props("degerlemeAciklamasi")["maxLength"]!);
        Assert.Equal(240, (int)Props("ekMaliyetAciklamasi")["maxLength"]!);
        Assert.Equal(8, (int)Props("birimKodu")["maxLength"]!);
    }

    [Fact]
    public void Reversal_is_offered_once_per_kind_with_a_required_reason()
    {
        var revaluation = Props("degerlemeTersKayitDugmesi");
        Assert.Equal("kayitTablosu.seciliSatir.kind == 'Revaluation' && kayitTablosu.seciliSatir.hasReversal != true", (string)revaluation["visibleWhen"]!);
        Assert.Equal("degerlemeTersKayit", (string)revaluation["queryId"]!);
        var landed = Props("ekMaliyetTersKayitDugmesi");
        Assert.Equal("ekMaliyetTablosu.seciliSatir.kind == 'LandedCost' && ekMaliyetTablosu.seciliSatir.hasReversal != true", (string)landed["visibleWhen"]!);
        Assert.Equal("ekMaliyetTersKayit", (string)landed["queryId"]!);
        foreach (var button in new[] { revaluation, landed })
        {
            Assert.Equal("Ters kayıt nedeni", (string)button["promptLabel"]!);
            Assert.True((bool)button["promptRequired"]!);
        }
        Assert.Equal("{{degerlemeTersKayitDugmesi.yanit}}", Binding("degerlemeTersKayit", "reason"));
        Assert.Equal("{{kayitTablosu.seciliSatir.id}}", Binding("degerlemeTersKayit", "id"));
        Assert.Equal("{{ekMaliyetTablosu.seciliSatir.purchaseReceiptId}}", Binding("ekMaliyetTersKayit", "id"));
        Assert.Equal("{{ekMaliyetTablosu.seciliSatir.id}}", Binding("ekMaliyetTersKayit", "adjustmentId"));
        Assert.Equal(new[] { "degerlemeTersKayitDugmesi" }, Strings(Props("kayitTablosu")["rowActions"]));
        Assert.Equal(new[] { "ekMaliyetTersKayitDugmesi" }, Strings(Props("ekMaliyetTablosu")["rowActions"]));
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

    private static JsonObject Props(string id) =>
        (AllComponents().SingleOrDefault(x => (string)x["id"]! == id) ?? throw new Xunit.Sdk.XunitException($"Bileşen yok: {id}"))["props"]!.AsObject();

    private static JsonObject Query(string id) =>
        Definition()["queries"]!.AsArray().OfType<JsonObject>().SingleOrDefault(x => (string)x["id"]! == id)
        ?? throw new Xunit.Sdk.XunitException($"Sorgu yok: {id}");

    private static string? Binding(string queryId, string parameter) =>
        (string?)Query(queryId)["parameters"]!.AsArray().OfType<JsonObject>().SingleOrDefault(x => (string)x["name"]! == parameter)?["binding"];

    private static string[] Strings(JsonNode? node) => node!.AsArray().Select(x => (string)x!).ToArray();
}
