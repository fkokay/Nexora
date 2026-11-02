using System.Text.Json;
using AIERP.AIService.AI;
using AIERP.Platform.Application;

namespace AIERP.Platform.UnitTests;

public sealed class ERPAssistantInventoryMovementToolsTests
{
    [Theory]
    [InlineData("ST-01", "2025-10-25", "2026-10-25", true)]
    [InlineData("ST-01", "2025-10-24", "2026-10-25", false)]
    [InlineData("ST-01", "2026-10-26", "2026-10-25", false)]
    [InlineData("ST-01", "2026-02-30", "2026-03-01", false)]
    [InlineData("x", "2026-10-01", "2026-10-02", false)]
    [InlineData("ST-01", "2026-10-01", "2026-10-26", false)]
    public void Request_requires_exact_stock_code_and_past_or_current_bounded_period(string? code, string? from, string? to, bool expected)
    {
        Assert.Equal(expected, ERPAssistantInventoryMovementTools.TryValidateRequest(code, from, to,
            new DateOnly(2026, 10, 25), out _, out _, out _));
    }

    [Fact]
    public async Task Movement_search_requires_both_stock_source_and_report_run_permissions()
    {
        var tenantId = Guid.NewGuid();
        var userId = Guid.NewGuid();

        var bothGranted = new RecordingPermissionAuthorizer(tenantId, "erp.stock-items.read", "erp.reports.execute");
        Assert.True(await ERPAssistantInventoryMovementTools.IsReadAllowedAsync(tenantId, userId, "TenantUser", bothGranted, CancellationToken.None));
        Assert.Equal(new[] { "erp.stock-items.read", "erp.reports.execute" }, bothGranted.PermissionCodes);

        var sourceOnly = new RecordingPermissionAuthorizer(tenantId, "erp.stock-items.read");
        Assert.False(await ERPAssistantInventoryMovementTools.IsReadAllowedAsync(tenantId, userId, "TenantUser", sourceOnly, CancellationToken.None));
        Assert.Equal(new[] { "erp.stock-items.read", "erp.reports.execute" }, sourceOnly.PermissionCodes);

        var reportOnly = new RecordingPermissionAuthorizer(tenantId, "erp.reports.execute");
        Assert.False(await ERPAssistantInventoryMovementTools.IsReadAllowedAsync(tenantId, userId, "TenantUser", reportOnly, CancellationToken.None));
        Assert.Equal(new[] { "erp.stock-items.read" }, reportOnly.PermissionCodes);
    }

    [Fact]
    public void Projection_returns_only_bounded_movement_facts_and_omits_cost_and_tracking_details()
    {
        using var report = JsonDocument.Parse("""
            {"source":"inventoryTransactions","page":1,"pageSize":10,"totalCount":11,"rows":[
              {"entryDate":"2026-10-20","direction":"Receipt","stockCode":"ST-01","stockName":"Sensitive item name","quantity":12.5,"enteredUnitCode":"PCS","unitCostBase":99.9,"totalCostBase":1248.75,"warehouseName":"Private warehouse","description":"private memo","traceCount":2,"transactionId":"private-id"}]}
            """);
        var json = ERPAssistantInventoryMovementTools.SummarizeReport(report.RootElement, "ST-01", new DateOnly(2026, 10, 1), new DateOnly(2026, 10, 25));
        using var result = JsonDocument.Parse(json);
        Assert.Equal(11, result.RootElement.GetProperty("totalCount").GetInt32());
        Assert.True(result.RootElement.GetProperty("hasMore").GetBoolean());
        var movement = Assert.Single(result.RootElement.GetProperty("movements").EnumerateArray());
        Assert.Equal("Receipt", movement.GetProperty("direction").GetString());
        Assert.Equal(12.5m, movement.GetProperty("quantity").GetDecimal());
        Assert.Equal("PCS", movement.GetProperty("unitCode").GetString());
        Assert.DoesNotContain("unitCostBase", json, StringComparison.Ordinal);
        Assert.DoesNotContain("Sensitive item name", json, StringComparison.Ordinal);
        Assert.DoesNotContain("Private warehouse", json, StringComparison.Ordinal);
        Assert.DoesNotContain("private memo", json, StringComparison.Ordinal);
        Assert.DoesNotContain("private-id", json, StringComparison.Ordinal);
    }

