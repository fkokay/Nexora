using System.Text.Json;
using System.Text.Json.Nodes;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>Belge modeli satis.irsaliye: sales-delivery-document (Belge) and sales-deliveries (Liste) system standards.</summary>
public sealed class SalesDeliveryDocumentStandardTests
{
    private static readonly string[] Section2Settings = ["fillQuery", "fillColumns", "lookupFills", "formulas", "editableGrid", "calc:", "gridColumns"];

    private static JsonObject Definition(string key) => JsonNode.Parse(SystemPageStandards.All[key].DefinitionJson)!.AsObject();

    private static JsonObject Props(string key, string id) =>
        Definition(key)["components"]!.AsArray().OfType<JsonObject>().Single(x => (string)x["id"]! == id)["props"]!.AsObject();

    [Fact]
    public void Belge_delivery_card_is_a_valid_belge_page_without_section_2_settings()
    {
        Assert.True(SystemPageStandards.TryGet("sales-delivery-document", out var standard));

        Assert.Empty(SystemPageStandards.Validate(SystemPageStandards.EmbeddedFiles().Where(x => x.FileName == "sales-delivery-document.json")));
        Assert.True(TenantCustomPageSchema.Validate(standard.DefinitionJson, out var error), error);
        Assert.Equal("belge", PageTemplateSummary.Read(standard.DefinitionJson).Template);
        using var document = JsonDocument.Parse(standard.DefinitionJson);
        Assert.Equal("satis.irsaliye", document.RootElement.GetProperty("template").GetProperty("document").GetString());
        foreach (var setting in Section2Settings) Assert.DoesNotContain(setting, standard.DefinitionJson);
        Assert.Equal(["code", "customerId", "deliveryDate", "warehouseId"], Props("sales-delivery-document", "baslik")["fields"]!.AsArray().Select(x => (string)x!).ToArray());
    }

    [Fact]
    public void Delivery_card_rejects_an_unknown_field_and_an_order_only_column()
    {
        var definition = Definition("sales-delivery-document");
        definition["components"]!.AsArray().OfType<JsonObject>().Single(x => (string)x["id"]! == "satirlar")["props"]!["columns"]!.AsArray().Add("deliveredQuantity");
        Assert.False(TenantCustomPageSchema.Validate(definition.ToJsonString(), out var error));
        Assert.Contains("deliveredQuantity", error);

        definition = Definition("sales-delivery-document");
        definition["components"]!.AsArray().OfType<JsonObject>().Single(x => (string)x["id"]! == "baslik")["props"]!["fields"]!.AsArray().Add("orderDate");
        Assert.False(TenantCustomPageSchema.Validate(definition.ToJsonString(), out error));
        Assert.Contains("orderDate", error);
    }

    [Fact]
    public void Sales_deliveries_is_a_list_whose_new_and_open_go_to_the_belge_card_and_the_invoice_window_keeps_its_custom_fields_block()
    {
        var standard = SystemPageStandards.All["sales-deliveries"];

        Assert.Equal(2, standard.Version);
        Assert.Empty(SystemPageStandards.Validate(SystemPageStandards.EmbeddedFiles().Where(x => x.FileName == "sales-deliveries.json")));
        Assert.True(TenantCustomPageSchema.Validate(standard.DefinitionJson, out var error), error);
        for (var k = 1; k <= standard.Version; k++)
            Assert.True(TenantCustomPageSchema.Validate(SystemPageStandards.Restrict(standard, k), out var restricted), $"v{k}: {restricted}");
        Assert.Equal("list", (string)Definition("sales-deliveries")["template"]!["name"]!);
        var bar = Props("sales-deliveries", "komutlar");
        Assert.Equal(("page", "@sales-delivery-document", "page", "@sales-delivery-document"),
            ((string)bar["newAction"]!, (string)bar["newPageCode"]!, (string)bar["openAction"]!, (string)bar["openPageCode"]!));
        var ids = Definition("sales-deliveries")["components"]!.AsArray().Select(x => (string)x!["id"]!).ToArray();
        Assert.All(new[] { "yeniDugmesi", "eskiEkranDugmesi" }, id => Assert.DoesNotContain(id, ids));
        // The invoicing window stays; its custom fields block is a window part of its own (not inside a group).
        Assert.Contains("faturaAlanlari", ids);
        Assert.Equal("dialog", (string)Props("sales-deliveries", "faturaAlanlari")["slot"]!);
        Assert.Contains("faturaAlanlari", (string)Props("sales-deliveries", "irsaliyeSekmeleri")["tabs"]!.AsArray()[1]!);
    }
}
