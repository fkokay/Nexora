using System.Text.Json;
using AIERP.AIService.AI;
using AIERP.Platform.Application;

namespace AIERP.Platform.UnitTests;

public sealed class ERPAssistantCrmOpportunityToolsTests
{
    [Theory]
    [InlineData(null, false)]
    [InlineData("x", false)]
    [InlineData(" OP-2026 ", true)]
    [InlineData("01234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890", false)]
    public void Search_term_is_trimmed_and_bounded(string? input, bool expected)
    {
        Assert.Equal(expected, ERPAssistantCrmOpportunityTools.TryValidateSearchTerm(input, out var term));
        Assert.Equal(input?.Trim() ?? string.Empty, term);
    }

    [Fact]
    public async Task Read_requires_the_CRM_opportunity_permission()
    {
        var tenantId = Guid.NewGuid();
        var authorizer = new RecordingPermissionAuthorizer(tenantId);
        Assert.False(await ERPAssistantCrmOpportunityTools.IsReadAllowedAsync(tenantId, Guid.NewGuid(), "TenantUser", authorizer, CancellationToken.None));
        Assert.Equal("erp.crm-opportunities.read", authorizer.PermissionCode);
    }

    [Fact]
    public void Summary_is_bounded_and_omits_customer_identity_notes_activities_and_ids()
    {
        using var response = JsonDocument.Parse("""
            {"total":12,"items":[{"id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","code":"OP-01","name":"ERP rollout","stage":"Proposal","estimatedValue":125000.50,"currencyCode":"TRY","probabilityPercent":45,"expectedCloseDate":"2026-12-31","customerName":"Private customer","notes":"Private notes","nextActivityAt":"2026-10-27T12:00:00Z"}]}
            """);
        using var result = JsonDocument.Parse(ERPAssistantCrmOpportunityTools.SummarizeOpportunities(response.RootElement));
        var root = result.RootElement;
        Assert.Equal(12, root.GetProperty("totalCount").GetInt32());
        Assert.True(root.GetProperty("hasMore").GetBoolean());
        var item = Assert.Single(root.GetProperty("items").EnumerateArray());
        Assert.Equal("Proposal", item.GetProperty("stage").GetString());
        Assert.Equal("TRY", item.GetProperty("currencyCode").GetString());
        Assert.Equal(125000.50m, item.GetProperty("estimatedValue").GetDecimal());
        Assert.False(item.TryGetProperty("id", out _));
        Assert.False(item.TryGetProperty("customerName", out _));
        Assert.False(item.TryGetProperty("notes", out _));
        Assert.False(item.TryGetProperty("nextActivityAt", out _));
    }

    [Theory]
    [InlineData("""{"total":-1,"items":[]}""")]
    [InlineData("""{"total":0,"items":[{}]}""")]
    public void Summary_rejects_invalid_result_shape(string json)
    {
        using var response = JsonDocument.Parse(json);
        Assert.Throws<JsonException>(() => ERPAssistantCrmOpportunityTools.SummarizeOpportunities(response.RootElement));
    }

    private sealed class RecordingPermissionAuthorizer(Guid tenantId) : IPlatformPermissionAuthorizer
    {
        public string? PermissionCode { get; private set; }
        public Task<bool> IsAllowedAsync(Guid requestedTenantId, Guid userId, string role, ResolvedPlatformPermission permission, CancellationToken cancellationToken = default)
        {
            PermissionCode = permission.Permission.Code;
            return Task.FromResult(requestedTenantId == tenantId && role == "TenantAdmin");
        }
    }
}
