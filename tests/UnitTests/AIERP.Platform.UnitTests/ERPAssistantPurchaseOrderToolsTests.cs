using System.Text.Json;
using AIERP.AIService.AI;
using AIERP.Platform.Application;

namespace AIERP.Platform.UnitTests;

public sealed class ERPAssistantPurchaseOrderToolsTests
{
    [Theory]
    [InlineData(null, false)]
    [InlineData(" x ", false)]
    [InlineData(" PO-2026-001 ", true)]
    [InlineData("  ", false)]
    public void Order_code_is_trimmed_and_bounded(string? input, bool expected)
    {
        Assert.Equal(expected, ERPAssistantPurchaseOrderTools.TryValidateOrderCode(input, out var code));
        Assert.Equal(input?.Trim() ?? string.Empty, code);
    }

    [Fact]
    public async Task Purchase_order_read_requires_existing_read_permission()
    {
        var tenantId = Guid.NewGuid();
        var authorizer = new RecordingPermissionAuthorizer(tenantId);

        var allowed = await ERPAssistantPurchaseOrderTools.IsReadAllowedAsync(tenantId, Guid.NewGuid(), "TenantUser",
            authorizer, CancellationToken.None);

        Assert.True(allowed);
        Assert.Equal(tenantId, authorizer.TenantId);
        Assert.Equal("erp.purchase-orders.read", authorizer.PermissionCode);
    }

    [Fact]
    public void Order_summary_projects_bounded_line_facts_and_omits_internal_or_supplier_data()
    {
        using var response = JsonDocument.Parse("""
            {"id":"internal-order","orderCode":"PO-01","supplierName":"Private Supplier","supplierId":"internal-supplier","notes":"private","orderDate":"2026-10-20","status":"Open","currencyCode":"TRY","subtotal":1000,"discountTotal":0,"taxTotal":200,"grandTotal":1200,"lineCount":1,"returnedLines":1,"hasMoreLines":false,"invoiceId":"internal-invoice","lines":[{"lineNumber":1,"stockCode":"ITEM-1","stockName":"Synthetic item","unitCode":"EA","quantity":10,"unitPrice":100,"discountPercent":0,"vatPercent":20,"lineSubtotal":1000,"taxAmount":200,"lineTotal":1200,"stockItemId":"internal-stock","note":"private"}]}
            """);

        var serialized = ERPAssistantPurchaseOrderTools.SummarizeOrder(response.RootElement);
        using var result = JsonDocument.Parse(serialized);
        var root = result.RootElement;
        Assert.Equal("PO-01", root.GetProperty("orderCode").GetString());
        Assert.Equal("TRY", root.GetProperty("currencyCode").GetString());
        Assert.Equal(1200m, root.GetProperty("grandTotal").GetDecimal());
        Assert.False(root.TryGetProperty("id", out _));
        Assert.False(root.TryGetProperty("supplierName", out _));
        Assert.False(root.TryGetProperty("supplierId", out _));
        Assert.False(root.TryGetProperty("notes", out _));
        Assert.False(root.TryGetProperty("invoiceId", out _));
        var line = Assert.Single(root.GetProperty("lines").EnumerateArray());
        Assert.Equal(10m, line.GetProperty("quantity").GetDecimal());
        Assert.False(line.TryGetProperty("stockItemId", out _));
        Assert.False(line.TryGetProperty("note", out _));
    }

    [Theory]
    [InlineData("""{"orderCode":"PO-1","orderDate":"2026-10-20","status":"Open","currencyCode":"TRY","subtotal":0,"discountTotal":0,"taxTotal":0,"grandTotal":0,"lineCount":51,"returnedLines":51,"hasMoreLines":false,"lines":[]}""")]
    [InlineData("""{"orderCode":"PO-1","orderDate":"2026-10-20","status":"Open","currencyCode":"TRY","subtotal":0,"discountTotal":0,"taxTotal":0,"grandTotal":0,"lineCount":1,"returnedLines":1,"hasMoreLines":false,"lines":[{}]}""")]
    public void Order_summary_rejects_invalid_or_unbounded_shapes(string json)
    {
        using var response = JsonDocument.Parse(json);
        Assert.Throws<JsonException>(() => ERPAssistantPurchaseOrderTools.SummarizeOrder(response.RootElement));
    }

    private sealed class RecordingPermissionAuthorizer(Guid expectedTenantId) : IPlatformPermissionAuthorizer
    {
        public Guid? TenantId { get; private set; }
        public string? PermissionCode { get; private set; }
        public Task<bool> IsAllowedAsync(Guid tenantId, Guid userId, string role, ResolvedPlatformPermission permission,
            CancellationToken cancellationToken = default)
        {
            TenantId = tenantId;
            PermissionCode = permission.Permission.Code;
            return Task.FromResult(expectedTenantId == tenantId && PermissionCode == "erp.purchase-orders.read");
        }
    }
}
