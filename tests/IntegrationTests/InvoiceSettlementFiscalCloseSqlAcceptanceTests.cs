using System.Net;
using System.Net.Http.Json;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace AIERP.Api.IntegrationTests;

public sealed class InvoiceSettlementFiscalCloseSqlAcceptanceTests
{
    [SqlServerAcceptanceFact]
    public async Task Customer_collection_and_supplier_payment_serialize_against_fiscal_close_on_sql_server()
    {
        var configuredConnection = Environment.GetEnvironmentVariable("AIERP_REPORT_TEST_SQL_CONNECTION_STRING");
        Assert.False(string.IsNullOrWhiteSpace(configuredConnection));
        var tenantA = Guid.NewGuid();
        var tenantB = Guid.NewGuid();
        var databaseName = $"AIERP_SettlementCloseAcceptance_{Guid.NewGuid():N}";
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
            var tenantARecord = new Tenant { Id = tenantA, Name = "Synthetic settlement A", Slug = $"settlement-a-{tenantA:N}", BaseCurrencyCode = "TRY" };
            var tenantBRecord = new Tenant { Id = tenantB, Name = "Synthetic settlement B", Slug = $"settlement-b-{tenantB:N}", BaseCurrencyCode = "TRY" };
            seedDb.Tenants.AddRange(tenantARecord, tenantBRecord);

            var accounts = new List<LedgerAccount>();
            var mappings = new List<LedgerAccountMapping>();
            var journalEntries = new List<JournalEntry>();
            var ids = new Dictionary<Guid, (Guid RetainedEarnings, string SourceType, string PaymentMethod, string ClearingKey, string ControlKey)>();
            foreach (var (tenantId, tenant, isCustomer) in new[] { (tenantA, tenantARecord, true), (tenantB, tenantBRecord, false) })
            {
                var settlement = Account(tenantId, isCustomer ? "108" : "103", "Settlement clearing",
                    isCustomer ? LedgerAccountStatementSection.Asset : LedgerAccountStatementSection.Liability);
                var control = Account(tenantId, isCustomer ? "120" : "320", "Counterparty control",
                    isCustomer ? LedgerAccountStatementSection.Asset : LedgerAccountStatementSection.Liability);
                var retained = Account(tenantId, "390", "Retained earnings", LedgerAccountStatementSection.Equity);
                var cash = Account(tenantId, "100", "Cash", LedgerAccountStatementSection.Asset);
                var capital = Account(tenantId, "300", "Capital", LedgerAccountStatementSection.Equity);
                accounts.AddRange(new[] { settlement, control, retained, cash, capital });
                var clearingKey = isCustomer ? LedgerMappingKeys.CustomerCardClearing : LedgerMappingKeys.SupplierCheckClearing;
                var controlKey = isCustomer ? LedgerMappingKeys.SalesReceivable : LedgerMappingKeys.PurchasePayable;
                mappings.AddRange(new[]
                {
                    new LedgerAccountMapping { TenantId = tenantId, MappingKey = clearingKey, AccountId = settlement.Id },
                    new LedgerAccountMapping { TenantId = tenantId, MappingKey = controlKey, AccountId = control.Id }
                });
                var opening = new JournalEntry
                {
                    TenantId = tenantId, Code = $"OPEN-{tenantId:N}", EntryDate = new DateOnly(2025, 12, 31),
                    Description = "Synthetic opening balance", SourceType = "Manual", SourceId = Guid.NewGuid()
                };
                opening.Lines.Add(new JournalEntryLine { TenantId = tenantId, JournalEntryId = opening.Id, AccountId = cash.Id,
                    LineNumber = 1, Description = "Synthetic opening balance", Debit = 1000m, Credit = 0m });
                opening.Lines.Add(new JournalEntryLine { TenantId = tenantId, JournalEntryId = opening.Id, AccountId = capital.Id,
                    LineNumber = 2, Description = "Synthetic opening balance", Debit = 0m, Credit = 1000m });
                journalEntries.Add(opening);
                ids[tenantId] = (retained.Id, isCustomer ? "CustomerCollection" : "SupplierPayment",
                    isCustomer ? "Card" : "Check", clearingKey, controlKey);
            }
            seedDb.LedgerAccounts.AddRange(accounts);
            seedDb.LedgerAccountMappings.AddRange(mappings);
            seedDb.JournalEntries.AddRange(journalEntries);
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
            app.MapPost("/test/settlements/{sourceType}", async (string sourceType, SettlementRequest request,
                System.Security.Claims.ClaimsPrincipal principal, TenantDbContext db) =>
            {
                if (!Guid.TryParse(principal.FindFirst("tenant_id")?.Value, out var tenantId)) return Results.Forbid();
                await using var transaction = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable);
                if (!await FiscalYearCloseEndpoints.LockTenantForPostingAsync(db, tenantId)) return Results.NotFound();
                var posting = await InvoiceSettlementJournalPosting.CreateAsync(db, tenantId, sourceType, request.SourceId,
                    request.SourceCode, request.CounterpartyName, request.EntryDate, "TRY", request.Amount,
                    request.PaymentMethod, null, null);
                if (!posting.Succeeded) return Results.Conflict(new { error = posting.Error });
                await db.SaveChangesAsync();
                await transaction.CommitAsync();
                return Results.Created($"/test/settlements/{posting.Entry!.Id}", new { id = posting.Entry.Id });
            });
            app.MapGroup("/api/finance/general-ledger").RequireAuthorization().MapFiscalYearCloseEndpoints();
            await app.StartAsync();
            using var client = app.GetTestClient();

