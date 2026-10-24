using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace AIERP.Api.IntegrationTests;

public sealed class FixedAssetAcquisitionPostingIntegrationTests
{
    [Fact]
    public async Task Acquisition_posting_requires_active_tenant_cost_mapping_and_offset_account()
    {
        var tenantId = Guid.NewGuid();
        await using var app = await StartAsync(tenantId);
        var asset = NewAsset(tenantId);
        await SeedAsync(app, tenantId, asset);
        using var client = Client(app, tenantId);

        using var missingMapping = await client.PostAsJsonAsync($"/api/fixed-assets/{asset.Id}/acquisition-posting", new { offsetAccountId = Guid.NewGuid() });
        Assert.Equal(HttpStatusCode.Conflict, missingMapping.StatusCode);
        using (var json = JsonDocument.Parse(await missingMapping.Content.ReadAsStringAsync()))
            Assert.Equal(LedgerMappingKeys.FixedAssetCost, json.RootElement.GetProperty("requiredMapping").GetString());

        var (assetCost, _) = await AddAccountsAsync(app, tenantId);
        using var missingOffset = await client.PostAsJsonAsync($"/api/fixed-assets/{asset.Id}/acquisition-posting", new { offsetAccountId = Guid.NewGuid() });
        Assert.Equal(HttpStatusCode.BadRequest, missingOffset.StatusCode);
        Assert.NotEqual(assetCost.Id, Guid.Empty);
        await AssertNoJournalAsync(app);
    }

    [Fact]
    public async Task Acquisition_posting_is_balanced_tenant_scoped_replay_safe_and_preserves_asset_record()
    {
        var tenantId = Guid.NewGuid();
        var otherTenantId = Guid.NewGuid();
        await using var app = await StartAsync(tenantId, otherTenantId);
        var asset = NewAsset(tenantId);
        await SeedAsync(app, tenantId, asset);
        var (assetCost, offset) = await AddAccountsAsync(app, tenantId);
        var (otherCost, otherOffset) = await AddAccountsAsync(app, otherTenantId);
        using var client = Client(app, tenantId);

        using var crossTenant = await client.PostAsJsonAsync($"/api/fixed-assets/{asset.Id}/acquisition-posting", new { offsetAccountId = otherOffset.Id });
        Assert.Equal(HttpStatusCode.BadRequest, crossTenant.StatusCode);
        await AssertNoJournalAsync(app);

        using var created = await client.PostAsJsonAsync($"/api/fixed-assets/{asset.Id}/acquisition-posting", new { offsetAccountId = offset.Id });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        using var createdJson = JsonDocument.Parse(await created.Content.ReadAsStringAsync());
        var journalId = createdJson.RootElement.GetProperty("journalEntryId").GetGuid();

        // A retried command with a different offset still returns the first immutable journal.
        using var replay = await client.PostAsJsonAsync($"/api/fixed-assets/{asset.Id}/acquisition-posting", new { offsetAccountId = otherCost.Id });
        Assert.Equal(HttpStatusCode.OK, replay.StatusCode);
        using var replayJson = JsonDocument.Parse(await replay.Content.ReadAsStringAsync());
        Assert.Equal(journalId, replayJson.RootElement.GetProperty("journalEntryId").GetGuid());

        using var foreignTenant = Client(app, otherTenantId);
        Assert.Equal(HttpStatusCode.NotFound, (await foreignTenant.GetAsync($"/api/fixed-assets/{asset.Id}/acquisition-posting")).StatusCode);

        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        var journal = await db.JournalEntries.Include(x => x.Lines).SingleAsync(x => x.TenantId == tenantId && x.SourceType == "FixedAssetAcquisition");
        Assert.Equal(journalId, journal.Id);
        Assert.Equal(assetCost.Id, journal.Lines.Single(x => x.Debit > 0).AccountId);
        Assert.Equal(offset.Id, journal.Lines.Single(x => x.Credit > 0).AccountId);
        Assert.Equal(asset.AcquisitionCostBase, journal.Lines.Sum(x => x.Debit));
        Assert.Equal(asset.AcquisitionCostBase, journal.Lines.Sum(x => x.Credit));
        Assert.Equal(2, journal.Lines.Count);
        Assert.Equal(1, await db.JournalEntries.CountAsync(x => x.TenantId == tenantId && x.SourceType == "FixedAssetAcquisition"));
        var persistedAsset = await db.FixedAssets.SingleAsync(x => x.TenantId == tenantId && x.Id == asset.Id);
        Assert.Equal(asset.AssetCode, persistedAsset.AssetCode);
        Assert.Equal(asset.AcquisitionCostBase, persistedAsset.AcquisitionCostBase);
        Assert.Equal(asset.AcquisitionDate, persistedAsset.AcquisitionDate);
        Assert.Equal(0m, persistedAsset.AccumulatedDepreciationBase);
    }

