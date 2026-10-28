using System.Net;
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

public sealed class TrialBalanceIntegrationTests
{
    private static readonly Guid TenantA = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid TenantB = Guid.Parse("22222222-2222-2222-2222-222222222222");

    [Fact]
    public async Task Trial_balance_separates_opening_period_and_closing_amounts_by_tenant()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/finance/general-ledger/trial-balance")).StatusCode);
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());

        using var response = await client.GetAsync("/api/finance/general-ledger/trial-balance?from=2026-01-01&to=2026-01-31");
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = json.RootElement;
        Assert.Equal(1000m, root.GetProperty("totalOpeningDebit").GetDecimal());
        Assert.Equal(1000m, root.GetProperty("totalOpeningCredit").GetDecimal());
        Assert.Equal(200m, root.GetProperty("totalDebit").GetDecimal());
        Assert.Equal(200m, root.GetProperty("totalCredit").GetDecimal());
        Assert.Equal(1000m, root.GetProperty("totalBalanceDebit").GetDecimal());
        Assert.Equal(1000m, root.GetProperty("totalBalanceCredit").GetDecimal());
        Assert.True(root.GetProperty("isBalanced").GetBoolean());
        Assert.Equal(3, root.GetProperty("accounts").GetArrayLength());
        var cash = root.GetProperty("accounts").EnumerateArray().Single(x => x.GetProperty("code").GetString() == "1000");
        Assert.Equal(1000m, cash.GetProperty("openingDebit").GetDecimal());
        Assert.Equal(200m, cash.GetProperty("credit").GetDecimal());
        Assert.Equal(800m, cash.GetProperty("balanceDebit").GetDecimal());
        Assert.Equal(0m, cash.GetProperty("balanceCredit").GetDecimal());

        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantB.ToString());
        using var tenantB = await client.GetAsync("/api/finance/general-ledger/trial-balance?from=2026-01-01&to=2026-01-31");
        Assert.True(tenantB.IsSuccessStatusCode, await tenantB.Content.ReadAsStringAsync());
        using var tenantBJson = JsonDocument.Parse(await tenantB.Content.ReadAsStringAsync());
        Assert.Equal(1, tenantBJson.RootElement.GetProperty("accounts").GetArrayLength());
        Assert.Equal(500m, tenantBJson.RootElement.GetProperty("totalDebit").GetDecimal());
    }

    [Fact]
    public async Task Trial_balance_rejects_reversed_date_range()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        using var response = await client.GetAsync("/api/finance/general-ledger/trial-balance?from=2026-02-01&to=2026-01-01");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Ledger_account_statement_returns_opening_period_totals_and_paged_tenant_lines()
    {
        await using var app = await StartApplicationAsync();
        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        var accountId = await db.LedgerAccounts.AsNoTracking().Where(x => x.TenantId == TenantA && x.Code == "1000")
            .Select(x => x.Id).SingleAsync();

        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        using var response = await client.GetAsync($"/api/finance/general-ledger/accounts/{accountId}/statement?from=2026-01-01&to=2026-01-31&page=1&pageSize=1");
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = json.RootElement;
        Assert.Equal("1000", root.GetProperty("account").GetProperty("code").GetString());
        Assert.Equal(1000m, root.GetProperty("openingDebit").GetDecimal());
        Assert.Equal(1000m, root.GetProperty("openingBalanceDebit").GetDecimal());
        Assert.Equal(0m, root.GetProperty("openingBalanceCredit").GetDecimal());
        Assert.Equal(0m, root.GetProperty("totalDebit").GetDecimal());
        Assert.Equal(200m, root.GetProperty("totalCredit").GetDecimal());
        Assert.Equal(1, root.GetProperty("totalCount").GetInt32());
        Assert.Equal(1, root.GetProperty("totalPages").GetInt32());
        var line = Assert.Single(root.GetProperty("lines").EnumerateArray());
        Assert.Equal("PERIOD", line.GetProperty("journalEntryCode").GetString());
        Assert.Equal(200m, line.GetProperty("credit").GetDecimal());
        Assert.Equal(800m, root.GetProperty("closingBalanceDebit").GetDecimal());

        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantB.ToString());
        using var crossTenant = await client.GetAsync($"/api/finance/general-ledger/accounts/{accountId}/statement");
        Assert.Equal(HttpStatusCode.NotFound, crossTenant.StatusCode);
    }

    [Fact]
    public async Task Ledger_account_statement_rejects_invalid_date_range_and_paging()
    {
        await using var app = await StartApplicationAsync();
        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        var accountId = await db.LedgerAccounts.AsNoTracking().Where(x => x.TenantId == TenantA && x.Code == "1000")
            .Select(x => x.Id).SingleAsync();
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());

        using var invalidDates = await client.GetAsync($"/api/finance/general-ledger/accounts/{accountId}/statement?from=2026-02-01&to=2026-01-01");
        Assert.Equal(HttpStatusCode.BadRequest, invalidDates.StatusCode);
        using var invalidPageSize = await client.GetAsync($"/api/finance/general-ledger/accounts/{accountId}/statement?pageSize=201");
        Assert.Equal(HttpStatusCode.BadRequest, invalidPageSize.StatusCode);
    }

    private static async Task<WebApplication> StartApplicationAsync()
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        var databaseName = $"trial-balance-{Guid.NewGuid():N}";
        var root = new InMemoryDatabaseRoot();
        builder.Services.AddDbContext<TenantDbContext>(options => options.UseInMemoryDatabase(databaseName, root));
        builder.Services.AddAuthentication("report-test").AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("report-test", _ => { });
        builder.Services.AddAuthorization();
        var app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();
        var generalLedger = app.MapGroup("/api/finance/general-ledger").RequireAuthorization();
        generalLedger.MapTrialBalanceEndpoint();
        generalLedger.MapLedgerAccountStatementEndpoint();
        await app.StartAsync();
        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        await db.Database.EnsureCreatedAsync();
        db.Tenants.AddRange(new Tenant { Id = TenantA, Name = "A", Slug = "tenant-a" }, new Tenant { Id = TenantB, Name = "B", Slug = "tenant-b" });
        var cashA = new LedgerAccount { TenantId = TenantA, Code = "1000", Name = "Cash" };
        var equityA = new LedgerAccount { TenantId = TenantA, Code = "3000", Name = "Equity" };
        var expenseA = new LedgerAccount { TenantId = TenantA, Code = "6000", Name = "Expense" };
        var cashB = new LedgerAccount { TenantId = TenantB, Code = "1000", Name = "Other cash" };
        db.LedgerAccounts.AddRange(cashA, equityA, expenseA, cashB);
        AddEntry(db, TenantA, "OPEN", new DateOnly(2025, 12, 31), (cashA, 1000m, 0m), (equityA, 0m, 1000m));
        AddEntry(db, TenantA, "PERIOD", new DateOnly(2026, 1, 15), (expenseA, 200m, 0m), (cashA, 0m, 200m));
        AddEntry(db, TenantA, "FUTURE", new DateOnly(2026, 3, 1), (cashA, 50m, 0m), (expenseA, 0m, 50m));
        AddEntry(db, TenantB, "OTHER", new DateOnly(2026, 1, 15), (cashB, 500m, 0m), (cashB, 0m, 500m));
        await db.SaveChangesAsync();
        return app;
    }

    private static void AddEntry(TenantDbContext db, Guid tenantId, string code, DateOnly date,
        params (LedgerAccount Account, decimal Debit, decimal Credit)[] lines)
    {
        var entry = new JournalEntry { TenantId = tenantId, Code = code, EntryDate = date, Description = code, SourceType = "Manual" };
        var number = 1;
        foreach (var (account, debit, credit) in lines)
            entry.Lines.Add(new JournalEntryLine { TenantId = tenantId, JournalEntryId = entry.Id, AccountId = account.Id,
                LineNumber = number++, Debit = debit, Credit = credit });
        db.JournalEntries.Add(entry);
    }
}