            await seedDb.Database.ExecuteSqlRawAsync("""
                CREATE TRIGGER [dbo].[TR_TestSettlementCloseAcceptance_HoldPosting]
                ON [dbo].[JournalEntries]
                AFTER INSERT
                AS
                BEGIN
                    SET NOCOUNT ON;
                    IF EXISTS (SELECT 1 FROM inserted WHERE [SourceType] IN ('CustomerCollection', 'SupplierPayment'))
                        WAITFOR DELAY '00:00:04';
                END;
                """);
            triggerCreated = true;

            foreach (var tenantId in new[] { tenantA, tenantB })
            {
                var setup = ids[tenantId];
                client.DefaultRequestHeaders.Remove("X-Test-Tenant");
                client.DefaultRequestHeaders.Add("X-Test-Tenant", tenantId.ToString("D"));
                var sourceId = Guid.NewGuid();
                var settleTask = client.PostAsJsonAsync($"/test/settlements/{setup.SourceType}", new SettlementRequest(
                    sourceId, $"SYN-{setup.SourceType}", "Synthetic counterparty", new DateOnly(2026, 6, 15), setup.PaymentMethod, 25m));
                await Task.Delay(TimeSpan.FromMilliseconds(600));
                Assert.False(settleTask.IsCompleted, $"SQL trigger did not hold the {setup.SourceType} posting transaction.");

                var closeTask = client.PostAsJsonAsync("/api/finance/general-ledger/fiscal-year-close", new
                {
                    fromDate = "2026-01-01", toDate = "2026-12-31", retainedEarningsAccountId = setup.RetainedEarnings
                });
                Assert.NotSame(closeTask, await Task.WhenAny(closeTask, Task.Delay(TimeSpan.FromMilliseconds(500))));
                using var settled = await settleTask;
                Assert.Equal(HttpStatusCode.Created, settled.StatusCode);
                using var closed = await closeTask;
                Assert.Equal(HttpStatusCode.Created, closed.StatusCode);

                var journalCountBeforeRejectedWrite = await seedDb.JournalEntries.CountAsync(x => x.TenantId == tenantId
                    && x.SourceType == setup.SourceType);
                using var rejected = await client.PostAsJsonAsync($"/test/settlements/{setup.SourceType}", new SettlementRequest(
                    Guid.NewGuid(), $"SYN-CLOSED-{setup.SourceType}", "Synthetic counterparty", new DateOnly(2026, 7, 1), setup.PaymentMethod, 10m));
                Assert.Equal(HttpStatusCode.Conflict, rejected.StatusCode);
                Assert.Equal(journalCountBeforeRejectedWrite, await seedDb.JournalEntries.CountAsync(x => x.TenantId == tenantId
                    && x.SourceType == setup.SourceType));
            }
        }
        finally
        {
            if (triggerCreated)
                await seedDb.Database.ExecuteSqlRawAsync("DROP TRIGGER [dbo].[TR_TestSettlementCloseAcceptance_HoldPosting];");
            if (databaseCreated)
                await seedDb.Database.EnsureDeletedAsync();
        }
    }

    private static LedgerAccount Account(Guid tenantId, string code, string name, LedgerAccountStatementSection section)
        => new() { TenantId = tenantId, Code = code, Name = name, StatementSection = section };

    private sealed record SettlementRequest(Guid SourceId, string SourceCode, string CounterpartyName, DateOnly EntryDate,
        string PaymentMethod, decimal Amount);
}
