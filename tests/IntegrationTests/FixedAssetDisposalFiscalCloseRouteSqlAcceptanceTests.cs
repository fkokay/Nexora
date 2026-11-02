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
public sealed class FixedAssetDisposalFiscalCloseRouteSqlAcceptanceTests
{
    [SqlServerAcceptanceFact]
    public async Task Fixed_asset_disposal_route_serializes_with_fiscal_close_and_rejects_closed_period_without_side_effects()
    {
        var configuredConnection = Environment.GetEnvironmentVariable("AIERP_REPORT_TEST_SQL_CONNECTION_STRING");
        Assert.False(string.IsNullOrWhiteSpace(configuredConnection));
        var tenantId = Guid.NewGuid();
        var databaseName = $"AIERP_FixedAssetDisposalCloseAcceptance_{Guid.NewGuid():N}";
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
                Id = tenantId, Name = "Synthetic fixed asset disposal close", Slug = $"fa-disposal-close-{tenantId:N}", BaseCurrencyCode = "TRY"
            };
            var assetCost = Account(tenantId, "250", "Fixed asset cost", LedgerAccountStatementSection.Asset);
            var accumulatedDepreciation = Account(tenantId, "257", "Accumulated depreciation", LedgerAccountStatementSection.Asset);
            var depreciationExpense = Account(tenantId, "770", "Depreciation expense", LedgerAccountStatementSection.Expense);
            var proceedsAccount = Account(tenantId, "100", "Cash proceeds", LedgerAccountStatementSection.Asset);
            var gainAccount = Account(tenantId, "679", "Disposal gain", LedgerAccountStatementSection.Revenue);
            var lossAccount = Account(tenantId, "689", "Disposal loss", LedgerAccountStatementSection.Expense);
            var capital = Account(tenantId, "500", "Capital", LedgerAccountStatementSection.Equity);
            var retainedEarnings = Account(tenantId, "570", "Retained earnings", LedgerAccountStatementSection.Equity);
            var cash = Account(tenantId, "101", "Opening cash", LedgerAccountStatementSection.Asset);
            var revenue = Account(tenantId, "600", "Revenue", LedgerAccountStatementSection.Revenue);

            seedDb.Tenants.Add(tenant);
            seedDb.LedgerAccounts.AddRange(assetCost, accumulatedDepreciation, depreciationExpense, proceedsAccount,
                gainAccount, lossAccount, capital, retainedEarnings, cash, revenue);
            seedDb.LedgerAccountMappings.AddRange(
                Mapping(tenantId, LedgerMappingKeys.FixedAssetCost, assetCost),
                Mapping(tenantId, LedgerMappingKeys.FixedAssetAccumulatedDepreciation, accumulatedDepreciation),
                Mapping(tenantId, LedgerMappingKeys.FixedAssetDepreciationExpense, depreciationExpense),
                Mapping(tenantId, LedgerMappingKeys.FixedAssetDisposalProceeds, proceedsAccount),
                Mapping(tenantId, LedgerMappingKeys.FixedAssetDisposalGain, gainAccount),
                Mapping(tenantId, LedgerMappingKeys.FixedAssetDisposalLoss, lossAccount));

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
                TenantId = tenantId, Code = $"REV-2025-{tenantId:N}", EntryDate = new DateOnly(2025, 1, 10),
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

