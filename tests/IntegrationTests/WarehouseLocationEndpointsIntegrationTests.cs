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

public sealed class WarehouseLocationEndpointsIntegrationTests
{
    private static readonly Guid TenantA = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid TenantB = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid WarehouseId = Guid.Parse("eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee");
    private static readonly Guid StockItemId = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    private static readonly Guid EarlierStockItemId = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");

    [Fact]
    public async Task Warehouse_locations_are_admin_managed_tenant_scoped_and_report_as_of_balances()
    {
        var databaseName = $"warehouse-locations-{Guid.NewGuid():N}";
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Services.AddDbContext<TenantDbContext>(options => options.UseInMemoryDatabase(databaseName));
        builder.Services.AddAuthentication("location-test").AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("location-test", _ => { });
        builder.Services.AddAuthorization();
        var app = builder.Build();
        app.UseAuthentication(); app.UseAuthorization();
        app.MapGroup("/api/warehouses").RequireAuthorization().MapWarehouseLocationEndpoints();
        await app.StartAsync();
        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            await db.Database.EnsureCreatedAsync();
            var tenantA = new Tenant { Id = TenantA, Name = "Tenant A", Slug = "tenant-a" };
            var tenantB = new Tenant { Id = TenantB, Name = "Tenant B", Slug = "tenant-b" };
            var warehouse = new Warehouse { Id = WarehouseId, TenantId = TenantA, Tenant = tenantA, Code = "WH-A", Name = "Main" };
            var stock = new StockItem { Id = StockItemId, TenantId = TenantA, Tenant = tenantA, Code = "MAT-1", Name = "Synthetic material", UnitCode = "EA" };
            var earlierStock = new StockItem { Id = EarlierStockItemId, TenantId = TenantA, Tenant = tenantA, Code = "MAT-0", Name = "Earlier synthetic material", UnitCode = "EA" };
            db.Tenants.AddRange(tenantA, tenantB); db.Warehouses.Add(warehouse); db.StockItems.AddRange(stock, earlierStock);
            await db.SaveChangesAsync();
        }

        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString("D"));
        var parentResponse = await client.PostAsJsonAsync($"/api/warehouses/{WarehouseId}/locations", new { code = "A-01", name = "Aisle A" });
        Assert.Equal(HttpStatusCode.Created, parentResponse.StatusCode);
        using var parentJson = JsonDocument.Parse(await parentResponse.Content.ReadAsStringAsync());
        var parentId = parentJson.RootElement.GetProperty("id").GetGuid();
        Assert.Equal("A-01", parentJson.RootElement.GetProperty("code").GetString());

        client.DefaultRequestHeaders.Remove("X-Test-Role"); client.DefaultRequestHeaders.Add("X-Test-Role", "TenantUser");
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync($"/api/warehouses/{WarehouseId}/locations", new { code = "BIN-1", name = "Bin 1" })).StatusCode);
        client.DefaultRequestHeaders.Remove("X-Test-Role");
        var invalidParent = await client.PostAsJsonAsync($"/api/warehouses/{WarehouseId}/locations", new { code = "BIN-1", name = "Bin 1", parentLocationId = Guid.NewGuid() });
        Assert.Equal(HttpStatusCode.BadRequest, invalidParent.StatusCode);
        var childResponse = await client.PostAsJsonAsync($"/api/warehouses/{WarehouseId}/locations", new { code = "BIN-1", name = "Bin 1", parentLocationId = parentId });
        Assert.Equal(HttpStatusCode.Created, childResponse.StatusCode);
        using var childJson = JsonDocument.Parse(await childResponse.Content.ReadAsStringAsync());
        var childId = childJson.RootElement.GetProperty("id").GetGuid();
        Assert.Equal(parentId, childJson.RootElement.GetProperty("parentLocationId").GetGuid());

        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            _ = await db.WarehouseLocations.SingleAsync(x => x.Id == childId);
            db.InventoryTransactions.AddRange(
                new InventoryTransaction { TenantId = TenantA, WarehouseId = WarehouseId, StockItemId = StockItemId, StorageLocationId = childId,
                    EntryDate = new DateOnly(2026, 10, 1), Direction = InventoryDirection.Receipt, Quantity = 8m, Description = "Synthetic receipt" },
                new InventoryTransaction { TenantId = TenantA, WarehouseId = WarehouseId, StockItemId = StockItemId, StorageLocationId = childId,
                    EntryDate = new DateOnly(2026, 10, 4), Direction = InventoryDirection.Issue, Quantity = 3m, Description = "Synthetic issue" },
                new InventoryTransaction { TenantId = TenantA, WarehouseId = WarehouseId, StockItemId = StockItemId,
                    EntryDate = new DateOnly(2026, 10, 1), Direction = InventoryDirection.Receipt, Quantity = 5m, Description = "Unlocated legacy receipt" },
                new InventoryTransaction { TenantId = TenantA, WarehouseId = WarehouseId, StockItemId = StockItemId,
                    EntryDate = new DateOnly(2026, 10, 3), Direction = InventoryDirection.Issue, Quantity = 2m, Description = "Unlocated legacy issue" },
                new InventoryTransaction { TenantId = TenantA, WarehouseId = WarehouseId, StockItemId = EarlierStockItemId,
                    EntryDate = new DateOnly(2026, 10, 1), Direction = InventoryDirection.Receipt, Quantity = 3m, Description = "Earlier unlocated receipt" });
            await db.SaveChangesAsync();
        }
        using var balanceResponse = await client.GetAsync($"/api/warehouses/{WarehouseId}/locations/{childId}/balances?asOfDate=2026-10-02");
        Assert.Equal(HttpStatusCode.OK, balanceResponse.StatusCode);
        using var balanceJson = JsonDocument.Parse(await balanceResponse.Content.ReadAsStringAsync());
        Assert.Equal(8m, balanceJson.RootElement.GetProperty("items")[0].GetProperty("quantity").GetDecimal());
        Assert.Equal("MAT-1", balanceJson.RootElement.GetProperty("items")[0].GetProperty("stockItemCode").GetString());

        using var reconciliationResponse = await client.GetAsync($"/api/warehouses/{WarehouseId}/location-reconciliation?asOfDate=2026-10-02");
        Assert.Equal(HttpStatusCode.OK, reconciliationResponse.StatusCode);
        using var reconciliationJson = JsonDocument.Parse(await reconciliationResponse.Content.ReadAsStringAsync());
        var reconciledItems = reconciliationJson.RootElement.GetProperty("items").EnumerateArray().ToArray();
        Assert.Equal(2, reconciledItems.Length);
        Assert.Equal("MAT-0", reconciledItems[0].GetProperty("stockItemCode").GetString());
        Assert.Equal(3m, reconciledItems[0].GetProperty("warehouseQuantity").GetDecimal());
        Assert.Equal(0m, reconciledItems[0].GetProperty("locatedQuantity").GetDecimal());
        Assert.Equal(3m, reconciledItems[0].GetProperty("unlocatedQuantity").GetDecimal());
        Assert.Equal("MAT-1", reconciledItems[1].GetProperty("stockItemCode").GetString());
        Assert.Equal(13m, reconciledItems[1].GetProperty("warehouseQuantity").GetDecimal());
        Assert.Equal(8m, reconciledItems[1].GetProperty("locatedQuantity").GetDecimal());
        Assert.Equal(5m, reconciledItems[1].GetProperty("unlocatedQuantity").GetDecimal());

        client.DefaultRequestHeaders.Remove("X-Test-Tenant"); client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantB.ToString("D"));
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/warehouses/{WarehouseId}/locations")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/warehouses/{WarehouseId}/locations/{childId}/balances")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/warehouses/{WarehouseId}/location-reconciliation")).StatusCode);
        await app.StopAsync();
    }
}