    [Fact]
    public void Projection_rejects_wrong_stock_code_and_invalid_result_shapes()
    {
        using var wrongStock = JsonDocument.Parse("""
            {"source":"inventoryTransactions","page":1,"totalCount":1,"rows":[{"entryDate":"2026-10-20","direction":"Issue","stockCode":"OTHER","quantity":1,"enteredUnitCode":"PCS"}]}
            """);
        Assert.Throws<JsonException>(() => ERPAssistantInventoryMovementTools.SummarizeReport(wrongStock.RootElement, "ST-01", new DateOnly(2026, 10, 1), new DateOnly(2026, 10, 25)));

        using var tooMany = JsonDocument.Parse("""
            {"source":"inventoryTransactions","page":1,"totalCount":11,"rows":[{"entryDate":"2026-10-20","direction":"Issue","stockCode":"ST-01","quantity":1,"enteredUnitCode":"PCS"},{"entryDate":"2026-10-20","direction":"Issue","stockCode":"ST-01","quantity":1,"enteredUnitCode":"PCS"},{"entryDate":"2026-10-20","direction":"Issue","stockCode":"ST-01","quantity":1,"enteredUnitCode":"PCS"},{"entryDate":"2026-10-20","direction":"Issue","stockCode":"ST-01","quantity":1,"enteredUnitCode":"PCS"},{"entryDate":"2026-10-20","direction":"Issue","stockCode":"ST-01","quantity":1,"enteredUnitCode":"PCS"},{"entryDate":"2026-10-20","direction":"Issue","stockCode":"ST-01","quantity":1,"enteredUnitCode":"PCS"},{"entryDate":"2026-10-20","direction":"Issue","stockCode":"ST-01","quantity":1,"enteredUnitCode":"PCS"},{"entryDate":"2026-10-20","direction":"Issue","stockCode":"ST-01","quantity":1,"enteredUnitCode":"PCS"},{"entryDate":"2026-10-20","direction":"Issue","stockCode":"ST-01","quantity":1,"enteredUnitCode":"PCS"},{"entryDate":"2026-10-20","direction":"Issue","stockCode":"ST-01","quantity":1,"enteredUnitCode":"PCS"},{"entryDate":"2026-10-20","direction":"Issue","stockCode":"ST-01","quantity":1,"enteredUnitCode":"PCS"}]}
            """);
        Assert.Throws<JsonException>(() => ERPAssistantInventoryMovementTools.SummarizeReport(tooMany.RootElement, "ST-01", new DateOnly(2026, 10, 1), new DateOnly(2026, 10, 25)));
    }

    [Fact]
    public void Projection_accepts_a_movement_without_an_entered_unit()
    {
        using var report = JsonDocument.Parse("""
            {"source":"inventoryTransactions","page":1,"pageSize":10,"totalCount":1,"rows":[
              {"entryDate":"2026-10-20","direction":"Issue","stockCode":"ST-01","quantity":3,"enteredUnitCode":null}]}
            """);
        using var result = JsonDocument.Parse(ERPAssistantInventoryMovementTools.SummarizeReport(report.RootElement,
            "ST-01", new DateOnly(2026, 10, 1), new DateOnly(2026, 10, 25)));
        var movement = Assert.Single(result.RootElement.GetProperty("movements").EnumerateArray());
        Assert.True(movement.GetProperty("unitCode").ValueKind == JsonValueKind.Null);
    }

    private sealed class RecordingPermissionAuthorizer(Guid expectedTenantId, params string[] grantedPermissions) : IPlatformPermissionAuthorizer
    {
        public List<string> PermissionCodes { get; } = [];
        public Task<bool> IsAllowedAsync(Guid tenantId, Guid userId, string role, ResolvedPlatformPermission permission, CancellationToken cancellationToken = default)
        {
            PermissionCodes.Add(permission.Permission.Code);
            return Task.FromResult(expectedTenantId == tenantId && grantedPermissions.Contains(permission.Permission.Code, StringComparer.Ordinal));
        }
    }
}
