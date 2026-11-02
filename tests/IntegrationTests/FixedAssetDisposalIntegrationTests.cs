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

public sealed class FixedAssetDisposalIntegrationTests
{
    [Fact]
    public async Task Disposal_uses_monthly_schedule_is_audited_and_idempotent_per_tenant()
    {
        var tenantA = Guid.NewGuid();
        var tenantB = Guid.NewGuid();
        var databaseName = $"fixed-asset-disposal-{Guid.NewGuid():N}";
        var tenant = new Tenant { Id = tenantA, Name = "Asset test", Slug = $"asset-{tenantA:N}" };
        var otherTenant = new Tenant { Id = tenantB, Name = "Other asset test", Slug = $"asset-{tenantB:N}" };
        var asset = new FixedAsset
        {
            TenantId = tenantA, AssetCode = "MACHINE-1", Name = "Synthetic machine", AcquisitionDate = new DateOnly(2025, 1, 1),
            InServiceDate = new DateOnly(2025, 1, 10), AcquisitionCostBase = 1200m, ResidualValueBase = 0m, UsefulLifeMonths = 12
        };

        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Services.AddDbContext<TenantDbContext>(options => options.UseInMemoryDatabase(databaseName));
        builder.Services.AddAuthentication("asset-test").AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("asset-test", _ => { });
        builder.Services.AddAuthorization();
        await using var app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapFixedAssetEndpoints();
        await app.StartAsync();
        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            await db.Database.EnsureCreatedAsync();
            db.Tenants.AddRange(tenant, otherTenant);
            db.FixedAssets.Add(asset);
            AddDisposalMappings(db, tenantA);
            await db.SaveChangesAsync();
        }

        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", tenantA.ToString("D"));
        var idempotencyKey = Guid.NewGuid();
        var body = new { disposalDate = "2025-04-20", reason = "Synthetic retirement", proceedsBase = 100m, idempotencyKey };
        using var created = await client.PostAsJsonAsync($"/api/fixed-assets/{asset.Id}/disposals", body);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        using var createdJson = JsonDocument.Parse(await created.Content.ReadAsStringAsync());
        var result = createdJson.RootElement;
        Assert.Equal(200m, result.GetProperty("scheduleAccumulatedDepreciationBase").GetDecimal());
        Assert.Equal(0m, result.GetProperty("postedAccumulatedDepreciationBase").GetDecimal());
        Assert.Equal(1000m, result.GetProperty("bookValueBase").GetDecimal());
        Assert.Equal(-900m, result.GetProperty("gainLossBase").GetDecimal());
        Assert.Equal("GeneralLedgerPosted", result.GetProperty("accountingTreatment").GetString());
        var journalEntryId = result.GetProperty("journalEntryId").GetGuid();
        Assert.NotEqual(Guid.Empty, journalEntryId);

        using var replay = await client.PostAsJsonAsync($"/api/fixed-assets/{asset.Id}/disposals", body);
        Assert.Equal(HttpStatusCode.OK, replay.StatusCode);
        using var replayJson = JsonDocument.Parse(await replay.Content.ReadAsStringAsync());
        Assert.Equal(journalEntryId, replayJson.RootElement.GetProperty("journalEntryId").GetGuid());
        using var conflictingReplay = await client.PostAsJsonAsync($"/api/fixed-assets/{asset.Id}/disposals", body with { proceedsBase = 101m });
        Assert.Equal(HttpStatusCode.Conflict, conflictingReplay.StatusCode);

        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", tenantB.ToString("D"));
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/fixed-assets/{asset.Id}/disposal")).StatusCode);
        using var crossTenantRequest = await client.PostAsJsonAsync($"/api/fixed-assets/{asset.Id}/disposals", body with { idempotencyKey = Guid.NewGuid() });
        Assert.Equal(HttpStatusCode.NotFound, crossTenantRequest.StatusCode);

