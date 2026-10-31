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
public sealed class FixedAssetFiscalCloseSqlAcceptanceTests
{
    [SqlServerAcceptanceFact]
    public async Task Fixed_asset_acquisition_posting_serializes_with_fiscal_close_and_respects_closed_period_on_sql_server()
    {
        var configuredConnection = Environment.GetEnvironmentVariable("AIERP_REPORT_TEST_SQL_CONNECTION_STRING");
        Assert.False(string.IsNullOrWhiteSpace(configuredConnection));
        var tenantId = Guid.NewGuid();
        var databaseName = $"AIERP_FixedAssetCloseAcceptance_{Guid.NewGuid():N}";
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
            var tenant = new Tenant
            {
                Id = tenantId, Name = "Synthetic fixed asset close", Slug = $"fa-close-{tenantId:N}", BaseCurrencyCode = "TRY"
            };
            var cost = Account(tenantId, "250", "Fixed asset cost", LedgerAccountStatementSection.Asset);
            var capital = Account(tenantId, "500", "Capital", LedgerAccountStatementSection.Equity);
            var retainedEarnings = Account(tenantId, "570", "Retained earnings", LedgerAccountStatementSection.Equity);
            var cash = Account(tenantId, "100", "Cash", LedgerAccountStatementSection.Asset);
            var revenue = Account(tenantId, "600", "Revenue", LedgerAccountStatementSection.Revenue);
            var offset = Account(tenantId, "320", "Acquisition offset", LedgerAccountStatementSection.Liability);
            seedDb.Tenants.Add(tenant);
            seedDb.LedgerAccounts.AddRange(cost, capital, retainedEarnings, cash, revenue, offset);
            seedDb.LedgerAccountMappings.Add(new LedgerAccountMapping
            {
                TenantId = tenantId, MappingKey = LedgerMappingKeys.FixedAssetCost, AccountId = cost.Id
            });
            var opening = new JournalEntry
            {
                TenantId = tenantId, Code = $"OPEN-{tenantId:N}", EntryDate = new DateOnly(2024, 12, 31),
                Description = "Synthetic opening balance", SourceType = "Manual", SourceId = Guid.NewGuid()
            };
            opening.Lines.Add(new JournalEntryLine
            {
                TenantId = tenantId, JournalEntryId = opening.Id, AccountId = cash.Id, LineNumber = 1,
                Description = "Synthetic opening balance", Debit = 1000m, Credit = 0m
            });
            opening.Lines.Add(new JournalEntryLine
            {
                TenantId = tenantId, JournalEntryId = opening.Id, AccountId = capital.Id, LineNumber = 2,
                Description = "Synthetic opening balance", Debit = 0m, Credit = 1000m
            });
            var priorYearIncome = new JournalEntry
            {
                TenantId = tenantId, Code = $"REV-2025-{tenantId:N}", EntryDate = new DateOnly(2025, 6, 1),
                Description = "Synthetic current-year revenue", SourceType = "Manual", SourceId = Guid.NewGuid()
            };
            priorYearIncome.Lines.Add(new JournalEntryLine
            {
                TenantId = tenantId, JournalEntryId = priorYearIncome.Id, AccountId = cash.Id, LineNumber = 1,
                Description = "Synthetic receipt", Debit = 100m, Credit = 0m
            });
            priorYearIncome.Lines.Add(new JournalEntryLine
            {
                TenantId = tenantId, JournalEntryId = priorYearIncome.Id, AccountId = revenue.Id, LineNumber = 2,
                Description = "Synthetic revenue", Debit = 0m, Credit = 100m
            });
            seedDb.JournalEntries.AddRange(opening, priorYearIncome);
            var postedAsset = Asset(tenantId, "MACHINE-RACE", new DateOnly(2025, 4, 15));
            var unpostedAsset = Asset(tenantId, "MACHINE-CLOSED", new DateOnly(2025, 8, 20));
            seedDb.FixedAssets.AddRange(postedAsset, unpostedAsset);
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
            app.MapFixedAssetEndpoints();
            app.MapGroup("/api/finance/general-ledger").MapFiscalYearCloseEndpoints();
            await app.StartAsync();
            using var client = app.GetTestClient();
            client.DefaultRequestHeaders.Add("X-Test-Tenant", tenantId.ToString("D"));

            await seedDb.Database.ExecuteSqlRawAsync("""
                CREATE TRIGGER [dbo].[TR_TestFixedAssetCloseAcceptance_HoldPosting]
                ON [dbo].[JournalEntries]
                AFTER INSERT
                AS
                BEGIN
                    SET NOCOUNT ON;
                    IF EXISTS (SELECT 1 FROM inserted WHERE [SourceType] = 'FixedAssetAcquisition')
                        WAITFOR DELAY '00:00:04';
                END;
                """);
            triggerCreated = true;

            var acquisitionTask = client.PostAsJsonAsync($"/api/fixed-assets/{postedAsset.Id}/acquisition-posting", new { offsetAccountId = offset.Id });
            await Task.Delay(TimeSpan.FromMilliseconds(600));
            Assert.False(acquisitionTask.IsCompleted, "The SQL trigger did not hold the fixed asset posting transaction.");

            var closeTask = client.PostAsJsonAsync("/api/finance/general-ledger/fiscal-year-close", new
            {
                fromDate = "2025-01-01", toDate = "2025-12-31", retainedEarningsAccountId = retainedEarnings.Id
            });
            Assert.NotSame(closeTask, await Task.WhenAny(closeTask, Task.Delay(TimeSpan.FromMilliseconds(500))));

            using var acquisition = await acquisitionTask;
            Assert.Equal(HttpStatusCode.Created, acquisition.StatusCode);
            using var closed = await closeTask;
            Assert.Equal(HttpStatusCode.Created, closed.StatusCode);

            var acquisitionCount = await seedDb.JournalEntries.CountAsync(x => x.TenantId == tenantId && x.SourceType == "FixedAssetAcquisition");
            Assert.Equal(1, acquisitionCount);
            var closeEntry = await seedDb.JournalEntries.SingleAsync(x => x.TenantId == tenantId && x.SourceType == "FiscalYearClose");
            var openingEntry = await seedDb.JournalEntries.Include(x => x.Lines)
                .SingleAsync(x => x.TenantId == tenantId && x.SourceType == "FiscalYearOpening");
            Assert.Contains(openingEntry.Lines, x => x.AccountId == cost.Id && x.Debit > 0m);
            Assert.Contains(openingEntry.Lines, x => x.AccountId == offset.Id && x.Credit > 0m);
            Assert.Equal(closeEntry.EntryDate.AddDays(1), openingEntry.EntryDate);

            using var rejected = await client.PostAsJsonAsync($"/api/fixed-assets/{unpostedAsset.Id}/acquisition-posting", new { offsetAccountId = offset.Id });
            Assert.Equal(HttpStatusCode.Conflict, rejected.StatusCode);
            Assert.Equal(acquisitionCount, await seedDb.JournalEntries.CountAsync(x => x.TenantId == tenantId && x.SourceType == "FixedAssetAcquisition"));
            Assert.False(await seedDb.AuditEvents.AnyAsync(x => x.TenantId == tenantId && x.Action == "fixed-asset.acquisition-posted" && x.Resource == unpostedAsset.AssetCode));
        }
        finally
        {
            if (triggerCreated)
                await seedDb.Database.ExecuteSqlRawAsync("DROP TRIGGER [dbo].[TR_TestFixedAssetCloseAcceptance_HoldPosting];");
            if (databaseCreated)
                await seedDb.Database.EnsureDeletedAsync();
        }
    }

    private static LedgerAccount Account(Guid tenantId, string code, string name, LedgerAccountStatementSection section)
        => new() { TenantId = tenantId, Code = code, Name = name, StatementSection = section };

    private static FixedAsset Asset(Guid tenantId, string code, DateOnly acquisitionDate) => new()
    {
        TenantId = tenantId, AssetCode = code, Name = code, Category = "Equipment", AcquisitionDate = acquisitionDate,
        InServiceDate = acquisitionDate.AddMonths(1), AcquisitionCostBase = 250m, ResidualValueBase = 0m,
        UsefulLifeMonths = 60
    };
}
