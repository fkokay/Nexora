using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
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

public sealed class BalanceSheetIntegrationTests
{
    private static readonly Guid TenantA = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid TenantB = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly DateOnly AsOfDate = new(2026, 12, 31);

    [Fact]
    public async Task Income_statement_reports_period_revenue_expense_and_tenant_scope()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/finance/general-ledger/financial-statements/income-statement?from=2026-01-01&to=2026-12-31")).StatusCode);
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        using var response = await client.GetAsync("/api/finance/general-ledger/financial-statements/income-statement?from=2026-01-01&to=2026-12-31");
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("TRY", json.RootElement.GetProperty("baseCurrencyCode").GetString());
        Assert.Equal(400m, json.RootElement.GetProperty("totals").GetProperty("revenue").GetDecimal());
        Assert.Equal(50m, json.RootElement.GetProperty("totals").GetProperty("expenses").GetDecimal());
        Assert.Equal(350m, json.RootElement.GetProperty("totals").GetProperty("netIncome").GetDecimal());
        Assert.True(json.RootElement.GetProperty("isComplete").GetBoolean());
        Assert.Equal(2, json.RootElement.GetProperty("accounts").GetArrayLength());

        using var invalidRange = await client.GetAsync("/api/finance/general-ledger/financial-statements/income-statement?from=2026-12-31&to=2026-01-01");
        Assert.Equal(HttpStatusCode.BadRequest, invalidRange.StatusCode);
        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantB.ToString());
        using var tenantB = await client.GetAsync("/api/finance/general-ledger/financial-statements/income-statement?from=2026-01-01&to=2026-12-31");
        Assert.True(tenantB.IsSuccessStatusCode, await tenantB.Content.ReadAsStringAsync());
        using var tenantBJson = JsonDocument.Parse(await tenantB.Content.ReadAsStringAsync());
        Assert.Equal(0m, tenantBJson.RootElement.GetProperty("totals").GetProperty("revenue").GetDecimal());
        Assert.Equal(0, tenantBJson.RootElement.GetProperty("accounts").GetArrayLength());
    }

    [Fact]
    public async Task Cash_flow_statement_classifies_cash_movements_and_flags_unknown_activity()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        using var response = await client.GetAsync("/api/finance/general-ledger/financial-statements/cash-flow?from=2026-01-01&to=2026-01-31");
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = json.RootElement;
        Assert.False(root.GetProperty("isComplete").GetBoolean());
        Assert.False(root.GetProperty("statutory").GetBoolean());
        Assert.Equal(1, root.GetProperty("unclassifiedMovementCount").GetInt32());
        var currency = Assert.Single(root.GetProperty("currencies").EnumerateArray());
        Assert.Equal("TRY", currency.GetProperty("currencyCode").GetString());
        Assert.Equal(300m, currency.GetProperty("openingBalance").GetDecimal());
        Assert.Equal(500m, currency.GetProperty("operating").GetDecimal());
        Assert.Equal(-200m, currency.GetProperty("investing").GetDecimal());
        Assert.Equal(100m, currency.GetProperty("financing").GetDecimal());
        Assert.Equal(0m, currency.GetProperty("internalTransfers").GetDecimal());
        Assert.Equal(-25m, currency.GetProperty("unclassified").GetDecimal());
        Assert.Equal(1000m, currency.GetProperty("openingAdjustments").GetDecimal());
        Assert.Equal(1375m, currency.GetProperty("netChange").GetDecimal());
        Assert.Equal(1675m, currency.GetProperty("closingBalance").GetDecimal());
        Assert.True(currency.GetProperty("reconciles").GetBoolean());

        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantB.ToString());
        using var tenantBResponse = await client.GetAsync("/api/finance/general-ledger/financial-statements/cash-flow?from=2026-01-01&to=2026-01-31");
        Assert.True(tenantBResponse.IsSuccessStatusCode, await tenantBResponse.Content.ReadAsStringAsync());
        using var tenantBJson = JsonDocument.Parse(await tenantBResponse.Content.ReadAsStringAsync());
        Assert.Empty(tenantBJson.RootElement.GetProperty("currencies").EnumerateArray());
        Assert.Equal(0, tenantBJson.RootElement.GetProperty("unclassifiedMovementCount").GetInt32());
    }

    [Fact]
    public async Task Balance_sheet_uses_classified_tenant_postings_and_respects_as_of_date()
    {
        await using var app = await StartApplicationAsync();
        await AssertTenantSeededAsync(app, TenantA);
        using var client = app.GetTestClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync($"/api/finance/general-ledger/financial-statements/balance-sheet?asOfDate={AsOfDate:yyyy-MM-dd}")).StatusCode);
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());

        using var result = await client.GetAsync($"/api/finance/general-ledger/financial-statements/balance-sheet?asOfDate={AsOfDate:yyyy-MM-dd}");
        Assert.True(result.IsSuccessStatusCode, await result.Content.ReadAsStringAsync());
        using var json = JsonDocument.Parse(await result.Content.ReadAsStringAsync());
        var root = json.RootElement;
        var totals = root.GetProperty("totals");
        Assert.Equal("TRY", root.GetProperty("baseCurrencyCode").GetString());
        Assert.Equal(1000m, totals.GetProperty("assets").GetDecimal());
        Assert.Equal(200m, totals.GetProperty("liabilities").GetDecimal());
        Assert.Equal(450m, totals.GetProperty("equity").GetDecimal());
        Assert.Equal(400m, totals.GetProperty("revenue").GetDecimal());
        Assert.Equal(50m, totals.GetProperty("expenses").GetDecimal());
        Assert.Equal(350m, totals.GetProperty("cumulativeResult").GetDecimal());
        Assert.Equal(0m, totals.GetProperty("difference").GetDecimal());
        Assert.True(root.GetProperty("isComplete").GetBoolean());
        Assert.True(root.GetProperty("isBalanced").GetBoolean());
        Assert.Equal(5, root.GetProperty("accounts").GetArrayLength());

        var invalidRange = await client.GetAsync("/api/finance/general-ledger/financial-statements/balance-sheet?asOfDate=not-a-date");
        Assert.Equal(HttpStatusCode.BadRequest, invalidRange.StatusCode);
    }

    [Fact]
    public async Task Balance_sheet_flags_unclassified_posted_accounts_and_never_reads_another_tenant()
    {
        await using var app = await StartApplicationAsync(includeUnclassified: true);
        await AssertTenantSeededAsync(app, TenantA);
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        using (var response = await client.GetAsync($"/api/finance/general-ledger/financial-statements/balance-sheet?asOfDate={AsOfDate:yyyy-MM-dd}"))
        {
            Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
            using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            Assert.False(json.RootElement.GetProperty("isComplete").GetBoolean());
            Assert.False(json.RootElement.GetProperty("isBalanced").GetBoolean());
            Assert.Equal(1, json.RootElement.GetProperty("unclassifiedAccountCount").GetInt32());
        }
        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantB.ToString());
        using var tenantB = await client.GetAsync($"/api/finance/general-ledger/financial-statements/balance-sheet?asOfDate={AsOfDate:yyyy-MM-dd}");
        Assert.True(tenantB.IsSuccessStatusCode, await tenantB.Content.ReadAsStringAsync());
        using var tenantBJson = JsonDocument.Parse(await tenantB.Content.ReadAsStringAsync());
        Assert.Equal(1, tenantBJson.RootElement.GetProperty("accounts").GetArrayLength());
        Assert.Equal(0m, tenantBJson.RootElement.GetProperty("totals").GetProperty("assets").GetDecimal());
    }

    [Fact]
    public async Task Tms7_cash_flow_requires_account_classification_and_keeps_tenant_scope()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        using var before = await client.GetAsync("/api/finance/general-ledger/financial-statements/tms7/cash-flow?from=2026-12-31&to=2026-12-31");
        Assert.True(before.IsSuccessStatusCode, await before.Content.ReadAsStringAsync());
        using var beforeJson = JsonDocument.Parse(await before.Content.ReadAsStringAsync());
        Assert.Equal("TMS 7", beforeJson.RootElement.GetProperty("standard").GetString());
        Assert.Equal("Indirect", beforeJson.RootElement.GetProperty("method").GetString());
        Assert.False(beforeJson.RootElement.GetProperty("certified").GetBoolean());
        Assert.False(beforeJson.RootElement.GetProperty("isComplete").GetBoolean());
        Assert.Equal(3, beforeJson.RootElement.GetProperty("unclassifiedBalanceAccounts").GetArrayLength());

        using var accountsResponse = await client.GetAsync("/api/finance/general-ledger/financial-statements/tms7/cash-flow-classifications");
        Assert.True(accountsResponse.IsSuccessStatusCode, await accountsResponse.Content.ReadAsStringAsync());
        using var accountsJson = JsonDocument.Parse(await accountsResponse.Content.ReadAsStringAsync());
        var cashAccount = accountsJson.RootElement.EnumerateArray().Single(x => x.GetProperty("code").GetString() == "A100");
        var cashAccountId = cashAccount.GetProperty("id").GetGuid();
        using var wrongClass = await client.PutAsJsonAsync($"/api/finance/general-ledger/financial-statements/tms7/cash-flow-classifications/{cashAccountId}", new { classification = "WorkingCapitalLiability" });
        Assert.Equal(HttpStatusCode.BadRequest, wrongClass.StatusCode);
        using var update = await client.PutAsJsonAsync($"/api/finance/general-ledger/financial-statements/tms7/cash-flow-classifications/{cashAccountId}", new { classification = "CashEquivalent" });
        Assert.True(update.IsSuccessStatusCode, await update.Content.ReadAsStringAsync());
        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantB.ToString());
        using var tenantBAccounts = await client.GetAsync("/api/finance/general-ledger/financial-statements/tms7/cash-flow-classifications");
        Assert.True(tenantBAccounts.IsSuccessStatusCode, await tenantBAccounts.Content.ReadAsStringAsync());
        using var tenantBJson = JsonDocument.Parse(await tenantBAccounts.Content.ReadAsStringAsync());
        Assert.Single(tenantBJson.RootElement.EnumerateArray());
        Assert.All(tenantBJson.RootElement.EnumerateArray(), x => Assert.NotEqual(cashAccountId, x.GetProperty("id").GetGuid()));
    }

    private static async Task<WebApplication> StartApplicationAsync(bool includeUnclassified = false)
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        var databaseName = $"balance-sheet-{Guid.NewGuid():N}";
        var databaseRoot = new InMemoryDatabaseRoot();
        builder.Services.AddDbContext<TenantDbContext>(options => options.UseInMemoryDatabase(databaseName, databaseRoot));
        builder.Services.AddAuthentication("report-test").AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("report-test", _ => { });
        builder.Services.AddAuthorization();
        var app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapGroup("/api/finance/general-ledger").RequireAuthorization().MapBalanceSheetEndpoint();
        await app.StartAsync();
        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        await db.Database.EnsureCreatedAsync();
        var tenantA = new Tenant { Id = TenantA, Name = "A", Slug = "tenant-a", BaseCurrencyCode = "TRY" };
        var tenantB = new Tenant { Id = TenantB, Name = "B", Slug = "tenant-b", BaseCurrencyCode = "USD" };
        db.Tenants.AddRange(tenantA, tenantB);
        var cash = new FinancialAccount { TenantId = TenantA, Code = "CASH", Name = "Cash", Type = FinancialAccountType.Cash, CurrencyCode = "TRY" };
        db.FinancialAccounts.Add(cash);
        db.FinancialAccountTransactions.AddRange(
            new FinancialAccountTransaction { TenantId = TenantA, FinancialAccount = cash, CurrencyCode = "TRY", TransactionDate = new(2025, 12, 31), Direction = FinancialDirection.Inflow, CashFlowCategory = CashFlowCategory.Operating, Amount = 300m, Description = "Prior period" },
            new FinancialAccountTransaction { TenantId = TenantA, FinancialAccount = cash, CurrencyCode = "TRY", TransactionDate = new(2026, 1, 1), Direction = FinancialDirection.Inflow, CashFlowCategory = CashFlowCategory.OpeningBalance, Amount = 1000m, Description = "Opening balance" },
            new FinancialAccountTransaction { TenantId = TenantA, FinancialAccount = cash, CurrencyCode = "TRY", TransactionDate = new(2026, 1, 3), Direction = FinancialDirection.Inflow, CashFlowCategory = CashFlowCategory.Operating, Amount = 500m, Description = "Collection" },
            new FinancialAccountTransaction { TenantId = TenantA, FinancialAccount = cash, CurrencyCode = "TRY", TransactionDate = new(2026, 1, 4), Direction = FinancialDirection.Outflow, CashFlowCategory = CashFlowCategory.Investing, Amount = 200m, Description = "Equipment" },
            new FinancialAccountTransaction { TenantId = TenantA, FinancialAccount = cash, CurrencyCode = "TRY", TransactionDate = new(2026, 1, 5), Direction = FinancialDirection.Inflow, CashFlowCategory = CashFlowCategory.Financing, Amount = 100m, Description = "Financing" },
            new FinancialAccountTransaction { TenantId = TenantA, FinancialAccount = cash, CurrencyCode = "TRY", TransactionDate = new(2026, 1, 6), Direction = FinancialDirection.Outflow, CashFlowCategory = CashFlowCategory.InternalTransfer, Amount = 50m, Description = "Internal transfer out" },
            new FinancialAccountTransaction { TenantId = TenantA, FinancialAccount = cash, CurrencyCode = "TRY", TransactionDate = new(2026, 1, 6), Direction = FinancialDirection.Inflow, CashFlowCategory = CashFlowCategory.InternalTransfer, Amount = 50m, Description = "Internal transfer in" },
            new FinancialAccountTransaction { TenantId = TenantA, FinancialAccount = cash, CurrencyCode = "TRY", TransactionDate = new(2026, 1, 7), Direction = FinancialDirection.Outflow, CashFlowCategory = CashFlowCategory.Unclassified, Amount = 25m, Description = "Unclassified statement line" });
        var asset = new LedgerAccount { TenantId = TenantA, Code = "A100", Name = "Cash", StatementSection = LedgerAccountStatementSection.Asset };
        var liability = new LedgerAccount { TenantId = TenantA, Code = "L200", Name = "Payable", StatementSection = LedgerAccountStatementSection.Liability };
        var equity = new LedgerAccount { TenantId = TenantA, Code = "E300", Name = "Capital", StatementSection = LedgerAccountStatementSection.Equity };
        var revenue = new LedgerAccount { TenantId = TenantA, Code = "R400", Name = "Sales", StatementSection = LedgerAccountStatementSection.Revenue };
        var expense = new LedgerAccount { TenantId = TenantA, Code = "X500", Name = "Expense", StatementSection = LedgerAccountStatementSection.Expense };
        var foreignAsset = new LedgerAccount { TenantId = TenantB, Code = "A100", Name = "Other cash", StatementSection = LedgerAccountStatementSection.Asset };
        db.LedgerAccounts.AddRange(asset, liability, equity, revenue, expense, foreignAsset);
        var entry = new JournalEntry { TenantId = TenantA, Code = "JE-1", EntryDate = AsOfDate, Description = "Opening", SourceType = "Manual" };
        entry.Lines.Add(new JournalEntryLine { TenantId = TenantA, JournalEntryId = entry.Id, AccountId = asset.Id, LineNumber = 1, Debit = 1000m });
        entry.Lines.Add(new JournalEntryLine { TenantId = TenantA, JournalEntryId = entry.Id, AccountId = liability.Id, LineNumber = 2, Credit = 200m });
        entry.Lines.Add(new JournalEntryLine { TenantId = TenantA, JournalEntryId = entry.Id, AccountId = equity.Id, LineNumber = 3, Credit = 450m });
        entry.Lines.Add(new JournalEntryLine { TenantId = TenantA, JournalEntryId = entry.Id, AccountId = revenue.Id, LineNumber = 4, Credit = 400m });
        entry.Lines.Add(new JournalEntryLine { TenantId = TenantA, JournalEntryId = entry.Id, AccountId = expense.Id, LineNumber = 5, Debit = 50m });
        db.JournalEntries.Add(entry);
        var future = new JournalEntry { TenantId = TenantA, Code = "JE-FUTURE", EntryDate = AsOfDate.AddDays(1), Description = "Future", SourceType = "Manual" };
        future.Lines.Add(new JournalEntryLine { TenantId = TenantA, JournalEntryId = future.Id, AccountId = asset.Id, LineNumber = 1, Debit = 100m });
        future.Lines.Add(new JournalEntryLine { TenantId = TenantA, JournalEntryId = future.Id, AccountId = liability.Id, LineNumber = 2, Credit = 100m });
        db.JournalEntries.Add(future);
        if (includeUnclassified)
        {
            var unclassified = new LedgerAccount { TenantId = TenantA, Code = "U900", Name = "Unmapped", StatementSection = LedgerAccountStatementSection.Unclassified };
            db.LedgerAccounts.Add(unclassified);
            var unknownEntry = new JournalEntry { TenantId = TenantA, Code = "JE-UNKNOWN", EntryDate = AsOfDate, Description = "Unclassified", SourceType = "Manual" };
            unknownEntry.Lines.Add(new JournalEntryLine { TenantId = TenantA, JournalEntryId = unknownEntry.Id, AccountId = unclassified.Id, LineNumber = 1, Debit = 25m });
            unknownEntry.Lines.Add(new JournalEntryLine { TenantId = TenantA, JournalEntryId = unknownEntry.Id, AccountId = equity.Id, LineNumber = 2, Credit = 25m });
            db.JournalEntries.Add(unknownEntry);
        }
        await db.SaveChangesAsync();
        return app;
    }

    private static async Task AssertTenantSeededAsync(WebApplication app, Guid tenantId)
    {
        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        Assert.Equal("TRY", await db.Tenants.AsNoTracking().Where(x => x.Id == tenantId).Select(x => x.BaseCurrencyCode).SingleOrDefaultAsync());
    }
}
