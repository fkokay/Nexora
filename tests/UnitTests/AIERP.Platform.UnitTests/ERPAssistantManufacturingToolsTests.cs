using System.Text.Json;
using AIERP.AIService.AI;
using AIERP.Platform.Application;

namespace AIERP.Platform.UnitTests;

public sealed class ERPAssistantManufacturingToolsTests
{
    [Theory]
    [InlineData(null, false)]
    [InlineData(" x ", false)]
    [InlineData(" MO-2026-001 ", true)]
    [InlineData("01234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890", false)]
    public void Search_term_is_trimmed_and_bounded(string? input, bool expected)
    {
        Assert.Equal(expected, ERPAssistantManufacturingTools.TryValidateSearchTerm(input, out var term));
        Assert.Equal(input?.Trim() ?? string.Empty, term);
    }

    [Fact]
    public async Task Work_order_read_requires_the_manufacturing_permission()
    {
        var tenantId = Guid.NewGuid();
        var authorizer = new RecordingPermissionAuthorizer(allowed: false, tenantId);

        var allowed = await ERPAssistantManufacturingTools.IsReadAllowedAsync(tenantId, Guid.NewGuid(), "ProductionUser",
            authorizer, CancellationToken.None);

        Assert.False(allowed);
        Assert.Equal(tenantId, authorizer.TenantId);
        Assert.Equal("erp.manufacturing.read", authorizer.PermissionCode);
    }

    [Fact]
    public void Summary_projects_only_bounded_operational_fields_and_discloses_more_matches()
    {
        using var response = JsonDocument.Parse("""
            {"totalCount":12,"returned":10,"hasMore":true,"items":[
              {"id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","code":"MO-2026-001","plannedDate":"2026-10-20","status":"Released","plannedQuantity":4.5,"completedAt":null,"warehouseId":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}
            ]}
            """);

        var serialized = ERPAssistantManufacturingTools.SummarizeOrders(response.RootElement);
        using var result = JsonDocument.Parse(serialized);

        Assert.Equal(12, result.RootElement.GetProperty("totalCount").GetInt32());
        Assert.True(result.RootElement.GetProperty("hasMore").GetBoolean());
        var item = Assert.Single(result.RootElement.GetProperty("items").EnumerateArray());
        Assert.Equal("MO-2026-001", item.GetProperty("code").GetString());
        Assert.Equal(4.5m, item.GetProperty("plannedQuantity").GetDecimal());
        Assert.False(item.TryGetProperty("id", out _));
        Assert.False(item.TryGetProperty("warehouseId", out _));
    }

    [Fact]
    public void Summary_rejects_oversized_or_inconsistent_responses()
    {
        using var response = JsonDocument.Parse("""
            {"totalCount":0,"items":[{"code":"MO-1","plannedDate":"2026-10-20","status":"Planned","plannedQuantity":1,"completedAt":null}]}
            """);

        Assert.Throws<JsonException>(() => ERPAssistantManufacturingTools.SummarizeOrders(response.RootElement));
    }

    private sealed class RecordingPermissionAuthorizer(bool allowed, Guid? expectedTenantId) : IPlatformPermissionAuthorizer
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
