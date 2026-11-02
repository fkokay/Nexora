using System.Text.Json;
using AIERP.AIService.AI;
using AIERP.Platform.Application;

namespace AIERP.Platform.UnitTests;

public sealed class ERPAssistantBudgetVarianceToolsTests
{
    [Theory]
    [InlineData(null, false)]
    [InlineData("x", false)]
    [InlineData(" Plan  ", true)]
    [InlineData("01234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890", false)]
    public void Search_term_is_trimmed_and_bounded(string? input, bool expected)
    {
        Assert.Equal(expected, ERPAssistantBudgetVarianceTools.TryValidateSearchTerm(input, out var term));
        Assert.Equal(input?.Trim() ?? string.Empty, term);
    }

    [Fact]
    public async Task Read_requires_budget_permission_and_matching_tenant()
    {
        var tenantId = Guid.NewGuid();
        var authorizer = new RecordingPermissionAuthorizer(tenantId);
        Assert.True(await ERPAssistantBudgetVarianceTools.IsReadAllowedAsync(tenantId, Guid.NewGuid(), "TenantAdmin", authorizer, CancellationToken.None));
        Assert.Equal("erp.finance-budgets.read", authorizer.PermissionCode);
        Assert.False(await ERPAssistantBudgetVarianceTools.IsReadAllowedAsync(Guid.NewGuid(), Guid.NewGuid(), "TenantAdmin", authorizer, CancellationToken.None));
    }

    [Fact]
    public void Summary_preserves_monthly_currency_and_omits_sensitive_fields()
    {
        using var response = JsonDocument.Parse("""
            {"totalCount":1,"items":[{"id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","name":"2026 işletme planı","fiscalYear":2026,"currencyCode":"TRY","baseCurrencyCode":"TRY","status":"Approved","lineCount":2,"isComparableToLedger":true,"plannedTotal":1300,"actualTotal":950,"varianceTotal":-350,"notes":"private note","periods":[{"periodStart":"2026-01-01","plannedAmount":1300,"actualAmount":950,"variance":-350,"accountId":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","notes":"private line"}]}]}
            """);
        using var result = JsonDocument.Parse(ERPAssistantBudgetVarianceTools.SummarizeBudgets(response.RootElement));
        var root = result.RootElement;
        Assert.Equal(1, root.GetProperty("totalCount").GetInt32());
        Assert.False(root.GetProperty("hasMore").GetBoolean());
        var item = Assert.Single(root.GetProperty("items").EnumerateArray());
        Assert.Equal("TRY", item.GetProperty("currencyCode").GetString());
        Assert.Equal(-350m, item.GetProperty("varianceTotal").GetDecimal());
        var period = Assert.Single(item.GetProperty("periods").EnumerateArray());
        Assert.Equal(-350m, period.GetProperty("variance").GetDecimal());
        Assert.False(item.TryGetProperty("id", out _));
        Assert.False(item.TryGetProperty("notes", out _));
        Assert.False(period.TryGetProperty("accountId", out _));
        Assert.False(period.TryGetProperty("notes", out _));
    }

    [Fact]
    public void Summary_marks_foreign_currency_legacy_budget_non_comparable()
    {
        using var response = JsonDocument.Parse("""
            {"totalCount":1,"items":[{"name":"Legacy EUR","fiscalYear":2026,"currencyCode":"EUR","baseCurrencyCode":"USD","status":"Approved","lineCount":1,"isComparableToLedger":false,"plannedTotal":100,"actualTotal":null,"varianceTotal":null,"periods":[{"periodStart":"2026-01-01","plannedAmount":100,"actualAmount":null,"variance":null}]}]}
            """);
        using var result = JsonDocument.Parse(ERPAssistantBudgetVarianceTools.SummarizeBudgets(response.RootElement));
        var item = Assert.Single(result.RootElement.GetProperty("items").EnumerateArray());
        Assert.False(item.GetProperty("isComparableToLedger").GetBoolean());
        Assert.Equal(JsonValueKind.Null, item.GetProperty("actualTotal").ValueKind);
        Assert.Equal(JsonValueKind.Null, item.GetProperty("varianceTotal").ValueKind);
    }

    [Fact]
    public void Summary_rejects_unbounded_or_inconsistent_results()
    {
        using var tooMany = JsonDocument.Parse("""{"totalCount":11,"items":[{"name":"a"},{"name":"b"},{"name":"c"},{"name":"d"},{"name":"e"},{"name":"f"},{"name":"g"},{"name":"h"},{"name":"i"},{"name":"j"},{"name":"k"}]}""");
        Assert.Throws<JsonException>(() => ERPAssistantBudgetVarianceTools.SummarizeBudgets(tooMany.RootElement));

        using var invalidVariance = JsonDocument.Parse("""
            {"totalCount":1,"items":[{"name":"Plan","fiscalYear":2026,"currencyCode":"TRY","baseCurrencyCode":"TRY","status":"Approved","lineCount":1,"isComparableToLedger":true,"plannedTotal":100,"actualTotal":120,"varianceTotal":30,"periods":[{"periodStart":"2026-01-01","plannedAmount":100,"actualAmount":120,"variance":20}]}]}
            """);
        Assert.Throws<JsonException>(() => ERPAssistantBudgetVarianceTools.SummarizeBudgets(invalidVariance.RootElement));
    }

    private sealed class RecordingPermissionAuthorizer(Guid tenantId) : IPlatformPermissionAuthorizer
    {
        public string? PermissionCode { get; private set; }

        public Task<bool> IsAllowedAsync(Guid requestedTenantId, Guid userId, string role,
            ResolvedPlatformPermission permission, CancellationToken cancellationToken = default)
        {
            PermissionCode = permission.Permission.Code;
            return Task.FromResult(requestedTenantId == tenantId && role == "TenantAdmin");
        }
    }
}