            var raceAsset = Asset(tenantId, "DEVICE-RACE", new DateOnly(2025, 1, 1));
            var closedAsset = Asset(tenantId, "DEVICE-CLOSED", new DateOnly(2025, 1, 1));
            seedDb.FixedAssets.AddRange(raceAsset, closedAsset);
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
                CREATE TRIGGER [dbo].[TR_TestFixedAssetDisposalCloseAcceptance_HoldPosting]
                ON [dbo].[JournalEntries]
                AFTER INSERT
                AS
                BEGIN
                    SET NOCOUNT ON;
                    IF EXISTS (SELECT 1 FROM inserted WHERE [SourceType] = 'FixedAssetDisposal')
                        WAITFOR DELAY '00:00:04';
                END;
                """);
            triggerCreated = true;

            var idempotencyKey = Guid.NewGuid();
            var disposalTask = client.PostAsJsonAsync($"/api/fixed-assets/{raceAsset.Id}/disposals", new
            {
                disposalDate = "2025-06-15", reason = "Synthetic retirement", proceedsBase = 100m, idempotencyKey
            });
            await Task.Delay(TimeSpan.FromMilliseconds(600));
            Assert.False(disposalTask.IsCompleted, "The SQL trigger did not hold the fixed asset disposal transaction.");

            var closeTask = client.PostAsJsonAsync("/api/finance/general-ledger/fiscal-year-close", new
            {
                fromDate = "2025-01-01", toDate = "2025-12-31", retainedEarningsAccountId = retainedEarnings.Id
            });
            Assert.NotSame(closeTask, await Task.WhenAny(closeTask, Task.Delay(TimeSpan.FromMilliseconds(500))));

            using var disposed = await disposalTask;
            Assert.Equal(HttpStatusCode.Created, disposed.StatusCode);
            using var closed = await closeTask;
            Assert.Equal(HttpStatusCode.Created, closed.StatusCode);

            var disposal = await seedDb.FixedAssetDisposals.SingleAsync(x => x.TenantId == tenantId && x.AssetId == raceAsset.Id);
            var disposalEntry = await seedDb.JournalEntries.Include(x => x.Lines)
                .SingleAsync(x => x.TenantId == tenantId && x.SourceType == "FixedAssetDisposal" && x.SourceId == disposal.Id);
            Assert.Equal(new DateOnly(2025, 6, 15), disposalEntry.EntryDate);
            Assert.Equal(disposalEntry.Lines.Sum(x => x.Debit), disposalEntry.Lines.Sum(x => x.Credit));
            Assert.Equal(FixedAssetStatus.Disposed,
                (await seedDb.FixedAssets.AsNoTracking().SingleAsync(x => x.TenantId == tenantId && x.Id == raceAsset.Id)).Status);
            Assert.True(await seedDb.AuditEvents.AnyAsync(x => x.TenantId == tenantId && x.Action == "fixed-asset.disposed"));

            var openingEntry = await seedDb.JournalEntries.Include(x => x.Lines)
                .SingleAsync(x => x.TenantId == tenantId && x.SourceType == "FiscalYearOpening");
            Assert.Equal(new DateOnly(2026, 1, 1), openingEntry.EntryDate);
            Assert.Contains(openingEntry.Lines, x => x.AccountId == proceedsAccount.Id && x.Debit > 0m);
            Assert.Contains(openingEntry.Lines, x => x.AccountId == retainedEarnings.Id && x.Debit > 0m);

            var journalCountBeforeRejectedPost = await seedDb.JournalEntries.CountAsync(x => x.TenantId == tenantId);
            var disposalCountBeforeRejectedPost = await seedDb.FixedAssetDisposals.CountAsync(x => x.TenantId == tenantId);
            var auditCountBeforeRejectedPost = await seedDb.AuditEvents.CountAsync(x => x.TenantId == tenantId);
            var activeStatusBeforeRejectedPost = (await seedDb.FixedAssets.SingleAsync(x => x.TenantId == tenantId && x.Id == closedAsset.Id)).Status;
            using var rejected = await client.PostAsJsonAsync($"/api/fixed-assets/{closedAsset.Id}/disposals", new
            {
                disposalDate = "2025-03-15", reason = "Synthetic closed-period retirement", proceedsBase = 0m,
                idempotencyKey = Guid.NewGuid()
            });
            Assert.Equal(HttpStatusCode.Conflict, rejected.StatusCode);
            Assert.Equal(journalCountBeforeRejectedPost, await seedDb.JournalEntries.CountAsync(x => x.TenantId == tenantId));
            Assert.Equal(disposalCountBeforeRejectedPost, await seedDb.FixedAssetDisposals.CountAsync(x => x.TenantId == tenantId));
            Assert.Equal(auditCountBeforeRejectedPost, await seedDb.AuditEvents.CountAsync(x => x.TenantId == tenantId));
            Assert.Equal(activeStatusBeforeRejectedPost,
                (await seedDb.FixedAssets.SingleAsync(x => x.TenantId == tenantId && x.Id == closedAsset.Id)).Status);
            Assert.False(await seedDb.FixedAssetDisposals.AnyAsync(x => x.TenantId == tenantId && x.AssetId == closedAsset.Id));
        }
        finally
        {
            if (triggerCreated)
                await seedDb.Database.ExecuteSqlRawAsync("DROP TRIGGER [dbo].[TR_TestFixedAssetDisposalCloseAcceptance_HoldPosting];");
            if (databaseCreated)
                await seedDb.Database.EnsureDeletedAsync();
        }
    }

    private static LedgerAccount Account(Guid tenantId, string code, string name, LedgerAccountStatementSection section)
        => new() { TenantId = tenantId, Code = code, Name = name, StatementSection = section };

    private static LedgerAccountMapping Mapping(Guid tenantId, string key, LedgerAccount account)
        => new() { TenantId = tenantId, MappingKey = key, AccountId = account.Id };

    private static FixedAsset Asset(Guid tenantId, string code, DateOnly acquisitionDate) => new()
    {
        TenantId = tenantId, AssetCode = code, Name = code, Category = "Equipment", AcquisitionDate = acquisitionDate,
        InServiceDate = acquisitionDate, AcquisitionCostBase = 1200m, ResidualValueBase = 0m,
        UsefulLifeMonths = 12
    };
}
