using System.Text.Json;
using AIERP.AIService.AI;
using AIERP.Platform.Application;

namespace AIERP.Platform.UnitTests;

public sealed class ERPAssistantSalesQuoteToolsTests
{
    [Theory]
    [InlineData(null, false)]
    [InlineData(" x ", false)]
    [InlineData(" SQ-2026-001 ", true)]
    public void Search_term_is_trimmed_and_bounded(string? input, bool expected)
    {
        Assert.Equal(expected, ERPAssistantSalesQuoteTools.TryValidateSearchTerm(input, out var term));
        Assert.Equal(input?.Trim() ?? string.Empty, term);
    }

    [Fact]
    public async Task Quote_read_requires_sales_quote_permission()
    {
        var tenantId = Guid.NewGuid();
        var authorizer = new RecordingPermissionAuthorizer(true, tenantId);
        Assert.True(await ERPAssistantSalesQuoteTools.IsReadAllowedAsync(tenantId, Guid.NewGuid(), "SalesUser", authorizer, CancellationToken.None));
        Assert.Equal("erp.sales-quotes.read", authorizer.PermissionCode);
    }

    [Fact]
    public async Task Quote_read_denies_when_permission_authorizer_rejects()
    {
        var tenantId = Guid.NewGuid();
        Assert.False(await ERPAssistantSalesQuoteTools.IsReadAllowedAsync(tenantId, Guid.NewGuid(), "SalesUser",
            new RecordingPermissionAuthorizer(false, tenantId), CancellationToken.None));
    }

    [Fact]
    public void Summary_exposes_only_bounded_quote_facts()
    {
        using var response = JsonDocument.Parse("""
            {"totalCount":12,"items":[{"id":"11111111-1111-1111-1111-111111111111","code":"SQ-2026-001","quoteDate":"2026-10-25","validUntil":"2026-11-25","currencyCode":"TRY","status":"Draft","grandTotal":12500.00,"lineCount":2,"hasSalesOrder":false,"customerId":"22222222-2222-2222-2222-222222222222","customerName":"Private customer"}]}
            """);
        using var result = JsonDocument.Parse(ERPAssistantSalesQuoteTools.SummarizeQuotes(response.RootElement));
        var item = Assert.Single(result.RootElement.GetProperty("items").EnumerateArray());
        Assert.Equal("SQ-2026-001", item.GetProperty("code").GetString());
        Assert.Equal(12500m, item.GetProperty("total").GetDecimal());
        Assert.True(result.RootElement.GetProperty("hasMore").GetBoolean());
        Assert.False(item.TryGetProperty("id", out _));
        Assert.False(item.TryGetProperty("customerName", out _));
    }

    private sealed class RecordingPermissionAuthorizer(bool allowed, Guid expectedTenantId) : IPlatformPermissionAuthorizer
    {
        public string? PermissionCode { get; private set; }
        public Task<bool> IsAllowedAsync(Guid tenantId, Guid userId, string role, ResolvedPlatformPermission permission, CancellationToken cancellationToken = default)
        {
            PermissionCode = permission.Permission.Code;
            return Task.FromResult(allowed && expectedTenantId == tenantId);
        }
    }
}
