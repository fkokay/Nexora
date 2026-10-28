using System.Text.Json;
using AIERP.AIService.AI;
using AIERP.Platform.Application;

namespace AIERP.Platform.UnitTests;

public sealed class ERPAssistantOperationalProjectToolsTests
{
    [Theory]
    [InlineData(null, false)]
    [InlineData(" x ", false)]
    [InlineData(" PRJ-2026 ", true)]
    [InlineData("01234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890", false)]
    public void Search_term_is_trimmed_and_bounded(string? input, bool expected)
    {
        Assert.Equal(expected, ERPAssistantOperationalProjectTools.TryValidateSearchTerm(input, out var term));
        Assert.Equal(input?.Trim() ?? string.Empty, term);
    }

    [Fact]
    public async Task Project_read_requires_the_operational_projects_permission()
    {
        var tenantId = Guid.NewGuid();
        var authorizer = new RecordingPermissionAuthorizer(allowed: false, tenantId);

        var allowed = await ERPAssistantOperationalProjectTools.IsReadAllowedAsync(tenantId, Guid.NewGuid(), "TenantUser",
            authorizer, CancellationToken.None);

        Assert.False(allowed);
        Assert.Equal(tenantId, authorizer.TenantId);
        Assert.Equal("erp.operational-projects.read", authorizer.PermissionCode);
    }

    [Fact]
    public void Summary_projects_only_bounded_project_and_progress_fields()
    {
        using var response = JsonDocument.Parse("""
            {"total":12,"items":[{"id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","code":"PRJ-01","name":"Warehouse upgrade","status":"Active","startDate":"2026-01-01","endDate":null,"taskCount":5,"completedTaskCount":2,"overdueTaskCount":1,"budgetAmount":900000,"customerAccountId":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","notes":"private"}]}
            """);

        using var result = JsonDocument.Parse(ERPAssistantOperationalProjectTools.SummarizeProjects(response.RootElement));
        var root = result.RootElement;
        Assert.Equal(12, root.GetProperty("totalCount").GetInt32());
        Assert.Equal(1, root.GetProperty("returned").GetInt32());
        Assert.True(root.GetProperty("hasMore").GetBoolean());
        var item = Assert.Single(root.GetProperty("items").EnumerateArray());
        Assert.Equal("PRJ-01", item.GetProperty("code").GetString());
        Assert.Equal(2, item.GetProperty("completedTaskCount").GetInt32());
        Assert.False(item.TryGetProperty("id", out _));
        Assert.False(item.TryGetProperty("budgetAmount", out _));
        Assert.False(item.TryGetProperty("customerAccountId", out _));
        Assert.False(item.TryGetProperty("notes", out _));
    }

    [Theory]
    [InlineData("""{"total":0,"items":[{}]}""")]
    [InlineData("""{"total":-1,"items":[]}""")]
    public void Summary_rejects_invalid_or_unbounded_results(string json)
    {
        using var response = JsonDocument.Parse(json);
        Assert.Throws<JsonException>(() => ERPAssistantOperationalProjectTools.SummarizeProjects(response.RootElement));
    }

    [Fact]
    public void Summary_rejects_more_than_ten_results()
    {
        var item = new { code = "P", name = "Project", status = "Active", startDate = (string?)null, endDate = (string?)null,
            taskCount = 0, completedTaskCount = 0, overdueTaskCount = 0 };
        using var response = JsonDocument.Parse(JsonSerializer.Serialize(new { total = 11, items = Enumerable.Repeat(item, 11) }));
        Assert.Throws<JsonException>(() => ERPAssistantOperationalProjectTools.SummarizeProjects(response.RootElement));
    }

    [Fact]
    public void Progress_request_requires_exact_code_and_bounded_past_or_current_period()
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var from = today.AddDays(-365).ToString("yyyy-MM-dd");
        var to = today.ToString("yyyy-MM-dd");

