using System.Text.Json;
using AIERP.AIService.AI;
using AIERP.Platform.Application;

namespace AIERP.Platform.UnitTests;

public sealed class ERPAssistantFinancialAccountToolsTests
{
    [Fact]
    public async Task Balance_read_requires_finance_account_permission()
    {
        var tenantId = Guid.NewGuid();
        var allowed = new RecordingPermissionAuthorizer(true, tenantId);
        Assert.True(await ERPAssistantFinancialAccountTools.IsReadAllowedAsync(tenantId, Guid.NewGuid(), "FinanceUser", allowed, CancellationToken.None));
        Assert.Equal("erp.finance-accounts.read", allowed.PermissionCode);
        Assert.False(await ERPAssistantFinancialAccountTools.IsReadAllowedAsync(tenantId, Guid.NewGuid(), "FinanceUser",
            new RecordingPermissionAuthorizer(false, tenantId), CancellationToken.None));
    }

    [Fact]
    public void Summary_groups_by_account_type_and_currency_without_forwarding_identity()
    {
        using var json = JsonDocument.Parse("""
        [
          {"id":"11111111-1111-1111-1111-111111111111","code":"CASH-SECRET","name":"Private cash box","type":"Cash","currencyCode":"TRY","isActive":true,"balance":125.50},
          {"id":"22222222-2222-2222-2222-222222222222","code":"BANK-SECRET","name":"Private bank account","type":"Bank","currencyCode":"TRY","isActive":true,"balance":-25.50},
          {"id":"33333333-3333-3333-3333-333333333333","code":"USD-SECRET","name":"Private USD account","type":"Bank","currencyCode":"USD","isActive":false,"balance":900}
        ]
        """);

        var summary = ERPAssistantFinancialAccountTools.SummarizeBalances(json.RootElement);
        using var result = JsonDocument.Parse(summary);
        var balances = result.RootElement.GetProperty("balances").EnumerateArray().ToArray();

        Assert.Equal(3, result.RootElement.GetProperty("accountCount").GetInt32());
        Assert.Equal(3, balances.Length);
        Assert.Equal(125.50m, balances.Single(x => x.GetProperty("accountType").GetString() == "Cash")
            .GetProperty("recordedBalance").GetDecimal());
        Assert.Equal(-25.50m, balances.Single(x => x.GetProperty("accountType").GetString() == "Bank" && x.GetProperty("currencyCode").GetString() == "TRY")
            .GetProperty("recordedBalance").GetDecimal());
        Assert.Equal("not bank-statement reconciliation or a cleared-funds confirmation.",
            result.RootElement.GetProperty("basis").GetString()!.Split("this is ", StringSplitOptions.None).Last());
        Assert.DoesNotContain("11111111", summary, StringComparison.Ordinal);
        Assert.DoesNotContain("CASH-SECRET", summary, StringComparison.Ordinal);
        Assert.DoesNotContain("Private cash box", summary, StringComparison.Ordinal);
    }

    [Fact]
    public void Tool_arguments_must_be_empty_object()
    {
        using var valid = JsonDocument.Parse("{}");
        using var invalid = JsonDocument.Parse("{\"accountId\":\"secret\"}");
        using var wrongShape = JsonDocument.Parse("[]");

        Assert.True(ERPAssistantFinancialAccountTools.HasNoArguments(valid.RootElement));
        Assert.False(ERPAssistantFinancialAccountTools.HasNoArguments(invalid.RootElement));
        Assert.False(ERPAssistantFinancialAccountTools.HasNoArguments(wrongShape.RootElement));
    }

    private sealed class RecordingPermissionAuthorizer(bool allowed, Guid expectedTenantId) : IPlatformPermissionAuthorizer
    {
        public string? PermissionCode { get; private set; }
        public Task<bool> IsAllowedAsync(Guid tenantId, Guid userId, string role, ResolvedPlatformPermission permission,
            CancellationToken cancellationToken = default)
        {
            PermissionCode = permission.Permission.Code;
            return Task.FromResult(allowed && tenantId == expectedTenantId);
        }
    }
}
