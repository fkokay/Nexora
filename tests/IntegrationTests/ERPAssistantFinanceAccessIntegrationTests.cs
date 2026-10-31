using System.Net;
using System.Text.Json;
using AIERP.AIService.AI;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace AIERP.Api.IntegrationTests;

public sealed class ERPAssistantFinanceAccessIntegrationTests
{
    private static readonly Guid TenantA = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid TenantB = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid UserA = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private static readonly Guid UserB = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    private static readonly DateOnly From = new(2026, 1, 1);

    [Fact]
    public async Task Financial_account_balance_tool_requires_active_tenant_finance_account_read_permission()
    {
        var options = new DbContextOptionsBuilder<PlatformDbContext>()
            .UseInMemoryDatabase($"assistant-financial-account-access-{Guid.NewGuid():N}").Options;
        await using var db = new PlatformDbContext(options);
        var tenantA = new Tenant { Id = TenantA, Name = "Synthetic A", Slug = "assistant-account-a" };
        var tenantB = new Tenant { Id = TenantB, Name = "Synthetic B", Slug = "assistant-account-b" };
        var userA = new AppUser { Id = UserA, Email = "account-user@example.test" };
        var userB = new AppUser { Id = UserB, Email = "other-account-user@example.test" };
        db.Tenants.AddRange(tenantA, tenantB);
        db.Users.AddRange(userA, userB);
        db.TenantMemberships.AddRange(
            new TenantMembership { Tenant = tenantA, TenantId = TenantA, User = userA, UserId = UserA, Role = "FinanceUser" },
            new TenantMembership { Tenant = tenantB, TenantId = TenantB, User = userB, UserId = UserB, Role = "FinanceUser" });
        var permission = new PermissionDefinition
        {
            Code = "erp.finance-accounts.read", ResourceType = "erp.finance-accounts", Action = "read",
            Description = "Synthetic finance account read permission"
        };
        db.PermissionDefinitions.Add(permission);
        db.TenantPermissionRules.Add(new TenantPermissionRule
        {
            Tenant = tenantA, TenantId = TenantA, SubjectType = TenantPermissionSubjectType.Role,
            SubjectRole = "FinanceUser", Permission = permission, PermissionCode = permission.Code,
            Effect = TenantPermissionEffect.Allow
        });
        await db.SaveChangesAsync();

        var authorizer = new PlatformPermissionAuthorizer(db);
        Assert.True(await ERPAssistantFinancialAccountTools.IsReadAllowedAsync(TenantA, UserA,
            "FinanceUser", authorizer, CancellationToken.None));
        Assert.False(await ERPAssistantFinancialAccountTools.IsReadAllowedAsync(TenantB, UserB,
            "FinanceUser", authorizer, CancellationToken.None));
    }

    [Fact]
    public async Task Cash_forecast_tool_uses_active_tenant_finance_read_permission()
    {
        var options = new DbContextOptionsBuilder<PlatformDbContext>()
            .UseInMemoryDatabase($"assistant-finance-access-{Guid.NewGuid():N}").Options;
        await using var db = new PlatformDbContext(options);
        var tenantA = new Tenant { Id = TenantA, Name = "Synthetic A", Slug = "assistant-finance-a" };
        var tenantB = new Tenant { Id = TenantB, Name = "Synthetic B", Slug = "assistant-finance-b" };
        var userA = new AppUser { Id = UserA, Email = "cash-user@example.test" };
        var userB = new AppUser { Id = UserB, Email = "other-user@example.test" };
        db.Tenants.AddRange(tenantA, tenantB);
        db.Users.AddRange(userA, userB);
        db.TenantMemberships.AddRange(
            new TenantMembership { Tenant = tenantA, TenantId = TenantA, User = userA, UserId = UserA, Role = "FinanceUser" },
            new TenantMembership { Tenant = tenantB, TenantId = TenantB, User = userB, UserId = UserB, Role = "FinanceUser" });
        var permission = new PermissionDefinition
        {
            Code = "erp.finance-cash-flow.read", ResourceType = "erp.finance-cash-flow", Action = "read",
            Description = "Synthetic finance read permission"
        };
        db.PermissionDefinitions.Add(permission);
        db.TenantPermissionRules.Add(new TenantPermissionRule
        {
            Tenant = tenantA, TenantId = TenantA, SubjectType = TenantPermissionSubjectType.Role,
            SubjectRole = "FinanceUser", Permission = permission, PermissionCode = permission.Code,
            Effect = TenantPermissionEffect.Allow
        });
        await db.SaveChangesAsync();

        var authorizer = new PlatformPermissionAuthorizer(db);
        Assert.True(await ERPAssistantFinanceTools.IsReadAllowedAsync("get_cash_flow_forecast", TenantA, UserA,
            "FinanceUser", authorizer, CancellationToken.None));
        Assert.False(await ERPAssistantFinanceTools.IsReadAllowedAsync("get_cash_flow_forecast", TenantB, UserB,
            "FinanceUser", authorizer, CancellationToken.None));
        Assert.False(await ERPAssistantFinanceTools.IsReadAllowedAsync("get_payroll_salary", TenantA, UserA,
            "FinanceUser", authorizer, CancellationToken.None));
    }

