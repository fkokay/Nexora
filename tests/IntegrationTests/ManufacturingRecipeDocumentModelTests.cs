using AIERP.Api.DocumentModels;
using Xunit;

namespace AIERP.Api.IntegrationTests;

public sealed class ManufacturingRecipeDocumentModelTests
{
    [Fact]
    public void Recipe_model_declares_both_editable_line_groups_and_existing_transitions()
    {
        var model = DocumentModelRegistry.Find("uretim.recete");
        Assert.NotNull(model);
        Assert.Equal(new[] { "Active", "Inactive" }, model.States.Select(x => x.Code));
        Assert.Equal(new[] { "pasifeAl", "etkinlestir" }, model.Transitions.Select(x => x.Code));
        Assert.Equal("uretim.recete.olustur", model.CreateOperation);
        Assert.Equal("uretim.recete.guncelle", model.UpdateOperation);
        var route = Assert.Single(model.LineGroups!);
        Assert.Equal("rota", route.Code);
        Assert.Equal(50, route.MaxRows);
        Assert.Contains(model.LineColumns, x => x.Code == "componentStockItemId");
        Assert.Contains(route.Columns, x => x.Code == "eligibleWorkCenterIds");
        var sample = ManufacturingRecipeDocumentModel.Sample(true);
        Assert.Single(sample.Recipe.Lines);
        Assert.Single(sample.Recipe.Operations);
    }
}
