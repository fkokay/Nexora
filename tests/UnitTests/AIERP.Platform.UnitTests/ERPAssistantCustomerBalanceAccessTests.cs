using System.Text.Json;
using AIERP.AIService.AI;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace AIERP.Platform.UnitTests;

public sealed class ERPAssistantCustomerBalanceAccessTests
{
    [Fact]
    public void Balance_read_requires_one_current_search_match_and_rejects_ambiguous_or_truncated_searches()
    {
        var accountId = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1");
        var selection = new ERPAssistantCustomerAccountSelection();
        using var unique = JsonDocument.Parse($"{{\"totalCount\":1,\"items\":[{{\"id\":\"{accountId:D}\",\"code\":\"C-100\",\"type\":1}}]}}");
        Assert.True(selection.TryRememberUniqueSearchResult(unique.RootElement));
        Assert.True(selection.CanReadBalance(accountId));
        Assert.True(selection.TryGetSelectedCustomerCode(accountId, out var customerCode));
        Assert.Equal("C-100", customerCode);
        Assert.False(selection.TryGetSelectedCustomerCode(Guid.NewGuid(), out _));
        Assert.False(selection.CanReadBalance(Guid.NewGuid()));

        using var ambiguous = JsonDocument.Parse($"{{\"totalCount\":2,\"items\":[{{\"id\":\"{accountId:D}\"}},{{\"id\":\"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1\"}}]}}");
        Assert.False(selection.TryRememberUniqueSearchResult(ambiguous.RootElement));
        Assert.False(selection.CanReadBalance(accountId));
        Assert.False(selection.TryGetSelectedCustomerCode(accountId, out _));

        using var narrowedWithoutUser = JsonDocument.Parse("{\"totalCount\":1,\"items\":[{\"id\":\"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1\"}]}");
        Assert.False(selection.TryRememberUniqueSearchResult(narrowedWithoutUser.RootElement));
        Assert.False(selection.CanReadBalance(Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1")));

        using var truncated = JsonDocument.Parse($"{{\"totalCount\":26,\"items\":[{{\"id\":\"{accountId:D}\"}}]}}");
        Assert.False(selection.TryRememberUniqueSearchResult(truncated.RootElement));
        Assert.False(selection.CanReadBalance(accountId));
    }

    [Theory]
    [InlineData(1, true)]
    [InlineData(2, false)]
    [InlineData(3, true)]
    public void Ledger_selection_allows_only_customer_accounts_and_both_accounts(int type, bool expected)
    {
        var accountId = Guid.NewGuid();
        var selection = new ERPAssistantCustomerAccountSelection();
        using var unique = JsonDocument.Parse($"{{\"totalCount\":1,\"items\":[{{\"id\":\"{accountId:D}\",\"code\":\"C-100\",\"type\":{type}}}]}}");
        Assert.True(selection.TryRememberUniqueSearchResult(unique.RootElement));
        Assert.Equal(expected, selection.TryGetSelectedCustomerCode(accountId, out _));
    }

    [Fact]
    public async Task Customer_balance_read_permission_requires_live_user_membership_in_selected_tenant_and_deny_wins()
    {
        var tenantId = Guid.NewGuid();
        var otherTenantId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        var options = new DbContextOptionsBuilder<PlatformDbContext>()
            .UseInMemoryDatabase($"assistant-customer-balance-permission-{Guid.NewGuid():N}").Options;
        await using var db = new PlatformDbContext(options);
        var tenant = new Tenant { Id = tenantId, Name = "Synthetic tenant", Slug = Guid.NewGuid().ToString("N") };
        var user = new AppUser { Id = userId, Email = "synthetic-user@example.test" };
        db.TenantMemberships.Add(new TenantMembership { Tenant = tenant, User = user, Role = "TenantUser" });
        db.PermissionDefinitions.Add(new PermissionDefinition
        {
            Code = "erp.customers.read", ResourceType = "erp.customers", Action = "read", Description = "Read customer accounts"
        });
        await db.SaveChangesAsync();
        await TenantPermissionDefaults.AddTenantUserBaselineAsync(db, tenantId, userId);
        await db.SaveChangesAsync();

        Assert.True(PlatformPermissionCatalog.TryResolve("/api/customers/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1/balance", "GET",
            "/api/customers/{id:guid}/balance", new Dictionary<string, string?>(), tenantId, userId, "TenantUser", out var resolved));
        var permissionResolution = resolved!;
        Assert.Equal("erp.customers.read", permissionResolution.Permission.Code);
        var selectedAccountId = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1");
        var resolvedPermission = new ResolvedPlatformPermission(permissionResolution.Permission,
            new Dictionary<string, string>(permissionResolution.Attributes, StringComparer.OrdinalIgnoreCase)
            {
                ["resource.customerId"] = selectedAccountId.ToString("D"),
                ["resource.customerType"] = "Customer",
                ["resource.customerActive"] = "true"
            });
        var authorizer = new PlatformPermissionAuthorizer(db);
        Assert.True(await authorizer.IsAllowedAsync(tenantId, userId, "TenantUser", resolvedPermission));
        Assert.False(await authorizer.IsAllowedAsync(otherTenantId, userId, "TenantUser", resolvedPermission));

        user.IsActive = false;
        await db.SaveChangesAsync();
        Assert.False(await authorizer.IsAllowedAsync(tenantId, userId, "TenantUser", resolvedPermission));
        user.IsActive = true;

        var permission = await db.PermissionDefinitions.SingleAsync(x => x.Code == "erp.customers.read");
        db.TenantPermissionRules.Add(new TenantPermissionRule
        {
            TenantId = tenantId,
            Tenant = tenant,
            SubjectType = TenantPermissionSubjectType.Role,
            SubjectRole = "TenantUser",
            PermissionCode = permission.Code,
            Permission = permission,
            Effect = TenantPermissionEffect.Deny,
            ResourceType = permission.ResourceType,
            AttributeName = "resource.customerId",
            AttributeOperator = TenantPermissionConditionOperator.Equals,
            AttributeValue = selectedAccountId.ToString("D")
        });
        await db.SaveChangesAsync();
        Assert.False(await authorizer.IsAllowedAsync(tenantId, userId, "TenantUser", resolvedPermission));
    }

    [Theory]
    [InlineData(125, 25, 100, "TRY", "Debit")]
    [InlineData(25, 125, -100, "EUR", "Credit")]
    [InlineData(50, 50, 0, "USD", "Balanced")]
    public void Balance_response_preserves_account_currency_and_signed_side(decimal debit, decimal credit, decimal expected,
        string currency, string expectedSide)
    {
        var result = CustomerLedgerBalanceCalculator.Calculate(currency, debit, credit, null);

        Assert.Equal(currency, result.CurrencyCode);
        Assert.Equal(expected, result.Balance);
        Assert.Equal(expectedSide, result.BalanceSide);
    }
}
