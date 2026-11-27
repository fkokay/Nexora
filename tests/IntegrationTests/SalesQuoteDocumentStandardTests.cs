using System.Text.Json;
using System.Text.Json.Nodes;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>Belge modeli satis.teklif: sales-quote-document (Belge) and sales-quotes (Liste) system standards.</summary>
public sealed class SalesQuoteDocumentStandardTests
{
    private static readonly string[] Section2Settings = ["fillQuery", "fillColumns", "lookupFills", "formulas", "editableGrid", "calc:", "gridColumns"];

    private static JsonObject Definition(string key) => JsonNode.Parse(SystemPageStandards.All[key].DefinitionJson)!.AsObject();

    private static JsonObject Props(string key, string id) =>
        Definition(key)["components"]!.AsArray().OfType<JsonObject>().Single(x => (string)x["id"]! == id)["props"]!.AsObject();

    [Fact]
    public void Belge_quote_card_is_a_valid_belge_page_without_section_2_settings()
    {
        Assert.True(SystemPageStandards.TryGet("sales-quote-document", out var standard));

        Assert.Empty(SystemPageStandards.Validate(SystemPageStandards.EmbeddedFiles().Where(x => x.FileName == "sales-quote-document.json")));
        Assert.True(TenantCustomPageSchema.Validate(standard.DefinitionJson, out var error), error);
        Assert.Equal("belge", PageTemplateSummary.Read(standard.DefinitionJson).Template);
        using var document = JsonDocument.Parse(standard.DefinitionJson);
        Assert.Equal("satis.teklif", document.RootElement.GetProperty("template").GetProperty("document").GetString());
        foreach (var setting in Section2Settings) Assert.DoesNotContain(setting, standard.DefinitionJson);
        // The model's required fields and columns are on the page (the schema rejects hiding them).
        Assert.Equal(["code", "customerId", "quoteDate", "validUntil", "salespersonEmployeeId", "deliveryTerms", "notes"],
            Props("sales-quote-document", "baslik")["fields"]!.AsArray().Select(x => (string)x!).ToArray());
    }

    [Fact]
    public void Quote_card_rejects_an_unknown_field_and_an_order_only_column()
    {
        var definition = Definition("sales-quote-document");
        definition["components"]!.AsArray().OfType<JsonObject>().Single(x => (string)x["id"]! == "satirlar")["props"]!["columns"]!.AsArray().Add("deliveredQuantity");
        Assert.False(TenantCustomPageSchema.Validate(definition.ToJsonString(), out var error));
        Assert.Contains("deliveredQuantity", error);

        definition = Definition("sales-quote-document");
        definition["components"]!.AsArray().OfType<JsonObject>().Single(x => (string)x["id"]! == "baslik")["props"]!["fields"]!.AsArray().Add("orderDate");
        Assert.False(TenantCustomPageSchema.Validate(definition.ToJsonString(), out error));
        Assert.Contains("orderDate", error);
    }

    [Fact]
    public void Sales_quotes_is_a_list_whose_new_and_open_go_to_the_belge_card()
    {
        var standard = SystemPageStandards.All["sales-quotes"];

        Assert.Equal(2, standard.Version);
        Assert.Empty(SystemPageStandards.Validate(SystemPageStandards.EmbeddedFiles().Where(x => x.FileName == "sales-quotes.json")));
        Assert.True(TenantCustomPageSchema.Validate(standard.DefinitionJson, out var error), error);
        for (var k = 1; k <= standard.Version; k++)
            Assert.True(TenantCustomPageSchema.Validate(SystemPageStandards.Restrict(standard, k), out var restricted), $"v{k}: {restricted}");
        Assert.Equal("list", (string)Definition("sales-quotes")["template"]!["name"]!);
        var bar = Props("sales-quotes", "komutlar");
        Assert.Equal(("page", "@sales-quote-document", "page", "@sales-quote-document"),
            ((string)bar["newAction"]!, (string)bar["newPageCode"]!, (string)bar["openAction"]!, (string)bar["openPageCode"]!));
        Assert.Equal(["id={{liste.seciliSatir.id}}"], bar["openParams"]!.AsArray().Select(x => (string)x!).ToArray());
        var open = Props("sales-quotes", "acDugmesi");
        Assert.Equal(("page", "@sales-quote-document"), ((string)open["actionType"]!, (string)open["pageCode"]!));
        // The old detail card, dialog and revision/print buttons are gone; incoming "quoteId" links still open a row.
        var ids = Definition("sales-quotes")["components"]!.AsArray().Select(x => (string)x!["id"]!).ToArray();
        Assert.All(new[] { "detayKarti", "teklifPenceresi", "revizyonlarDugmesi", "yazdirDugmesi", "duzenleDugmesi", "detayPaneli" }, id => Assert.DoesNotContain(id, ids));
        Assert.Equal("quoteId", (string)Props("sales-quotes", "liste")["openParam"]!);
        Assert.Equal(["kabulDugmesi", "reddetDugmesi", "siparisDugmesi", "siparisAcDugmesi"], Props("sales-quotes", "liste")["rowActions"]!.AsArray().Select(x => (string)x!).ToArray());
    }

    [Fact]
    public void Sales_quotes_keeps_the_quote_operations_it_ran_before()
    {
        var queries = Definition("sales-quotes")["queries"]!.AsArray().OfType<JsonObject>().ToArray();
        var read = queries.Where(x => (string)x["kind"]! == "read").Select(x => (string)x["operation"]!).Distinct().Order(StringComparer.Ordinal);
        var write = queries.Where(x => (string)x["kind"]! != "read").Select(x => (string)x["operation"]!).Distinct().Order(StringComparer.Ordinal);
        Assert.Equal(["satis.teklif.listele"], read);
        Assert.Equal(["satis.teklif.kabulEt", "satis.teklif.reddet", "satis.teklif.sil", "satis.teklif.siparisOlustur"], write);
    }
}
