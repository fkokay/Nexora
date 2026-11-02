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
public sealed class ManualJournalFiscalCloseRouteSqlAcceptanceTests
{
    [SqlServerAcceptanceFact]
    public async Task Manual_journal_serializes_with_fiscal_close_and_rejects_closed_period_without_side_effects()
    {
        var configuredConnection = Environment.GetEnvironmentVariable("AIERP_REPORT_TEST_SQL_CONNECTION_STRING");
        Assert.False(string.IsNullOrWhiteSpace(configuredConnection));
        var suffix = Guid.NewGuid().ToString("N");
        var tenantId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        var platformConnection = DatabaseConnection(configuredConnection!, $"AIERP_ManualJournalClosePlatform_{suffix}");
        var tenantConnection = DatabaseConnection(configuredConnection!, $"AIERPTenant_{tenantId:N}");
        var studioConnection = DatabaseConnection(configuredConnection!, $"AIERP_ManualJournalCloseStudio_{suffix}");
        var platformCreated = false;
        var tenantCreated = false;
        var studioCreated = false;
        var triggerCreated = false;
        SqlAcceptanceTenantCredential? tenantCredential = null;
        try
        {
            await using var platformDb = new PlatformDbContext(new DbContextOptionsBuilder<PlatformDbContext>().UseSqlServer(platformConnection).Options);
            await using var seedDb = new TenantDbContext(new DbContextOptionsBuilder<TenantDbContext>().UseSqlServer(tenantConnection).Options);
            await using var studioDb = new AIStudioDbContext(new DbContextOptionsBuilder<AIStudioDbContext>().UseSqlServer(studioConnection).Options);
            platformCreated = await platformDb.Database.EnsureCreatedAsync();
            tenantCreated = await seedDb.Database.EnsureCreatedAsync();
            studioCreated = await studioDb.Database.EnsureCreatedAsync();
            Assert.True(platformCreated && tenantCreated && studioCreated);
            tenantCredential = await SqlAcceptanceTenantCredential.CreateAsync(configuredConnection!, tenantId);

            var tenant = new Tenant { Id = tenantId, Name = "Synthetic manual journal close", Slug = $"manual-journal-close-{suffix}", BaseCurrencyCode = "TRY" };
            platformDb.Tenants.Add(tenant);
            platformDb.Users.Add(new AppUser { Id = userId, Email = $"manual-journal-close-{suffix}@example.invalid", DisplayName = "Synthetic Tenant Admin", PasswordHash = "test" });
            platformDb.TenantMemberships.Add(new TenantMembership { TenantId = tenantId, UserId = userId, Role = "TenantAdmin" });
            platformDb.TenantDatabaseCatalog.Add(new TenantDatabaseCatalogEntry
            {
                TenantId = tenantId, Tenant = tenant, DatabaseName = new SqlConnectionStringBuilder(tenantConnection).InitialCatalog,
                State = TenantDatabaseProvisioningState.Ready, ReadyAt = DateTimeOffset.UtcNow
            });
            await platformDb.SaveChangesAsync();

            seedDb.Tenants.Add(tenant);
            var retainedEarnings = Account(tenantId, "390", "Retained earnings", LedgerAccountStatementSection.Equity);
            var cash = Account(tenantId, "100", "Cash", LedgerAccountStatementSection.Asset);
            var capital = Account(tenantId, "300", "Capital", LedgerAccountStatementSection.Equity);
            var revenue = Account(tenantId, "600", "Revenue", LedgerAccountStatementSection.Revenue);
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
            await seedDb.SaveChangesAsync();

            using var factory = new ManualJournalApiFactory(platformConnection, tenantConnection, studioConnection, tenantCredential.CredentialReader);
            using var client = factory.CreateClient();
            client.DefaultRequestHeaders.Add("X-Test-Tenant", tenantId.ToString("D"));
            client.DefaultRequestHeaders.Add("X-Test-User", userId.ToString("D"));

            await seedDb.Database.ExecuteSqlRawAsync("""
                CREATE TRIGGER [dbo].[TR_TestManualJournalCloseAcceptance_HoldPosting]
                ON [dbo].[JournalEntries]
                AFTER INSERT
                AS
                BEGIN
                    SET NOCOUNT ON;
                    IF EXISTS (SELECT 1 FROM inserted WHERE [SourceType] = N'Manual' AND [Code] LIKE N'YV-%')
                        WAITFOR DELAY '00:00:04';
                END;
                """);
            triggerCreated = true;

            var journalTask = client.PostAsJsonAsync("/api/finance/general-ledger/entries/manual", new
            {
                entryDate = "2025-04-15", description = "Synthetic manual journal",
                lines = new[]
                {
                    new { accountId = cash.Id, description = "Cash debit", debit = 25m, credit = 0m },
                    new { accountId = revenue.Id, description = "Revenue credit", debit = 0m, credit = 25m }
                }
            });
            await WaitForPostingTriggerAsync(tenantConnection);
            Assert.False(journalTask.IsCompleted, "The SQL trigger did not hold the real manual-journal transaction.");

            var closeTask = client.PostAsJsonAsync("/api/finance/general-ledger/fiscal-year-close", new
            {
                fromDate = "2025-01-01", toDate = "2025-12-31", retainedEarningsAccountId = retainedEarnings.Id
            });
            await WaitForTenantLockWaitAsync(tenantConnection);
            Assert.False(closeTask.IsCompleted, "Fiscal close completed before the held manual journal released the tenant lock.");

            using var posted = await journalTask;
            Assert.True(posted.StatusCode == HttpStatusCode.Created,
                $"Expected Created, got {(int)posted.StatusCode}: {await posted.Content.ReadAsStringAsync()}");
            using var closed = await closeTask;
            Assert.Equal(HttpStatusCode.Created, closed.StatusCode);
            await seedDb.Database.ExecuteSqlRawAsync("DROP TRIGGER [dbo].[TR_TestManualJournalCloseAcceptance_HoldPosting];");
            triggerCreated = false;

            var persistedManualEntry = await seedDb.JournalEntries.AsNoTracking().Include(x => x.Lines)
                .SingleAsync(x => x.TenantId == tenantId && x.Description == "Synthetic manual journal");
            Assert.Equal(new DateOnly(2025, 4, 15), persistedManualEntry.EntryDate);
            Assert.Equal(25m, persistedManualEntry.Lines.Sum(x => x.Debit));
            Assert.Equal(25m, persistedManualEntry.Lines.Sum(x => x.Credit));
            var manualAuditCount = await seedDb.AuditEvents.CountAsync(x => x.TenantId == tenantId && x.Action == "finance.general-ledger.manual-entry-created");
            Assert.Equal(1, manualAuditCount);

            using var rejected = await client.PostAsJsonAsync("/api/finance/general-ledger/entries/manual", new
            {
                entryDate = "2025-06-01", description = "Closed-period journal",
                lines = new[]
                {
                    new { accountId = cash.Id, description = "Cash debit", debit = 10m, credit = 0m },
                    new { accountId = revenue.Id, description = "Revenue credit", debit = 0m, credit = 10m }
                }
            });
            Assert.Equal(HttpStatusCode.Conflict, rejected.StatusCode);
            Assert.Contains("dönemi kapalı", await rejected.Content.ReadAsStringAsync(), StringComparison.OrdinalIgnoreCase);
            Assert.Equal(1, await seedDb.JournalEntries.CountAsync(x => x.TenantId == tenantId && x.Description == "Synthetic manual journal"));
            Assert.Equal(manualAuditCount, await seedDb.AuditEvents.CountAsync(x => x.TenantId == tenantId && x.Action == "finance.general-ledger.manual-entry-created"));
        }
        finally
        {
            if (triggerCreated)
            {
                await using var cleanup = new TenantDbContext(new DbContextOptionsBuilder<TenantDbContext>().UseSqlServer(tenantConnection).Options);
                await cleanup.Database.ExecuteSqlRawAsync("DROP TRIGGER [dbo].[TR_TestManualJournalCloseAcceptance_HoldPosting];");
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
                  AND sql_text.[text] LIKE N'%TR_TestManualJournalCloseAcceptance_HoldPosting%';
                """;
            command.Parameters.AddWithValue("@tenantDatabase", tenantDatabase);
            if (Convert.ToInt32(await command.ExecuteScalarAsync()) > 0) return;
            await Task.Delay(TimeSpan.FromMilliseconds(100));
        }
        throw new TimeoutException("The manual-journal SQL trigger did not enter its WAITFOR barrier.");
    }

    private static async Task WaitForTenantLockWaitAsync(string tenantConnection)
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
                WHERE requests.database_id = DB_ID(@tenantDatabase)
                  AND requests.wait_type LIKE N'LCK_M%';
                """;
            command.Parameters.AddWithValue("@tenantDatabase", tenantDatabase);
            if (Convert.ToInt32(await command.ExecuteScalarAsync()) > 0) return;
            await Task.Delay(TimeSpan.FromMilliseconds(50));
        }
        throw new TimeoutException("Fiscal close did not wait on the in-flight manual-journal tenant lock.");
    }

    private sealed class ManualJournalApiFactory(string platformConnection, string tenantConnection, string studioConnection,
        ITenantSqlCredentialReader credentialReader) : WebApplicationFactory<ApiEntryPointMarker>
    {
        protected override IHost CreateHost(IHostBuilder builder)
        {
            builder.ConfigureHostConfiguration(configuration => configuration.AddInMemoryCollection(new Dictionary<string, string?>
            {
                // A deterministic test-only value lets Program validate JWT setup
                // before the web-host app configuration is composed.
                ["Authentication:SigningKey"] = "synthetic-manual-journal-close-key-at-least-32-bytes",
                ["PluginHost:SigningKey"] = "different-synthetic-plugin-key-at-least-32-bytes-long",
                ["Authentication:Issuer"] = "AIERP",
                ["Authentication:Audience"] = "AIERP",
                ["ConnectionStrings:Platform"] = platformConnection,
                ["ConnectionStrings:Tenant"] = tenantConnection,
                ["ConnectionStrings:AIStudio"] = studioConnection,
                ["Database:SeparationEnabled"] = "true",
                ["Database:ApplyMigrationsOnStartup"] = "false",
                ["Vault:Address"] = "https://vault.test",
                ["Vault:TenantSqlCredentialReader:RoleId"] = "manual-journal-test-role",
                ["Vault:TenantSqlCredentialReader:SecretId"] = "manual-journal-test-secret"
            }));
            return base.CreateHost(builder);
        }

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Production);
            builder.ConfigureAppConfiguration((_, configuration) => configuration.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Authentication:SigningKey"] = "synthetic-manual-journal-close-key-at-least-32-bytes",
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
}
