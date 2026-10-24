using System.Net;
using System.Net.Http.Json;
using AIERP.Api;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using Xunit;

namespace AIERP.Api.IntegrationTests;

[Collection("SQL Server acceptance")]
public sealed class BankStatementFiscalCloseRouteSqlAcceptanceTests
{
    [SqlServerAcceptanceFact]
    public async Task Bank_statement_book_entry_route_serializes_with_fiscal_close_and_rejects_closed_period_without_side_effects()
    {
        var configuredConnection = Environment.GetEnvironmentVariable("AIERP_REPORT_TEST_SQL_CONNECTION_STRING");
        Assert.False(string.IsNullOrWhiteSpace(configuredConnection));
        var suffix = Guid.NewGuid().ToString("N");
        var tenantId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        var platformConnection = DatabaseConnection(configuredConnection!, $"AIERP_BankStatementClosePlatform_{suffix}");
        var tenantConnection = DatabaseConnection(configuredConnection!, $"AIERPTenant_{tenantId:N}");
        var studioConnection = DatabaseConnection(configuredConnection!, $"AIERP_BankStatementCloseStudio_{suffix}");
        var platformCreated = false;
        var tenantCreated = false;
        var studioCreated = false;
        var triggerCreated = false;
        try
        {
            await using var platformDb = new PlatformDbContext(new DbContextOptionsBuilder<PlatformDbContext>().UseSqlServer(platformConnection).Options);
            await using var seedDb = new TenantDbContext(new DbContextOptionsBuilder<TenantDbContext>().UseSqlServer(tenantConnection).Options);
            await using var studioDb = new AIStudioDbContext(new DbContextOptionsBuilder<AIStudioDbContext>().UseSqlServer(studioConnection).Options);
            platformCreated = await platformDb.Database.EnsureCreatedAsync();
            tenantCreated = await seedDb.Database.EnsureCreatedAsync();
            studioCreated = await studioDb.Database.EnsureCreatedAsync();
            Assert.True(platformCreated && tenantCreated && studioCreated);

            var tenant = new Tenant { Id = tenantId, Name = "Synthetic bank statement close", Slug = $"bank-statement-close-{suffix}", BaseCurrencyCode = "TRY" };
            platformDb.Tenants.Add(tenant);
            platformDb.Users.Add(new AppUser { Id = userId, Email = $"bank-statement-close-{suffix}@example.invalid", DisplayName = "Synthetic Tenant Admin", PasswordHash = "test" });
            platformDb.TenantMemberships.Add(new TenantMembership { TenantId = tenantId, UserId = userId, Role = "TenantAdmin" });
            platformDb.TenantDatabaseCatalog.Add(new TenantDatabaseCatalogEntry
            {
                TenantId = tenantId, Tenant = tenant, DatabaseName = new SqlConnectionStringBuilder(tenantConnection).InitialCatalog,
                State = TenantDatabaseProvisioningState.Ready, ReadyAt = DateTimeOffset.UtcNow
            });
            await platformDb.SaveChangesAsync();

            seedDb.Tenants.Add(tenant);
            var bank = new FinancialAccount { TenantId = tenantId, Code = "BANK-1", Name = "Synthetic bank", Type = FinancialAccountType.Bank, CurrencyCode = "TRY" };
            var retainedEarnings = Account(tenantId, "390", "Retained earnings", LedgerAccountStatementSection.Equity);
            var cash = Account(tenantId, "100", "Cash", LedgerAccountStatementSection.Asset);
            var capital = Account(tenantId, "300", "Capital", LedgerAccountStatementSection.Equity);
            var revenue = Account(tenantId, "600", "Revenue", LedgerAccountStatementSection.Revenue);
            seedDb.FinancialAccounts.Add(bank);
            seedDb.LedgerAccounts.AddRange(retainedEarnings, cash, capital, revenue);
            var opening = new JournalEntry { TenantId = tenantId, Code = $"OPEN-{suffix}", EntryDate = new DateOnly(2024, 12, 31),
                Description = "Synthetic opening", SourceType = "Manual", SourceId = Guid.NewGuid() };
            opening.Lines.Add(new JournalEntryLine { TenantId = tenantId, JournalEntryId = opening.Id, AccountId = cash.Id,
                LineNumber = 1, Description = "Opening cash", Debit = 1000m, Credit = 0m });
            opening.Lines.Add(new JournalEntryLine { TenantId = tenantId, JournalEntryId = opening.Id, AccountId = capital.Id,
                LineNumber = 2, Description = "Opening capital", Debit = 0m, Credit = 1000m });
            var revenueEntry = new JournalEntry { TenantId = tenantId, Code = $"REV-2025-{suffix}", EntryDate = new DateOnly(2025, 1, 5),
                Description = "Synthetic revenue", SourceType = "Manual", SourceId = Guid.NewGuid() };
            revenueEntry.Lines.Add(new JournalEntryLine { TenantId = tenantId, JournalEntryId = revenueEntry.Id, AccountId = cash.Id,
                LineNumber = 1, Description = "Synthetic receipt", Debit = 100m, Credit = 0m });
            revenueEntry.Lines.Add(new JournalEntryLine { TenantId = tenantId, JournalEntryId = revenueEntry.Id, AccountId = revenue.Id,
                LineNumber = 2, Description = "Synthetic revenue", Debit = 0m, Credit = 100m });
            seedDb.JournalEntries.AddRange(opening, revenueEntry);

            var statement = new BankStatement { TenantId = tenantId, Account = bank, CurrencyCode = "TRY", RequestId = Guid.NewGuid(),
                Code = $"BS-SYN-{suffix}", StartDate = new DateOnly(2025, 4, 1), EndDate = new DateOnly(2025, 4, 30), OpeningBalance = 0m, ClosingBalance = 0m };
            var raceLine = new BankStatementLine { TenantId = tenantId, Statement = statement, FinancialAccountId = bank.Id, CurrencyCode = "TRY",
                LineNumber = 1, TransactionDate = new DateOnly(2025, 4, 15), Direction = FinancialDirection.Inflow, Amount = 25m,
                Description = "Synthetic bank receipt", Reference = "SYN-STATEMENT-1" };
            var closedLine = new BankStatementLine { TenantId = tenantId, Statement = statement, FinancialAccountId = bank.Id, CurrencyCode = "TRY",
                LineNumber = 2, TransactionDate = new DateOnly(2025, 4, 16), Direction = FinancialDirection.Inflow, Amount = 10m,
                Description = "Closed-period receipt", Reference = "SYN-STATEMENT-2" };
            statement.Lines.Add(raceLine);
            statement.Lines.Add(closedLine);
            seedDb.BankStatements.Add(statement);
            await seedDb.SaveChangesAsync();

            using var startupOverride = ProcessEnvironmentOverride.Push(new Dictionary<string, string?>
            {
                ["Authentication__SigningKey"] = "synthetic-bank-statement-close-key-at-least-32-bytes",
                ["PluginHost__SigningKey"] = "different-synthetic-plugin-key-at-least-32-bytes-long",
                ["Authentication__Issuer"] = "AIERP", ["Authentication__Audience"] = "AIERP",
                ["ConnectionStrings__Platform"] = platformConnection, ["ConnectionStrings__Tenant"] = tenantConnection,
                ["ConnectionStrings__AIStudio"] = studioConnection, ["Database__SeparationEnabled"] = "true",
                ["Database__ApplyMigrationsOnStartup"] = "false"
            });
            using var factory = new BankStatementApiFactory(platformConnection, tenantConnection, studioConnection);
            using var client = factory.CreateClient();
            client.DefaultRequestHeaders.Add("X-Test-Tenant", tenantId.ToString("D"));
            client.DefaultRequestHeaders.Add("X-Test-User", userId.ToString("D"));

            await seedDb.Database.ExecuteSqlRawAsync("""
                CREATE TRIGGER [dbo].[TR_TestBankStatementCloseAcceptance_HoldBookEntry]
                ON [dbo].[FinancialAccountTransactions]
                AFTER INSERT
                AS
                BEGIN
                    SET NOCOUNT ON;
                    IF EXISTS (SELECT 1 FROM inserted WHERE [RequestId] IS NOT NULL)
                        WAITFOR DELAY '00:00:04';
                END;
                """);
            triggerCreated = true;

            var bookEntryTask = client.PostAsync($"/api/finance/statements/{statement.Id}/lines/{raceLine.Id}/create-book-entry", content: null);
            await WaitForPostingTriggerAsync(tenantConnection);
            Assert.False(bookEntryTask.IsCompleted, "The SQL trigger did not hold the real statement book-entry transaction.");
            var closeTask = client.PostAsJsonAsync("/api/finance/general-ledger/fiscal-year-close", new
            {
                fromDate = "2025-01-01", toDate = "2025-12-31", retainedEarningsAccountId = retainedEarnings.Id
            });
            await Task.Delay(TimeSpan.FromMilliseconds(500));
            Assert.False(closeTask.IsCompleted, "Fiscal close completed before the held statement posting released the tenant lock.");

            using var posted = await bookEntryTask;
            Assert.True(posted.StatusCode == HttpStatusCode.Created,
                $"Expected Created, got {(int)posted.StatusCode}: {await posted.Content.ReadAsStringAsync()}");
            using var closed = await closeTask;
            Assert.Equal(HttpStatusCode.Created, closed.StatusCode);
            await seedDb.Database.ExecuteSqlRawAsync("DROP TRIGGER [dbo].[TR_TestBankStatementCloseAcceptance_HoldBookEntry];");
            triggerCreated = false;

            var transactionCount = await seedDb.FinancialAccountTransactions.CountAsync(x => x.TenantId == tenantId);
            var auditCount = await seedDb.AuditEvents.CountAsync(x => x.TenantId == tenantId && x.Action == "bank-statement.book-entry-created");
            var raceMovement = await seedDb.FinancialAccountTransactions.AsNoTracking().SingleAsync(x => x.TenantId == tenantId && x.RequestId == raceLine.Id);
            Assert.Equal(raceLine.TransactionDate, raceMovement.TransactionDate);
            Assert.Equal(1, auditCount);
            var persistedRaceLine = await seedDb.BankStatementLines.AsNoTracking().SingleAsync(x => x.TenantId == tenantId && x.Id == raceLine.Id);
            Assert.Equal(raceMovement.Id, persistedRaceLine.FinancialAccountTransactionId);
            Assert.True(persistedRaceLine.IsBookEntryCreated);

            using var rejected = await client.PostAsync($"/api/finance/statements/{statement.Id}/lines/{closedLine.Id}/create-book-entry", content: null);
            Assert.Equal(HttpStatusCode.Conflict, rejected.StatusCode);
            Assert.Contains("dönemi kapalı", await rejected.Content.ReadAsStringAsync(), StringComparison.OrdinalIgnoreCase);
            Assert.Equal(transactionCount, await seedDb.FinancialAccountTransactions.CountAsync(x => x.TenantId == tenantId));
            Assert.Equal(auditCount, await seedDb.AuditEvents.CountAsync(x => x.TenantId == tenantId && x.Action == "bank-statement.book-entry-created"));
            var persistedClosedLine = await seedDb.BankStatementLines.AsNoTracking().SingleAsync(x => x.TenantId == tenantId && x.Id == closedLine.Id);
            Assert.Null(persistedClosedLine.FinancialAccountTransactionId);
            Assert.False(persistedClosedLine.IsBookEntryCreated);
            Assert.Null(persistedClosedLine.MatchedAt);
        }
        finally
        {
            if (triggerCreated)
            {
                await using var cleanup = new TenantDbContext(new DbContextOptionsBuilder<TenantDbContext>().UseSqlServer(tenantConnection).Options);
                await cleanup.Database.ExecuteSqlRawAsync("DROP TRIGGER [dbo].[TR_TestBankStatementCloseAcceptance_HoldBookEntry];");
            }
            if (studioCreated)
            {
                await using var cleanup = new AIStudioDbContext(new DbContextOptionsBuilder<AIStudioDbContext>().UseSqlServer(studioConnection).Options);
                await cleanup.Database.EnsureDeletedAsync();
            }
            if (tenantCreated)
            {
                await using var cleanup = new TenantDbContext(new DbContextOptionsBuilder<TenantDbContext>().UseSqlServer(tenantConnection).Options);
                await cleanup.Database.EnsureDeletedAsync();
            }
            if (platformCreated)
            {
                await using var cleanup = new PlatformDbContext(new DbContextOptionsBuilder<PlatformDbContext>().UseSqlServer(platformConnection).Options);
                await cleanup.Database.EnsureDeletedAsync();
            }
        }
    }