    [Fact]
    public async Task Assistant_summary_uses_only_tenant_forecast_aggregates_and_drops_transaction_identity()
    {
        await using var app = await StartForecastApplicationAsync();
        using var client = app.GetTestClient();
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.GetAsync("/api/finance/cash-flow/forecast?from=2026-01-01&months=1")).StatusCode);

        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        client.DefaultRequestHeaders.Add("X-Test-User", UserA.ToString());
        client.DefaultRequestHeaders.Add("X-Test-Role", "FinanceUser");
        using var allowed = await client.GetAsync("/api/finance/cash-flow/forecast?from=2026-01-01&months=1");
        Assert.Equal(HttpStatusCode.OK, allowed.StatusCode);
        using var apiResult = JsonDocument.Parse(await allowed.Content.ReadAsStringAsync());
        var summary = ERPAssistantFinanceTools.SummarizeCashForecast(apiResult.RootElement);
        using var assistantResult = JsonDocument.Parse(summary);
        var month = Assert.Single(assistantResult.RootElement.GetProperty("currencies")[0].GetProperty("months").EnumerateArray());
        Assert.Equal(1200m, month.GetProperty("plannedCashInflows").GetDecimal());
        Assert.Equal(400m, month.GetProperty("plannedCashOutflows").GetDecimal());
        Assert.Equal(800m, month.GetProperty("netChange").GetDecimal());
        Assert.DoesNotContain("SYNTHETIC ACCOUNT OR COUNTERPARTY", summary, StringComparison.Ordinal);
        Assert.DoesNotContain("accountId", summary, StringComparison.Ordinal);

        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantB.ToString());
        using var otherTenant = await client.GetAsync("/api/finance/cash-flow/forecast?from=2026-01-01&months=1");
        Assert.Equal(HttpStatusCode.OK, otherTenant.StatusCode);
        using var otherResult = JsonDocument.Parse(await otherTenant.Content.ReadAsStringAsync());
        var otherSummary = ERPAssistantFinanceTools.SummarizeCashForecast(otherResult.RootElement);
        using var otherAssistantResult = JsonDocument.Parse(otherSummary);
        Assert.Equal(0, otherAssistantResult.RootElement.GetProperty("currencyCount").GetInt32());
        Assert.DoesNotContain("1200", otherSummary, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("2026-01-01", 1, true)]
    [InlineData("2026-01-02", 1, false)]
    [InlineData("2026-01-01", 13, false)]
    [InlineData("1999-12-01", 1, false)]
    [InlineData("2026-01-01", 0, false)]
    public void Forecast_arguments_are_month_aligned_and_bounded(string from, int months, bool expected) =>
        Assert.Equal(expected, ERPAssistantFinanceTools.TryValidatePeriod(from, months, out _, out _));

    private static async Task<WebApplication> StartForecastApplicationAsync()
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        var dbName = $"assistant-cash-forecast-{Guid.NewGuid():N}";
        var root = new InMemoryDatabaseRoot();
        builder.Services.AddDbContext<TenantDbContext>(options => options.UseInMemoryDatabase(dbName, root));
        builder.Services.AddAuthentication("report-test")
            .AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("report-test", _ => { });
        builder.Services.AddAuthorization();
        var app = builder.Build();
        app.UseAuthentication(); app.UseAuthorization();
        app.MapTenantCashForecastEndpoints();
        await app.StartAsync();

        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        await db.Database.EnsureCreatedAsync();
        db.Tenants.AddRange(
            new Tenant { Id = TenantA, Name = "Synthetic A", Slug = "assistant-cash-a" },
            new Tenant { Id = TenantB, Name = "Synthetic B", Slug = "assistant-cash-b" });
        var plan = new DirectCashBudgetPlan
        {
            Id = Guid.Parse("cccccccc-cccc-cccc-cccc-cccccccccccc"), TenantId = TenantA,
            Name = "Synthetic forecast", FiscalYear = 2026, CurrencyCode = "TRY",
            Status = DirectCashBudgetPlanStatus.Approved, CreatedByUserId = UserA, ApprovedByUserId = UserB
        };
        plan.Lines.Add(new DirectCashBudgetLine
        {
            Id = Guid.Parse("dddddddd-dddd-dddd-dddd-dddddddddddd"), TenantId = TenantA, PlanId = plan.Id,
            Plan = plan, PeriodStart = From, Direction = DirectCashBudgetDirection.Inflow,
            Category = "Sales", Description = "SYNTHETIC ACCOUNT OR COUNTERPARTY", Amount = 1200m
        });
        plan.Lines.Add(new DirectCashBudgetLine
        {
            Id = Guid.Parse("eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee"), TenantId = TenantA, PlanId = plan.Id,
            Plan = plan, PeriodStart = From, Direction = DirectCashBudgetDirection.Outflow,
            Category = "Payroll", Description = "SYNTHETIC ACCOUNT OR COUNTERPARTY", Amount = 400m
        });
        db.DirectCashBudgetPlans.Add(plan);
        await db.SaveChangesAsync();
        return app;
    }
}