        Assert.True(ERPAssistantOperationalProjectTools.TryValidateProgressRequest(" PRJ-01 ", from, to, out var code, out var parsedFrom, out var parsedTo));
        Assert.Equal("PRJ-01", code);
        Assert.Equal(today.AddDays(-365), parsedFrom);
        Assert.Equal(today, parsedTo);
        Assert.False(ERPAssistantOperationalProjectTools.TryValidateProgressRequest("PRJ 01", from, to, out _, out _, out _));
        Assert.False(ERPAssistantOperationalProjectTools.TryValidateProgressRequest("PRJ-01", today.AddDays(-366).ToString("yyyy-MM-dd"), to, out _, out _, out _));
        Assert.False(ERPAssistantOperationalProjectTools.TryValidateProgressRequest("PRJ-01", to, from, out _, out _, out _));
        Assert.False(ERPAssistantOperationalProjectTools.TryValidateProgressRequest("PRJ-01", from, today.AddDays(1).ToString("yyyy-MM-dd"), out _, out _, out _));
    }

    [Fact]
    public void Progress_summary_projects_only_bounded_non_sensitive_fields()
    {
        using var response = JsonDocument.Parse("""
            {"projectId":"internal-project","projectCode":"PRJ-01","projectName":"Migration","status":"Active","from":"2026-10-01","to":"2026-10-25","totalTaskCount":1,"completedTaskCount":0,"overdueOpenTaskCount":1,"periodActualHours":3.5,"periodTimeEntryCount":1,"hasMoreTasks":false,"customerAccountId":"customer-id","notes":"private","tasks":[{"id":"internal-task","code":"TASK-1","name":"Database move","status":"InProgress","startDate":null,"endDate":"2026-10-20","plannedHours":8,"actualHours":3.5,"timeEntryCount":1,"userId":"employee-id","description":"private"}]}
            """);

        using var result = JsonDocument.Parse(ERPAssistantOperationalProjectTools.SummarizeProjectProgress(response.RootElement));
        var root = result.RootElement;
        Assert.Equal("PRJ-01", root.GetProperty("projectCode").GetString());
        Assert.Equal(3.5m, root.GetProperty("periodActualHours").GetDecimal());
        Assert.False(root.TryGetProperty("projectId", out _));
        Assert.False(root.TryGetProperty("customerAccountId", out _));
        Assert.False(root.TryGetProperty("notes", out _));
        var task = Assert.Single(root.GetProperty("tasks").EnumerateArray());
        Assert.Equal(3.5m, task.GetProperty("actualHours").GetDecimal());
        Assert.False(task.TryGetProperty("id", out _));
        Assert.False(task.TryGetProperty("userId", out _));
        Assert.False(task.TryGetProperty("description", out _));
    }

    [Theory]
    [InlineData("""{"projectCode":"P","projectName":"Project","status":"Active","from":"2026-10-01","to":"2026-10-25","totalTaskCount":0,"completedTaskCount":0,"overdueOpenTaskCount":0,"periodActualHours":0,"periodTimeEntryCount":0,"hasMoreTasks":false,"tasks":[{}]}""")]
    [InlineData("""{"projectCode":"P","projectName":"Project","status":"Active","from":"2026-10-01","to":"2026-10-25","totalTaskCount":1,"completedTaskCount":2,"overdueOpenTaskCount":0,"periodActualHours":0,"periodTimeEntryCount":0,"hasMoreTasks":false,"tasks":[]}""")]
    public void Progress_summary_rejects_invalid_or_unbounded_results(string json)
    {
        using var response = JsonDocument.Parse(json);
        Assert.Throws<JsonException>(() => ERPAssistantOperationalProjectTools.SummarizeProjectProgress(response.RootElement));
    }

    private sealed class RecordingPermissionAuthorizer(bool allowed, Guid expectedTenantId) : IPlatformPermissionAuthorizer
    {
        public Guid? TenantId { get; private set; }
        public string? PermissionCode { get; private set; }
        public Task<bool> IsAllowedAsync(Guid tenantId, Guid userId, string role, ResolvedPlatformPermission permission, CancellationToken cancellationToken = default)
        {
            TenantId = tenantId;
            PermissionCode = permission.Permission.Code;
            return Task.FromResult(allowed && expectedTenantId == tenantId);
        }
    }
}