    private static LedgerAccount Account(Guid tenantId, string code, string name, LedgerAccountStatementSection section)
        => new() { TenantId = tenantId, Code = code, Name = name, StatementSection = section };

    private static string DatabaseConnection(string source, string databaseName)
        => new SqlConnectionStringBuilder(source) { InitialCatalog = databaseName, ConnectTimeout = 15, TrustServerCertificate = true }.ConnectionString;

    private static async Task WaitForPostingTriggerAsync(string tenantConnection)
    {
        var tenantDatabase = new SqlConnectionStringBuilder(tenantConnection).InitialCatalog;
        var masterConnection = new SqlConnectionStringBuilder(tenantConnection) { InitialCatalog = "master", ConnectTimeout = 15 }.ConnectionString;
        await using var connection = new SqlConnection(masterConnection);
        await connection.OpenAsync();
        var deadline = DateTimeOffset.UtcNow.AddSeconds(15);
        while (DateTimeOffset.UtcNow < deadline)
        {
            await using var command = connection.CreateCommand();
            command.CommandText = """
                SELECT COUNT(*)
                FROM sys.dm_exec_requests AS requests
                CROSS APPLY sys.dm_exec_sql_text(requests.sql_handle) AS sql_text
                WHERE requests.database_id = DB_ID(@tenantDatabase)
                  AND requests.wait_type = N'WAITFOR'
                  AND sql_text.[text] LIKE N'%TR_TestBankStatementCloseAcceptance_HoldBookEntry%';
                """;
            command.Parameters.AddWithValue("@tenantDatabase", tenantDatabase);
            if (Convert.ToInt32(await command.ExecuteScalarAsync()) > 0) return;
            await Task.Delay(TimeSpan.FromMilliseconds(100));
        }
        throw new TimeoutException("The bank-statement SQL trigger did not enter its WAITFOR barrier.");
    }

