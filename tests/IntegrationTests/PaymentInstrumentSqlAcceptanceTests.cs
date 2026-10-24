using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
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
using Xunit;

namespace AIERP.Api.IntegrationTests;

[Collection("SQL Server acceptance")]
public sealed class PaymentInstrumentSqlAcceptanceTests
{
    [SqlServerAcceptanceFact]
    public async Task SqlServer_check_note_lifecycle_is_tenant_scoped_audited_idempotent_and_reversible()
    {
        var configuredConnection = Environment.GetEnvironmentVariable("AIERP_REPORT_TEST_SQL_CONNECTION_STRING");
        Assert.False(string.IsNullOrWhiteSpace(configuredConnection));
        var tenantA = Guid.NewGuid();
        var tenantB = Guid.NewGuid();
        var databaseName = $"AIERP_PaymentInstrumentAcceptance_{Guid.NewGuid():N}";
        var connectionString = new SqlConnectionStringBuilder(configuredConnection)
        {
            InitialCatalog = databaseName,
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
            var tenantARecord = new Tenant { Id = tenantA, Name = "Synthetic instruments A", Slug = $"instrument-a-{tenantA:N}" };
            var tenantBRecord = new Tenant { Id = tenantB, Name = "Synthetic instruments B", Slug = $"instrument-b-{tenantB:N}" };
            var bank = new FinancialAccount { TenantId = tenantA, Tenant = tenantARecord, Code = "BANK-A", Name = "Synthetic bank", Type = FinancialAccountType.Bank, CurrencyCode = "TRY" };
            var cash = new FinancialAccount { TenantId = tenantA, Tenant = tenantARecord, Code = "CASH-A", Name = "Synthetic cash", Type = FinancialAccountType.Cash, CurrencyCode = "TRY" };
            var otherTenantBank = new FinancialAccount { TenantId = tenantB, Tenant = tenantBRecord, Code = "BANK-B", Name = "Other bank", Type = FinancialAccountType.Bank, CurrencyCode = "TRY" };
            var ledgerAccounts = new[]
            {
                new LedgerAccount { TenantId = tenantA, Code = "101", Name = "Bank", StatementSection = LedgerAccountStatementSection.Asset },
                new LedgerAccount { TenantId = tenantA, Code = "100", Name = "Cash", StatementSection = LedgerAccountStatementSection.Asset },
                new LedgerAccount { TenantId = tenantA, Code = "121", Name = "Receivable offset", StatementSection = LedgerAccountStatementSection.Asset },
                new LedgerAccount { TenantId = tenantA, Code = "321", Name = "Payable offset", StatementSection = LedgerAccountStatementSection.Liability },
                new LedgerAccount { TenantId = tenantA, Code = "101.10", Name = "Receivable instruments", StatementSection = LedgerAccountStatementSection.Asset },
                new LedgerAccount { TenantId = tenantA, Code = "321.10", Name = "Payable instruments", StatementSection = LedgerAccountStatementSection.Liability },
                new LedgerAccount { TenantId = tenantA, Code = "320.10", Name = "Endorsement offset", StatementSection = LedgerAccountStatementSection.Liability },
                new LedgerAccount { TenantId = tenantA, Code = "300", Name = "Capital", StatementSection = LedgerAccountStatementSection.Equity },
                new LedgerAccount { TenantId = tenantA, Code = "390", Name = "Retained earnings", StatementSection = LedgerAccountStatementSection.Equity },
                new LedgerAccount { TenantId = tenantA, Code = "600", Name = "Revenue", StatementSection = LedgerAccountStatementSection.Revenue },
                new LedgerAccount { TenantId = tenantA, Code = "700", Name = "Expense", StatementSection = LedgerAccountStatementSection.Expense }
            };
            var creditFacility = new CreditFacility { TenantId = tenantA, Code = "SYN-LOAN", LenderName = "Synthetic lender", FacilityType = "Loan",
                CurrencyCode = "TRY", ApprovedLimit = 10000m, StartDate = new DateOnly(2025, 1, 1), MaturityDate = new DateOnly(2027, 12, 31) };
            var mappingByKey = new Dictionary<string, Guid>
            {
                [LedgerMappingKeys.InstrumentReceivablePortfolio] = ledgerAccounts[4].Id,
                [LedgerMappingKeys.InstrumentPayablePortfolio] = ledgerAccounts[5].Id,
                [LedgerMappingKeys.InstrumentReceivableOffset] = ledgerAccounts[2].Id,
                [LedgerMappingKeys.InstrumentPayableOffset] = ledgerAccounts[3].Id,
                [LedgerMappingKeys.InstrumentEndorsementOffset] = ledgerAccounts[6].Id,
                [LedgerMappingKeys.FinancialAccountPrefix + bank.Id] = ledgerAccounts[0].Id,
                [LedgerMappingKeys.FinancialAccountPrefix + cash.Id] = ledgerAccounts[1].Id,
                [LedgerMappingKeys.CreditFacilityPrincipal] = ledgerAccounts[3].Id,
                [LedgerMappingKeys.CreditFacilityInterestExpense] = ledgerAccounts[10].Id,
                [LedgerMappingKeys.CreditFacilityFeeExpense] = ledgerAccounts[10].Id
            };
            seedDb.LedgerAccounts.AddRange(ledgerAccounts);
            seedDb.LedgerAccountMappings.AddRange(mappingByKey.Select(x => new LedgerAccountMapping { TenantId = tenantA, MappingKey = x.Key, AccountId = x.Value }));
            cash.Transactions.Add(new FinancialAccountTransaction { TenantId = tenantA, FinancialAccountId = cash.Id, FinancialAccount = cash, CurrencyCode = "TRY", TransactionDate = new DateOnly(2026, 1, 1), Direction = FinancialDirection.Inflow, Amount = 1000m, Description = "Synthetic opening cash", RequestId = Guid.NewGuid() });
            seedDb.Tenants.AddRange(tenantARecord, tenantBRecord);
            seedDb.FinancialAccounts.AddRange(bank, cash, otherTenantBank);
            var priorCreditTransaction = new FinancialAccountTransaction { TenantId = tenantA, FinancialAccountId = bank.Id, FinancialAccount = bank,
                CurrencyCode = "TRY", TransactionDate = new DateOnly(2025, 10, 1), Direction = FinancialDirection.Inflow,
                CashFlowCategory = CashFlowCategory.Financing, Amount = 100m, Description = "Synthetic facility opening drawdown" };
            var priorCreditMovement = new CreditFacilityMovement { TenantId = tenantA, CreditFacilityId = creditFacility.Id, CreditFacility = creditFacility,
                FinancialAccountTransaction = priorCreditTransaction, RequestId = Guid.NewGuid(), Type = CreditFacilityMovementType.Drawdown,
                TransactionDate = new DateOnly(2025, 10, 1), PrincipalAmount = 100m };
            creditFacility.Movements.Add(priorCreditMovement);
            seedDb.CreditFacilities.Add(creditFacility);
            seedDb.JournalEntries.AddRange(
                Journal(tenantA, "OPEN-2025", new DateOnly(2025, 12, 31), (ledgerAccounts[0], 1000m, 0m), (ledgerAccounts[7], 0m, 1000m)),
                Journal(tenantA, "SALES-2026", new DateOnly(2026, 6, 1), (ledgerAccounts[0], 120m, 0m), (ledgerAccounts[9], 0m, 120m)),
                Journal(tenantA, "COST-2026", new DateOnly(2026, 7, 1), (ledgerAccounts[10], 30m, 0m), (ledgerAccounts[0], 0m, 30m)),
                Journal(tenantA, "CREDIT-OPEN", new DateOnly(2025, 10, 1), (ledgerAccounts[0], 100m, 0m), (ledgerAccounts[3], 0m, 100m)));
            await seedDb.SaveChangesAsync();

            var builder = WebApplication.CreateBuilder();
            builder.WebHost.UseTestServer();
            builder.Services.AddDbContext<TenantDbContext>(db => db.UseSqlServer(connectionString));
            builder.Services.AddAuthentication("report-test")
                .AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("report-test", _ => { });
            builder.Services.AddAuthorization();
            builder.Services.ConfigureHttpJsonOptions(json => json.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));
            await using var app = builder.Build();
            app.UseAuthentication();
            app.UseAuthorization();
            app.MapPaymentInstrumentEndpoints();
            app.MapGroup("/api/finance/general-ledger").MapFiscalYearCloseEndpoints();
            app.MapFinanceCreditFacilityEndpoints();
            await app.StartAsync();
            using var client = app.GetTestClient();
            Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/finance/payment-instruments/")).StatusCode);
            client.DefaultRequestHeaders.Add("X-Test-Tenant", tenantA.ToString("D"));

            var createRequestId = Guid.NewGuid();
            var createPayload = new
            {
                requestId = createRequestId, type = PaymentInstrumentType.Check, direction = PaymentInstrumentDirection.Receivable,
                instrumentNumber = "CHK-SYN-001", counterpartyName = "Synthetic customer", bankName = "Synthetic bank", currencyCode = "TRY",
                amount = 250m, issueDate = "2026-01-10", dueDate = "2026-02-10", portfolioDate = "2026-01-10", notes = "Synthetic lifecycle acceptance"
            };
            using var created = await client.PostAsJsonAsync("/api/finance/payment-instruments/", createPayload);
            Assert.Equal(HttpStatusCode.Created, created.StatusCode);
            using var createdJson = JsonDocument.Parse(await created.Content.ReadAsStringAsync());
            var instrumentId = createdJson.RootElement.GetProperty("id").GetGuid();
            var currentVersion = createdJson.RootElement.GetProperty("rowVersion").GetString()!;
            Assert.Equal(PaymentInstrumentStatus.Portfolio.ToString(), createdJson.RootElement.GetProperty("status").GetString());
            await using (var accountingDb = new TenantDbContext(options))
            {
                var receiptJournal = await accountingDb.JournalEntries.Include(x => x.Lines).SingleAsync(x => x.TenantId == tenantA && x.SourceType == "PaymentInstrumentEvent");
                Assert.Equal(250m, receiptJournal.Lines.Sum(x => x.Debit));
                Assert.Equal(250m, receiptJournal.Lines.Sum(x => x.Credit));
            }

            using var replay = await client.PostAsJsonAsync("/api/finance/payment-instruments/", createPayload);
            Assert.Equal(HttpStatusCode.OK, replay.StatusCode);
            client.DefaultRequestHeaders.Remove("X-Test-Tenant");
            client.DefaultRequestHeaders.Add("X-Test-Tenant", tenantB.ToString("D"));
            using var otherTenantList = await client.GetAsync("/api/finance/payment-instruments/");
            Assert.Equal(HttpStatusCode.OK, otherTenantList.StatusCode);
            using (var otherTenantJson = JsonDocument.Parse(await otherTenantList.Content.ReadAsStringAsync()))
                Assert.Equal(0, otherTenantJson.RootElement.GetProperty("totalCount").GetInt32());
            Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/finance/payment-instruments/{instrumentId}/events")).StatusCode);

            client.DefaultRequestHeaders.Remove("X-Test-Tenant");
            client.DefaultRequestHeaders.Add("X-Test-Tenant", tenantA.ToString("D"));
            var collectRequestId = Guid.NewGuid();
            using var collected = await client.PostAsJsonAsync($"/api/finance/payment-instruments/{instrumentId}/collect", new
            {
                requestId = collectRequestId, rowVersion = currentVersion, financialAccountId = bank.Id,
                eventDate = "2026-02-10", note = "Synthetic collection"
            });
            Assert.Equal(HttpStatusCode.OK, collected.StatusCode);
            using var collectedJson = JsonDocument.Parse(await collected.Content.ReadAsStringAsync());
            Assert.Equal(PaymentInstrumentStatus.Collected.ToString(), collectedJson.RootElement.GetProperty("status").GetString());
            currentVersion = collectedJson.RootElement.GetProperty("rowVersion").GetString()!;
            Assert.NotEqual(createRequestId, collectRequestId);

            using var bounced = await client.PostAsJsonAsync($"/api/finance/payment-instruments/{instrumentId}/bounce", new
            {
                requestId = Guid.NewGuid(), rowVersion = currentVersion, eventDate = "2026-02-11", note = "Synthetic returned check"
            });
            Assert.Equal(HttpStatusCode.OK, bounced.StatusCode);
            using var bouncedJson = JsonDocument.Parse(await bounced.Content.ReadAsStringAsync());
            Assert.Equal(PaymentInstrumentStatus.Bounced.ToString(), bouncedJson.RootElement.GetProperty("status").GetString());

            using var cashPayment = await client.PostAsJsonAsync("/api/finance/payment-instruments/", new
            {
                requestId = Guid.NewGuid(), type = PaymentInstrumentType.PromissoryNote, direction = PaymentInstrumentDirection.Payable,
                instrumentNumber = "NOTE-SYN-001", counterpartyName = "Synthetic supplier", bankName = "Synthetic bank", currencyCode = "TRY",
                amount = 300m, issueDate = "2026-01-10", dueDate = "2026-02-20", portfolioDate = "2026-01-10", notes = (string?)null
            });
            Assert.Equal(HttpStatusCode.Created, cashPayment.StatusCode);
            using var cashPaymentJson = JsonDocument.Parse(await cashPayment.Content.ReadAsStringAsync());
            var payableId = cashPaymentJson.RootElement.GetProperty("id").GetGuid();
            using var paid = await client.PostAsJsonAsync($"/api/finance/payment-instruments/{payableId}/collect", new
            {
                requestId = Guid.NewGuid(), rowVersion = cashPaymentJson.RootElement.GetProperty("rowVersion").GetString(),
                financialAccountId = cash.Id, eventDate = "2026-02-20", note = "Synthetic cash payment"
            });
            Assert.Equal(HttpStatusCode.OK, paid.StatusCode);

            var list = await client.GetFromJsonAsync<JsonElement>("/api/finance/payment-instruments/?page=1&pageSize=50");
            Assert.Equal(2, list.GetProperty("totalCount").GetInt32());
            using var eventsResponse = await client.GetAsync($"/api/finance/payment-instruments/{instrumentId}/events");
            Assert.Equal(HttpStatusCode.OK, eventsResponse.StatusCode);
            using var eventsJson = JsonDocument.Parse(await eventsResponse.Content.ReadAsStringAsync());
            Assert.Equal(new[] { "Created", "Collected", "Bounced" }, eventsJson.RootElement.EnumerateArray()
                .Select(item => item.GetProperty("eventType").GetString()).ToArray());

            await using var assertDb = new TenantDbContext(options);
            var movements = await assertDb.FinancialAccountTransactions.AsNoTracking()
                .Where(x => x.TenantId == tenantA && x.FinancialAccountId == bank.Id).OrderBy(x => x.CreatedAt).ToListAsync();
            Assert.Equal(3, movements.Count);
            var reversedMovement = Assert.Single(movements, x => x.ReversalOfId is not null);
            var originalMovement = Assert.Single(movements, x => x.Id == reversedMovement.ReversalOfId);
            Assert.Equal(FinancialDirection.Inflow, originalMovement.Direction);
            Assert.Equal(FinancialDirection.Outflow, reversedMovement.Direction);
            var instrumentJournals = await assertDb.JournalEntries.AsNoTracking().Where(x => x.TenantId == tenantA && x.SourceType == "PaymentInstrumentEvent")
                .Select(x => new { x.Id, Lines = x.Lines.Select(line => new { line.Debit, line.Credit }).ToArray() }).ToListAsync();
            Assert.Equal(5, instrumentJournals.Count);
            Assert.All(instrumentJournals, journal =>
            {
                Assert.Equal(journal.Lines.Sum(line => line.Debit), journal.Lines.Sum(line => line.Credit));
                Assert.True(journal.Lines.Sum(line => line.Debit) > 0m);
            });
            Assert.Equal(5, await assertDb.AuditEvents.CountAsync(x => x.TenantId == tenantA && x.Action.StartsWith("finance.instrument.")));

            var outstandingCreatePayload = new
            {
                requestId = Guid.NewGuid(), type = PaymentInstrumentType.Check, direction = PaymentInstrumentDirection.Receivable,
                instrumentNumber = "CHK-CLOSE-001", counterpartyName = "Synthetic customer", bankName = "Synthetic bank", currencyCode = "TRY",
                amount = 50m, issueDate = "2026-01-10", dueDate = "2026-02-10", portfolioDate = "2026-01-10", notes = "Fiscal-close route acceptance"
            };
            await seedDb.Database.ExecuteSqlRawAsync("""
                CREATE OR ALTER TRIGGER [dbo].[TR_TestFiscalCloseAcceptance_HoldCreatedEvent]
                ON [dbo].[PaymentInstrumentEvents]
                AFTER INSERT
                AS
                BEGIN
                    SET NOCOUNT ON;
                    IF EXISTS (SELECT 1 FROM inserted WHERE [EventType] = 'Created')
                        WAITFOR DELAY '00:00:04';
                END;
                """);
            var outstandingCreateTask = client.PostAsJsonAsync("/api/finance/payment-instruments/", outstandingCreatePayload);
            await Task.Delay(TimeSpan.FromMilliseconds(750));
            Assert.False(outstandingCreateTask.IsCompleted, "The SQL acceptance trigger did not hold the posting transaction as expected.");
            var closeTask = client.PostAsJsonAsync("/api/finance/general-ledger/fiscal-year-close", new
            {
                fromDate = "2026-01-01", toDate = "2026-12-31", retainedEarningsAccountId = ledgerAccounts[8].Id
            });
            var closeBeforePostingFinishes = await Task.WhenAny(closeTask, Task.Delay(TimeSpan.FromMilliseconds(500)));
            Assert.NotSame(closeTask, closeBeforePostingFinishes);
            using var outstandingInstrument = await outstandingCreateTask;
            Assert.Equal(HttpStatusCode.Created, outstandingInstrument.StatusCode);
            using var outstandingJson = JsonDocument.Parse(await outstandingInstrument.Content.ReadAsStringAsync());
            var outstandingId = outstandingJson.RootElement.GetProperty("id").GetGuid();
            var outstandingVersion = outstandingJson.RootElement.GetProperty("rowVersion").GetString();
            using var close = await closeTask;
            Assert.Equal(HttpStatusCode.Created, close.StatusCode);
            await seedDb.Database.ExecuteSqlRawAsync("DROP TRIGGER [dbo].[TR_TestFiscalCloseAcceptance_HoldCreatedEvent];");

            var creditMovementCountBeforeClosedWrites = await seedDb.CreditFacilityMovements.CountAsync(x => x.TenantId == tenantA);
            var creditTransactionCountBeforeClosedWrites = await seedDb.FinancialAccountTransactions.CountAsync(x => x.TenantId == tenantA);
            var creditJournalCountBeforeClosedWrites = await seedDb.JournalEntries.CountAsync(x => x.TenantId == tenantA && x.SourceType.StartsWith("CreditFacility"));
            var creditAuditCountBeforeClosedWrites = await seedDb.AuditEvents.CountAsync(x => x.TenantId == tenantA && x.Action.StartsWith("finance.credit-facility."));
            using var drawdownAfterClose = await client.PostAsJsonAsync($"/api/finance/credit-facilities/{creditFacility.Id}/drawdowns", new
            {
                requestId = Guid.NewGuid(), financialAccountId = bank.Id, transactionDate = "2026-07-10", principalAmount = 10m, notes = "Synthetic closed-period drawdown"
            });
            Assert.Equal(HttpStatusCode.Conflict, drawdownAfterClose.StatusCode);
            using var repaymentAfterClose = await client.PostAsJsonAsync($"/api/finance/credit-facilities/{creditFacility.Id}/repayments", new
            {
                requestId = Guid.NewGuid(), financialAccountId = bank.Id, transactionDate = "2026-07-10", principalAmount = 10m,
                interestAmount = 1m, feeAmount = 0m, notes = "Synthetic closed-period repayment"
            });
            Assert.Equal(HttpStatusCode.Conflict, repaymentAfterClose.StatusCode);
            using var reversalAfterClose = await client.PostAsJsonAsync($"/api/finance/credit-facilities/{creditFacility.Id}/movements/{priorCreditMovement.Id}/reversals", new
            {
                requestId = Guid.NewGuid(), transactionDate = "2026-07-10", notes = "Synthetic closed-period reversal"
            });
            Assert.Equal(HttpStatusCode.Conflict, reversalAfterClose.StatusCode);
            Assert.Equal(creditMovementCountBeforeClosedWrites, await seedDb.CreditFacilityMovements.CountAsync(x => x.TenantId == tenantA));
            Assert.Equal(creditTransactionCountBeforeClosedWrites, await seedDb.FinancialAccountTransactions.CountAsync(x => x.TenantId == tenantA));
            Assert.Equal(creditJournalCountBeforeClosedWrites, await seedDb.JournalEntries.CountAsync(x => x.TenantId == tenantA && x.SourceType.StartsWith("CreditFacility")));
            Assert.Equal(creditAuditCountBeforeClosedWrites, await seedDb.AuditEvents.CountAsync(x => x.TenantId == tenantA && x.Action.StartsWith("finance.credit-facility.")));

            using var createAfterClose = await client.PostAsJsonAsync("/api/finance/payment-instruments/", new
            {
                requestId = Guid.NewGuid(), type = PaymentInstrumentType.Check, direction = PaymentInstrumentDirection.Receivable,
                instrumentNumber = "CHK-CLOSED-001", counterpartyName = "Synthetic customer", bankName = "Synthetic bank", currencyCode = "TRY",
                amount = 10m, issueDate = "2026-07-10", dueDate = "2026-08-10", portfolioDate = "2026-07-10", notes = (string?)null
            });
            Assert.Equal(HttpStatusCode.Conflict, createAfterClose.StatusCode);
            using var endorseAfterClose = await client.PostAsJsonAsync($"/api/finance/payment-instruments/{outstandingId}/endorse", new
            {
                requestId = Guid.NewGuid(), rowVersion = outstandingVersion, eventDate = "2026-07-10", endorsedTo = "Synthetic bank"
            });
            Assert.Equal(HttpStatusCode.Conflict, endorseAfterClose.StatusCode);
            using var collectAfterClose = await client.PostAsJsonAsync($"/api/finance/payment-instruments/{outstandingId}/collect", new
            {
                requestId = Guid.NewGuid(), rowVersion = outstandingVersion, eventDate = "2026-07-10", financialAccountId = bank.Id
            });
            Assert.Equal(HttpStatusCode.Conflict, collectAfterClose.StatusCode);
            using var bounceAfterClose = await client.PostAsJsonAsync($"/api/finance/payment-instruments/{outstandingId}/bounce", new
            {
                requestId = Guid.NewGuid(), rowVersion = outstandingVersion, eventDate = "2026-07-10", note = "Synthetic closed-period bounce"
            });
            Assert.Equal(HttpStatusCode.Conflict, bounceAfterClose.StatusCode);
            using var cancelAfterClose = await client.PostAsJsonAsync($"/api/finance/payment-instruments/{outstandingId}/cancel", new
            {
                requestId = Guid.NewGuid(), rowVersion = outstandingVersion, eventDate = "2026-07-10"
            });
            Assert.Equal(HttpStatusCode.Conflict, cancelAfterClose.StatusCode);
            using var paidJson = JsonDocument.Parse(await paid.Content.ReadAsStringAsync());
            using var applyAfterClose = await client.PostAsJsonAsync($"/api/finance/payment-instruments/{payableId}/apply-to-invoice", new
            {
                requestId = Guid.NewGuid(), rowVersion = paidJson.RootElement.GetProperty("rowVersion").GetString(),
                eventDate = "2026-07-10", invoiceId = Guid.NewGuid(), amount = 10m
            });
            Assert.Equal(HttpStatusCode.Conflict, applyAfterClose.StatusCode);

            await using var closedDb = new TenantDbContext(options);
            Assert.Equal(PaymentInstrumentStatus.Portfolio, (await closedDb.PaymentInstruments.SingleAsync(x => x.TenantId == tenantA && x.Id == outstandingId)).Status);
            Assert.Equal(0, await closedDb.PaymentInstrumentEvents.CountAsync(x => x.TenantId == tenantA && x.PaymentInstrumentId == outstandingId && x.EventType != "Created"));
        }
        finally
        {
            if (databaseCreated)
                await seedDb.Database.EnsureDeletedAsync();
        }
    }

    private static JournalEntry Journal(Guid tenantId, string code, DateOnly date, params (LedgerAccount Account, decimal Debit, decimal Credit)[] lines)
    {
        var entry = new JournalEntry { TenantId = tenantId, Code = code, EntryDate = date, Description = code, SourceType = "Manual", SourceId = Guid.NewGuid() };
        for (var index = 0; index < lines.Length; index++)
            entry.Lines.Add(new JournalEntryLine { TenantId = tenantId, JournalEntryId = entry.Id, AccountId = lines[index].Account.Id,
                LineNumber = index + 1, Description = code, Debit = lines[index].Debit, Credit = lines[index].Credit });
        return entry;
    }
}
