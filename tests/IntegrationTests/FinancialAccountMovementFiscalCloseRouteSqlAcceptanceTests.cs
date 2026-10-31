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
public sealed class FinancialAccountMovementFiscalCloseRouteSqlAcceptanceTests
{
    [SqlServerAcceptanceFact]
    public async Task Manual_movement_and_transfer_routes_reject_closed_period_and_movement_serializes_with_close()
    {
        var configuredConnection = Environment.GetEnvironmentVariable("AIERP_REPORT_TEST_SQL_CONNECTION_STRING");
        Assert.False(string.IsNullOrWhiteSpace(configuredConnection));
        var suffix = Guid.NewGuid().ToString("N");
        var tenantId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        var platformConnection = DatabaseConnection(configuredConnection!, $"AIERP_CashMovementClosePlatform_{suffix}");
        var tenantConnection = DatabaseConnection(configuredConnection!, $"AIERPTenant_{tenantId:N}");
        var studioConnection = DatabaseConnection(configuredConnection!, $"AIERP_CashMovementCloseStudio_{suffix}");
        var platformCreated = false;
        var tenantCreated = false;
        var studioCreated = false;
        var triggerCreated = false;
        SqlAcceptanceTenantCredential? tenantCredential = null;
        try
        {
            var platformOptions = new DbContextOptionsBuilder<PlatformDbContext>().UseSqlServer(platformConnection).Options;
            var tenantOptions = new DbContextOptionsBuilder<TenantDbContext>().UseSqlServer(tenantConnection).Options;
            await using var platformDb = new PlatformDbContext(platformOptions);
            await using var seedDb = new TenantDbContext(tenantOptions);
            await using var studioDb = new AIStudioDbContext(new DbContextOptionsBuilder<AIStudioDbContext>().UseSqlServer(studioConnection).Options);
            platformCreated = await platformDb.Database.EnsureCreatedAsync();
            tenantCreated = await seedDb.Database.EnsureCreatedAsync();
            studioCreated = await studioDb.Database.EnsureCreatedAsync();
            Assert.True(platformCreated && tenantCreated && studioCreated);
            tenantCredential = await SqlAcceptanceTenantCredential.CreateAsync(configuredConnection!, tenantId);

            var tenant = new Tenant { Id = tenantId, Name = "Synthetic cash movement close", Slug = $"cash-close-{suffix}", BaseCurrencyCode = "TRY" };
            platformDb.Tenants.Add(tenant);
            platformDb.Users.Add(new AppUser { Id = userId, Email = $"cash-close-{suffix}@example.invalid", DisplayName = "Synthetic Tenant Admin", PasswordHash = "test" });
            platformDb.TenantMemberships.Add(new TenantMembership { TenantId = tenantId, UserId = userId, Role = "TenantAdmin" });
            platformDb.TenantDatabaseCatalog.Add(new TenantDatabaseCatalogEntry
            {
                TenantId = tenantId, Tenant = tenant, DatabaseName = new SqlConnectionStringBuilder(tenantConnection).InitialCatalog,
                State = TenantDatabaseProvisioningState.Ready, ReadyAt = DateTimeOffset.UtcNow
            });
            await platformDb.SaveChangesAsync();

            seedDb.Tenants.Add(tenant);
            var bank = new FinancialAccount { TenantId = tenantId, Code = "BANK-1", Name = "Synthetic bank", Type = FinancialAccountType.Bank, CurrencyCode = "TRY" };
            var secondBank = new FinancialAccount { TenantId = tenantId, Code = "BANK-2", Name = "Synthetic second bank", Type = FinancialAccountType.Bank, CurrencyCode = "TRY" };
            seedDb.FinancialAccounts.AddRange(bank, secondBank);
            var retained = Account(tenantId, "390", "Retained earnings", LedgerAccountStatementSection.Equity);
            var cash = Account(tenantId, "100", "Cash", LedgerAccountStatementSection.Asset);
            var capital = Account(tenantId, "300", "Capital", LedgerAccountStatementSection.Equity);
            var revenue = Account(tenantId, "600", "Revenue", LedgerAccountStatementSection.Revenue);
            seedDb.LedgerAccounts.AddRange(retained, cash, capital, revenue);
            var opening = new JournalEntry { TenantId = tenantId, Code = $"OPEN-{suffix}", EntryDate = new DateOnly(2024, 12, 31), Description = "Synthetic opening", SourceType = "Manual", SourceId = Guid.NewGuid() };
            opening.Lines.Add(new JournalEntryLine { TenantId = tenantId, JournalEntryId = opening.Id, AccountId = cash.Id, LineNumber = 1, Description = "Opening cash", Debit = 1000m, Credit = 0m });
            opening.Lines.Add(new JournalEntryLine { TenantId = tenantId, JournalEntryId = opening.Id, AccountId = capital.Id, LineNumber = 2, Description = "Opening capital", Debit = 0m, Credit = 1000m });
            var revenueEntry = new JournalEntry { TenantId = tenantId, Code = $"REV-2025-{suffix}", EntryDate = new DateOnly(2025, 1, 5), Description = "Synthetic revenue", SourceType = "Manual", SourceId = Guid.NewGuid() };
            revenueEntry.Lines.Add(new JournalEntryLine { TenantId = tenantId, JournalEntryId = revenueEntry.Id, AccountId = cash.Id, LineNumber = 1, Description = "Synthetic revenue", Debit = 100m, Credit = 0m });
            revenueEntry.Lines.Add(new JournalEntryLine { TenantId = tenantId, JournalEntryId = revenueEntry.Id, AccountId = revenue.Id, LineNumber = 2, Description = "Synthetic revenue", Debit = 0m, Credit = 100m });
            seedDb.JournalEntries.AddRange(opening, revenueEntry);
            await seedDb.SaveChangesAsync();

            using var startupOverride = ProcessEnvironmentOverride.Push(new Dictionary<string, string?>
            {
                ["Authentication__SigningKey"] = "synthetic-cash-close-acceptance-key-at-least-32-bytes",
                ["PluginHost__SigningKey"] = "different-synthetic-plugin-key-at-least-32-bytes-long",
                ["Authentication__Issuer"] = "AIERP", ["Authentication__Audience"] = "AIERP",
                ["ConnectionStrings__Platform"] = platformConnection, ["ConnectionStrings__Tenant"] = tenantConnection,
                ["ConnectionStrings__AIStudio"] = studioConnection, ["Database__SeparationEnabled"] = "true",
                ["Database__ApplyMigrationsOnStartup"] = "false"
            });
            using var factory = new FinancialMovementApiFactory(platformConnection, tenantConnection, studioConnection, tenantCredential.CredentialReader);
            using var client = factory.CreateClient();
            client.DefaultRequestHeaders.Add("X-Test-Tenant", tenantId.ToString("D"));
            client.DefaultRequestHeaders.Add("X-Test-User", userId.ToString("D"));

            var requestId = Guid.NewGuid();
            await seedDb.Database.ExecuteSqlRawAsync("""
                CREATE TRIGGER [dbo].[TR_TestFinancialMovementCloseAcceptance_HoldPosting]
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
            var movementTask = client.PostAsJsonAsync($"/api/finance/accounts/{bank.Id}/movements", new
            {
                requestId, transactionDate = "2025-04-15", direction = "Inflow", amount = 25m,
                description = "Synthetic bank receipt", reference = "SYN-BANK-1", cashFlowCategory = "Operating"
            });
            await WaitForPostingTriggerAsync(tenantConnection);
            Assert.False(movementTask.IsCompleted, "The SQL trigger did not hold the real manual financial-movement transaction.");
            var closeTask = client.PostAsJsonAsync("/api/finance/general-ledger/fiscal-year-close", new
            {
                fromDate = "2025-01-01", toDate = "2025-12-31", retainedEarningsAccountId = retained.Id
            });
            await Task.Delay(TimeSpan.FromMilliseconds(500));
            Assert.False(closeTask.IsCompleted, "Fiscal close completed before the held cash movement released the tenant lock.");
            using var postedMovement = await movementTask;
            Assert.True(postedMovement.StatusCode == HttpStatusCode.Created,
                $"Expected Created, got {(int)postedMovement.StatusCode}: {await postedMovement.Content.ReadAsStringAsync()}");
            using var close = await closeTask;
            Assert.Equal(HttpStatusCode.Created, close.StatusCode);

            await seedDb.Database.ExecuteSqlRawAsync("DROP TRIGGER [dbo].[TR_TestFinancialMovementCloseAcceptance_HoldPosting];");
            triggerCreated = false;
            var transactionsBeforeRejectedWrites = await seedDb.FinancialAccountTransactions.CountAsync(x => x.TenantId == tenantId);
            var transfersBeforeRejectedWrites = await seedDb.FinancialAccountTransfers.CountAsync(x => x.TenantId == tenantId);
            var movementAuditBeforeRejectedWrites = await seedDb.AuditEvents.CountAsync(x => x.TenantId == tenantId && x.Action == "financial-account.movement-posted");
            var transferAuditBeforeRejectedWrites = await seedDb.AuditEvents.CountAsync(x => x.TenantId == tenantId && x.Action == "financial-transfer.posted");
            using var closedMovement = await client.PostAsJsonAsync($"/api/finance/accounts/{bank.Id}/movements", new
            {
                requestId = Guid.NewGuid(), transactionDate = "2025-07-01", direction = "Inflow", amount = 10m,
                description = "Closed-period movement", reference = "SYN-CLOSED", cashFlowCategory = "Operating"
            });
            Assert.Equal(HttpStatusCode.Conflict, closedMovement.StatusCode);
            using var closedTransfer = await client.PostAsJsonAsync("/api/finance/transfers/", new
            {
                requestId = Guid.NewGuid(), fromAccountId = bank.Id, toAccountId = secondBank.Id,
                transferDate = "2025-08-01", amount = 10m, reference = "SYN-CLOSED-XFER", description = "Closed-period transfer", exchangeRate = 1m
            });
            Assert.Equal(HttpStatusCode.Conflict, closedTransfer.StatusCode);
            Assert.Equal(transactionsBeforeRejectedWrites, await seedDb.FinancialAccountTransactions.CountAsync(x => x.TenantId == tenantId));
            Assert.Equal(transfersBeforeRejectedWrites, await seedDb.FinancialAccountTransfers.CountAsync(x => x.TenantId == tenantId));
            Assert.Equal(movementAuditBeforeRejectedWrites, await seedDb.AuditEvents.CountAsync(x => x.TenantId == tenantId && x.Action == "financial-account.movement-posted"));
            Assert.Equal(transferAuditBeforeRejectedWrites, await seedDb.AuditEvents.CountAsync(x => x.TenantId == tenantId && x.Action == "financial-transfer.posted"));
        }
        finally
        {
            if (triggerCreated)
            {
                await using var cleanup = new TenantDbContext(new DbContextOptionsBuilder<TenantDbContext>().UseSqlServer(tenantConnection).Options);
                await cleanup.Database.ExecuteSqlRawAsync("DROP TRIGGER [dbo].[TR_TestFinancialMovementCloseAcceptance_HoldPosting];");
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
            if (tenantCredential is not null) await tenantCredential.DisposeAsync();
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
                  AND sql_text.[text] LIKE N'%TR_TestFinancialMovementCloseAcceptance_HoldPosting%';
                """;
            command.Parameters.AddWithValue("@tenantDatabase", tenantDatabase);
            if (Convert.ToInt32(await command.ExecuteScalarAsync()) > 0) return;
            await Task.Delay(TimeSpan.FromMilliseconds(100));
        }
        throw new TimeoutException("The manual financial-movement SQL trigger did not enter its WAITFOR barrier.");
    }

    private sealed class FinancialMovementApiFactory(string platformConnection, string tenantConnection, string studioConnection,
        ITenantSqlCredentialReader credentialReader)
        : WebApplicationFactory<ApiEntryPointMarker>
    {
        protected override IHost CreateHost(IHostBuilder builder)
        {
            builder.ConfigureHostConfiguration(configuration => configuration.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Vault:Address"] = "https://vault.test",
                ["Vault:TenantSqlCredentialReader:RoleId"] = "financial-movement-test-role",
                ["Vault:TenantSqlCredentialReader:SecretId"] = "financial-movement-test-secret"
            }));
            return base.CreateHost(builder);
        }

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Production);
            builder.ConfigureAppConfiguration((_, configuration) => configuration.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Authentication:SigningKey"] = "synthetic-cash-close-acceptance-key-at-least-32-bytes",
                ["PluginHost:SigningKey"] = "different-synthetic-plugin-key-at-least-32-bytes-long",
                ["Authentication:Issuer"] = "AIERP", ["Authentication:Audience"] = "AIERP",
                ["ConnectionStrings:Platform"] = platformConnection, ["ConnectionStrings:Tenant"] = tenantConnection,
                ["ConnectionStrings:AIStudio"] = studioConnection, ["Database:SeparationEnabled"] = "true",
                ["Database:ApplyMigrationsOnStartup"] = "false"
            }));
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<ITenantSqlCredentialReader>();
                services.AddSingleton(credentialReader);
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