    private sealed class BankStatementApiFactory(string platformConnection, string tenantConnection, string studioConnection)
        : WebApplicationFactory<ApiEntryPointMarker>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Production);
            builder.ConfigureAppConfiguration((_, configuration) => configuration.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Authentication:SigningKey"] = "synthetic-bank-statement-close-key-at-least-32-bytes",
                ["PluginHost:SigningKey"] = "different-synthetic-plugin-key-at-least-32-bytes-long",
                ["Authentication:Issuer"] = "AIERP", ["Authentication:Audience"] = "AIERP",
                ["ConnectionStrings:Platform"] = platformConnection, ["ConnectionStrings:Tenant"] = tenantConnection,
                ["ConnectionStrings:AIStudio"] = studioConnection, ["Database:SeparationEnabled"] = "true",
                ["Database:ApplyMigrationsOnStartup"] = "false"
            }));
            builder.ConfigureTestServices(services =>
            {
                services.AddAuthentication("report-test").AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("report-test", _ => { });
                foreach (var worker in services.Where(x => x.ServiceType == typeof(IHostedService)
                             && x.ImplementationType?.Name is "IntegrationOperationWorker" or "AuditRetentionWorker" or "TcmbExchangeRateWorker").ToArray())
                    services.Remove(worker);
            });
        }
    }

    private sealed class ProcessEnvironmentOverride(IReadOnlyDictionary<string, string?> previousValues) : IDisposable
    {
        public static ProcessEnvironmentOverride Push(IReadOnlyDictionary<string, string?> values)
        {
            var previous = values.Keys.ToDictionary(key => key, Environment.GetEnvironmentVariable);
            foreach (var (key, value) in values) Environment.SetEnvironmentVariable(key, value);
            return new ProcessEnvironmentOverride(previous);
        }

        public void Dispose()
        {
            foreach (var (key, value) in previousValues) Environment.SetEnvironmentVariable(key, value);
        }
    }
}
