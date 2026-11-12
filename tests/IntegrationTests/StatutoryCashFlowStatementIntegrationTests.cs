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

/// <summary>
/// Hand-computed TMS 7 indirect-method ledger (TRY, period 2026-01-01..2026-12-31).
///
/// Opening (2025-12-31): cash 100 = 1,000; machinery 253 = 2,000; accumulated depreciation 257 = (400);
/// capital 500 = (2,000); retained earnings 570 = (600). Opening cash = 1,000.
///
/// 2026 postings and the expected statement:
///   net profit = sales 5,000 + disposal gain 100 + FX gain 50 − COGS 3,000 − admin 300 − depreciation 200 − interest 80 = 1,570
///   adjustments = +200 depreciation − 100 disposal gain + 80 interest − 50 cash FX gain = +130
///   working capital = −800 receivables − 1,000 inventory + 500 payables = −1,300
///   operating = 1,570 + 130 − 1,300 = 400 (cross-check: collections 4,200 − supplier 3,500 − admin 300)
///   investing (253) = disposal receipt 450 − purchase 1,500 = −1,050
///   financing = loan 2,000 − repayment 500 − interest paid 80 + capital 1,000 = 2,420
///   FX effect on cash = +50
///   net change = 400 − 1,050 + 2,420 + 50 = 1,820; closing cash = 1,000 + 1,820 = 2,820
/// The 700 machine financed directly by the lender is a non-cash investing/financing transaction (TMS 7.43).
/// Fiscal close/opening entries and postings after the period end must not affect the statement.
/// </summary>
public sealed class StatutoryCashFlowStatementIntegrationTests
{
    private static readonly Guid TenantA = Guid.Parse("31111111-1111-1111-1111-111111111111");
    private static readonly Guid TenantB = Guid.Parse("32222222-2222-2222-2222-222222222222");
    private const string Route = "/api/finance/general-ledger/financial-statements/tms7/statement-of-cash-flows";

