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

public sealed class FixedAssetDepreciationIntegrationTests
{
    [Fact]
    public async Task Depreciation_posts_in_order_and_schedule_matches_balanced_tenant_journals()
    {
        var tenantId = Guid.NewGuid();
        var otherTenantId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        var asset = new FixedAsset
        {
            TenantId = tenantId,
            AssetCode = "DEP-001",
            Name = "Three month test asset",
            AcquisitionDate = new DateOnly(2025, 1, 1),
            InServiceDate = new DateOnly(2025, 1, 1),
            AcquisitionCostBase = 1000m,
            ResidualValueBase = 100m,
            UsefulLifeMonths = 3
        };
        var databaseName = $"fixed-asset-depreciation-{Guid.NewGuid():N}";
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

        Guid expenseId;
        Guid accumulatedId;
        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            await db.Database.EnsureCreatedAsync();
            db.Tenants.AddRange(
                new Tenant { Id = tenantId, Name = "Depreciation test", Slug = $"depreciation-{tenantId:N}" },
                new Tenant { Id = otherTenantId, Name = "Other tenant", Slug = $"depreciation-{otherTenantId:N}" });
            var expense = new LedgerAccount { TenantId = tenantId, Code = "FA-EXP", Name = "Depreciation expense" };
            var accumulated = new LedgerAccount { TenantId = tenantId, Code = "FA-ACC", Name = "Accumulated depreciation" };
            expenseId = expense.Id;
            accumulatedId = accumulated.Id;
            db.LedgerAccounts.AddRange(expense, accumulated);
            db.LedgerAccountMappings.AddRange(
                new LedgerAccountMapping { TenantId = tenantId, MappingKey = LedgerMappingKeys.FixedAssetDepreciationExpense, AccountId = expense.Id },
                new LedgerAccountMapping { TenantId = tenantId, MappingKey = LedgerMappingKeys.FixedAssetAccumulatedDepreciation, AccountId = accumulated.Id });
            db.FixedAssets.Add(asset);
            await db.SaveChangesAsync();
        }

        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", tenantId.ToString("D"));
        client.DefaultRequestHeaders.Add("X-Test-User", userId.ToString("D"));

        using var invalidDate = await client.PostAsJsonAsync($"/api/fixed-assets/{asset.Id}/depreciation-postings", new { periodStart = "2025-02-15" });
        Assert.Equal(HttpStatusCode.BadRequest, invalidDate.StatusCode);

        using var marchOutOfOrder = await client.PostAsJsonAsync($"/api/fixed-assets/{asset.Id}/depreciation-postings", new { periodStart = "2025-03-01" });
        Assert.Equal(HttpStatusCode.Conflict, marchOutOfOrder.StatusCode);

        using var february = await client.PostAsJsonAsync($"/api/fixed-assets/{asset.Id}/depreciation-postings", new { periodStart = "2025-02-01" });
        Assert.Equal(HttpStatusCode.Created, february.StatusCode);
        using var februaryBody = JsonDocument.Parse(await february.Content.ReadAsStringAsync());
        Assert.Equal(300m, februaryBody.RootElement.GetProperty("amountBase").GetDecimal());

        using var duplicate = await client.PostAsJsonAsync($"/api/fixed-assets/{asset.Id}/depreciation-postings", new { periodStart = "2025-02-01" });
        Assert.Equal(HttpStatusCode.Conflict, duplicate.StatusCode);

        using var scheduleResponse = await client.GetAsync($"/api/fixed-assets/{asset.Id}/depreciation-schedule?through=2025-04-30");
        Assert.Equal(HttpStatusCode.OK, scheduleResponse.StatusCode);
        using var schedule = JsonDocument.Parse(await scheduleResponse.Content.ReadAsStringAsync());
        var rows = schedule.RootElement.GetProperty("rows").EnumerateArray().ToArray();
        Assert.Equal(3, rows.Length);
        Assert.Equal("2025-02-01", rows[0].GetProperty("periodStart").GetString());
        Assert.Equal(300m, rows[0].GetProperty("amountBase").GetDecimal());
        Assert.True(rows[0].GetProperty("isPosted").GetBoolean());
        Assert.Equal("2025-03-01", rows[1].GetProperty("periodStart").GetString());
        Assert.Equal(300m, rows[1].GetProperty("amountBase").GetDecimal());
        Assert.False(rows[1].GetProperty("isPosted").GetBoolean());
        Assert.Equal(900m, rows.Sum(row => row.GetProperty("amountBase").GetDecimal()));

        using var foreignClient = app.GetTestClient();
        foreignClient.DefaultRequestHeaders.Add("X-Test-Tenant", otherTenantId.ToString("D"));
        Assert.Equal(HttpStatusCode.NotFound, (await foreignClient.GetAsync($"/api/fixed-assets/{asset.Id}/depreciation-schedule")).StatusCode);

        await using var verifyScope = app.Services.CreateAsyncScope();
        var verifyDb = verifyScope.ServiceProvider.GetRequiredService<TenantDbContext>();
        var posting = await verifyDb.FixedAssetDepreciationPostings.SingleAsync(x => x.TenantId == tenantId && x.AssetId == asset.Id);
        Assert.Equal(new DateOnly(2025, 2, 1), posting.PeriodStart);
        Assert.Equal(new DateOnly(2025, 2, 28), posting.PeriodEnd);
        Assert.Equal(300m, posting.AmountBase);
        Assert.Equal(userId, posting.PostedByUserId);
        var journal = await verifyDb.JournalEntries.Include(x => x.Lines).SingleAsync(x => x.Id == posting.JournalEntryId);
        Assert.Equal("FixedAssetDepreciation", journal.SourceType);
        Assert.Equal(300m, journal.Lines.Sum(x => x.Debit));
        Assert.Equal(300m, journal.Lines.Sum(x => x.Credit));
        Assert.Equal(expenseId, journal.Lines.Single(x => x.Debit > 0).AccountId);
        Assert.Equal(accumulatedId, journal.Lines.Single(x => x.Credit > 0).AccountId);
        Assert.Equal(300m, (await verifyDb.FixedAssets.SingleAsync(x => x.Id == asset.Id)).AccumulatedDepreciationBase);
        Assert.True(await verifyDb.AuditEvents.AnyAsync(x => x.TenantId == tenantId && x.Action == "fixed-asset.depreciation-posted"));
        Assert.Single(await verifyDb.JournalEntries.Where(x => x.TenantId == tenantId).ToListAsync());
    }
}