    [Fact]
    public async Task Purchase_invoice_link_reports_policy_requirement_and_does_not_claim_invoice_journal_is_sufficient()
    {
        var tenantId = Guid.NewGuid();
        await using var app = await StartAsync(tenantId);
        var invoiceId = Guid.NewGuid();
        var supplier = new CustomerAccount { TenantId = tenantId, Code = "SUP-FA", Name = "Asset supplier", Type = CounterpartyType.Supplier };
        var invoiceDate = new DateOnly(2025, 4, 15);
        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            db.CustomerAccounts.Add(supplier);
            db.PurchaseInvoices.Add(new PurchaseInvoice { Id = invoiceId, TenantId = tenantId, SupplierId = supplier.Id, Supplier = supplier,
                Code = "PI-FA-001", InvoiceDate = invoiceDate, DueDate = invoiceDate.AddDays(30), GrandTotal = 1000m });
            var invoiceJournal = new JournalEntry { TenantId = tenantId, Code = "PUR-FA-001", EntryDate = invoiceDate,
                Description = "Purchase invoice", SourceType = "PurchaseInvoice", SourceId = invoiceId };
            db.JournalEntries.Add(invoiceJournal);
            await db.SaveChangesAsync();
        }
        using var client = Client(app, tenantId);
        using var createdAsset = await client.PostAsJsonAsync("/api/fixed-assets", new
        {
            assetCode = "MACHINE-LINKED", name = "Purchase invoice asset", category = "Equipment", acquisitionDate = invoiceDate,
            inServiceDate = new DateOnly(2025, 5, 1), acquisitionCostBase = 1000m, residualValueBase = 0m, usefulLifeMonths = 60,
            purchaseInvoiceId = invoiceId
        });
        Assert.Equal(HttpStatusCode.Created, createdAsset.StatusCode);
        using var createdJson = JsonDocument.Parse(await createdAsset.Content.ReadAsStringAsync());
        var createdAssetId = createdJson.RootElement.GetProperty("id").GetGuid();
        Assert.Equal(invoiceId, createdJson.RootElement.GetProperty("purchaseInvoiceId").GetGuid());
        Assert.Equal(supplier.Id, createdJson.RootElement.GetProperty("supplierAccountId").GetGuid());

        using var get = await client.GetAsync($"/api/fixed-assets/{createdAssetId}/acquisition-posting");
        Assert.Equal(HttpStatusCode.OK, get.StatusCode);
        using (var json = JsonDocument.Parse(await get.Content.ReadAsStringAsync()))
        {
            Assert.Equal("PI-FA-001", json.RootElement.GetProperty("purchaseInvoiceCode").GetString());
            Assert.True(json.RootElement.GetProperty("journalEntryId").ValueKind == JsonValueKind.Null);
        }
        using var post = await client.PostAsJsonAsync($"/api/fixed-assets/{createdAssetId}/acquisition-posting", new { offsetAccountId = Guid.NewGuid() });
        Assert.Equal(HttpStatusCode.Conflict, post.StatusCode);
        using (var json = JsonDocument.Parse(await post.Content.ReadAsStringAsync()))
        {
            Assert.Equal(invoiceId, json.RootElement.GetProperty("purchaseInvoiceId").GetGuid());
            Assert.True(json.RootElement.GetProperty("requiresAccountingPolicyDecision").GetBoolean());
            Assert.Contains("KDV", json.RootElement.GetProperty("error").GetString());
        }
        await using var verifyScope = app.Services.CreateAsyncScope();
        var verifyDb = verifyScope.ServiceProvider.GetRequiredService<TenantDbContext>();
        Assert.Single(await verifyDb.JournalEntries.Where(x => x.TenantId == tenantId).ToListAsync());
        Assert.False(await verifyDb.JournalEntries.AnyAsync(x => x.TenantId == tenantId && x.SourceType == "FixedAssetAcquisition"));
    }

    private static FixedAsset NewAsset(Guid tenantId) => new()
    {
        TenantId = tenantId, AssetCode = "MACHINE-ACQ", Name = "Acquisition test machine", Category = "Equipment",
        AcquisitionDate = new DateOnly(2025, 4, 15), InServiceDate = new DateOnly(2025, 5, 1),
        AcquisitionCostBase = 12850.75m, ResidualValueBase = 350.75m, UsefulLifeMonths = 60, SourceReference = "PO-77"
    };

    private static async Task<WebApplication> StartAsync(params Guid[] tenantIds)
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        var databaseName = $"fixed-asset-acquisition-{Guid.NewGuid():N}";
        builder.Services.AddDbContext<TenantDbContext>(options => options.UseInMemoryDatabase(databaseName));
        builder.Services.AddAuthentication("asset-test").AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("asset-test", _ => { });
        builder.Services.AddAuthorization();
        var app = builder.Build();
        app.UseAuthentication(); app.UseAuthorization(); app.MapFixedAssetEndpoints(); await app.StartAsync();
        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        await db.Database.EnsureCreatedAsync();
        db.Tenants.AddRange(tenantIds.Select(id => new Tenant { Id = id, Name = "Asset test", Slug = $"asset-{id:N}" }));
        await db.SaveChangesAsync();
        return app;
    }

    private static async Task SeedAsync(WebApplication app, Guid tenantId, FixedAsset asset)
    {
        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        db.FixedAssets.Add(asset);
        await db.SaveChangesAsync();
    }

    private static async Task<(LedgerAccount Cost, LedgerAccount Offset)> AddAccountsAsync(WebApplication app, Guid tenantId)
    {
        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        var cost = new LedgerAccount { TenantId = tenantId, Code = "FA-COST", Name = "Fixed asset cost" };
        var offset = new LedgerAccount { TenantId = tenantId, Code = "FA-OFFSET", Name = "Asset acquisition offset" };
        db.LedgerAccounts.AddRange(cost, offset);
        db.LedgerAccountMappings.Add(new LedgerAccountMapping { TenantId = tenantId, MappingKey = LedgerMappingKeys.FixedAssetCost, AccountId = cost.Id });
        await db.SaveChangesAsync();
        return (cost, offset);
    }

    private static HttpClient Client(WebApplication app, Guid tenantId)
    {
        var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", tenantId.ToString("D"));
        return client;
    }

    private static async Task AssertNoJournalAsync(WebApplication app)
    {
        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        Assert.Empty(await db.JournalEntries.ToListAsync());
    }
}
