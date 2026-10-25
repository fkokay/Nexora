using System.Net;
using System.Net.Http.Json;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace AIERP.Api.IntegrationTests;

[Collection("SQL Server acceptance")]
public sealed class CreditFacilityFiscalCloseRouteSqlAcceptanceTests
{
    [SqlServerAcceptanceFact]
    public async Task Credit_facility_drawdown_serializes_with_fiscal_close_and_closed_period_has_no_side_effects()
    {
        var configuredConnection = Environment.GetEnvironmentVariable("AIERP_REPORT_TEST_SQL_CONNECTION_STRING");
        Assert.False(string.IsNullOrWhiteSpace(configuredConnection));
        var tenantId = Guid.NewGuid();
        var suffix = Guid.NewGuid().ToString("N");
        var databaseName = $"AIERP_CreditCloseAcceptance_{suffix}";
        var connectionString = new SqlConnectionStringBuilder(configuredConnection)
        {
            InitialCatalog = databaseName,
            ConnectTimeout = 15,
            TrustServerCertificate = true
        }.ConnectionString;
        var options = new DbContextOptionsBuilder<TenantDbContext>().UseSqlServer(connectionString).Options;
        await using var seedDb = new TenantDbContext(options);
        var databaseCreated = false;
        var triggerCreated = false;
        try
        {
            databaseCreated = await seedDb.Database.EnsureCreatedAsync();
            Assert.True(databaseCreated);

            var tenant = new Tenant { Id = tenantId, Name = "Synthetic credit close", Slug = $"credit-close-{suffix}", BaseCurrencyCode = "TRY" };
            var bank = new FinancialAccount { TenantId = tenantId, Tenant = tenant, Code = "BANK-1", Name = "Synthetic bank",
                Type = FinancialAccountType.Bank, CurrencyCode = "TRY" };
            var bankLedger = Account(tenantId, "102", "Bank", LedgerAccountStatementSection.Asset);
            var principalLedger = Account(tenantId, "300", "Credit principal", LedgerAccountStatementSection.Liability);
            var capitalLedger = Account(tenantId, "500", "Capital", LedgerAccountStatementSection.Equity);
            var retainedEarnings = Account(tenantId, "390", "Retained earnings", LedgerAccountStatementSection.Equity);
            var facility = new CreditFacility { TenantId = tenantId, Code = "SYN-LOAN", LenderName = "Synthetic lender",
                FacilityType = "Loan", CurrencyCode = "TRY", ApprovedLimit = 1000m,
                StartDate = new DateOnly(2026, 1, 1), MaturityDate = new DateOnly(2027, 12, 31) };
            var opening = new JournalEntry { TenantId = tenantId, Code = $"OPEN-{suffix}", EntryDate = new DateOnly(2025, 12, 31),
                Description = "Synthetic opening balance", SourceType = "Manual", SourceId = Guid.NewGuid() };
            opening.Lines.Add(new JournalEntryLine { TenantId = tenantId, JournalEntryId = opening.Id, AccountId = bankLedger.Id,
                LineNumber = 1, Description = "Opening bank", Debit = 1000m, Credit = 0m });
            opening.Lines.Add(new JournalEntryLine { TenantId = tenantId, JournalEntryId = opening.Id, AccountId = capitalLedger.Id,
                LineNumber = 2, Description = "Opening capital", Debit = 0m, Credit = 1000m });
            seedDb.Tenants.Add(tenant);
            seedDb.FinancialAccounts.Add(bank);
            seedDb.LedgerAccounts.AddRange(bankLedger, principalLedger, capitalLedger, retainedEarnings);
            seedDb.LedgerAccountMappings.AddRange(
                new LedgerAccountMapping { TenantId = tenantId, MappingKey = LedgerMappingKeys.FinancialAccountPrefix + bank.Id, AccountId = bankLedger.Id },
                new LedgerAccountMapping { TenantId = tenantId, MappingKey = LedgerMappingKeys.CreditFacilityPrincipal, AccountId = principalLedger.Id });
            seedDb.CreditFacilities.Add(facility);
            seedDb.JournalEntries.Add(opening);
            await seedDb.SaveChangesAsync();

            var builder = WebApplication.CreateBuilder();
            builder.WebHost.UseTestServer();
            builder.Services.AddDbContext<TenantDbContext>(db => db.UseSqlServer(connectionString));
            builder.Services.AddAuthentication("report-test")
                .AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("report-test", _ => { });
            builder.Services.AddAuthorization();
            await using var app = builder.Build();
            app.UseAuthentication();
            app.UseAuthorization();
            app.MapFinanceCreditFacilityEndpoints();
            app.MapGroup("/api/finance/general-ledger").MapFiscalYearCloseEndpoints();
            await app.StartAsync();
            using var client = app.GetTestClient();
            client.DefaultRequestHeaders.Add("X-Test-Tenant", tenantId.ToString("D"));

            await seedDb.Database.ExecuteSqlRawAsync("""
                CREATE TRIGGER [dbo].[TR_TestCreditCloseAcceptance_HoldDrawdown]
                ON [dbo].[CreditFacilityMovements]
                AFTER INSERT
                AS
                BEGIN
                    SET NOCOUNT ON;
                    IF EXISTS (SELECT 1 FROM inserted WHERE [Type] = 1)
                        WAITFOR DELAY '00:00:04';
                END;
                """);
            triggerCreated = true;

            var drawdownTask = client.PostAsJsonAsync($"/api/finance/credit-facilities/{facility.Id}/drawdowns", new
            {
                requestId = Guid.NewGuid(), financialAccountId = bank.Id, transactionDate = "2026-06-01",
                principalAmount = 100m, notes = "Synthetic close-race drawdown"
            });
            await Task.Delay(TimeSpan.FromMilliseconds(600));
            Assert.False(drawdownTask.IsCompleted, "The SQL trigger did not hold the credit drawdown transaction.");

            var closeTask = client.PostAsJsonAsync("/api/finance/general-ledger/fiscal-year-close", new
            {
                fromDate = "2026-01-01", toDate = "2026-12-31", retainedEarningsAccountId = retainedEarnings.Id
            });
            Assert.NotSame(closeTask, await Task.WhenAny(closeTask, Task.Delay(TimeSpan.FromMilliseconds(500))));

            using var drawdown = await drawdownTask;
            Assert.Equal(HttpStatusCode.Created, drawdown.StatusCode);
            using var close = await closeTask;
            Assert.Equal(HttpStatusCode.Created, close.StatusCode);

            await using var verifyDb = new TenantDbContext(options);
            var postedMovementCount = await verifyDb.CreditFacilityMovements.CountAsync(x => x.TenantId == tenantId);
            var postedTransactionCount = await verifyDb.FinancialAccountTransactions.CountAsync(x => x.TenantId == tenantId);
            var postedJournalCount = await verifyDb.JournalEntries.CountAsync(x => x.TenantId == tenantId && x.SourceType == "CreditFacilityMovement");
            var postedAuditCount = await verifyDb.AuditEvents.CountAsync(x => x.TenantId == tenantId && x.Action == "finance.credit-facility.drawdown-posted");
            Assert.Equal(1, postedMovementCount);
            Assert.Equal(1, postedTransactionCount);
            Assert.Equal(1, postedJournalCount);
            Assert.Equal(1, postedAuditCount);
            var movement = await verifyDb.CreditFacilityMovements.AsNoTracking().SingleAsync(x => x.TenantId == tenantId);
            var cashMovement = await verifyDb.FinancialAccountTransactions.AsNoTracking().SingleAsync(x => x.TenantId == tenantId);
            Assert.Equal(CreditFacilityMovementType.Drawdown, movement.Type);
            Assert.Equal(100m, movement.PrincipalAmount);
            Assert.Equal(FinancialDirection.Inflow, cashMovement.Direction);
            Assert.Equal(100m, cashMovement.Amount);
            var movementJournal = await verifyDb.JournalEntries.Include(x => x.Lines)
                .SingleAsync(x => x.TenantId == tenantId && x.SourceType == "CreditFacilityMovement");
            Assert.Equal(100m, movementJournal.Lines.Sum(x => x.Debit));
            Assert.Equal(100m, movementJournal.Lines.Sum(x => x.Credit));
            Assert.Contains(movementJournal.Lines, x => x.AccountId == bankLedger.Id && x.Debit == 100m);
            Assert.Contains(movementJournal.Lines, x => x.AccountId == principalLedger.Id && x.Credit == 100m);
            Assert.Contains(await verifyDb.JournalEntries.AsNoTracking().ToListAsync(), x => x.SourceType == "FiscalYearClose");

            using var closedPeriodDrawdown = await client.PostAsJsonAsync($"/api/finance/credit-facilities/{facility.Id}/drawdowns", new
            {
                requestId = Guid.NewGuid(), financialAccountId = bank.Id, transactionDate = "2026-07-10",
                principalAmount = 25m, notes = "Synthetic post-close rejection"
            });
            Assert.Equal(HttpStatusCode.Conflict, closedPeriodDrawdown.StatusCode);
            Assert.Contains("dönemi kapalı", await closedPeriodDrawdown.Content.ReadAsStringAsync(), StringComparison.OrdinalIgnoreCase);
            Assert.Equal(postedMovementCount, await verifyDb.CreditFacilityMovements.CountAsync(x => x.TenantId == tenantId));
            Assert.Equal(postedTransactionCount, await verifyDb.FinancialAccountTransactions.CountAsync(x => x.TenantId == tenantId));
            Assert.Equal(postedJournalCount, await verifyDb.JournalEntries.CountAsync(x => x.TenantId == tenantId && x.SourceType == "CreditFacilityMovement"));
            Assert.Equal(postedAuditCount, await verifyDb.AuditEvents.CountAsync(x => x.TenantId == tenantId && x.Action == "finance.credit-facility.drawdown-posted"));
        }
        finally
        {
            if (triggerCreated)
                await seedDb.Database.ExecuteSqlRawAsync("DROP TRIGGER [dbo].[TR_TestCreditCloseAcceptance_HoldDrawdown];");
            if (databaseCreated)
                await seedDb.Database.EnsureDeletedAsync();
        }
    }

    private static LedgerAccount Account(Guid tenantId, string code, string name, LedgerAccountStatementSection section)
        => new() { TenantId = tenantId, Code = code, Name = name, StatementSection = section };
}
