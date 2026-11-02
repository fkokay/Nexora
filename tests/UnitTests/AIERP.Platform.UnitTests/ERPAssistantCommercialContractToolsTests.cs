using System.Text.Json;
using AIERP.AIService.AI;
using AIERP.Platform.Application;

namespace AIERP.Platform.UnitTests;

public sealed class ERPAssistantCommercialContractToolsTests
{
    [Theory]
    [InlineData(null, false)]
    [InlineData(" x ", false)]
    [InlineData(" ab ", true)]
    [InlineData("0123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789", true)]
    [InlineData("01234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890", false)]
    public void Search_term_is_trimmed_and_bounded(string? input, bool expected)
    {
        Assert.Equal(expected, ERPAssistantCommercialContractTools.TryValidateSearchTerm(input, out var term));
        Assert.Equal(input?.Trim() ?? string.Empty, term);
    }

    [Theory]
    [InlineData(true, true)]
    [InlineData(false, false)]
    public async Task Contract_read_uses_the_contract_read_permission(bool configuredAllowed, bool expected)
    {
        var tenantId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        var authorizer = new RecordingPermissionAuthorizer(configuredAllowed, tenantId, userId);

        var allowed = await ERPAssistantCommercialContractTools.IsReadAllowedAsync(tenantId, userId, "TenantUser",
            authorizer, CancellationToken.None);

        Assert.Equal(expected, allowed);
        Assert.Equal(tenantId, authorizer.TenantId);
        Assert.Equal(userId, authorizer.UserId);
        Assert.Equal("TenantUser", authorizer.Role);
        Assert.Equal("erp.commercial-contracts.read", authorizer.PermissionCode);
    }

    [Fact]
    public void Summary_projects_only_bounded_contract_fields()
    {
        using var response = JsonDocument.Parse("""
            {"total":12,"items":[{"id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","code":"CTR-01","type":"Sales","counterpartyName":"Example buyer","effectiveFrom":"2026-01-01","effectiveThrough":"2026-12-31","currencyCode":"usd","status":"Active","salesQuoteId":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","salesOrderId":"cccccccc-cccc-cccc-cccc-cccccccccccc","transitionNote":"private transition","lineTerms":[{"price":999999}],"notes":"private"}]}
            """);

        var resultText = ERPAssistantCommercialContractTools.SummarizeContracts(response.RootElement);
        using var result = JsonDocument.Parse(resultText);
        var root = result.RootElement;
        Assert.Equal(12, root.GetProperty("totalCount").GetInt32());
        Assert.Equal(1, root.GetProperty("returned").GetInt32());
        Assert.True(root.GetProperty("hasMore").GetBoolean());

        var item = Assert.Single(root.GetProperty("items").EnumerateArray());
        Assert.Equal("CTR-01", item.GetProperty("code").GetString());
        Assert.Equal("Sales", item.GetProperty("type").GetString());
        Assert.Equal("Example buyer", item.GetProperty("counterpartyName").GetString());
        Assert.Equal("2026-01-01", item.GetProperty("effectiveFrom").GetString());
        Assert.Equal("2026-12-31", item.GetProperty("effectiveThrough").GetString());
        Assert.Equal("USD", item.GetProperty("currencyCode").GetString());
        Assert.Equal("Active", item.GetProperty("status").GetString());

        Assert.DoesNotContain("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", resultText, StringComparison.Ordinal);
        Assert.DoesNotContain("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", resultText, StringComparison.Ordinal);
        Assert.DoesNotContain("cccccccc-cccc-cccc-cccc-cccccccccccc", resultText, StringComparison.Ordinal);
        Assert.DoesNotContain("private transition", resultText, StringComparison.Ordinal);
        Assert.DoesNotContain("lineTerms", resultText, StringComparison.Ordinal);
        Assert.DoesNotContain("private", resultText, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("Draft")]
    [InlineData("Active")]
    [InlineData("Suspended")]
    [InlineData("Completed")]
    [InlineData("Terminated")]
    [InlineData("Cancelled")]
    public void Summary_accepts_each_supported_contract_status(string status)
    {
        var item = new
        {
            code = "CTR-01", type = "Sales", counterpartyName = "Buyer", effectiveFrom = "2026-01-01",
            effectiveThrough = "2026-12-31", currencyCode = "USD", status
        };
        using var response = JsonDocument.Parse(JsonSerializer.Serialize(new { total = 1, items = new[] { item } }));

        using var result = JsonDocument.Parse(ERPAssistantCommercialContractTools.SummarizeContracts(response.RootElement));
        Assert.Equal(status, Assert.Single(result.RootElement.GetProperty("items").EnumerateArray()).GetProperty("status").GetString());
    }

    [Theory]
    [InlineData("""{"total":0,"items":[{}]}""")]
    [InlineData("""{"total":-1,"items":[]}""")]
    [InlineData("""{"total":0,"items":[{"code":"C","type":"Sales","counterpartyName":"Buyer","effectiveFrom":"2026-01-01","effectiveThrough":"2026-12-31","currencyCode":"USD","status":"Active"}]}""")]
    [InlineData("""{"total":1,"items":[{"code":"C","type":"Unknown","counterpartyName":"Buyer","effectiveFrom":"2026-01-01","effectiveThrough":"2026-12-31","currencyCode":"USD","status":"Active"}]}""")]
    [InlineData("""{"total":1,"items":[{"code":"C","type":"Sales","counterpartyName":"Buyer","effectiveFrom":"2026-1-1","effectiveThrough":"2026-12-31","currencyCode":"USD","status":"Active"}]}""")]
    [InlineData("""{"total":1,"items":[{"code":"C","type":"Sales","counterpartyName":"Buyer","effectiveFrom":"2026-01-01","effectiveThrough":"2026-12-31","currencyCode":"US","status":"Active"}]}""")]
    [InlineData("""{"total":1,"items":[{"code":"C","type":"Sales","counterpartyName":"Buyer","effectiveFrom":"2026-01-01","effectiveThrough":"2026-12-31","currencyCode":"USD","status":"Unknown"}]}""")]
    public void Summary_rejects_invalid_or_inconsistent_results(string json)
    {
        using var response = JsonDocument.Parse(json);
        Assert.Throws<JsonException>(() => ERPAssistantCommercialContractTools.SummarizeContracts(response.RootElement));
    }

    [Fact]
    public void Summary_rejects_more_than_ten_results()
    {
        var item = new
        {
            code = "CTR-01", type = "Purchase", counterpartyName = "Supplier", effectiveFrom = "2026-01-01",
            effectiveThrough = "2026-12-31", currencyCode = "TRY", status = "Draft"
        };
        using var response = JsonDocument.Parse(JsonSerializer.Serialize(new { total = 11, items = Enumerable.Repeat(item, 11) }));
        Assert.Throws<JsonException>(() => ERPAssistantCommercialContractTools.SummarizeContracts(response.RootElement));
    }

    private sealed class RecordingPermissionAuthorizer(bool allowed, Guid expectedTenantId, Guid expectedUserId) : IPlatformPermissionAuthorizer
    {
        public Guid? TenantId { get; private set; }
        public Guid? UserId { get; private set; }
        public string? Role { get; private set; }
        public string? PermissionCode { get; private set; }

        public Task<bool> IsAllowedAsync(Guid tenantId, Guid userId, string role, ResolvedPlatformPermission permission,
            CancellationToken cancellationToken = default)
        {
            TenantId = tenantId;
            UserId = userId;
            Role = role;
            PermissionCode = permission.Permission.Code;
            return Task.FromResult(allowed && expectedTenantId == tenantId && expectedUserId == userId);
        }
    }
}
