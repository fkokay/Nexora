using System.Text.Json;
using AIERP.AIService.AI;
using AIERP.Platform.Application;

namespace AIERP.Platform.UnitTests;

public sealed class ERPAssistantPurchaseReceiptToolsTests
{
    [Theory]
    [InlineData(null, false)]
    [InlineData(" x ", false)]
    [InlineData(" GR-2026-001 ", true)]
    [InlineData("01234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890", false)]
    public void Search_term_is_trimmed_and_bounded(string? input, bool expected)
    {
        Assert.Equal(expected, ERPAssistantPurchaseReceiptTools.TryValidateSearchTerm(input, out var term));
        Assert.Equal(input?.Trim() ?? string.Empty, term);
    }

    [Fact]
    public async Task Receipt_read_requires_the_specific_purchase_receipt_permission()
    {
        var tenantId = Guid.NewGuid();
        var authorizer = new RecordingPermissionAuthorizer(true, tenantId);
        var allowed = await ERPAssistantPurchaseReceiptTools.IsReadAllowedAsync(tenantId, Guid.NewGuid(), "PurchasingUser",
            authorizer, CancellationToken.None);
        Assert.True(allowed);
        Assert.Equal(tenantId, authorizer.TenantId);
        Assert.Equal("erp.purchase-receipts.read", authorizer.PermissionCode);
    }

    [Fact]
    public async Task Receipt_read_denies_when_permission_authorizer_rejects()
    {
        var tenantId = Guid.NewGuid();
        var authorizer = new RecordingPermissionAuthorizer(false, tenantId);
        Assert.False(await ERPAssistantPurchaseReceiptTools.IsReadAllowedAsync(tenantId, Guid.NewGuid(), "PurchasingUser",
            authorizer, CancellationToken.None));
        Assert.Equal("erp.purchase-receipts.read", authorizer.PermissionCode);
    }

    [Fact]
    public void Summary_projects_only_bounded_receipt_fulfillment_fields()
    {
        using var response = JsonDocument.Parse("""
            {"totalCount":12,"returned":10,"hasMore":true,"items":[
              {"id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","code":"GR-2026-001","purchaseOrderCode":"PO-2026-001","receiptDate":"2026-10-25","status":"Posted","lineCount":3,"warehouseId":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","supplierName":"Sensitive Supplier"}
            ]}
            """);
        using var result = JsonDocument.Parse(ERPAssistantPurchaseReceiptTools.SummarizeReceipts(response.RootElement));
        Assert.Equal(12, result.RootElement.GetProperty("totalCount").GetInt32());
        Assert.True(result.RootElement.GetProperty("hasMore").GetBoolean());
        var item = Assert.Single(result.RootElement.GetProperty("items").EnumerateArray());
        Assert.Equal("GR-2026-001", item.GetProperty("code").GetString());
        Assert.Equal("PO-2026-001", item.GetProperty("purchaseOrderCode").GetString());
        Assert.Equal(3, item.GetProperty("lineCount").GetInt32());
        Assert.False(item.TryGetProperty("id", out _));
        Assert.False(item.TryGetProperty("warehouseId", out _));
        Assert.False(item.TryGetProperty("supplierName", out _));
    }

    [Fact]
    public void Summary_rejects_oversized_or_inconsistent_responses()
    {
        using var response = JsonDocument.Parse("""
            {"totalCount":0,"items":[{"code":"GR-1","purchaseOrderCode":"PO-1","receiptDate":"2026-10-25","status":"Posted","lineCount":1}]}
            """);
        Assert.Throws<JsonException>(() => ERPAssistantPurchaseReceiptTools.SummarizeReceipts(response.RootElement));
    }

    private sealed class RecordingPermissionAuthorizer(bool allowed, Guid expectedTenantId) : IPlatformPermissionAuthorizer
    {
        public Guid? TenantId { get; private set; }
        public string? PermissionCode { get; private set; }

        public Task<bool> IsAllowedAsync(Guid tenantId, Guid userId, string role, ResolvedPlatformPermission permission,
            CancellationToken cancellationToken = default)
        {
            TenantId = tenantId;
            PermissionCode = permission.Permission.Code;
            return Task.FromResult(allowed && expectedTenantId == tenantId);
        }
    }
}
