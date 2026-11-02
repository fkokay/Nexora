using System.Text.Json;
using AIERP.AIService.AI;
using AIERP.Platform.Application;

namespace AIERP.Platform.UnitTests;

public sealed class ERPAssistantForeignTradeToolsTests
{
    [Theory]
    [InlineData(null, false)]
    [InlineData(" x ", false)]
    [InlineData(" CIF ", true)]
    [InlineData("01234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890", false)]
    public void Search_term_is_trimmed_and_bounded(string? input, bool expected)
    {
        Assert.Equal(expected, ERPAssistantForeignTradeTools.TryValidateSearchTerm(input, out var term));
        Assert.Equal(input?.Trim() ?? string.Empty, term);
    }

    [Fact]
    public async Task Foreign_trade_read_requires_the_foreign_trade_permission()
    {
        var tenantId = Guid.NewGuid();
        var authorizer = new RecordingPermissionAuthorizer(false, tenantId);

        var allowed = await ERPAssistantForeignTradeTools.IsReadAllowedAsync(tenantId, Guid.NewGuid(), "TenantUser",
            authorizer, CancellationToken.None);

        Assert.False(allowed);
        Assert.Equal(tenantId, authorizer.TenantId);
        Assert.Equal("erp.foreign-trade.read", authorizer.PermissionCode);
    }

    [Fact]
    public void Summary_returns_only_bounded_status_and_shipping_fields()
    {
        using var response = JsonDocument.Parse("""
            {"total":12,"items":[{"id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","direction":"Export","status":"Shipped","referenceCode":"EXP-2026-01","originCountryCode":"TR","destinationCountryCode":"DE","incotermsCode":"FCA","transportMode":"Road","plannedShipDate":"2026-10-01","actualShipDate":"2026-10-02","plannedArrivalDate":"2026-10-05","actualArrivalDate":null,"purchaseOrderId":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","declaredValue":100000,"customsReference":"customs-secret","carrierReference":"carrier-secret","notes":"private"}]}
            """);

        using var result = JsonDocument.Parse(ERPAssistantForeignTradeTools.SummarizeCases(response.RootElement));
        var root = result.RootElement;
        Assert.Equal(12, root.GetProperty("totalCount").GetInt32());
        Assert.Equal(1, root.GetProperty("returned").GetInt32());
        Assert.True(root.GetProperty("hasMore").GetBoolean());
        var item = Assert.Single(root.GetProperty("items").EnumerateArray());
        Assert.Equal("EXP-2026-01", item.GetProperty("referenceCode").GetString());
        Assert.Equal("2026-10-02", item.GetProperty("actualShipDate").GetString());
        Assert.False(item.TryGetProperty("id", out _));
        Assert.False(item.TryGetProperty("purchaseOrderId", out _));
        Assert.False(item.TryGetProperty("declaredValue", out _));
        Assert.False(item.TryGetProperty("customsReference", out _));
        Assert.False(item.TryGetProperty("carrierReference", out _));
        Assert.False(item.TryGetProperty("notes", out _));
    }

    [Theory]
    [InlineData("""{"total":0,"items":[{}]}""")]
    [InlineData("""{"total":-1,"items":[]}""")]
    public void Summary_rejects_invalid_result_shapes(string json)
    {
        using var response = JsonDocument.Parse(json);
        Assert.Throws<JsonException>(() => ERPAssistantForeignTradeTools.SummarizeCases(response.RootElement));
    }

    [Fact]
    public void Summary_rejects_more_than_ten_results()
    {
        var item = new { direction = "Export", status = "Shipped", referenceCode = "EXP-1", originCountryCode = "TR",
            destinationCountryCode = "DE", incotermsCode = (string?)null, transportMode = "Road", plannedShipDate = (string?)null,
            actualShipDate = (string?)null, plannedArrivalDate = (string?)null, actualArrivalDate = (string?)null };
        using var response = JsonDocument.Parse(JsonSerializer.Serialize(new { total = 11, items = Enumerable.Repeat(item, 11) }));
        Assert.Throws<JsonException>(() => ERPAssistantForeignTradeTools.SummarizeCases(response.RootElement));
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
