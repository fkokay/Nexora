using AIERP.Api.DocumentModels;
using Xunit;

namespace AIERP.Api.IntegrationTests;

public sealed class PurchaseDocumentModelTests
{
    [Fact]
    public void Purchase_order_model_uses_only_existing_create_and_read_operations()
    {
        var model = DocumentModelRegistry.Find("satinalma.siparis")!;
        Assert.Equal("satinalma.siparis.belge", model.LoadOperation);
        Assert.Equal("satinalma.siparis.hesapla", model.CalculateOperation);
        Assert.Equal("satinalma.siparis.olustur", model.CreateOperation);
        Assert.Empty(model.UpdateOperation);
        Assert.Contains(model.Fields, x => x.Code == "supplierId" && x.Required);
        Assert.Contains(model.LineColumns, x => x.Code == "stockItemId" && x.Required);
        Assert.Empty(model.Transitions);
    }

    [Fact]
    public void Purchase_invoice_model_exposes_editable_draft_and_no_invented_transition()
    {
        var model = DocumentModelRegistry.Find("satinalma.fatura")!;
        Assert.Equal("satinalma.faturaTaslagi.olustur", model.CreateOperation);
        Assert.Equal("satinalma.faturaTaslagi.guncelle", model.UpdateOperation);
        Assert.Equal("satinalma.fatura.hesapla", model.CalculateOperation);
        Assert.Contains(model.Fields, x => x.Code == "supplierId" && x.Required);
        Assert.Contains(model.LineColumns, x => x.Code == "expenseAccountId");
        Assert.Contains(model.Transitions, x => x.Code == "muhasebelestir" && x.Operation == "satinalma.faturaTaslagi.muhasebelestir");
        Assert.Contains(model.Transitions, x => x.Code == "iptal" && x.Operation == "satinalma.fatura.iptal");
    }

    [Theory]
    [InlineData("purchase-order-document", "satinalma.siparis")]
    [InlineData("purchase-invoice-document", "satinalma.fatura")]
    public void Purchase_document_standard_matches_model(string key, string code)
    {
        var standard = SystemPageStandards.All[key];
        Assert.Equal(1, standard.Version);
        Assert.Equal("belge", System.Text.Json.JsonDocument.Parse(standard.DefinitionJson).RootElement
            .GetProperty("template").GetProperty("name").GetString());
        Assert.Equal(code, System.Text.Json.JsonDocument.Parse(standard.DefinitionJson).RootElement
            .GetProperty("template").GetProperty("document").GetString());
        Assert.True(TenantCustomPageSchema.Validate(standard.DefinitionJson, out var error), error);
    }

    [Theory]
    [InlineData("sales-purchasing", "@purchase-order-document")]
    [InlineData("sales-purchase-invoices", "@purchase-invoice-document")]
    public void Purchase_lists_route_new_and_open_to_document(string listKey, string documentPage)
    {
        var standard = SystemPageStandards.All[listKey];
        using var json = System.Text.Json.JsonDocument.Parse(standard.DefinitionJson);
        var actionBar = json.RootElement.GetProperty("components").EnumerateArray()
            .Single(x => x.GetProperty("type").GetString() == "actionBar").GetProperty("props");
        Assert.Equal("page", actionBar.GetProperty("newAction").GetString());
        Assert.Equal(documentPage, actionBar.GetProperty("newPageCode").GetString());
        Assert.Equal("page", actionBar.GetProperty("openAction").GetString());
        Assert.Equal(documentPage, actionBar.GetProperty("openPageCode").GetString());
        Assert.NotEmpty(standard.Updates);
    }
}
