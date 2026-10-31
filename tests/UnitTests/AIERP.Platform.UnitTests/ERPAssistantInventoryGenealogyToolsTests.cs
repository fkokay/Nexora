using System.Text.Json;
using AIERP.AIService.AI;
using AIERP.Platform.Application;

namespace AIERP.Platform.UnitTests;

public sealed class ERPAssistantInventoryGenealogyToolsTests
{
    [Theory]
    [InlineData("ITEM-01", "LOT-A", true)]
    [InlineData("I", "LOT-A", false)]
    [InlineData("ITEM-01", "", false)]
    [InlineData("ITEM-01\n", "LOT-A", false)]
    [InlineData("ITEM-01", "LOT\tA", false)]
    [InlineData("ITEM-01", "x", true)]
    public void Request_requires_exact_codes_with_bounded_lengths(string? stockCode, string? trackingCode, bool expected)
    {
        Assert.Equal(expected, ERPAssistantInventoryGenealogyTools.TryValidateRequest(stockCode, trackingCode, out _, out _));
    }

    [Fact]
    public async Task Genealogy_read_requires_inventory_tracking_read_permission()
    {
        var tenantId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        var allowed = new RecordingPermissionAuthorizer(tenantId, "erp.inventory-tracking.read");

        Assert.True(await ERPAssistantInventoryGenealogyTools.IsReadAllowedAsync(tenantId, userId, "TenantUser", allowed, CancellationToken.None));
        Assert.Equal(new[] { "erp.inventory-tracking.read" }, allowed.PermissionCodes);

        var denied = new RecordingPermissionAuthorizer(tenantId);
        Assert.False(await ERPAssistantInventoryGenealogyTools.IsReadAllowedAsync(tenantId, userId, "TenantUser", denied, CancellationToken.None));
    }

    [Fact]
    public void Projection_preserves_bounded_lot_facts_and_omits_sensitive_fields_and_ids()
    {
        using var api = JsonDocument.Parse("""
            {"stockItemCode":"ITEM-01","stockItemName":"Sensitive product name","unitCode":"KG","trackingMode":"Lot","trackingCode":"LOT-A","totalEvents":2,"isComplete":false,"coverage":"incomplete","limit":50,"internalId":"private-id","events":[
              {"date":"2026-10-20","direction":"Receipt","quantity":12.5,"warehouseCode":"MAIN","sourceType":"purchaseReceipt","sourceCode":"GR-001","sourceResolved":true,"isReversal":false,"unitCost":88.1,"description":"private note","inventoryTransactionId":"movement-id"},
              {"date":"2026-10-21","direction":"Issue","quantity":3.25,"warehouseCode":"MAIN","sourceType":null,"sourceCode":"must-not-leak","sourceResolved":false,"isReversal":false,"inventoryTransactionId":"movement-id-2"}]}
            """);

        var json = ERPAssistantInventoryGenealogyTools.SummarizeGenealogy(api.RootElement, "ITEM-01", "LOT-A");
        using var result = JsonDocument.Parse(json);
        var root = result.RootElement;
        Assert.Equal("KG", root.GetProperty("unitCode").GetString());
        Assert.Equal("Lot", root.GetProperty("trackingMode").GetString());
        Assert.Equal("incomplete", root.GetProperty("coverage").GetString());
        Assert.True(root.GetProperty("hasMore").GetBoolean() == false);
        Assert.Equal(12.5m, root.GetProperty("events")[0].GetProperty("quantity").GetDecimal());
        Assert.Equal("Receipt", root.GetProperty("events")[0].GetProperty("direction").GetString());
        Assert.Equal("Issue", root.GetProperty("events")[1].GetProperty("direction").GetString());
        Assert.Equal(JsonValueKind.Null, root.GetProperty("events")[1].GetProperty("sourceCode").ValueKind);
        Assert.DoesNotContain("Sensitive product name", json, StringComparison.Ordinal);
        Assert.DoesNotContain("private-id", json, StringComparison.Ordinal);
        Assert.DoesNotContain("movement-id", json, StringComparison.Ordinal);
        Assert.DoesNotContain("unitCost", json, StringComparison.Ordinal);
        Assert.DoesNotContain("private note", json, StringComparison.Ordinal);
        Assert.DoesNotContain("must-not-leak", json, StringComparison.Ordinal);
    }

    [Fact]
    public void Projection_rejects_mismatched_codes_invalid_coverage_and_unbounded_results()
    {
        using var valid = JsonDocument.Parse("""
            {"stockItemCode":"ITEM-01","unitCode":"EA","trackingMode":"Serial","trackingCode":"SN-1","totalEvents":0,"isComplete":true,"coverage":"complete","limit":50,"events":[]}
            """);
        Assert.Throws<JsonException>(() => ERPAssistantInventoryGenealogyTools.SummarizeGenealogy(valid.RootElement, "ITEM-02", "SN-1"));
        Assert.Throws<JsonException>(() => ERPAssistantInventoryGenealogyTools.SummarizeGenealogy(valid.RootElement, "ITEM-01", "SN-2"));

        using var inconsistent = JsonDocument.Parse("""
            {"stockItemCode":"ITEM-01","unitCode":"EA","trackingMode":"Serial","trackingCode":"SN-1","totalEvents":0,"isComplete":true,"coverage":"incomplete","limit":50,"events":[]}
            """);
        Assert.Throws<JsonException>(() => ERPAssistantInventoryGenealogyTools.SummarizeGenealogy(inconsistent.RootElement, "ITEM-01", "SN-1"));

        using var invalidLimit = JsonDocument.Parse("""
            {"stockItemCode":"ITEM-01","unitCode":"EA","trackingMode":"Serial","trackingCode":"SN-1","totalEvents":0,"isComplete":true,"coverage":"complete","limit":500,"events":[]}
            """);
        Assert.Throws<JsonException>(() => ERPAssistantInventoryGenealogyTools.SummarizeGenealogy(invalidLimit.RootElement, "ITEM-01", "SN-1"));
    }

    private sealed class RecordingPermissionAuthorizer(Guid expectedTenantId, params string[] grantedPermissions) : IPlatformPermissionAuthorizer
    {
        public List<string> PermissionCodes { get; } = [];

        public Task<bool> IsAllowedAsync(Guid tenantId, Guid userId, string role, ResolvedPlatformPermission permission,
            CancellationToken cancellationToken = default)
        {
            PermissionCodes.Add(permission.Permission.Code);
            return Task.FromResult(tenantId == expectedTenantId && grantedPermissions.Contains(permission.Permission.Code, StringComparer.Ordinal));
        }
    }
}
