using System.Net;
using System.Net.Http.Json;
using System.Text.Encodings.Web;
using System.Text.Json.Serialization;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Xunit;

namespace AIERP.Api.IntegrationTests;

[Collection("SQL Server acceptance")]
public sealed class PaymentInstrumentFiscalCloseRouteSqlAcceptanceTests
{
    [SqlServerAcceptanceFact]
    public async Task Instrument_creation_is_rejected_in_closed_period_without_portfolio_journal_or_audit_side_effects()
    {
        var configuredConnection = Environment.GetEnvironmentVariable("AIERP_REPORT_TEST_SQL_CONNECTION_STRING");
        Assert.False(string.IsNullOrWhiteSpace(configuredConnection));

        var tenantId = Guid.NewGuid();
        var otherTenantId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        var databaseName = TenantSqlCredentialPath.DatabaseName(tenantId, TenantSqlDatabaseComponent.Erp);
        var databaseConnection = new SqlConnectionStringBuilder(configuredConnection!)
        {
            InitialCatalog = databaseName,
            ConnectTimeout = 15,
            TrustServerCertificate = true
        }.ConnectionString;
        var adminOptions = new DbContextOptionsBuilder<TenantDbContext>().UseSqlServer(databaseConnection).Options;
        await using var adminDb = new TenantDbContext(adminOptions);
        var databaseCreated = false;
        SqlAcceptanceTenantCredential? credential = null;
        try
        {
            databaseCreated = await adminDb.Database.EnsureCreatedAsync();
            Assert.True(databaseCreated);
            credential = await SqlAcceptanceTenantCredential.CreateAsync(configuredConnection!, tenantId);

            var tenant = new Tenant { Id = tenantId, Name = "Synthetic instrument fiscal close", Slug = $"instrument-close-{tenantId:N}", BaseCurrencyCode = "TRY" };
            var otherTenant = new Tenant { Id = otherTenantId, Name = "Synthetic other instrument tenant", Slug = $"instrument-other-{otherTenantId:N}", BaseCurrencyCode = "TRY" };
            var retainedEarnings = Account(tenantId, "390", "Retained earnings", LedgerAccountStatementSection.Equity);
            var cash = Account(tenantId, "100", "Cash", LedgerAccountStatementSection.Asset);
            var capital = Account(tenantId, "500", "Capital", LedgerAccountStatementSection.Equity);
            var receivableOffset = Account(tenantId, "121", "Receivable instrument offset", LedgerAccountStatementSection.Asset);
            var receivablePortfolio = Account(tenantId, "101.10", "Receivable instrument portfolio", LedgerAccountStatementSection.Asset);
            adminDb.Tenants.AddRange(tenant, otherTenant);
            adminDb.LedgerAccounts.AddRange(retainedEarnings, cash, capital, receivableOffset, receivablePortfolio);
            adminDb.LedgerAccountMappings.AddRange(
                Mapping(tenantId, LedgerMappingKeys.InstrumentReceivableOffset, receivableOffset),
                Mapping(tenantId, LedgerMappingKeys.InstrumentReceivablePortfolio, receivablePortfolio));

            var opening = new JournalEntry
            {
                TenantId = tenantId, Code = $"OPEN-{tenantId:N}", EntryDate = new DateOnly(2024, 12, 31),
                Description = "Synthetic opening balances", SourceType = "Manual", SourceId = Guid.NewGuid()
            };
            opening.Lines.Add(new JournalEntryLine { TenantId = tenantId, JournalEntryId = opening.Id, AccountId = cash.Id,
                LineNumber = 1, Description = "Synthetic cash", Debit = 1000m, Credit = 0m });
            opening.Lines.Add(new JournalEntryLine { TenantId = tenantId, JournalEntryId = opening.Id, AccountId = capital.Id,
                LineNumber = 2, Description = "Synthetic capital", Debit = 0m, Credit = 1000m });
            adminDb.JournalEntries.Add(opening);

            var otherTenantInstrument = new PaymentInstrument
            {
                TenantId = otherTenantId, Tenant = otherTenant, RequestId = Guid.NewGuid(), Type = PaymentInstrumentType.Check,
                Direction = PaymentInstrumentDirection.Receivable, Code = "OTHER-CHECK", InstrumentNumber = "OTHER-1",
                CounterpartyName = "Other tenant", BankName = "Synthetic bank", CurrencyCode = "TRY", Amount = 25m,
                IssueDate = new DateOnly(2024, 1, 1), DueDate = new DateOnly(2024, 2, 1), PortfolioDate = new DateOnly(2024, 1, 1)
            };
            adminDb.PaymentInstruments.Add(otherTenantInstrument);
            await adminDb.SaveChangesAsync();

            var tenantConnection = new SqlConnectionStringBuilder(databaseConnection)
            {
                IntegratedSecurity = false, UserID = credential.UserName, Password = credential.Password,
                PersistSecurityInfo = false
            }.ConnectionString;
            var builder = WebApplication.CreateBuilder();
            builder.WebHost.UseTestServer();
            builder.Services.ConfigureHttpJsonOptions(options => options.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));
            builder.Services.AddDbContext<TenantDbContext>(options => options.UseSqlServer(tenantConnection));
            builder.Services.AddAuthentication("report-test")
                .AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("report-test", _ => { });
            builder.Services.AddAuthorization();
            await using var app = builder.Build();
            app.UseAuthentication();
            app.UseAuthorization();
            app.MapPaymentInstrumentEndpoints();
            app.MapGroup("/api/finance/general-ledger").MapFiscalYearCloseEndpoints();
            await app.StartAsync();
            using var client = app.GetTestClient();
            client.DefaultRequestHeaders.Add("X-Test-Tenant", tenantId.ToString("D"));
            client.DefaultRequestHeaders.Add("X-Test-User", userId.ToString("D"));

            using var close = await client.PostAsJsonAsync("/api/finance/general-ledger/fiscal-year-close", new
            {
                fromDate = "2025-01-01", toDate = "2025-12-31", retainedEarningsAccountId = retainedEarnings.Id
            });
            Assert.Equal(HttpStatusCode.Created, close.StatusCode);

            var instrumentsBefore = await adminDb.PaymentInstruments.CountAsync(x => x.TenantId == tenantId);
            var eventsBefore = await adminDb.PaymentInstrumentEvents.CountAsync(x => x.TenantId == tenantId);
            var journalsBefore = await adminDb.JournalEntries.CountAsync(x => x.TenantId == tenantId && x.SourceType == "PaymentInstrumentEvent");
            var auditsBefore = await adminDb.AuditEvents.CountAsync(x => x.TenantId == tenantId && x.Action == "finance.instrument.created");
            using var rejected = await client.PostAsJsonAsync("/api/finance/payment-instruments/", new
            {
                requestId = Guid.NewGuid(), type = "Check", direction = "Receivable", instrumentNumber = "CLOSED-PERIOD-1",
                counterpartyName = "Synthetic customer", bankName = "Synthetic bank", currencyCode = "TRY", amount = 125m,
                issueDate = "2025-04-01", dueDate = "2025-05-01", portfolioDate = "2025-04-02", notes = "Must not be posted"
            });

            Assert.Equal(HttpStatusCode.Conflict, rejected.StatusCode);
            Assert.Equal(instrumentsBefore, await adminDb.PaymentInstruments.CountAsync(x => x.TenantId == tenantId));
            Assert.Equal(eventsBefore, await adminDb.PaymentInstrumentEvents.CountAsync(x => x.TenantId == tenantId));
            Assert.Equal(journalsBefore, await adminDb.JournalEntries.CountAsync(x => x.TenantId == tenantId && x.SourceType == "PaymentInstrumentEvent"));
            Assert.Equal(auditsBefore, await adminDb.AuditEvents.CountAsync(x => x.TenantId == tenantId && x.Action == "finance.instrument.created"));

            using var crossTenantRead = await client.GetAsync($"/api/finance/payment-instruments/{otherTenantInstrument.Id}/events");
            Assert.Equal(HttpStatusCode.NotFound, crossTenantRead.StatusCode);
            Assert.Equal(1, await adminDb.PaymentInstruments.CountAsync(x => x.TenantId == otherTenantId));
        }
        finally
        {
            if (credential is not null) await credential.DisposeAsync();
            if (databaseCreated) await adminDb.Database.EnsureDeletedAsync();
        }
    }

    private static LedgerAccount Account(Guid tenantId, string code, string name, LedgerAccountStatementSection section)
        => new() { TenantId = tenantId, Code = code, Name = name, StatementSection = section };

    private static LedgerAccountMapping Mapping(Guid tenantId, string key, LedgerAccount account)
        => new() { TenantId = tenantId, MappingKey = key, AccountId = account.Id };
}
