using System.Text.Json;
using AIERP.AIService.AI;
using AIERP.Platform.Application;

namespace AIERP.Platform.UnitTests;

public sealed class ERPAssistantSalesDeliveryToolsTests
{
    [Theory]
    [InlineData(null, false)]
    [InlineData(" x ", false)]
    [InlineData(" DN-2026-001 ", true)]
    [InlineData("01234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890", false)]
    public void Search_term_is_trimmed_and_bounded(string? input, bool expected)
    {
        Assert.Equal(expected, ERPAssistantSalesDeliveryTools.TryValidateSearchTerm(input, out var term));
        Assert.Equal(input?.Trim() ?? string.Empty, term);
    }

    [Fact]
    public async Task Delivery_read_requires_the_specific_sales_delivery_permission()
    {
        var tenantId = Guid.NewGuid();
        var authorizer = new RecordingPermissionAuthorizer(allowed: true, tenantId);

        var allowed = await ERPAssistantSalesDeliveryTools.IsReadAllowedAsync(tenantId, Guid.NewGuid(), "SalesUser",
            authorizer, CancellationToken.None);

        Assert.True(allowed);
        Assert.Equal(tenantId, authorizer.TenantId);
        Assert.Equal("erp.sales-deliveries.read", authorizer.PermissionCode);
    }

    [Fact]
    public void Summary_projects_only_bounded_fulfillment_fields()
    {
        using var response = JsonDocument.Parse("""
            {"totalCount":12,"returned":10,"hasMore":true,"items":[
              {"id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","code":"DN-2026-001","orderCode":"SO-2026-001","deliveryDate":"2026-10-25","status":"Posted","lineCount":3,"invoiced":false,"customerName":"Sensitive Customer"}
            ]}
            """);

        var serialized = ERPAssistantSalesDeliveryTools.SummarizeDeliveries(response.RootElement);
        using var result = JsonDocument.Parse(serialized);

        Assert.Equal(12, result.RootElement.GetProperty("totalCount").GetInt32());
        Assert.True(result.RootElement.GetProperty("hasMore").GetBoolean());
        var item = Assert.Single(result.RootElement.GetProperty("items").EnumerateArray());
        Assert.Equal("DN-2026-001", item.GetProperty("code").GetString());
        Assert.Equal("SO-2026-001", item.GetProperty("orderCode").GetString());
        Assert.Equal(3, item.GetProperty("lineCount").GetInt32());
        Assert.False(item.GetProperty("invoiced").GetBoolean());
        Assert.False(item.TryGetProperty("id", out _));
        Assert.False(item.TryGetProperty("customerName", out _));
    }

    [Fact]
    public void Summary_rejects_oversized_or_inconsistent_responses()
    {
        using var response = JsonDocument.Parse("""
            {"totalCount":0,"items":[{"code":"DN-1","orderCode":"SO-1","deliveryDate":"2026-10-25","status":"Posted","lineCount":1,"invoiced":false}]}
            """);

        Assert.Throws<JsonException>(() => ERPAssistantSalesDeliveryTools.SummarizeDeliveries(response.RootElement));
    }

    private sealed class RecordingPermissionAuthorizer : IPlatformPermissionAuthorizer
    {
        private readonly bool allowed;
        private readonly Guid expectedTenantId;

        public RecordingPermissionAuthorizer(bool allowed, Guid tenantId)
        {
            this.allowed = allowed;
            expectedTenantId = tenantId;
        }

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
