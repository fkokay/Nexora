using System.Text.Json.Nodes;
using AIERP.Api;
using Xunit;

/// <summary>
/// "Raf ve Konumlar" standard (inventory-locations, Liste kalıbı, version 2): depot filter first, the location list with its card
/// group, the Yeni konum and Düzenle windows, Pasife al as row action, and the balance and reconciliation tables in their own
/// windows. Writes are exactly create, update and deactivate; the three screen views keep their ids.
/// </summary>
public sealed class InventoryLocationsStandardTests
{
    private const string Key = "inventory-locations";

    [Fact]
    public void Header_is_preview_version_2_list_template_with_three_screen_views()
    {
        var standard = SystemPageStandards.All[Key];
        Assert.Equal((2, "preview", "Raf ve Konumlar"), (standard.Version, standard.Stage, standard.Title));
        Assert.Equal("list", (string)Definition()["template"]!["name"]!);
        Assert.True(TenantCustomPageSchema.Validate(standard.DefinitionJson, out var error), error);
        Assert.All(standard.Items, x => Assert.Equal(1, x.Since));
        Assert.Equal(new[] { "inventory-warehouse-locations", "warehouse-location-balances", "inventory-warehouse-reconciliation" }, standard.ScreenViews.Select(x => x.Key));
        Assert.Equal(new[] { "konumListesi", "bakiyeTablosu", "denetimTablosu" }, standard.ScreenViews.Select(x => x.Component));
    }

    [Fact]
    public void Operations_are_reads_and_three_writes()
    {
        var queries = Definition()["queries"]!.AsArray().OfType<JsonObject>().ToArray();
        Assert.Equal(new[] { "depo.listele", "depo.konumlari", "depo.konum.bakiyeleri", "depo.konumlandirmaDenetimi", "depo.konum.olustur", "depo.konum.guncelle", "depo.konum.pasifeAl" },
            queries.Select(x => (string)x["operation"]!));
        Assert.All(queries.Select(x => (string)x["operation"]!), name => Assert.True(ErpOperationCatalog.TryGet(name, out var op) && !op.Deprecated, name));
        Assert.Equal(new[] { "olustur", "guncelle", "pasifeAl" }, queries.Where(x => (string)x["runOn"]! == "manual").Select(x => (string)x["id"]!));
    }

    [Fact]
    public void Depot_filter_comes_first_and_hides_the_list_until_chosen()
    {
        var bar = Props("suzgec");
        Assert.Equal(new[] { "warehouseId|select|row|warehouseId|Depo|depolar:id:code:name|searchable,defaultFirst", "isActive|select|row||Durum" }, Strings(bar["filters"]));
        Assert.Equal(("konumListesi", "filters"), ((string)bar["table"]!, (string)bar["slot"]!));
        Assert.Equal("suzgec.warehouseId == null", (string)Props("depoSecinNotu")["visibleWhen"]!);
        Assert.Equal("suzgec.warehouseId != null", (string)Props("konumListesi")["visibleWhen"]!);
        Assert.Equal("{{suzgec.warehouseId}}", Binding("konumlar", "warehouseId"));
        Assert.Equal("{{suzgec.warehouseId}}", Binding("denetim", "warehouseId"));
        // Indicators: location count, active count, cards left without a location.
        Assert.Equal(new[] { "konumSayisi", "aktifKonumSayisi", "konumsuzKart" },
            Definition()["components"]!.AsArray().OfType<JsonObject>().Where(x => (string)x["type"]! == "metric").Select(x => (string)x["id"]!));
        Assert.Equal("{{denetim.rowCount}}", (string)Props("konumsuzKart")["value"]!);
    }

    [Fact]
    public void Commands_open_windows_and_writes_are_for_tenant_admins()
    {
        var bar = Props("komutlar");
        Assert.Equal(("yeniKonumDugmesi", "duzenleDugmesi"), ((string)bar["newButton"]!, (string)bar["openButton"]!));
        Assert.Equal(new[] { "bakiyelerDugmesi", "denetimDugmesi" }, Strings(bar["moreButtons"]));
        Assert.Contains("TenantAdmin", (string)Props("yeniKonumDugmesi")["disabledWhen"]!);
        Assert.Contains("TenantAdmin", (string)Props("duzenleDugmesi")["disabledWhen"]!);
        Assert.Contains("suzgec.warehouseId == null", (string)Props("yeniKonumDugmesi")["disabledWhen"]!);
        Assert.Contains("TenantAdmin", (string)Props("pasifeAlDugmesi")["visibleWhen"]!);
        Assert.Equal(new[] { "pasifeAlDugmesi" }, Strings(Props("konumListesi")["rowActions"]));
        Assert.True((bool)Props("pasifeAlDugmesi")["confirmEnabled"]!);
        Assert.Contains("Etkin alt konumu ya da stok bakiyesi olan konum pasife alınamaz", (string)Props("pasifeAlDugmesi")["confirmText"]!);
    }

    [Fact]
    public void New_and_edit_windows_save_with_their_own_inputs()
    {
        var created = Props("yeniKonumPenceresi");
        Assert.Equal(("olustur", "sm", true), ((string)created["saveQuery"]!, (string)created["size"]!, (bool)created["resetOnOpen"]!));
        Assert.Equal(new[] { "yeniKonumKodu", "yeniKonumAdi", "yeniUstKonum" }, Strings(Props("yeniKonumFormu")["inputs"]));
        Assert.Equal("{{suzgec.warehouseId}}", Binding("olustur", "warehouseId"));
        Assert.Equal("{{yeniUstKonum.value}}", Binding("olustur", "parentLocationId"));

        var edited = Props("duzenleKonumPenceresi");
        Assert.Equal(("guncelle", "Konum · {{konumListesi.seciliSatir.code}}"), ((string)edited["saveQuery"]!, (string)edited["title"]!));
        Assert.Equal(new[] { "konumKodu", "konumAdi", "ustKonum", "konumAktif" }, Strings(Props("duzenleKonumFormu")["inputs"]));
        Assert.Equal("{{konumListesi.seciliSatir.parentLocationId}}", (string)Props("ustKonum")["defaultValue"]!);
        Assert.Equal("{{konumAktif.value}}", Binding("guncelle", "isActive"));
        Assert.Equal("{{konumListesi.seciliSatir.rowVersion}}", Binding("guncelle", "rowVersion"));
    }

    [Fact]
    public void Balance_and_reconciliation_tables_live_in_their_own_windows()
    {
        var balances = Props("bakiyePenceresi");
        Assert.Equal(new[] { "bakiyeTablosu" }, Strings(balances["contains"]));
        Assert.Equal("dialog", (string)Props("bakiyeTablosu")["slot"]!);
        Assert.Equal("{{konumListesi.seciliSatir.id}}", Binding("bakiyeler", "locationId"));
        var audit = Props("denetimPenceresi");
        Assert.Equal(new[] { "denetimNotu", "denetimTablosu" }, Strings(audit["contains"]));
        Assert.Equal("xl", (string)audit["size"]!);
        Assert.Equal("konumListesi.seciliSatir.id == null", (string)Props("bakiyelerDugmesi")["disabledWhen"]!);
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
