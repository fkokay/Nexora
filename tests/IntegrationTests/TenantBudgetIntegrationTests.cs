using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
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

public sealed class TenantBudgetIntegrationTests
{
    private static readonly Guid TenantA = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid TenantB = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid Creator = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private static readonly Guid Approver = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");

    [Fact]
    public async Task Budget_compares_tenant_actuals_and_requires_separate_admin_approval()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        client.DefaultRequestHeaders.Add("X-Test-User", Creator.ToString());

        var accounts = await GetAccountsAsync(app, TenantA);
        var revenue = accounts.Single(x => x.StatementSection == LedgerAccountStatementSection.Revenue);
        var expense = accounts.Single(x => x.StatementSection == LedgerAccountStatementSection.Expense);
        var payload = new TenantBudgetPlanWriteRequest("2026 işletme planı", 2026, new[]
        {
            new TenantBudgetLineWriteRequest(revenue.Id, new DateOnly(2026, 1, 1), 1000m),
            new TenantBudgetLineWriteRequest(expense.Id, new DateOnly(2026, 1, 1), 300m, "Ocak giderleri")
        });
        using var created = await client.PostAsJsonAsync("/api/finance/budgets/", payload);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        using var createdJson = JsonDocument.Parse(await created.Content.ReadAsStringAsync());
        var planId = createdJson.RootElement.GetProperty("plan").GetProperty("id").GetGuid();
        Assert.Equal(2, createdJson.RootElement.GetProperty("lines").GetArrayLength());

        using var detail = await client.GetAsync($"/api/finance/budgets/{planId}");
        Assert.True(detail.IsSuccessStatusCode, await detail.Content.ReadAsStringAsync());
        using var detailJson = JsonDocument.Parse(await detail.Content.ReadAsStringAsync());
        var detailLines = detailJson.RootElement.GetProperty("lines").EnumerateArray().ToArray();
        Assert.Equal(800m, detailLines.Single(x => x.GetProperty("statementSection").GetString() == "Revenue").GetProperty("actualAmount").GetDecimal());
        Assert.Equal(150m, detailLines.Single(x => x.GetProperty("statementSection").GetString() == "Expense").GetProperty("actualAmount").GetDecimal());

        using var staleUpdate = await client.PutAsJsonAsync($"/api/finance/budgets/{planId}", payload with { Name = "Stale update" });
        Assert.Equal(HttpStatusCode.Conflict, staleUpdate.StatusCode);
        using var updated = await client.PutAsJsonAsync($"/api/finance/budgets/{planId}", payload with { Name = "2026 işletme planı v2", Revision = 1 });
        Assert.True(updated.IsSuccessStatusCode, await updated.Content.ReadAsStringAsync());
        using var updatedJson = JsonDocument.Parse(await updated.Content.ReadAsStringAsync());
        Assert.Equal(2, updatedJson.RootElement.GetProperty("plan").GetProperty("revision").GetInt32());

        using var selfApproval = await client.PostAsync($"/api/finance/budgets/{planId}/approve", null);
        Assert.Equal(HttpStatusCode.Conflict, selfApproval.StatusCode);
        client.DefaultRequestHeaders.Remove("X-Test-User"); client.DefaultRequestHeaders.Add("X-Test-User", Approver.ToString());
        using var approved = await client.PostAsync($"/api/finance/budgets/{planId}/approve", null);
        Assert.True(approved.IsSuccessStatusCode, await approved.Content.ReadAsStringAsync());
        using var approvedJson = JsonDocument.Parse(await approved.Content.ReadAsStringAsync());
        var status = approvedJson.RootElement.GetProperty("plan").GetProperty("status");
        Assert.True(status.ValueKind == JsonValueKind.String ? status.GetString() == "Approved" : status.GetInt32() == (int)TenantBudgetPlanStatus.Approved);
        Assert.Equal(Approver, approvedJson.RootElement.GetProperty("plan").GetProperty("approvedByUserId").GetGuid());
        using var immutable = await client.PutAsJsonAsync($"/api/finance/budgets/{planId}", payload with { Revision = 2 });
        Assert.Equal(HttpStatusCode.Conflict, immutable.StatusCode);

