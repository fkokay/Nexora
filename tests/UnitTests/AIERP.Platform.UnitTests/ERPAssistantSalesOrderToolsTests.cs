using System.Text.Json;
using AIERP.AIService.AI;
using AIERP.Platform.Application;

namespace AIERP.Platform.UnitTests;

public sealed class ERPAssistantSalesOrderToolsTests
{
    [Theory]
    [InlineData(null, false)]
    [InlineData(" x ", false)]
    [InlineData(" SO-2026-001 ", true)]
    public void Order_code_is_trimmed_and_bounded(string? input, bool expected)
    {
        Assert.Equal(expected, ERPAssistantSalesOrderTools.TryValidateOrderCode(input, out var code));
        Assert.Equal(input?.Trim() ?? string.Empty, code);
    }

    [Fact]
    public async Task Sales_order_read_requires_existing_read_permission()
    {
        var tenantId = Guid.NewGuid();
        var authorizer = new RecordingPermissionAuthorizer(tenantId);

        var allowed = await ERPAssistantSalesOrderTools.IsReadAllowedAsync(tenantId, Guid.NewGuid(), "TenantUser",
            authorizer, CancellationToken.None);

        Assert.True(allowed);
        Assert.Equal(tenantId, authorizer.TenantId);
        Assert.Equal("erp.sales-orders.read", authorizer.PermissionCode);
    }

    [Fact]
    public void Order_summary_keeps_currency_and_fulfillment_facts_but_omits_private_fields()
    {
        using var response = JsonDocument.Parse("""
            {"id":"internal-order","orderCode":"SO-01","customerName":"Private customer","customerId":"internal-customer","notes":"private","orderDate":"2026-10-20","requestedDeliveryDate":null,"status":"Open","currencyCode":"TRY","subtotal":1000,"discountTotal":0,"taxTotal":200,"grandTotal":1200,"lineCount":1,"returnedLines":1,"hasMoreLines":false,"lines":[{"lineNumber":1,"stockCode":"ITEM-1","stockName":"Synthetic item","unitCode":"EA","quantity":10,"deliveredQuantity":3,"outstandingQuantity":7,"unitPrice":100,"discountPercent":0,"vatPercent":20,"lineSubtotal":1000,"taxAmount":200,"lineTotal":1200,"stockItemId":"internal-stock","reservationId":"internal-reservation","warehouseName":"Private warehouse"}]}
            """);

        var serialized = ERPAssistantSalesOrderTools.SummarizeOrder(response.RootElement);
        using var result = JsonDocument.Parse(serialized);
        var root = result.RootElement;
        Assert.Equal("SO-01", root.GetProperty("orderCode").GetString());
        Assert.Equal("TRY", root.GetProperty("currencyCode").GetString());
        Assert.Equal(1200m, root.GetProperty("grandTotal").GetDecimal());
        Assert.False(root.TryGetProperty("customerName", out _));
        Assert.False(root.TryGetProperty("customerId", out _));
        Assert.False(root.TryGetProperty("notes", out _));
        Assert.False(root.TryGetProperty("id", out _));
        var line = Assert.Single(root.GetProperty("lines").EnumerateArray());
        Assert.Equal(3m, line.GetProperty("deliveredQuantity").GetDecimal());
        Assert.Equal(7m, line.GetProperty("outstandingQuantity").GetDecimal());
        Assert.False(line.TryGetProperty("stockItemId", out _));
        Assert.False(line.TryGetProperty("reservationId", out _));
        Assert.False(line.TryGetProperty("warehouseName", out _));
    }

    [Theory]
    [InlineData("""{"orderCode":"SO-1","orderDate":"2026-10-20","requestedDeliveryDate":null,"status":"Open","currencyCode":"TRY","subtotal":0,"discountTotal":0,"taxTotal":0,"grandTotal":0,"lineCount":51,"returnedLines":51,"hasMoreLines":false,"lines":[]}""")]
    [InlineData("""{"orderCode":"SO-1","orderDate":"2026-10-20","requestedDeliveryDate":null,"status":"Open","currencyCode":"TRY","subtotal":0,"discountTotal":0,"taxTotal":0,"grandTotal":0,"lineCount":1,"returnedLines":1,"hasMoreLines":false,"lines":[{"lineNumber":1,"stockCode":"ITEM-1","stockName":"Item","unitCode":"EA","quantity":10,"deliveredQuantity":2,"outstandingQuantity":9,"unitPrice":1,"discountPercent":0,"vatPercent":20,"lineSubtotal":10,"taxAmount":2,"lineTotal":12}]}""")]
    public void Order_summary_rejects_unbounded_or_inconsistent_result(string json)
    {
        using var response = JsonDocument.Parse(json);
        Assert.Throws<JsonException>(() => ERPAssistantSalesOrderTools.SummarizeOrder(response.RootElement));
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
            return Task.FromResult(expectedTenantId == tenantId && PermissionCode == "erp.sales-orders.read");
        }
    }
}
