using System.Text.Json;
using System.Text.Json.Nodes;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>Belge modeli stok.transfer and its inventory-transfer-document standard.</summary>
public sealed class InventoryTransferDocumentStandardTests
{
    [Fact]
    public void Transfer_document_standard_is_valid_and_contains_the_model_fields()
    {
        var standard = SystemPageStandards.All["inventory-transfer-document"];
        Assert.Equal((1, "preview"), (standard.Version, standard.Stage));
        Assert.Equal("Stok & Depo", standard.Module);
        Assert.Contains("inventory-transfer-document", StandardMenuEndpoints.NavigablePageKeys);
        Assert.True(TenantCustomPageSchema.Validate(standard.DefinitionJson, out var error), error);
        using var json = JsonDocument.Parse(standard.DefinitionJson);
        var definition = json.RootElement;
        Assert.Equal("stok.transfer", definition.GetProperty("template").GetProperty("document").GetString());
        Assert.Equal(new[] { "code", "transferDate", "fromWarehouseId", "toWarehouseId" },
            definition.GetProperty("components")[0].GetProperty("props").GetProperty("fields").EnumerateArray().Select(x => x.GetString()).ToArray());
    }

    [Fact]
    public void Transfer_list_routes_new_open_and_row_open_to_the_belge_page()
    {
        var standard = SystemPageStandards.All["inventory-transfers"];
        Assert.Equal(2, standard.Version);
        var definition = JsonNode.Parse(standard.DefinitionJson)!.AsObject();
        var components = definition["components"]!.AsArray().OfType<JsonObject>().ToDictionary(x => (string)x["id"]!);
        var bar = components["komutlar"]["props"]!;
        Assert.Equal(("page", "@inventory-transfer-document", "page", "@inventory-transfer-document"),
            ((string)bar["newAction"]!, (string)bar["newPageCode"]!, (string)bar["openAction"]!, (string)bar["openPageCode"]!));
        Assert.Equal("@inventory-transfer-document", (string)components["yeniTransferDugmesi"]["props"]!["pageCode"]!);
        Assert.Equal("@inventory-transfer-document", (string)components["kalemlerDugmesi"]["props"]!["pageCode"]!);
    }
}
