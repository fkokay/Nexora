using System.Text.Json.Nodes;
using AIERP.Api;
using Xunit;

/// <summary>
/// "Depo Yönetimi" standard (inventory-warehouses, Liste kalıbı, version 4): the list with its card group, the Yeni depo and
/// Düzenle windows, and the row actions. Writes are exactly create, update, deactivate and activate; custom fields are not in
/// this version (the template windows have no custom field block).
/// </summary>
public sealed class InventoryWarehousesStandardTests
{
    private const string Key = "inventory-warehouses";

    [Fact]
    public void Header_is_preview_version_3_list_template()
    {
        var standard = SystemPageStandards.All[Key];
        Assert.Equal((4, "preview", "Depo Yönetimi"), (standard.Version, standard.Stage, standard.Title));
        Assert.Equal("Stok & Depo", standard.Module);
        Assert.Equal("list", (string)Definition()["template"]!["name"]!);
        Assert.True(TenantCustomPageSchema.Validate(standard.DefinitionJson, out var error), error);
        Assert.All(standard.Items, x => Assert.True(x.Since <= standard.Version, x.Key));
        var view = Assert.Single(standard.ScreenViews);
        Assert.Equal(("inventory-warehouses", "depoListesi"), (view.Key, view.Component));
    }

    [Fact]
    public void Operations_are_read_list_and_four_writes_and_nothing_else()
    {
        var queries = Definition()["queries"]!.AsArray().OfType<JsonObject>().ToArray();
        Assert.Equal(new[] { "depo.listele", "depo.konumlari", "depo.olustur", "depo.guncelle", "depo.pasifeAl", "depo.aktifEt", "depo.ozelAlanTanimlari", "depo.ozelAlanDegerleri", "depo.ozelAlanKaydet" },
            queries.Select(x => (string)x["operation"]!));
        Assert.All(queries.Select(x => (string)x["operation"]!), name => Assert.True(ErpOperationCatalog.TryGet(name, out var op) && !op.Deprecated, name));
        Assert.Equal(new[] { "olustur", "guncelle", "pasifeAl", "aktifEt", "ozelKaydet" }, queries.Where(x => (string)x["runOn"]! == "manual").Select(x => (string)x["id"]!));
        Assert.Contains(AllComponents(), x => (string)x["type"]! == "customFieldsBlock");
        Assert.Equal("depo.ozelAlanKaydet", (string)Query("ozelKaydet")["operation"]!);
        Assert.Equal("{{depoOzelAlanlar.degerler}}", Binding("ozelKaydet", "values"));
    }

    [Fact]
    public void Commands_open_the_two_windows_and_the_list_has_row_actions()
    {
        var bar = Props("komutlar");
        Assert.Equal(("yeniDepoDugmesi", "duzenleDugmesi", "depoListesi", "commands"),
            ((string)bar["newButton"]!, (string)bar["openButton"]!, (string)bar["exportTable"]!, (string)bar["slot"]!));
        Assert.Equal(new[] { "save", "delete", "print" }, Strings(bar["hiddenCommands"]));
        Assert.Equal(("yeniDepoPenceresi", "actions"), ((string)Props("yeniDepoDugmesi")["dialogId"]!, (string)Props("yeniDepoDugmesi")["slot"]!));
        var edit = Props("duzenleDugmesi");
        Assert.Equal(("duzenlePenceresi", "depoListesi.seciliSatir.id == null"), ((string)edit["dialogId"]!, (string)edit["disabledWhen"]!));

        var list = Props("depoListesi");
        Assert.Equal(("depolar", "list"), ((string)list["query"]!, (string)list["slot"]!));
        Assert.Equal(new[] { "code", "name", "isActive" }, Strings(list["columns"]));
        Assert.Equal(new[] { "konumlarDugmesi", "devreDisiBirak", "etkinlestir" }, Strings(list["rowActions"]));
        var locations = Props("konumlarDugmesi");
        Assert.Equal(("page", "@inventory-locations"), ((string)locations["actionType"]!, (string)locations["pageCode"]!));
        Assert.Equal(new[] { "warehouseId={{depoListesi.seciliSatir.id}}" }, Strings(locations["params"]));
        Assert.Equal("depoListesi.seciliSatir.isActive == true", (string)Props("devreDisiBirak")["visibleWhen"]!);
        Assert.Equal("depoListesi.seciliSatir.isActive == false", (string)Props("etkinlestir")["visibleWhen"]!);
        Assert.Equal("{{depoListesi.seciliSatir.id}}", Binding("pasifeAl", "warehouseId"));
        Assert.Equal("{{depoListesi.seciliSatir.id}}", Binding("aktifEt", "warehouseId"));
    }

    [Fact]
    public void New_and_edit_windows_save_with_their_own_inputs()
    {
        var created = Props("yeniDepoPenceresi");
        Assert.Equal(("dialog", "sm", "olustur", true, true), ((string)created["presentation"]!, (string)created["size"]!, (string)created["saveQuery"]!,
            (bool)created["closeOnSave"]!, (bool)created["resetOnOpen"]!));
        Assert.Equal(new[] { "yeniDepoFormu" }, Strings(created["contains"]));
        Assert.Equal(new[] { "yeniDepoKodu", "yeniDepoAdi" }, Strings(Props("yeniDepoFormu")["inputs"]));
        Assert.Equal(2, Query("olustur")["parameters"]!.AsArray().Count);
        Assert.Equal("{{yeniDepoKodu.value}}", Binding("olustur", "code"));
        Assert.Equal("{{yeniDepoAdi.value}}", Binding("olustur", "name"));
        // The new window starts empty: no row defaults.
        Assert.Null(Props("yeniDepoKodu")["defaultValue"]);

        var edited = Props("duzenlePenceresi");
        Assert.Equal("Depo · {{depoListesi.seciliSatir.code}}", (string)edited["title"]!);
        Assert.Equal(new[] { "guncelle", "ozelKaydet" }, Strings(edited["saveSequence"]));
        Assert.Equal(new[] { "depoKodu", "depoAdi" }, Strings(Props("duzenleFormu")["inputs"]));
        Assert.Equal("{{depoListesi.seciliSatir.code}}", (string)Props("depoKodu")["defaultValue"]!);
        Assert.Equal("{{depoListesi.seciliSatir.name}}", (string)Props("depoAdi")["defaultValue"]!);
        Assert.Equal("{{depoListesi.seciliSatir.rowVersion}}", Binding("guncelle", "rowVersion"));
        Assert.Equal("{{depoListesi.seciliSatir.id}}", Binding("guncelle", "warehouseId"));
        Assert.Equal("dialog", (string)Props("depoOzelAlanlar")["slot"]!);
        Assert.Equal("{{depoListesi.seciliSatir.id}}", Binding("ozelDegerler", "warehouseId"));
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