        await using var verifyScope = app.Services.CreateAsyncScope();
        var verifyDb = verifyScope.ServiceProvider.GetRequiredService<TenantDbContext>();
        var persistedAsset = await verifyDb.FixedAssets.SingleAsync(x => x.Id == asset.Id);
        Assert.Equal(FixedAssetStatus.Disposed, persistedAsset.Status);
        Assert.Equal(1, await verifyDb.FixedAssetDisposals.CountAsync(x => x.TenantId == tenantA && x.AssetId == asset.Id));
        var entry = await verifyDb.JournalEntries.Include(x => x.Lines).SingleAsync(x => x.TenantId == tenantA && x.SourceType == "FixedAssetDisposal");
        Assert.Equal(journalEntryId, entry.Id);
        Assert.Equal(1400m, entry.Lines.Sum(x => x.Debit));
        Assert.Equal(1400m, entry.Lines.Sum(x => x.Credit));
        var depreciationExpense = entry.Lines.Single(x => x.Description.Contains("öncesi amortisman", StringComparison.OrdinalIgnoreCase));
        var depreciationAccrual = entry.Lines.Single(x => x.Description.Contains("amortisman tahakkuku", StringComparison.OrdinalIgnoreCase));
        Assert.Equal(200m, depreciationExpense.Debit);
        Assert.Equal(200m, depreciationAccrual.Credit);
        Assert.Equal(depreciationAccrual.AccountId, entry.Lines.Single(x => x.Description.Contains("amortisman kapama", StringComparison.OrdinalIgnoreCase)).AccountId);
        Assert.Contains(entry.Lines, x => x.Debit == 100m && x.Description.Contains("tahsilatı", StringComparison.OrdinalIgnoreCase));
        Assert.Contains(entry.Lines, x => x.Credit == 1200m && x.Description.Contains("maliyet kapama", StringComparison.OrdinalIgnoreCase));
        Assert.Contains(entry.Lines, x => x.Debit == 900m && x.Description.Contains("zararı", StringComparison.OrdinalIgnoreCase));
        Assert.Single(await verifyDb.JournalEntries.Where(x => x.TenantId == tenantA).ToListAsync());
        Assert.True(await verifyDb.AuditEvents.AnyAsync(x => x.TenantId == tenantA && x.Action == "fixed-asset.disposed"));
    }

    [Fact]
    public async Task Disposal_requires_tenant_account_mappings_before_mutating_the_asset()
    {
        var tenantId = Guid.NewGuid();
        var databaseName = $"fixed-asset-disposal-mappings-{Guid.NewGuid():N}";
        var tenant = new Tenant { Id = tenantId, Name = "Asset mapping validation", Slug = $"asset-mapping-{tenantId:N}" };
        var asset = new FixedAsset
        {
            TenantId = tenantId, AssetCode = "DEVICE-MAP", Name = "Mapped device", AcquisitionDate = new DateOnly(2025, 1, 1),
            InServiceDate = new DateOnly(2025, 1, 1), AcquisitionCostBase = 500m, ResidualValueBase = 0m, UsefulLifeMonths = 10
        };
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Services.AddDbContext<TenantDbContext>(options => options.UseInMemoryDatabase(databaseName));
        builder.Services.AddAuthentication("asset-test").AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("asset-test", _ => { });
        builder.Services.AddAuthorization();
        await using var app = builder.Build();
        app.UseAuthentication(); app.UseAuthorization(); app.MapFixedAssetEndpoints(); await app.StartAsync();
        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            await db.Database.EnsureCreatedAsync(); db.Tenants.Add(tenant); db.FixedAssets.Add(asset); await db.SaveChangesAsync();
        }
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", tenantId.ToString("D"));
        using var response = await client.PostAsJsonAsync($"/api/fixed-assets/{asset.Id}/disposals", new
        {
            disposalDate = "2025-02-01", reason = "Mapping check", proceedsBase = 0m, idempotencyKey = Guid.NewGuid()
        });
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        using var responseJson = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(6, responseJson.RootElement.GetProperty("requiredMappings").GetArrayLength());
        await using var verifyScope = app.Services.CreateAsyncScope();
        var verifyDb = verifyScope.ServiceProvider.GetRequiredService<TenantDbContext>();
        Assert.Equal(FixedAssetStatus.Active, (await verifyDb.FixedAssets.SingleAsync(x => x.Id == asset.Id)).Status);
        Assert.Empty(await verifyDb.FixedAssetDisposals.ToListAsync());
        Assert.Empty(await verifyDb.JournalEntries.ToListAsync());
    }

    [Fact]
    public async Task Disposal_rejects_future_dates_and_invalid_reasons_without_changing_asset()
    {
        var tenantId = Guid.NewGuid();
        var databaseName = $"fixed-asset-disposal-validation-{Guid.NewGuid():N}";
        var tenant = new Tenant { Id = tenantId, Name = "Asset validation", Slug = $"asset-validation-{tenantId:N}" };
        var asset = new FixedAsset
        {
            TenantId = tenantId, AssetCode = "DEVICE-1", Name = "Synthetic device", AcquisitionDate = new DateOnly(2025, 1, 1),
            InServiceDate = new DateOnly(2025, 1, 1), AcquisitionCostBase = 500m, ResidualValueBase = 0m, UsefulLifeMonths = 10
        };
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Services.AddDbContext<TenantDbContext>(options => options.UseInMemoryDatabase(databaseName));
        builder.Services.AddAuthentication("asset-test").AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("asset-test", _ => { });
        builder.Services.AddAuthorization();
        await using var app = builder.Build();
        app.UseAuthentication(); app.UseAuthorization(); app.MapFixedAssetEndpoints(); await app.StartAsync();
        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            await db.Database.EnsureCreatedAsync(); db.Tenants.Add(tenant); db.FixedAssets.Add(asset); await db.SaveChangesAsync();
        }
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", tenantId.ToString("D"));
        var futureDate = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(1);
        using var future = await client.PostAsJsonAsync($"/api/fixed-assets/{asset.Id}/disposals", new { disposalDate = futureDate, reason = "future", proceedsBase = 0m, idempotencyKey = Guid.NewGuid() });
        Assert.Equal(HttpStatusCode.BadRequest, future.StatusCode);
        using var emptyReason = await client.PostAsJsonAsync($"/api/fixed-assets/{asset.Id}/disposals", new { disposalDate = "2025-01-01", reason = " ", proceedsBase = 0m, idempotencyKey = Guid.NewGuid() });
        Assert.Equal(HttpStatusCode.BadRequest, emptyReason.StatusCode);
        await using var verifyScope = app.Services.CreateAsyncScope();
        var verifyDb = verifyScope.ServiceProvider.GetRequiredService<TenantDbContext>();
        Assert.Equal(FixedAssetStatus.Active, (await verifyDb.FixedAssets.SingleAsync(x => x.Id == asset.Id)).Status);
        Assert.Empty(await verifyDb.FixedAssetDisposals.ToListAsync());
    }

    private static void AddDisposalMappings(TenantDbContext db, Guid tenantId)
    {
        var keys = new[]
        {
            LedgerMappingKeys.FixedAssetDepreciationExpense, LedgerMappingKeys.FixedAssetAccumulatedDepreciation,
            LedgerMappingKeys.FixedAssetCost, LedgerMappingKeys.FixedAssetDisposalProceeds,
            LedgerMappingKeys.FixedAssetDisposalGain, LedgerMappingKeys.FixedAssetDisposalLoss
        };
        for (var i = 0; i < keys.Length; i++)
        {
            var account = new LedgerAccount { TenantId = tenantId, Code = $"FA-{i + 1}", Name = $"Asset account {i + 1}" };
            db.LedgerAccounts.Add(account);
            db.LedgerAccountMappings.Add(new LedgerAccountMapping { TenantId = tenantId, MappingKey = keys[i], AccountId = account.Id });
        }
    }
}
