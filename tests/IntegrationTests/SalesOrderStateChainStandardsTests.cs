using System.Text.Json;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>Belge kuralları PR 1, task 8: the sales order standards follow the state chain.</summary>
public sealed class SalesOrderStateChainStandardsTests
{
    private static JsonElement Component(SystemPageStandard standard, string id)
    {
        using var document = JsonDocument.Parse(standard.DefinitionJson);
        return document.RootElement.GetProperty("components").EnumerateArray().Single(x => x.GetProperty("id").GetString() == id).Clone();
    }

    private static string Prop(JsonElement component, string name) => component.GetProperty("props").GetProperty(name).ToString();

    [Fact]
    public void Sales_orders_list_offers_the_transitions_by_row_state()
    {
        Assert.True(SystemPageStandards.TryGet("sales-orders", out var standard));

        Assert.True(standard.Version >= 3);
        Assert.Equal("liste.seciliSatir.status == 'Draft'", Prop(Component(standard, "onaylaDugmesi"), "visibleWhen"));
        Assert.Contains("status == 'Open'", Prop(Component(standard, "onayiGeriAlDugmesi"), "visibleWhen"));
        Assert.Contains("'Draft'", Prop(Component(standard, "iptalDugmesi"), "visibleWhen"));
        Assert.Equal("true", Prop(Component(standard, "iptalDugmesi"), "promptRequired").ToLowerInvariant());
        Assert.Equal("liste.seciliSatir.status == 'Draft'", Prop(Component(standard, "duzenleDugmesi"), "visibleWhen"));
        var badges = standard.DefinitionJson;
        foreach (var label in new[] { "\"Taslak\"", "\"Onaylı\"", "\"Sevk edildi\"", "\"Faturalandı\"" }) Assert.Contains(label, badges);
        Assert.DoesNotContain("\"Tamamlandı\"", badges);
    }

    [Fact]
    public void Tenant_copy_of_version_2_is_offered_the_transition_items()
    {
        Assert.True(SystemPageStandards.TryGet("sales-orders", out var standard));
        var version2 = SystemPageStandards.Restrict(standard, 2);

        var offered = SystemPageMerge.NewItems(standard, version2, baseVersion: 2).Select(x => x.Key).ToArray();

        Assert.Contains("component:onaylaDugmesi", offered);
        Assert.Contains("component:onayiGeriAlDugmesi", offered);
        Assert.Contains("component:iptalDugmesi", offered);
        Assert.Contains("query:onayla", offered);
        Assert.Contains("query:iptal", offered);
    }

}