        client.DefaultRequestHeaders.Remove("X-Test-Tenant"); client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantB.ToString());
        using var otherTenant = await client.GetAsync($"/api/finance/budgets/{planId}");
        Assert.Equal(HttpStatusCode.NotFound, otherTenant.StatusCode);
    }

    [Fact]
    public async Task Budget_rejects_unclassified_account_and_non_admin_writes()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        client.DefaultRequestHeaders.Add("X-Test-Role", "TenantUser");
        using var forbidden = await client.PostAsJsonAsync("/api/finance/budgets/", new { name = "Plan", fiscalYear = 2026, lines = new[] { new { accountId = Guid.NewGuid(), periodStart = "2026-01-01", plannedAmount = 1m } } });
        Assert.Equal(HttpStatusCode.Forbidden, forbidden.StatusCode);

        client.DefaultRequestHeaders.Remove("X-Test-Role"); client.DefaultRequestHeaders.Add("X-Test-Role", "TenantAdmin");
        var unclassified = (await GetAccountsAsync(app, TenantA)).Single(x => x.StatementSection == LedgerAccountStatementSection.Unclassified);
        using var invalid = await client.PostAsJsonAsync("/api/finance/budgets/", new { name = "Plan", fiscalYear = 2026, currencyCode = "TRY", revision = 0, lines = new[] { new { accountId = unclassified.Id, periodStart = "2026-01-01", plannedAmount = 1m } } });
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);
    }

    [Fact]
    public async Task Budget_rejects_foreign_currency_writes_and_marks_legacy_variance_unknown()
    {
        await using var app = await StartApplicationAsync();
        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            var tenant = await db.Tenants.SingleAsync(x => x.Id == TenantB);
            tenant.BaseCurrencyCode = "USD";
            var account = new LedgerAccount { TenantId = TenantB, Code = "4000", Name = "Revenue", StatementSection = LedgerAccountStatementSection.Revenue };
            var legacy = new TenantBudgetPlan { TenantId = TenantB, Name = "Legacy EUR", FiscalYear = 2026, CurrencyCode = "EUR", CreatedByUserId = Creator };
            legacy.Lines.Add(new TenantBudgetLine { TenantId = TenantB, BudgetPlanId = legacy.Id, AccountId = account.Id,
                Account = account, PeriodStart = new DateOnly(2026, 1, 1), PlannedAmount = 100m });
            db.LedgerAccounts.Add(account);
            db.TenantBudgetPlans.Add(legacy);
            await db.SaveChangesAsync();

            using var client = app.GetTestClient();
            client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantB.ToString());
            client.DefaultRequestHeaders.Add("X-Test-User", Creator.ToString());
            var request = new TenantBudgetPlanWriteRequest("New USD plan", 2026,
                [new TenantBudgetLineWriteRequest(account.Id, new DateOnly(2026, 1, 1), 50m)], "EUR");
            using var rejectedCreate = await client.PostAsJsonAsync("/api/finance/budgets/", request);
            Assert.Equal(HttpStatusCode.BadRequest, rejectedCreate.StatusCode);
            using var validCreate = await client.PostAsJsonAsync("/api/finance/budgets/", request with { CurrencyCode = "USD" });
            Assert.Equal(HttpStatusCode.Created, validCreate.StatusCode);
            using var validJson = JsonDocument.Parse(await validCreate.Content.ReadAsStringAsync());
            var validId = validJson.RootElement.GetProperty("plan").GetProperty("id").GetGuid();
            using var rejectedUpdate = await client.PutAsJsonAsync($"/api/finance/budgets/{validId}", request with { CurrencyCode = "EUR", Revision = 1 });
            Assert.Equal(HttpStatusCode.BadRequest, rejectedUpdate.StatusCode);

            using var detail = await client.GetAsync($"/api/finance/budgets/{legacy.Id}");
            Assert.Equal(HttpStatusCode.OK, detail.StatusCode);
            using var json = JsonDocument.Parse(await detail.Content.ReadAsStringAsync());
            Assert.Equal("USD", json.RootElement.GetProperty("plan").GetProperty("baseCurrencyCode").GetString());
            Assert.True(json.RootElement.GetProperty("lines")[0].GetProperty("variance").ValueKind == JsonValueKind.Null);
        }
    }

    private static async Task<WebApplication> StartApplicationAsync()
    {
        var builder = WebApplication.CreateBuilder(); builder.WebHost.UseTestServer();
        var dbName = $"tenant-budget-{Guid.NewGuid():N}"; var root = new InMemoryDatabaseRoot();
        builder.Services.AddDbContext<TenantDbContext>(o => o.UseInMemoryDatabase(dbName, root));
        builder.Services.AddAuthentication("report-test").AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("report-test", _ => { });
        builder.Services.AddAuthorization(); var app = builder.Build();
        app.UseAuthentication(); app.UseAuthorization(); app.MapTenantBudgetEndpoints(); await app.StartAsync();
        await using var scope = app.Services.CreateAsyncScope(); var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        await db.Database.EnsureCreatedAsync();
        db.Tenants.AddRange(new Tenant { Id = TenantA, Name = "A", Slug = "a" }, new Tenant { Id = TenantB, Name = "B", Slug = "b" });
        var revenue = new LedgerAccount { TenantId = TenantA, Code = "4000", Name = "Revenue", StatementSection = LedgerAccountStatementSection.Revenue };
        var expense = new LedgerAccount { TenantId = TenantA, Code = "6000", Name = "Expense", StatementSection = LedgerAccountStatementSection.Expense };
        var unclassified = new LedgerAccount { TenantId = TenantA, Code = "9999", Name = "Other" };
        db.LedgerAccounts.AddRange(revenue, expense, unclassified);
        var revenueEntry = new JournalEntry { TenantId = TenantA, Code = "R-1", EntryDate = new DateOnly(2026, 1, 15), Description = "Revenue", SourceType = "Manual" };
        revenueEntry.Lines.Add(new JournalEntryLine { TenantId = TenantA, JournalEntryId = revenueEntry.Id, AccountId = revenue.Id, LineNumber = 1, Credit = 800m });
        var expenseEntry = new JournalEntry { TenantId = TenantA, Code = "E-1", EntryDate = new DateOnly(2026, 1, 16), Description = "Expense", SourceType = "Manual" };
        expenseEntry.Lines.Add(new JournalEntryLine { TenantId = TenantA, JournalEntryId = expenseEntry.Id, AccountId = expense.Id, LineNumber = 1, Debit = 150m });
        db.JournalEntries.AddRange(revenueEntry, expenseEntry); await db.SaveChangesAsync(); return app;
    }

    private static async Task<List<LedgerAccount>> GetAccountsAsync(WebApplication app, Guid tenantId)
    {
        await using var scope = app.Services.CreateAsyncScope();
        return await scope.ServiceProvider.GetRequiredService<TenantDbContext>().LedgerAccounts.Where(x => x.TenantId == tenantId).ToListAsync();
    }
}
