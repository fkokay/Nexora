using System.Text.Json.Nodes;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>
/// 5b-2 dalga 1: Liste kalıbına taşınan dört standart. Gömülü tanımları dönüştürücünün çıktısıdır (taşımadan önceki tanımlar
/// <c>Fixtures/TemplatedStandards/&lt;key&gt;-before.json</c>); burada kalıplı sayfa olarak yüklendikleri ve doğrulandıkları sınanır.
/// </summary>
public sealed class TemplatedStandardsTests
{
    public static TheoryData<string> Keys => new() { "sales-orders", "sales-invoices", "sales-deliveries", "inventory-cost", "inventory-tracking" };

    [Theory]
    [MemberData(nameof(Keys))]
    public void Embedded_standard_loads_as_a_valid_list_template_page(string key)
    {
        Assert.True(SystemPageStandards.TryGet(key, out var standard), key);
        var current = standard.DefinitionJson;
        Assert.Equal("list", (string?)JsonNode.Parse(current)!["template"]?["name"]);
        Assert.True(TenantCustomPageSchema.Validate(current, out var error), $"{key}: {error}");
        for (var k = 1; k <= standard.Version; k++)
            Assert.True(TenantCustomPageSchema.Validate(SystemPageStandards.Restrict(standard, k), out var restricted), $"{key} v{k}: {restricted}");
    }

    [Theory]
    [InlineData("sales-orders", 7)]
    [InlineData("sales-invoices", 4)]
    [InlineData("sales-deliveries", 2)]
    [InlineData("inventory-cost", 2)]
    [InlineData("inventory-tracking", 2)]
    public void Templated_standard_version_was_bumped(string key, int version) =>
        Assert.Equal(version, SystemPageStandards.All[key].Version);
}
