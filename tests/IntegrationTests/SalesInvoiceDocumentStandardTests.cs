using System.Text.Json;
using System.Text.Json.Nodes;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>Belge modeli satis.fatura: sales-invoice-document (Belge) and sales-invoices (Liste) system standards.</summary>
public sealed class SalesInvoiceDocumentStandardTests
{
    private static readonly string[] Section2Settings = ["fillQuery", "fillColumns", "lookupFills", "formulas", "editableGrid", "calc:", "gridColumns"];

    private static JsonObject Definition(string key) => JsonNode.Parse(SystemPageStandards.All[key].DefinitionJson)!.AsObject();

    private static JsonObject Props(string key, string id) =>
        Definition(key)["components"]!.AsArray().OfType<JsonObject>().Single(x => (string)x["id"]! == id)["props"]!.AsObject();

    [Fact]
    public void Belge_invoice_card_is_a_valid_belge_page_without_section_2_settings()
    {
        Assert.True(SystemPageStandards.TryGet("sales-invoice-document", out var standard));

        Assert.Empty(SystemPageStandards.Validate(SystemPageStandards.EmbeddedFiles().Where(x => x.FileName == "sales-invoice-document.json")));
        Assert.True(TenantCustomPageSchema.Validate(standard.DefinitionJson, out var error), error);
        Assert.Equal("belge", PageTemplateSummary.Read(standard.DefinitionJson).Template);
        using var document = JsonDocument.Parse(standard.DefinitionJson);
        Assert.Equal("satis.fatura", document.RootElement.GetProperty("template").GetProperty("document").GetString());
        foreach (var setting in Section2Settings) Assert.DoesNotContain(setting, standard.DefinitionJson);
        Assert.Equal(["code", "customerId", "invoiceDate", "warehouseId", "invoiceType", "accountingProfileCode", "eDocumentScenario", "eDocumentTypeCode",
            "eDocumentRecipientAlias", "notes"], Props("sales-invoice-document", "baslik")["fields"]!.AsArray().Select(x => (string)x!).ToArray());
    }

    [Fact]
    public void Invoice_card_rejects_an_unknown_field_and_an_order_only_column()
    {
        var definition = Definition("sales-invoice-document");
        definition["components"]!.AsArray().OfType<JsonObject>().Single(x => (string)x["id"]! == "satirlar")["props"]!["columns"]!.AsArray().Add("deliveredQuantity");
        Assert.False(TenantCustomPageSchema.Validate(definition.ToJsonString(), out var error));
        Assert.Contains("deliveredQuantity", error);

        definition = Definition("sales-invoice-document");
        definition["components"]!.AsArray().OfType<JsonObject>().Single(x => (string)x["id"]! == "baslik")["props"]!["fields"]!.AsArray().Add("orderDate");
        Assert.False(TenantCustomPageSchema.Validate(definition.ToJsonString(), out error));
        Assert.Contains("orderDate", error);
    }

    [Fact]
    public void Sales_invoices_list_new_and_open_go_to_the_belge_card_and_the_window_stays_as_a_row_action()
    {
        var standard = SystemPageStandards.All["sales-invoices"];

        Assert.Equal(4, standard.Version);
        Assert.Empty(SystemPageStandards.Validate(SystemPageStandards.EmbeddedFiles().Where(x => x.FileName == "sales-invoices.json")));
        Assert.True(TenantCustomPageSchema.Validate(standard.DefinitionJson, out var error), error);
        for (var k = 1; k <= standard.Version; k++)
            Assert.True(TenantCustomPageSchema.Validate(SystemPageStandards.Restrict(standard, k), out var restricted), $"v{k}: {restricted}");
        var bar = Props("sales-invoices", "komutlar");
        Assert.Equal(("page", "@sales-invoice-document", "page", "@sales-invoice-document"),
            ((string)bar["newAction"]!, (string)bar["newPageCode"]!, (string)bar["openAction"]!, (string)bar["openPageCode"]!));
        Assert.Equal(["id={{liste.seciliSatir.id}}"], bar["openParams"]!.AsArray().Select(x => (string)x!).ToArray());
        var open = Props("sales-invoices", "acDugmesi");
        Assert.Equal(("page", "@sales-invoice-document"), ((string)open["actionType"]!, (string)open["pageCode"]!));
        var detail = Props("sales-invoices", "ayrintiDugmesi");
        Assert.Equal(("openDialog", "faturaPenceresi"), ((string)detail["actionType"]!, (string)detail["dialogId"]!));
        Assert.Equal(["ayrintiDugmesi"], Props("sales-invoices", "liste")["rowActions"]!.AsArray().Select(x => (string)x!).ToArray());
    }
}
