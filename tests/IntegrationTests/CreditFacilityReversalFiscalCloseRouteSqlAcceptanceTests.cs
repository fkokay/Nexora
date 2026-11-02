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
public sealed class CreditFacilityReversalFiscalCloseRouteSqlAcceptanceTests
{
    [SqlServerAcceptanceFact]
    public async Task Credit_facility_reversal_is_rejected_in_closed_period_without_financial_side_effects()
    {
        var configuredConnection = Environment.GetEnvironmentVariable("AIERP_REPORT_TEST_SQL_CONNECTION_STRING");
        Assert.False(string.IsNullOrWhiteSpace(configuredConnection));
        var tenantId = Guid.NewGuid();
        var suffix = Guid.NewGuid().ToString("N");
        var connectionString = new SqlConnectionStringBuilder(configuredConnection)
        {
            InitialCatalog = $"AIERP_CreditReversalCloseAcceptance_{suffix}",
            ConnectTimeout = 15,
            TrustServerCertificate = true
        }.ConnectionString;
        var options = new DbContextOptionsBuilder<TenantDbContext>().UseSqlServer(connectionString).Options;
        await using var seedDb = new TenantDbContext(options);
        var databaseCreated = false;
        try
        {
            databaseCreated = await seedDb.Database.EnsureCreatedAsync();
            Assert.True(databaseCreated);

            var tenant = new Tenant { Id = tenantId, Name = "Synthetic credit reversal close", Slug = $"credit-reversal-close-{suffix}", BaseCurrencyCode = "TRY" };
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

            using var drawdown = await client.PostAsJsonAsync($"/api/finance/credit-facilities/{facility.Id}/drawdowns", new
            {
                requestId = Guid.NewGuid(), financialAccountId = bank.Id, transactionDate = "2026-06-01",
                principalAmount = 100m, notes = "Synthetic original drawdown"
            });
            Assert.Equal(HttpStatusCode.Created, drawdown.StatusCode);
            var originalMovementId = await seedDb.CreditFacilityMovements.AsNoTracking()
                .Where(x => x.TenantId == tenantId && x.Type == CreditFacilityMovementType.Drawdown)
                .Select(x => x.Id).SingleAsync();

            using var close = await client.PostAsJsonAsync("/api/finance/general-ledger/fiscal-year-close", new
            {
                fromDate = "2026-01-01", toDate = "2026-12-31", retainedEarningsAccountId = retainedEarnings.Id
            });
            Assert.Equal(HttpStatusCode.Created, close.StatusCode);

            await using var verifyDb = new TenantDbContext(options);
            var movementCount = await verifyDb.CreditFacilityMovements.CountAsync(x => x.TenantId == tenantId);
            var transactionCount = await verifyDb.FinancialAccountTransactions.CountAsync(x => x.TenantId == tenantId);
            var journalCount = await verifyDb.JournalEntries.CountAsync(x => x.TenantId == tenantId && x.SourceType == "CreditFacilityMovementReversal");
            var auditCount = await verifyDb.AuditEvents.CountAsync(x => x.TenantId == tenantId && x.Action == "finance.credit-facility.movement-reversed");
            var reversalRequestId = Guid.NewGuid();

            using var reversal = await client.PostAsJsonAsync($"/api/finance/credit-facilities/{facility.Id}/movements/{originalMovementId}/reversals", new
            {
                requestId = reversalRequestId, transactionDate = "2026-07-10", notes = "Synthetic closed-period reversal"
            });
            Assert.Equal(HttpStatusCode.Conflict, reversal.StatusCode);
            Assert.Contains("dönemi kapalı", await reversal.Content.ReadAsStringAsync(), StringComparison.OrdinalIgnoreCase);
            Assert.Equal(movementCount, await verifyDb.CreditFacilityMovements.CountAsync(x => x.TenantId == tenantId));
            Assert.Equal(transactionCount, await verifyDb.FinancialAccountTransactions.CountAsync(x => x.TenantId == tenantId));
            Assert.Equal(journalCount, await verifyDb.JournalEntries.CountAsync(x => x.TenantId == tenantId && x.SourceType == "CreditFacilityMovementReversal"));
            Assert.Equal(auditCount, await verifyDb.AuditEvents.CountAsync(x => x.TenantId == tenantId && x.Action == "finance.credit-facility.movement-reversed"));
            Assert.False(await verifyDb.CreditFacilityMovements.AnyAsync(x => x.TenantId == tenantId &&
                (x.RequestId == reversalRequestId || x.ReversesMovementId == originalMovementId)));
            Assert.False(await verifyDb.FinancialAccountTransactions.AnyAsync(x => x.TenantId == tenantId && x.ReversalOfId != null));
        }
        finally
        {
            if (databaseCreated)
                await seedDb.Database.EnsureDeletedAsync();
        }
    }

    private static LedgerAccount Account(Guid tenantId, string code, string name, LedgerAccountStatementSection section)
        => new() { TenantId = tenantId, Code = code, Name = name, StatementSection = section };
}
