using System.Text.Json;
using AIERP.AIService.AI;
using AIERP.Platform.Application;
using Xunit;

namespace AIERP.Platform.UnitTests;

public sealed class ERPAssistantPaymentInstrumentToolsTests
{
    [Theory]
    [InlineData("  CH-001  ", true, "CH-001")]
    [InlineData("x", false, "x")]
    [InlineData("  ", false, "")]
    [InlineData("abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz", false, "abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz")]
    public void Search_term_is_trimmed_and_bounded(string input, bool expected, string expectedTerm)
    {
        Assert.Equal(expected, ERPAssistantPaymentInstrumentTools.TryValidateSearchTerm(input, out var term));
        Assert.Equal(expectedTerm, term);
    }

    [Fact]
    public async Task Read_requires_the_tenant_payment_instrument_permission()
    {
        var tenantId = Guid.NewGuid();
        var authorizer = new RecordingPermissionAuthorizer(tenantId);

        Assert.True(await ERPAssistantPaymentInstrumentTools.IsReadAllowedAsync(tenantId, Guid.NewGuid(), "TenantAdmin", authorizer, CancellationToken.None));
        Assert.Equal("erp.finance-payment-instruments.read", authorizer.PermissionCode);
        Assert.False(await ERPAssistantPaymentInstrumentTools.IsReadAllowedAsync(Guid.NewGuid(), Guid.NewGuid(), "TenantAdmin", authorizer, CancellationToken.None));
    }

    [Fact]
    public void Summary_preserves_currency_and_omits_private_fields()
    {
        using var response = JsonDocument.Parse("""
            {"totalCount":1,"items":[{"id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","code":"CEK-001","type":"Check","direction":"Receivable","status":"Portfolio","instrumentNumber":"Sensitive-Number","counterpartyName":"Private Customer","bankName":"Private Bank","currencyCode":"usd","amount":125.50,"issueDate":"2026-01-01","dueDate":"2026-02-01","financialAccountId":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","notes":"private note"}]}
            """);

        using var result = JsonDocument.Parse(ERPAssistantPaymentInstrumentTools.SummarizeSearchResult(response.RootElement));
        var root = result.RootElement;
        Assert.Equal(1, root.GetProperty("totalCount").GetInt32());
        Assert.False(root.GetProperty("hasMore").GetBoolean());
        var item = Assert.Single(root.GetProperty("items").EnumerateArray());
        Assert.Equal("USD", item.GetProperty("currencyCode").GetString());
        Assert.Equal(125.50m, item.GetProperty("amount").GetDecimal());
        Assert.Equal("2026-02-01", item.GetProperty("dueDate").GetString());
        Assert.False(item.TryGetProperty("id", out _));
        Assert.False(item.TryGetProperty("instrumentNumber", out _));
        Assert.False(item.TryGetProperty("counterpartyName", out _));
        Assert.False(item.TryGetProperty("bankName", out _));
        Assert.False(item.TryGetProperty("financialAccountId", out _));
        Assert.False(item.TryGetProperty("notes", out _));
    }

    [Fact]
    public void Summary_rejects_more_than_ten_items()
    {
        var rows = string.Join(',', Enumerable.Range(0, 11).Select(i =>
            $"{{\"code\":\"C-{i}\",\"type\":\"Check\",\"direction\":\"Receivable\",\"status\":\"Portfolio\",\"currencyCode\":\"TRY\",\"amount\":1,\"issueDate\":\"2026-01-01\",\"dueDate\":\"2026-02-01\"}}"));
        using var response = JsonDocument.Parse($"{{\"totalCount\":11,\"items\":[{rows}]}}");
        Assert.Throws<JsonException>(() => ERPAssistantPaymentInstrumentTools.SummarizeSearchResult(response.RootElement));
    }

    private sealed class RecordingPermissionAuthorizer(Guid allowedTenantId) : IPlatformPermissionAuthorizer
    {
        public string? PermissionCode { get; private set; }

        public Task<bool> IsAllowedAsync(Guid tenantId, Guid userId, string role,
            ResolvedPlatformPermission permission, CancellationToken cancellationToken = default)
        {
            PermissionCode = permission.Permission.Code;
            return Task.FromResult(tenantId == allowedTenantId && role == "TenantAdmin");
        }
    }
}
