using System.Text.Json;
using AIERP.AIService.AI;
using AIERP.Platform.Application;

namespace AIERP.Platform.UnitTests;

public sealed class ERPAssistantLedgerAccountToolsTests
{
    [Theory]
    [InlineData(null, false)]
    [InlineData("1", false)]
    [InlineData(" 120 ", true)]
    [InlineData("abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzx", false)]
    public void Search_term_is_trimmed_and_bounded(string? input, bool expected)
    {
        Assert.Equal(expected, ERPAssistantLedgerAccountTools.TryValidateSearchTerm(input, out var term));
        Assert.Equal(input?.Trim() ?? string.Empty, term);
    }

    [Fact]
    public async Task Read_requires_general_ledger_permission_and_matching_tenant()
    {
        var tenantId = Guid.NewGuid();
        var authorizer = new RecordingPermissionAuthorizer(tenantId);
        Assert.True(await ERPAssistantLedgerAccountTools.IsReadAllowedAsync(tenantId, Guid.NewGuid(), "TenantAdmin", authorizer, CancellationToken.None));
        Assert.Equal("erp.general-ledger.read", authorizer.PermissionCode);
        Assert.False(await ERPAssistantLedgerAccountTools.IsReadAllowedAsync(Guid.NewGuid(), Guid.NewGuid(), "TenantAdmin", authorizer, CancellationToken.None));
    }

    [Fact]
    public void Summary_keeps_only_bounded_account_projection()
    {
        using var response = JsonDocument.Parse("""
            {"totalCount":1,"accounts":[{"id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","code":"120","name":"ALICILAR","isActive":true,"statementSection":"Asset","balance":1000,"mapping":"secret"}]}
            """);
        using var result = JsonDocument.Parse(ERPAssistantLedgerAccountTools.SummarizeAccounts(response.RootElement));
        var root = result.RootElement;
        Assert.Equal(1, root.GetProperty("totalCount").GetInt32());
        var account = Assert.Single(root.GetProperty("accounts").EnumerateArray());
        Assert.Equal("120", account.GetProperty("code").GetString());
        Assert.False(account.TryGetProperty("id", out _));
        Assert.False(account.TryGetProperty("balance", out _));
        Assert.False(account.TryGetProperty("mapping", out _));
    }

    [Fact]
    public void Summary_rejects_more_than_ten_rows()
    {
        using var response = JsonDocument.Parse("""
            {"totalCount":11,"accounts":[{"code":"100","name":"A","isActive":true,"statementSection":"Asset"},{"code":"101","name":"B","isActive":true,"statementSection":"Asset"},{"code":"102","name":"C","isActive":true,"statementSection":"Asset"},{"code":"103","name":"D","isActive":true,"statementSection":"Asset"},{"code":"104","name":"E","isActive":true,"statementSection":"Asset"},{"code":"105","name":"F","isActive":true,"statementSection":"Asset"},{"code":"106","name":"G","isActive":true,"statementSection":"Asset"},{"code":"107","name":"H","isActive":true,"statementSection":"Asset"},{"code":"108","name":"I","isActive":true,"statementSection":"Asset"},{"code":"109","name":"J","isActive":true,"statementSection":"Asset"},{"code":"110","name":"K","isActive":true,"statementSection":"Asset"}]}
            """);
        Assert.Throws<JsonException>(() => ERPAssistantLedgerAccountTools.SummarizeAccounts(response.RootElement));
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
