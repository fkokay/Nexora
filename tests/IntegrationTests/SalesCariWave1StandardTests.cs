using System.Text.Json.Nodes;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>
/// Satış &amp; cari 1. dalga: customers, customer-ledger, crm-opportunities (Liste), customer-create ve crm-opportunity-create
/// (Kayıt kartı) sistem standartları kalıplarla çizildi. Standart yüklenir, şemadan geçer ve her sürümün kısıtlı hâli de geçer;
/// iş akışı (hangi sorgu okur, hangisi yazar) eski ekranla aynıdır; customer-create'ın "Özel alanlar" sekmesi (özel alan bloğu) v3'te geri geldi.
/// </summary>
public sealed class SalesCariWave1StandardTests
{
    public static TheoryData<string, string, int> Pages => new()
    {
        { "customers", "list", 4 },
        { "customer-ledger", "list", 3 },
        { "crm-opportunities", "list", 2 },
        { "customer-create", "record", 3 },
        { "crm-opportunity-create", "record", 2 },
    };

    [Theory]
    [MemberData(nameof(Pages))]
    public void Standard_loads_as_a_template_and_every_restricted_version_validates(string key, string template, int version)
    {
        Assert.Empty(SystemPageStandards.Validate(SystemPageStandards.EmbeddedFiles().Where(x => x.FileName == key + ".json")));
        var standard = SystemPageStandards.All[key];
        Assert.Equal(version, standard.Version);
        var definition = JsonNode.Parse(standard.DefinitionJson)!.AsObject();
        Assert.Equal(template, (string)definition["template"]!["name"]!);
        Assert.True(TenantCustomPageSchema.Validate(standard.DefinitionJson, out var error), error);
        for (var k = 1; k <= version; k++)
            Assert.True(TenantCustomPageSchema.Validate(SystemPageStandards.Restrict(standard, k), out var restrictedError), $"v{k}: {restrictedError}");
        // Kalıplı sayfada genişlik ayarı yoktur; her üst düzey bileşenin yeri yazılıdır.
        foreach (var component in definition["components"]!.AsArray().OfType<JsonObject>())
        {
            Assert.NotNull(component["props"]!["slot"]);
            Assert.Null(component["props"]!["width"]);
        }
    }

    [Fact]
    public void Customer_create_keeps_custom_fields_in_their_own_tab_with_a_save_step()
    {
        var standard = SystemPageStandards.All["customer-create"];
        var definition = JsonNode.Parse(standard.DefinitionJson)!.AsObject();
        var block = definition["components"]!.AsArray().OfType<JsonObject>().Single(x => (string)x["type"]! == "customFieldsBlock");
        Assert.Equal("customFields", (string)block["props"]!["slot"]!);
        var tabs = definition["components"]!.AsArray().OfType<JsonObject>().Single(x => (string)x["id"]! == "kartSekmeleri")["props"]!["tabs"]!.AsArray();
        Assert.Contains(tabs, x => (string)x! == "Özel alanlar=ozelAlanlar");
        var queries = definition["queries"]!.AsArray().OfType<JsonObject>().ToArray();
        // Var olan kartta ozelKaydet, yeni kartta olustur'un customFields parametresi yazar (eski ekranla aynı).
        var save = Assert.Single(queries, x => (string?)x["operation"] == "cari.ozelAlanKaydet");
        Assert.Contains(save["parameters"]!.AsArray().OfType<JsonObject>(), p => (string)p["binding"]! == "{{ozelAlanlar.degerler}}" && (string)p["type"]! == "map");
        var create = queries.Single(x => (string)x["id"]! == "olustur");
        Assert.Contains(create["parameters"]!.AsArray().OfType<JsonObject>(), p => (string)p["name"]! == "customFields" && (string)p["binding"]! == "{{ozelAlanlar.degerler}}");
        // Eski sürümlerde blok, sorguları, kayıt adımı, create'in parametresi ve boşalan sekme birlikte düşer.
        var v2 = JsonNode.Parse(SystemPageStandards.Restrict(standard, 2))!.AsObject();
        Assert.DoesNotContain(v2["components"]!.AsArray().OfType<JsonObject>(), x => (string)x["id"]! == "ozelAlanlar");
        var v2Tabs = v2["components"]!.AsArray().OfType<JsonObject>().Single(x => (string)x["id"]! == "kartSekmeleri")["props"]!["tabs"]!.AsArray().Select(x => (string)x!);
        Assert.Equal(["Genel=kimlikKarti,vergiKarti,eFaturaUyarisi,zorunluNotu", "İletişim ve adres=iletisimKarti,adresKarti", "Finans ve vergi=finansKarti,muhasebeKarti", "Adresler=adresTablosu"], v2Tabs);
        var bar = v2["components"]!.AsArray().OfType<JsonObject>().Single(x => (string)x["id"]! == "komutlar")["props"]!;
        Assert.Equal(["olustur", "guncelle"], bar["saveSequence"]!.AsArray().Select(x => (string)x!));
        Assert.DoesNotContain(v2["queries"]!.AsArray().OfType<JsonObject>().Single(x => (string)x["id"]! == "olustur")["parameters"]!.AsArray().OfType<JsonObject>(), p => (string)p["name"]! == "customFields");
    }

    [Theory]
    [InlineData("customers", "cari.listele,cari.sayaclar,cari.getir,cari.bakiye", "cari.pasifeAl,cari.aktifEt,cari.sil")]
    [InlineData("customer-ledger", "cari.listele,cari.ekstre", "")]
    [InlineData("crm-opportunities", "crm.firsat.listele,crm.firsat.ozet",
        "crm.firsat.sil,crm.firsat.nitelikliYap,crm.firsat.teklifeGecir,crm.firsat.muzakereyeGecir,crm.firsat.kazanildi,crm.firsat.kaybedildi")]
    [InlineData("customer-create",
        "cari.getir,cari.bakiye,cari.gruplar,cari.iller,cari.ilceler,cari.anaFirmaSecenekleri,cari.adresleri,cari.ozelAlanTanimlari,cari.ozelAlanDegerleri",
        "cari.olustur,cari.guncelle,cari.ozelAlanKaydet,cari.adres.ekle,cari.adres.pasifeAl,cari.adres.aktifEt")]
    [InlineData("crm-opportunity-create", "crm.firsat.getir,cari.listele", "crm.firsat.olustur,crm.firsat.guncelle")]
    public void Workflow_keeps_its_reads_and_writes(string key, string reads, string writes)
    {
        var queries = JsonNode.Parse(SystemPageStandards.All[key].DefinitionJson)!["queries"]!.AsArray().OfType<JsonObject>().ToArray();
        var read = queries.Where(x => (string)x["kind"]! == "read").Select(x => (string)x["operation"]!).Distinct().Order(StringComparer.Ordinal);
        var write = queries.Where(x => (string)x["kind"]! != "read").Select(x => (string)x["operation"]!).Distinct().Order(StringComparer.Ordinal);
        Assert.Equal(reads.Split(',', StringSplitOptions.RemoveEmptyEntries).Order(StringComparer.Ordinal), read);
        Assert.Equal(writes.Split(',', StringSplitOptions.RemoveEmptyEntries).Order(StringComparer.Ordinal), write);
    }
}
