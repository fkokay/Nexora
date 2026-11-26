using System.Text.Json;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>Belge kuralları, ertelenen iş: Belge kalıbıyla satış siparişi kartı standardı ve sipariş listesinde "Belgede aç".</summary>
public sealed class SalesOrderDocumentStandardTests
{
    private static readonly string[] Section2Settings = ["fillQuery", "fillColumns", "lookupFills", "formulas", "editableGrid", "calc:", "gridColumns"];

    private static JsonElement Component(SystemPageStandard standard, string id)
    {
        using var document = JsonDocument.Parse(standard.DefinitionJson);
        return document.RootElement.GetProperty("components").EnumerateArray().Single(x => x.GetProperty("id").GetString() == id).Clone();
    }

    [Fact]
    public void Belge_order_card_is_a_valid_belge_page_without_section_2_settings()
    {
        Assert.True(SystemPageStandards.TryGet("sales-order-document", out var standard));

        Assert.True(TenantCustomPageSchema.Validate(standard.DefinitionJson, out var error), error);
        Assert.Equal("belge", PageTemplateSummary.Read(standard.DefinitionJson).Template);
        using var document = JsonDocument.Parse(standard.DefinitionJson);
        Assert.Equal("satis.siparis", document.RootElement.GetProperty("template").GetProperty("document").GetString());
        foreach (var setting in Section2Settings) Assert.DoesNotContain(setting, standard.DefinitionJson);
    }

    [Fact]
    public void Sales_orders_list_offers_belgede_ac_with_the_order_id()
    {
        Assert.True(SystemPageStandards.TryGet("sales-orders", out var standard));

        Assert.True(standard.Version >= 4);
        var props = Component(standard, "belgedeAcDugmesi").GetProperty("props");
        Assert.Equal("sales-order-document", props.GetProperty("pageKey").GetString());
        Assert.Contains("id={{liste.seciliSatir.id}}", props.GetProperty("params").EnumerateArray().Select(x => x.GetString()));
        Assert.Contains("liste.seciliSatir.id != null", props.GetProperty("visibleWhen").GetString());
        Assert.Contains("component:belgedeAcDugmesi",
            SystemPageMerge.NewItems(standard, SystemPageStandards.Restrict(standard, 3), baseVersion: 3).Select(x => x.Key));
    }
}
