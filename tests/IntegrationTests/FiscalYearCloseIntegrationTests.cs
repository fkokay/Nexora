using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Encodings.Web;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Xunit;

namespace AIERP.Api.IntegrationTests;

public sealed class FiscalYearCloseIntegrationTests
{
    private static readonly Guid TenantA = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid TenantB = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid CashId = Guid.Parse("aaaaaaaa-0000-0000-0000-000000000001");
    private static readonly Guid CapitalId = Guid.Parse("aaaaaaaa-0000-0000-0000-000000000002");
    private static readonly Guid RetainedEarningsId = Guid.Parse("aaaaaaaa-0000-0000-0000-000000000003");
    private static readonly Guid RevenueId = Guid.Parse("aaaaaaaa-0000-0000-0000-000000000004");
    private static readonly Guid ExpenseId = Guid.Parse("aaaaaaaa-0000-0000-0000-000000000005");

    [Fact]
    public async Task Close_posts_balanced_profit_close_and_opening_balances_once_per_tenant()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            var seededRetained = await db.LedgerAccounts.SingleAsync(x => x.TenantId == TenantA && x.Id == RetainedEarningsId);
            Assert.Equal(LedgerAccountStatementSection.Equity, seededRetained.StatementSection);
            Assert.True(seededRetained.IsActive);
        }

        var request = Request();
        using var response = await client.PostAsJsonAsync("/api/finance/general-ledger/fiscal-year-close", request);
        Assert.True(response.StatusCode == HttpStatusCode.Created, $"Expected Created, got {(int)response.StatusCode}: {await response.Content.ReadAsStringAsync()} request={System.Text.Json.JsonSerializer.Serialize(request)}");
        var result = await response.Content.ReadFromJsonAsync<CloseResult>();
        Assert.NotNull(result);
        Assert.Equal(120m, result!.ClosingEntry.TotalDebit);
        Assert.Equal(result.ClosingEntry.TotalDebit, result.ClosingEntry.TotalCredit);
        Assert.Equal(1090m, result.OpeningEntry.TotalDebit);
        Assert.Equal(result.OpeningEntry.TotalDebit, result.OpeningEntry.TotalCredit);
        Assert.Equal(new DateOnly(2027, 1, 1), result.OpeningEntry.EntryDate);
        Assert.Equal(3, result.CarriedAccountCount);

        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            var closed = await FiscalYearCloseEndpoints.FindClosedPeriodAsync(db, TenantA, new DateOnly(2026, 6, 15));
            Assert.Equal((new DateOnly(2026, 1, 1), new DateOnly(2026, 12, 31)), closed);
            var movementConflict = FiscalYearCloseEndpoints.CreateClosedPeriodConflict(closed, "finans hareketi");
            Assert.NotNull(movementConflict);
            Assert.Equal((int)HttpStatusCode.Conflict,
                Assert.IsAssignableFrom<Microsoft.AspNetCore.Http.IStatusCodeHttpResult>(movementConflict).StatusCode);
            Assert.Null(FiscalYearCloseEndpoints.CreateClosedPeriodConflict(
                await FiscalYearCloseEndpoints.FindClosedPeriodAsync(db, TenantA, new DateOnly(2027, 1, 1)), "finans hareketi"));
            Assert.Null(await FiscalYearCloseEndpoints.FindClosedPeriodAsync(db, TenantA, new DateOnly(2027, 1, 1)));
            Assert.Null(await FiscalYearCloseEndpoints.FindClosedPeriodAsync(db, TenantB, new DateOnly(2026, 6, 15)));
        }

        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            var opening = await db.JournalEntries.Include(x => x.Lines).SingleAsync(x => x.TenantId == TenantA && x.SourceType == "FiscalYearOpening");
            Assert.DoesNotContain(opening.Lines, x => x.AccountId == RevenueId || x.AccountId == ExpenseId);
            Assert.Equal(1090m, opening.Lines.Single(x => x.AccountId == CashId).Debit);
            Assert.Equal(1000m, opening.Lines.Single(x => x.AccountId == CapitalId).Credit);
            Assert.Equal(90m, opening.Lines.Single(x => x.AccountId == RetainedEarningsId).Credit);
        }

        using var duplicate = await client.PostAsJsonAsync("/api/finance/general-ledger/fiscal-year-close", Request());
        Assert.Equal(HttpStatusCode.Conflict, duplicate.StatusCode);
        using var outOfOrder = await client.PostAsJsonAsync("/api/finance/general-ledger/fiscal-year-close",
            Request(new DateOnly(2024, 1, 1), new DateOnly(2024, 12, 31)));
        Assert.Equal(HttpStatusCode.Conflict, outOfOrder.StatusCode);
        using var overlap = await client.PostAsJsonAsync("/api/finance/general-ledger/fiscal-year-close", Request(new DateOnly(2025, 12, 1), new DateOnly(2026, 6, 30)));
        Assert.Equal(HttpStatusCode.Conflict, overlap.StatusCode);

        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantB.ToString());
        using var foreignAccount = await client.PostAsJsonAsync("/api/finance/general-ledger/fiscal-year-close", Request(retainedEarningsAccountId: RetainedEarningsId));
        Assert.Equal(HttpStatusCode.BadRequest, foreignAccount.StatusCode);
    }

    [Fact]
    public async Task Close_rejects_invalid_range_and_non_admin_user()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        using var invalid = await client.PostAsJsonAsync("/api/finance/general-ledger/fiscal-year-close", Request(new DateOnly(2026, 2, 1), new DateOnly(2026, 1, 1)));
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);

        client.DefaultRequestHeaders.Add("X-Test-Role", "TenantUser");
        using var forbidden = await client.PostAsJsonAsync("/api/finance/general-ledger/fiscal-year-close", Request());
        Assert.Equal(HttpStatusCode.Forbidden, forbidden.StatusCode);
    }

    private static object Request(DateOnly? from = null, DateOnly? to = null, Guid? retainedEarningsAccountId = null) => new
    {
        fromDate = from ?? new DateOnly(2026, 1, 1), toDate = to ?? new DateOnly(2026, 12, 31),
        retainedEarningsAccountId = retainedEarningsAccountId ?? RetainedEarningsId
    };

    private static async Task<WebApplication> StartApplicationAsync()
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        var databaseName = $"fiscal-close-{Guid.NewGuid():N}";
        var root = new InMemoryDatabaseRoot();
        builder.Services.AddDbContext<TenantDbContext>(options => options.UseInMemoryDatabase(databaseName, root));
        builder.Services.AddAuthentication("fiscal-close-test").AddScheme<AuthenticationSchemeOptions, FiscalCloseTestAuthenticationHandler>("fiscal-close-test", _ => { });
        builder.Services.AddAuthorization();
        var app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapGroup("/api/finance/general-ledger").RequireAuthorization().MapFiscalYearCloseEndpoints();
        await app.StartAsync();
        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        await db.Database.EnsureCreatedAsync();
        db.Tenants.AddRange(new Tenant { Id = TenantA, Name = "A", Slug = "tenant-a" }, new Tenant { Id = TenantB, Name = "B", Slug = "tenant-b" });
        var cash = new LedgerAccount { Id = CashId, TenantId = TenantA, Code = "1000", Name = "Cash", StatementSection = LedgerAccountStatementSection.Asset };
        var capital = new LedgerAccount { Id = CapitalId, TenantId = TenantA, Code = "3000", Name = "Capital", StatementSection = LedgerAccountStatementSection.Equity };
        var retained = new LedgerAccount { Id = RetainedEarningsId, TenantId = TenantA, Code = "3900", Name = "Retained earnings", StatementSection = LedgerAccountStatementSection.Equity };
        var revenue = new LedgerAccount { Id = RevenueId, TenantId = TenantA, Code = "6000", Name = "Revenue", StatementSection = LedgerAccountStatementSection.Revenue };
        var expense = new LedgerAccount { Id = ExpenseId, TenantId = TenantA, Code = "7000", Name = "Expense", StatementSection = LedgerAccountStatementSection.Expense };
        var foreignRetained = new LedgerAccount { Id = Guid.Parse("bbbbbbbb-0000-0000-0000-000000000003"), TenantId = TenantB, Code = "3900", Name = "Other retained", StatementSection = LedgerAccountStatementSection.Equity };
        db.LedgerAccounts.AddRange(cash, capital, retained, revenue, expense, foreignRetained);
        AddEntry(db, TenantA, "OPEN-2025", new DateOnly(2025, 12, 31), (cash, 1000m, 0m), (capital, 0m, 1000m));
        AddEntry(db, TenantA, "SALES-2026", new DateOnly(2026, 6, 1), (cash, 120m, 0m), (revenue, 0m, 120m));
        AddEntry(db, TenantA, "COST-2026", new DateOnly(2026, 7, 1), (expense, 30m, 0m), (cash, 0m, 30m));
        await db.SaveChangesAsync();
        return app;
    }

    private static void AddEntry(TenantDbContext db, Guid tenantId, string code, DateOnly date,
        params (LedgerAccount Account, decimal Debit, decimal Credit)[] lines)
    {
        var entry = new JournalEntry { TenantId = tenantId, Code = code, EntryDate = date, Description = code, SourceType = "Manual", SourceId = Guid.NewGuid() };
        var number = 1;
        foreach (var (account, debit, credit) in lines)
            entry.Lines.Add(new JournalEntryLine { TenantId = tenantId, JournalEntryId = entry.Id, AccountId = account.Id,
                LineNumber = number++, Debit = debit, Credit = credit });
        db.JournalEntries.Add(entry);
    }

    private sealed record CloseResult(CloseEntry ClosingEntry, OpenEntry OpeningEntry, int CarriedAccountCount);
    private sealed record CloseEntry(Guid Id, string Code, decimal TotalDebit, decimal TotalCredit);
    private sealed record OpenEntry(Guid Id, string Code, DateOnly EntryDate, decimal TotalDebit, decimal TotalCredit);
}

internal sealed class FiscalCloseTestAuthenticationHandler(
    IOptionsMonitor<AuthenticationSchemeOptions> options,
    ILoggerFactory logger,
    UrlEncoder encoder)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (!Guid.TryParse(Request.Headers["X-Test-Tenant"], out var tenantId)) return Task.FromResult(AuthenticateResult.NoResult());
        var claims = new[]
        {
            new Claim("tenant_id", tenantId.ToString()),
            new Claim("sub", Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa").ToString()),
            new Claim("role", Request.Headers["X-Test-Role"].FirstOrDefault() ?? "TenantAdmin")
        };
        var identity = new ClaimsIdentity(claims, Scheme.Name);
        return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), Scheme.Name)));
    }
}
