using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
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
public sealed class FixedAssetDepreciationFiscalCloseSqlAcceptanceTests
{
    [SqlServerAcceptanceFact]
    public async Task Fixed_asset_depreciation_is_rejected_in_closed_period_without_journal_or_asset_changes()
    {
        var configuredConnection = Environment.GetEnvironmentVariable("AIERP_REPORT_TEST_SQL_CONNECTION_STRING");
        Assert.False(string.IsNullOrWhiteSpace(configuredConnection));
        var tenantId = Guid.NewGuid();
        var otherTenantId = Guid.NewGuid();
        var databaseName = $"AIERP_FixedAssetDepreciationClose_{Guid.NewGuid():N}";
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

            seedDb.Tenants.AddRange(
                new Tenant { Id = tenantId, Name = "Synthetic depreciation close", Slug = $"fa-dep-close-{tenantId:N}", BaseCurrencyCode = "TRY" },
                new Tenant { Id = otherTenantId, Name = "Synthetic other tenant", Slug = $"fa-dep-other-{otherTenantId:N}", BaseCurrencyCode = "TRY" });
            var accumulated = Account(tenantId, "257", "Accumulated depreciation", LedgerAccountStatementSection.Asset);
            var expense = Account(tenantId, "770", "Depreciation expense", LedgerAccountStatementSection.Expense);
            var taxAccumulated = Account(tenantId, "257-TAX", "Tax accumulated depreciation", LedgerAccountStatementSection.Asset);
            var taxExpense = Account(tenantId, "770-TAX", "Tax depreciation expense", LedgerAccountStatementSection.Expense);
            var retainedEarnings = Account(tenantId, "570", "Retained earnings", LedgerAccountStatementSection.Equity);
            var cash = Account(tenantId, "100", "Cash", LedgerAccountStatementSection.Asset);
            var capital = Account(tenantId, "500", "Capital", LedgerAccountStatementSection.Equity);
            var revenue = Account(tenantId, "600", "Revenue", LedgerAccountStatementSection.Revenue);
            seedDb.LedgerAccounts.AddRange(accumulated, expense, taxAccumulated, taxExpense, retainedEarnings, cash, capital, revenue);
            seedDb.LedgerAccountMappings.AddRange(
                Mapping(tenantId, LedgerMappingKeys.FixedAssetAccumulatedDepreciation, accumulated),
                Mapping(tenantId, LedgerMappingKeys.FixedAssetDepreciationExpense, expense),
                Mapping(tenantId, LedgerMappingKeys.FixedAssetTaxAccumulatedDepreciation, taxAccumulated),
                Mapping(tenantId, LedgerMappingKeys.FixedAssetTaxDepreciationExpense, taxExpense));

            var opening = new JournalEntry
            {
                TenantId = tenantId, Code = $"OPEN-{tenantId:N}", EntryDate = new DateOnly(2024, 12, 31),
                Description = "Synthetic opening balance", SourceType = "Manual", SourceId = Guid.NewGuid()
            };
            opening.Lines.Add(new JournalEntryLine
            {
                TenantId = tenantId, JournalEntryId = opening.Id, AccountId = cash.Id, LineNumber = 1,
                Description = "Synthetic opening cash", Debit = 1000m, Credit = 0m
            });
            opening.Lines.Add(new JournalEntryLine
            {
                TenantId = tenantId, JournalEntryId = opening.Id, AccountId = capital.Id, LineNumber = 2,
                Description = "Synthetic opening capital", Debit = 0m, Credit = 1000m
            });
            var currentYearIncome = new JournalEntry
            {
                TenantId = tenantId, Code = $"REV-{tenantId:N}", EntryDate = new DateOnly(2025, 6, 1),
                Description = "Synthetic current-year income", SourceType = "Manual", SourceId = Guid.NewGuid()
            };
            currentYearIncome.Lines.Add(new JournalEntryLine
            {
                TenantId = tenantId, JournalEntryId = currentYearIncome.Id, AccountId = cash.Id, LineNumber = 1,
                Description = "Synthetic receipt", Debit = 100m, Credit = 0m
            });
            currentYearIncome.Lines.Add(new JournalEntryLine
            {
                TenantId = tenantId, JournalEntryId = currentYearIncome.Id, AccountId = revenue.Id, LineNumber = 2,
                Description = "Synthetic revenue", Debit = 0m, Credit = 100m
            });
            seedDb.JournalEntries.AddRange(opening, currentYearIncome);

            var asset = Asset(tenantId, "DEPRECIATION-CLOSED", new DateOnly(2025, 1, 1));
            var taxAsset = Asset(tenantId, "TAX-DEPRECIATION-CLOSED", new DateOnly(2024, 12, 1));
            taxAsset.VukUsefulLifeCode = "TEST-VUK";
            taxAsset.VukUsefulLifeDescription = "Synthetic test profile";
            taxAsset.VukUsefulLifeTableYear = 2025;
            taxAsset.VukUsefulLifeCommuniqueNumber = 1;
            taxAsset.VukUsefulLifeMonths = 60;
            taxAsset.VukNormalDepreciationRatePercent = 20m;
            taxAsset.VukTaxDepreciationStartDate = new DateOnly(2024, 12, 1);
            var openTaxAsset = Asset(tenantId, "TAX-DEPRECIATION-OPEN", new DateOnly(2025, 1, 1));
            openTaxAsset.VukUsefulLifeCode = "TEST-VUK";
            openTaxAsset.VukUsefulLifeDescription = "Synthetic test profile";
            openTaxAsset.VukUsefulLifeTableYear = 2025;
            openTaxAsset.VukUsefulLifeCommuniqueNumber = 1;
            openTaxAsset.VukUsefulLifeMonths = 60;
            openTaxAsset.VukNormalDepreciationRatePercent = 20m;
            openTaxAsset.VukTaxDepreciationStartDate = new DateOnly(2025, 12, 1);
            var otherTenantAsset = Asset(otherTenantId, "OTHER-TENANT-ASSET", new DateOnly(2025, 1, 1));
            seedDb.FixedAssets.AddRange(asset, taxAsset, openTaxAsset, otherTenantAsset);
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

            using var close = await client.PostAsJsonAsync("/api/finance/general-ledger/fiscal-year-close", new
            {
                fromDate = "2025-01-01", toDate = "2025-12-31", retainedEarningsAccountId = retainedEarnings.Id
            });
            Assert.Equal(HttpStatusCode.Created, close.StatusCode);
            Assert.True(await seedDb.JournalEntries.AnyAsync(x => x.TenantId == tenantId && x.SourceType == "FiscalYearClose" &&
                x.Code == "FY-CLOSE-20250101-20251231"));

            var postingsBefore = await seedDb.FixedAssetDepreciationPostings.CountAsync(x => x.TenantId == tenantId);
            var depreciationJournalsBefore = await seedDb.JournalEntries.CountAsync(x => x.TenantId == tenantId && x.SourceType == "FixedAssetDepreciation");
            var depreciationAuditsBefore = await seedDb.AuditEvents.CountAsync(x => x.TenantId == tenantId && x.Action == "fixed-asset.depreciation-posted");
            var accumulatedBefore = await seedDb.FixedAssets.Where(x => x.TenantId == tenantId && x.Id == asset.Id)
                .Select(x => x.AccumulatedDepreciationBase).SingleAsync();

            using var rejected = await client.PostAsJsonAsync($"/api/fixed-assets/{asset.Id}/depreciation-postings", new
            {
                periodStart = "2025-02-01"
            });
            Assert.Equal(HttpStatusCode.Conflict, rejected.StatusCode);
            Assert.Equal(postingsBefore, await seedDb.FixedAssetDepreciationPostings.CountAsync(x => x.TenantId == tenantId));
            Assert.Equal(depreciationJournalsBefore, await seedDb.JournalEntries.CountAsync(x => x.TenantId == tenantId && x.SourceType == "FixedAssetDepreciation"));
            Assert.Equal(depreciationAuditsBefore, await seedDb.AuditEvents.CountAsync(x => x.TenantId == tenantId && x.Action == "fixed-asset.depreciation-posted"));
            Assert.Equal(accumulatedBefore, await seedDb.FixedAssets.Where(x => x.TenantId == tenantId && x.Id == asset.Id)
                .Select(x => x.AccumulatedDepreciationBase).SingleAsync());

            var taxJournalSource = "FixedAssetTaxDepreciation";
            var taxJournalSourceId = TaxDepreciationSourceId(taxAsset.Id, new DateOnly(2025, 1, 1));
            var taxJournalCountBefore = await seedDb.JournalEntries.CountAsync(x => x.TenantId == tenantId && x.SourceType == taxJournalSource && x.SourceId == taxJournalSourceId);
            var taxAuditCountBefore = await seedDb.AuditEvents.CountAsync(x => x.TenantId == tenantId && x.Action == "fixed-asset.tax-depreciation-posted");
            using var rejectedTax = await client.PostAsJsonAsync($"/api/fixed-assets/{taxAsset.Id}/tax-depreciation-postings", new
            {
                periodStart = "2025-01-01"
            });
            Assert.Equal(HttpStatusCode.Conflict, rejectedTax.StatusCode);
            Assert.Equal(taxJournalCountBefore, await seedDb.JournalEntries.CountAsync(x => x.TenantId == tenantId && x.SourceType == taxJournalSource && x.SourceId == taxJournalSourceId));
            Assert.Equal(taxAuditCountBefore, await seedDb.AuditEvents.CountAsync(x => x.TenantId == tenantId && x.Action == "fixed-asset.tax-depreciation-posted"));
            Assert.Equal(0m, await seedDb.FixedAssets.Where(x => x.TenantId == tenantId && x.Id == taxAsset.Id)
                .Select(x => x.AccumulatedDepreciationBase).SingleAsync());

            var openTaxMonth = new DateOnly(2026, 1, 1);
            using var openTaxPosting = await client.PostAsJsonAsync($"/api/fixed-assets/{openTaxAsset.Id}/tax-depreciation-postings", new
            {
                periodStart = openTaxMonth.ToString("yyyy-MM-dd")
            });
            Assert.Equal(HttpStatusCode.Created, openTaxPosting.StatusCode);
            using var openTaxPostingBody = JsonDocument.Parse(await openTaxPosting.Content.ReadAsStringAsync());
            Assert.Equal(20m, openTaxPostingBody.RootElement.GetProperty("amountBase").GetDecimal());
            Assert.False(openTaxPostingBody.RootElement.GetProperty("isStatutoryFiling").GetBoolean());

            using var duplicateOpenTaxPosting = await client.PostAsJsonAsync($"/api/fixed-assets/{openTaxAsset.Id}/tax-depreciation-postings", new
            {
                periodStart = openTaxMonth.ToString("yyyy-MM-dd")
            });
            Assert.Equal(HttpStatusCode.Conflict, duplicateOpenTaxPosting.StatusCode);

            var openTaxJournalSource = "FixedAssetTaxDepreciation";
            var openTaxSourceId = TaxDepreciationSourceId(openTaxAsset.Id, openTaxMonth);
            var openTaxJournal = await seedDb.JournalEntries.Include(x => x.Lines).SingleAsync(x => x.TenantId == tenantId &&
                x.SourceType == openTaxJournalSource && x.SourceId == openTaxSourceId);
            Assert.Equal(20m, openTaxJournal.Lines.Sum(x => x.Debit));
            Assert.Equal(20m, openTaxJournal.Lines.Sum(x => x.Credit));
            Assert.Equal(taxExpense.Id, openTaxJournal.Lines.Single(x => x.Debit > 0).AccountId);
            Assert.Equal(taxAccumulated.Id, openTaxJournal.Lines.Single(x => x.Credit > 0).AccountId);
            Assert.Equal(0m, await seedDb.FixedAssets.Where(x => x.TenantId == tenantId && x.Id == openTaxAsset.Id)
                .Select(x => x.AccumulatedDepreciationBase).SingleAsync());
            Assert.Equal(1, await seedDb.JournalEntries.CountAsync(x => x.TenantId == tenantId && x.SourceType == openTaxJournalSource && x.SourceId == openTaxSourceId));
            Assert.Equal(1, await seedDb.AuditEvents.CountAsync(x => x.TenantId == tenantId && x.Action == "fixed-asset.tax-depreciation-posted"));

            using var crossTenant = await client.PostAsJsonAsync($"/api/fixed-assets/{otherTenantAsset.Id}/depreciation-postings", new
            {
                periodStart = "2025-02-01"
            });
            Assert.Equal(HttpStatusCode.NotFound, crossTenant.StatusCode);
            Assert.False(await seedDb.FixedAssetDepreciationPostings.AnyAsync(x => x.TenantId == otherTenantId && x.AssetId == otherTenantAsset.Id));
        }
        finally
        {
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
        InServiceDate = acquisitionDate, AcquisitionCostBase = 1200m, ResidualValueBase = 0m, UsefulLifeMonths = 60
    };

    private static Guid TaxDepreciationSourceId(Guid assetId, DateOnly month)
    {
        var hash = System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes($"{assetId:N}:{month:yyyy-MM}"));
        return new Guid(hash.AsSpan(0, 16));
    }
}
