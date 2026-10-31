using System.Text.Json;
using AIERP.AIService.AI;
using AIERP.Platform.Application;

namespace AIERP.Platform.UnitTests;

public sealed class ERPAssistantPurchaseRequestToolsTests
{
    [Theory]
    [InlineData(null, false)]
    [InlineData(" x ", false)]
    [InlineData(" PR-2026-001 ", true)]
    public void Search_term_is_trimmed_and_bounded(string? input, bool expected)
    {
        Assert.Equal(expected, ERPAssistantPurchaseRequestTools.TryValidateSearchTerm(input, out var term));
        Assert.Equal(input?.Trim() ?? string.Empty, term);
    }

    [Fact]
    public async Task Request_read_requires_purchase_request_permission()
    {
        var tenantId = Guid.NewGuid();
        var authorizer = new RecordingPermissionAuthorizer(true, tenantId);
        Assert.True(await ERPAssistantPurchaseRequestTools.IsReadAllowedAsync(tenantId, Guid.NewGuid(), "PurchasingUser", authorizer, CancellationToken.None));
        Assert.Equal("erp.purchase-requests.read", authorizer.PermissionCode);
    }

    [Fact]
    public async Task Request_read_denies_when_permission_authorizer_rejects()
    {
        var tenantId = Guid.NewGuid();
        Assert.False(await ERPAssistantPurchaseRequestTools.IsReadAllowedAsync(tenantId, Guid.NewGuid(), "PurchasingUser",
            new RecordingPermissionAuthorizer(false, tenantId), CancellationToken.None));
    }

    [Fact]
    public void Summary_exposes_only_bounded_request_facts()
    {
        using var response = JsonDocument.Parse("""
            {"totalCount":1,"items":[{"id":"11111111-1111-1111-1111-111111111111","code":"PR-2026-001","requestDate":"2026-10-25","neededByDate":"2026-11-05","status":"Submitted","lineCount":2,"purchaseOrderCode":null,"description":"Private request text","requestedByName":"Private employee","reviewNote":"Private review note"}]}
            """);
        using var result = JsonDocument.Parse(ERPAssistantPurchaseRequestTools.SummarizeRequests(response.RootElement));
        var item = Assert.Single(result.RootElement.GetProperty("items").EnumerateArray());
        Assert.Equal("PR-2026-001", item.GetProperty("code").GetString());
        Assert.Equal(2, item.GetProperty("lineCount").GetInt32());
        Assert.False(item.TryGetProperty("id", out _));
        Assert.False(item.TryGetProperty("requestedByName", out _));
        Assert.False(item.TryGetProperty("reviewNote", out _));
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
