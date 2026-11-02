using System.Text.Json;
using AIERP.AIService.AI;
using AIERP.Platform.Application;

namespace AIERP.Platform.UnitTests;

public sealed class ERPAssistantWorkCenterToolsTests
{
    [Theory]
    [InlineData(null, false)]
    [InlineData(" A ", false)]
    [InlineData(" CNC ", true)]
    [InlineData("01234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890", false)]
    public void Search_term_is_trimmed_and_bounded(string? input, bool expected)
    {
        Assert.Equal(expected, ERPAssistantWorkCenterTools.TryValidateSearchTerm(input, out var term));
        Assert.Equal(input?.Trim() ?? string.Empty, term);
    }

    [Fact]
    public async Task Work_center_read_requires_manufacturing_permission()
    {
        var tenantId = Guid.NewGuid();
        var authorizer = new RecordingPermissionAuthorizer(tenantId, allowed: true);

        var allowed = await ERPAssistantWorkCenterTools.IsReadAllowedAsync(tenantId, Guid.NewGuid(), "ProductionUser",
            authorizer, CancellationToken.None);

        Assert.True(allowed);
        Assert.Equal(tenantId, authorizer.TenantId);
        Assert.Equal("erp.manufacturing.read", authorizer.PermissionCode);

        var denied = await ERPAssistantWorkCenterTools.IsReadAllowedAsync(tenantId, Guid.NewGuid(), "ProductionUser",
            new RecordingPermissionAuthorizer(tenantId, allowed: false), CancellationToken.None);
        Assert.False(denied);
    }

    [Fact]
    public void Summary_projects_bounded_capacity_fields_and_omits_costs_and_identifiers()
    {
        using var response = JsonDocument.Parse("""
            {"totalCount":11,"items":[
              {"id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","code":"WC-CNC","name":"CNC Taşlama","capacityMinutesPerDay":420,"laborCostPerHourBase":1250.50,"overheadCostPerHourBase":300.25,"isActive":true,"workingDaysMask":31,"shiftStartMinuteOfDay":480,"shiftEndMinuteOfDay":900}
            ]}
            """);

        using var result = JsonDocument.Parse(ERPAssistantWorkCenterTools.SummarizeSearchResult(response.RootElement));
        var root = result.RootElement;
        Assert.Equal(11, root.GetProperty("totalCount").GetInt32());
        Assert.True(root.GetProperty("hasMore").GetBoolean());
        var item = Assert.Single(root.GetProperty("items").EnumerateArray());
        Assert.Equal("WC-CNC", item.GetProperty("code").GetString());
        Assert.Equal(420, item.GetProperty("capacityMinutesPerDay").GetInt32());
        Assert.False(item.TryGetProperty("id", out _));
        Assert.False(item.TryGetProperty("laborCostPerHourBase", out _));
        Assert.False(item.TryGetProperty("overheadCostPerHourBase", out _));
    }

    [Fact]
    public void Summary_rejects_oversized_and_invalid_shift_results()
    {
        using var inconsistentCount = JsonDocument.Parse("""
            {"totalCount":0,"items":[{"code":"WC-1","name":"Hat 1","capacityMinutesPerDay":480,"isActive":true,"workingDaysMask":31,"shiftStartMinuteOfDay":480,"shiftEndMinuteOfDay":900}]}
            """);
        using var invalidShift = JsonDocument.Parse("""
            {"totalCount":1,"items":[{"code":"WC-1","name":"Hat 1","capacityMinutesPerDay":480,"isActive":true,"workingDaysMask":31,"shiftStartMinuteOfDay":900,"shiftEndMinuteOfDay":480}]}
            """);

        Assert.Throws<JsonException>(() => ERPAssistantWorkCenterTools.SummarizeSearchResult(inconsistentCount.RootElement));
        Assert.Throws<JsonException>(() => ERPAssistantWorkCenterTools.SummarizeSearchResult(invalidShift.RootElement));
    }

    private sealed class RecordingPermissionAuthorizer(Guid expectedTenantId, bool allowed) : IPlatformPermissionAuthorizer
    {
        public Guid? TenantId { get; private set; }
        public string? PermissionCode { get; private set; }

        public Task<bool> IsAllowedAsync(Guid tenantId, Guid userId, string role, ResolvedPlatformPermission permission,
            CancellationToken cancellationToken = default)
        {
            TenantId = tenantId;
            PermissionCode = permission.Permission.Code;
            return Task.FromResult(allowed && expectedTenantId == tenantId && permission.Permission.Code == "erp.manufacturing.read");
        }
    }
}