    [Fact]
    public async Task Indirect_statement_matches_hand_computed_ledger_and_reconciles_cash()
    {
        await using var app = await StartApplicationAsync(includeUnclassified: false);
        using var client = app.GetTestClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync($"{Route}?from=2026-01-01&to=2026-12-31")).StatusCode);
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());

        using var response = await client.GetAsync($"{Route}?from=2026-01-01&to=2026-12-31");
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = json.RootElement;
        Assert.Equal("TMS 7", root.GetProperty("standard").GetString());
        Assert.Equal("Indirect", root.GetProperty("method").GetString());
        Assert.Equal("TRY", root.GetProperty("baseCurrencyCode").GetString());
        Assert.False(root.GetProperty("certified").GetBoolean());
        Assert.False(root.GetProperty("accountantReviewed").GetBoolean());
        Assert.Equal(2, root.GetProperty("excludedFiscalCloseEntryCount").GetInt32());

        var operating = root.GetProperty("operating");
        Assert.Equal(1570m, operating.GetProperty("netProfitLoss").GetDecimal());
        Assert.Equal(130m, operating.GetProperty("adjustmentsTotal").GetDecimal());
        Assert.Equal(-1300m, operating.GetProperty("workingCapitalTotal").GetDecimal());
        Assert.Equal(400m, operating.GetProperty("netCashFlow").GetDecimal());
        var adjustments = Lines(operating.GetProperty("adjustments"), "amount");
        Assert.Equal(new Dictionary<string, decimal> { ["646"] = -50m, ["679"] = -100m, ["780"] = 80m, ["796"] = 200m }, adjustments);
        var workingCapital = Lines(operating.GetProperty("workingCapitalChanges"), "amount");
        Assert.Equal(new Dictionary<string, decimal> { ["120"] = -800m, ["153"] = -1000m, ["320"] = 500m }, workingCapital);

        var investing = root.GetProperty("investing");
        var machine = Assert.Single(investing.GetProperty("lines").EnumerateArray());
        Assert.Equal("253", machine.GetProperty("code").GetString());
        Assert.Equal(450m, machine.GetProperty("inflows").GetDecimal());
        Assert.Equal(1500m, machine.GetProperty("outflows").GetDecimal());
        Assert.Equal(-1050m, investing.GetProperty("netCashFlow").GetDecimal());

        var financing = root.GetProperty("financing");
        Assert.Equal(new Dictionary<string, decimal> { ["300"] = 1500m, ["500"] = 1000m, ["780"] = -80m },
            Lines(financing.GetProperty("lines"), "netCashFlow"));
        Assert.Equal(3000m, financing.GetProperty("inflows").GetDecimal());
        Assert.Equal(580m, financing.GetProperty("outflows").GetDecimal());
        Assert.Equal(2420m, financing.GetProperty("netCashFlow").GetDecimal());

        Assert.Equal(50m, root.GetProperty("effectOfExchangeRateChanges").GetDecimal());
        Assert.Equal(1820m, root.GetProperty("netChangeInCash").GetDecimal());
        var reconciliation = root.GetProperty("reconciliation");
        Assert.Equal(1000m, reconciliation.GetProperty("openingCashAndCashEquivalents").GetDecimal());
        Assert.Equal(1820m, reconciliation.GetProperty("netChangeInCash").GetDecimal());
        Assert.Equal(2820m, reconciliation.GetProperty("expectedClosingCashAndCashEquivalents").GetDecimal());
        Assert.Equal(2820m, reconciliation.GetProperty("closingCashAndCashEquivalents").GetDecimal());
        Assert.Equal(0m, reconciliation.GetProperty("difference").GetDecimal());
        Assert.True(reconciliation.GetProperty("reconciles").GetBoolean());
        Assert.Equal(reconciliation.GetProperty("openingCashAndCashEquivalents").GetDecimal() + root.GetProperty("netChangeInCash").GetDecimal(),
            reconciliation.GetProperty("closingCashAndCashEquivalents").GetDecimal());

        var nonCash = Assert.Single(root.GetProperty("nonCashInvestingFinancingEntries").EnumerateArray());
        Assert.Equal("JE-13", nonCash.GetProperty("entryCode").GetString());
        Assert.Empty(root.GetProperty("warnings").EnumerateArray());
        Assert.True(root.GetProperty("isComplete").GetBoolean());

        using var invalidBasis = await client.GetAsync($"{Route}?basis=Other");
        Assert.Equal(HttpStatusCode.BadRequest, invalidBasis.StatusCode);
        using var invalidRange = await client.GetAsync($"{Route}?from=2026-12-31&to=2026-01-01");
        Assert.Equal(HttpStatusCode.BadRequest, invalidRange.StatusCode);

        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantB.ToString());
        using var tenantB = await client.GetAsync($"{Route}?from=2026-01-01&to=2026-12-31");
        Assert.True(tenantB.IsSuccessStatusCode, await tenantB.Content.ReadAsStringAsync());
        using var tenantBJson = JsonDocument.Parse(await tenantB.Content.ReadAsStringAsync());
        Assert.Equal(9000m, tenantBJson.RootElement.GetProperty("operating").GetProperty("netProfitLoss").GetDecimal());
        Assert.Equal(0m, tenantBJson.RootElement.GetProperty("reconciliation").GetProperty("closingCashAndCashEquivalents").GetDecimal());
        Assert.Contains(tenantBJson.RootElement.GetProperty("warnings").EnumerateArray(),
            x => x.GetProperty("code").GetString() == "NoCashEquivalentAccounts");
    }

    [Fact]
    public async Task Unclassified_accounts_and_missing_fx_rates_are_explicit_warnings_not_dropped()
    {
        await using var app = await StartApplicationAsync(includeUnclassified: true);
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());

        using var response = await client.GetAsync($"{Route}?from=2026-01-01&to=2026-12-31");
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = json.RootElement;
        Assert.False(root.GetProperty("isComplete").GetBoolean());

        // Extra postings: 2025 USD bank deposit 300 against capital (opening cash 1,300);
        // 2026 advance 136 paid 75 from the bank (unclassified asset) and other income 649 of 25 received in cash.
        Assert.Equal(1595m, root.GetProperty("operating").GetProperty("netProfitLoss").GetDecimal());
        Assert.Equal(425m, root.GetProperty("operating").GetProperty("netCashFlow").GetDecimal());
        var reconciliation = root.GetProperty("reconciliation");
        Assert.Equal(1300m, reconciliation.GetProperty("openingCashAndCashEquivalents").GetDecimal());
        Assert.Equal(1845m, reconciliation.GetProperty("netChangeInCash").GetDecimal());
        Assert.Equal(3070m, reconciliation.GetProperty("closingCashAndCashEquivalents").GetDecimal());
        Assert.Equal(-75m, reconciliation.GetProperty("difference").GetDecimal());
        Assert.False(reconciliation.GetProperty("reconciles").GetBoolean());

        var warnings = root.GetProperty("warnings").EnumerateArray().ToDictionary(x => x.GetProperty("code").GetString()!);
        var unclassified = warnings["UnclassifiedAccounts"].GetProperty("accounts").EnumerateArray()
            .ToDictionary(x => x.GetProperty("code").GetString()!, x => x.GetProperty("periodMovement").GetDecimal());
        Assert.Equal(new Dictionary<string, decimal> { ["136"] = 75m, ["649"] = -25m }, unclassified);
        var missingRate = Assert.Single(warnings["ForeignCurrencyRateMissing"].GetProperty("accounts").EnumerateArray());
        Assert.Equal("103", missingRate.GetProperty("code").GetString());
        Assert.Equal("USD", missingRate.GetProperty("currencyCode").GetString());
        Assert.True(warnings.ContainsKey("ReconciliationDifference"));
        var cashAccount = root.GetProperty("cashAccounts").EnumerateArray().Single(x => x.GetProperty("code").GetString() == "103");
        Assert.Equal(300m, cashAccount.GetProperty("closingBalance").GetDecimal());
    }

    [Fact]
    public async Task New_classifications_validate_against_ledger_section()
    {
        await using var app = await StartApplicationAsync(includeUnclassified: true);
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        Guid IdOf(string code)
        {
            using var scope = app.Services.CreateScope();
            return scope.ServiceProvider.GetRequiredService<TenantDbContext>().LedgerAccounts.Single(x => x.TenantId == TenantA && x.Code == code).Id;
        }
        const string classificationRoute = "/api/finance/general-ledger/financial-statements/tms7/cash-flow-classifications";
        using var wrong = await client.PutAsJsonAsync($"{classificationRoute}/{IdOf("136")}", new { classification = "FinancingEquity" });
        Assert.Equal(HttpStatusCode.BadRequest, wrong.StatusCode);
        using var investingAsset = await client.PutAsJsonAsync($"{classificationRoute}/{IdOf("136")}", new { classification = "InvestingAsset" });
        Assert.True(investingAsset.IsSuccessStatusCode, await investingAsset.Content.ReadAsStringAsync());
        // Regression: expense accounts may stay in the profit/loss base (previously rejected).
        using var expenseBase = await client.PutAsJsonAsync($"{classificationRoute}/{IdOf("770")}", new { classification = "ProfitLossBase" });
        Assert.True(expenseBase.IsSuccessStatusCode, await expenseBase.Content.ReadAsStringAsync());
        using var exchange = await client.PutAsJsonAsync($"{classificationRoute}/{IdOf("649")}", new { classification = "ExchangeDifference" });
        Assert.True(exchange.IsSuccessStatusCode, await exchange.Content.ReadAsStringAsync());

        // 136 now presents the 75 advance as an investing outflow and 649 as cash FX effect;
        // only the missing USD rate warning remains and the statement reconciles.
        using var response = await client.GetAsync($"{Route}?from=2026-01-01&to=2026-12-31");
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = json.RootElement;
        Assert.Equal(-1125m, root.GetProperty("investing").GetProperty("netCashFlow").GetDecimal());
        Assert.Equal(75m, root.GetProperty("effectOfExchangeRateChanges").GetDecimal());
        Assert.True(root.GetProperty("reconciliation").GetProperty("reconciles").GetBoolean());
        var warning = Assert.Single(root.GetProperty("warnings").EnumerateArray());
        Assert.Equal("ForeignCurrencyRateMissing", warning.GetProperty("code").GetString());
    }

    private static Dictionary<string, decimal> Lines(JsonElement array, string property) =>
        array.EnumerateArray().ToDictionary(x => x.GetProperty("code").GetString()!, x => x.GetProperty(property).GetDecimal());

    private static async Task<WebApplication> StartApplicationAsync(bool includeUnclassified)
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        var databaseName = $"statutory-cash-flow-{Guid.NewGuid():N}";
        var databaseRoot = new InMemoryDatabaseRoot();
        builder.Services.AddDbContext<TenantDbContext>(options => options.UseInMemoryDatabase(databaseName, databaseRoot));
        builder.Services.AddAuthentication("report-test").AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("report-test", _ => { });
        builder.Services.AddAuthorization();
        var app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();
        var group = app.MapGroup("/api/finance/general-ledger").RequireAuthorization();
        group.MapBalanceSheetEndpoint();
        group.MapStatutoryCashFlowStatementEndpoint();
        await app.StartAsync();

        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        await db.Database.EnsureCreatedAsync();
        db.Tenants.AddRange(new Tenant { Id = TenantA, Name = "A", Slug = "tenant-a", BaseCurrencyCode = "TRY" },
            new Tenant { Id = TenantB, Name = "B", Slug = "tenant-b", BaseCurrencyCode = "TRY" });

        var accounts = new Dictionary<string, LedgerAccount>();
        LedgerAccount Account(string code, LedgerAccountStatementSection section, CashFlowStatementClassification? classification, string? currency = null)
        {
            var account = new LedgerAccount { TenantId = TenantA, Code = code, Name = $"Hesap {code}", StatementSection = section, CurrencyCode = currency };
            accounts[code] = account;
            db.LedgerAccounts.Add(account);
            if (classification is { } value)
                db.LedgerAccountMappings.Add(new LedgerAccountMapping { TenantId = TenantA, AccountId = account.Id,
                    MappingKey = $"financial-statement.cash-flow-classification:{account.Id:D}:{value}" });
            return account;
        }
        const LedgerAccountStatementSection A = LedgerAccountStatementSection.Asset, L = LedgerAccountStatementSection.Liability,
            E = LedgerAccountStatementSection.Equity, R = LedgerAccountStatementSection.Revenue, X = LedgerAccountStatementSection.Expense;
        Account("100", A, CashFlowStatementClassification.CashEquivalent);
        Account("102", A, CashFlowStatementClassification.CashEquivalent);
        Account("120", A, CashFlowStatementClassification.WorkingCapitalAsset);
        Account("153", A, CashFlowStatementClassification.WorkingCapitalAsset);
        Account("253", A, CashFlowStatementClassification.InvestingAsset);
        Account("257", A, CashFlowStatementClassification.InvestingAsset);
        Account("300", L, CashFlowStatementClassification.FinancingLiability);
        Account("320", L, CashFlowStatementClassification.WorkingCapitalLiability);
        Account("500", E, CashFlowStatementClassification.FinancingEquity);
        Account("570", E, CashFlowStatementClassification.Excluded);
        Account("600", R, CashFlowStatementClassification.ProfitLossBase);
        Account("646", R, CashFlowStatementClassification.ExchangeDifference);
        Account("679", R, CashFlowStatementClassification.InvestingGain);
        Account("621", X, CashFlowStatementClassification.ProfitLossBase);
        Account("770", X, CashFlowStatementClassification.ProfitLossBase);
        Account("780", X, CashFlowStatementClassification.FinancingLoss);
        Account("796", X, CashFlowStatementClassification.NonCashExpense);

        void Post(string code, DateOnly date, string sourceType, params (string Account, decimal Debit, decimal Credit)[] lines)
        {
            var entry = new JournalEntry { TenantId = TenantA, Code = code, EntryDate = date, Description = code, SourceType = sourceType };
            var lineNumber = 0;
            foreach (var (account, debit, credit) in lines)
                entry.Lines.Add(new JournalEntryLine { TenantId = TenantA, JournalEntryId = entry.Id, AccountId = accounts[account].Id,
                    LineNumber = ++lineNumber, Debit = debit, Credit = credit });
            Assert.Equal(entry.Lines.Sum(x => x.Debit), entry.Lines.Sum(x => x.Credit));
            db.JournalEntries.Add(entry);
        }
        DateOnly D(int month, int day) => new(2026, month, day);
        Post("JE-OPEN", new DateOnly(2025, 12, 31), "Manual", ("100", 1000m, 0), ("253", 2000m, 0), ("257", 0, 400m), ("500", 0, 2000m), ("570", 0, 600m));
        Post("JE-00", D(1, 10), "Manual", ("153", 4000m, 0), ("320", 0, 4000m));
        Post("JE-01", D(2, 1), "Manual", ("120", 5000m, 0), ("600", 0, 5000m));
        Post("JE-02", D(2, 1), "Manual", ("621", 3000m, 0), ("153", 0, 3000m));
        Post("JE-03", D(3, 1), "Manual", ("102", 4200m, 0), ("120", 0, 4200m));
        Post("JE-04", D(3, 5), "Manual", ("320", 3500m, 0), ("102", 0, 3500m));
        Post("JE-05", D(4, 1), "Manual", ("770", 300m, 0), ("100", 0, 300m));
        Post("JE-06", D(12, 31), "FixedAssetDepreciation", ("796", 200m, 0), ("257", 0, 200m));
        Post("JE-07", D(5, 1), "FixedAssetAcquisition", ("253", 1500m, 0), ("102", 0, 1500m));
        Post("JE-08", D(6, 1), "FixedAssetDisposal", ("102", 450m, 0), ("257", 150m, 0), ("253", 0, 500m), ("679", 0, 100m));
        Post("JE-09", D(6, 15), "Manual", ("102", 2000m, 0), ("300", 0, 2000m));
        Post("JE-10", D(9, 15), "Manual", ("300", 500m, 0), ("780", 80m, 0), ("102", 0, 580m));
        Post("JE-11", D(10, 1), "Manual", ("102", 1000m, 0), ("500", 0, 1000m));
        Post("JE-12", D(12, 31), "Manual", ("102", 50m, 0), ("646", 0, 50m));
        Post("JE-13", D(11, 1), "Manual", ("253", 700m, 0), ("300", 0, 700m));
        Post("FY-CLOSE", D(12, 31), "FiscalYearClose", ("600", 5000m, 0), ("570", 0, 5000m));
        Post("FY-OPEN", D(1, 1), "FiscalYearOpening", ("100", 1000m, 0), ("570", 0, 1000m));
        Post("JE-LATER", new DateOnly(2027, 1, 5), "Manual", ("100", 999m, 0), ("600", 0, 999m));
        if (includeUnclassified)
        {
            Account("103", A, CashFlowStatementClassification.CashEquivalent, "USD");
            Account("136", A, null);
            Account("649", R, null);
            Post("JE-USD", new DateOnly(2025, 12, 31), "Manual", ("103", 300m, 0), ("500", 0, 300m));
            Post("JE-U1", D(7, 1), "Manual", ("136", 75m, 0), ("102", 0, 75m));
            Post("JE-U2", D(7, 2), "Manual", ("100", 25m, 0), ("649", 0, 25m));
        }

        var otherCash = new LedgerAccount { TenantId = TenantB, Code = "100", Name = "Other cash", StatementSection = A };
        var otherSales = new LedgerAccount { TenantId = TenantB, Code = "600", Name = "Other sales", StatementSection = R };
        db.LedgerAccounts.AddRange(otherCash, otherSales);
        var otherEntry = new JournalEntry { TenantId = TenantB, Code = "B-1", EntryDate = D(3, 1), Description = "Other tenant", SourceType = "Manual" };
        otherEntry.Lines.Add(new JournalEntryLine { TenantId = TenantB, JournalEntryId = otherEntry.Id, AccountId = otherCash.Id, LineNumber = 1, Debit = 9000m });
        otherEntry.Lines.Add(new JournalEntryLine { TenantId = TenantB, JournalEntryId = otherEntry.Id, AccountId = otherSales.Id, LineNumber = 2, Credit = 9000m });
        db.JournalEntries.Add(otherEntry);
        await db.SaveChangesAsync();
        return app;
    }
}
