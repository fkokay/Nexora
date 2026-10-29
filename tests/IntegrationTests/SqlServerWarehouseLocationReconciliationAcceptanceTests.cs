using System.Net;
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
public sealed class SqlServerWarehouseLocationReconciliationAcceptanceTests
{
    [SqlServerAcceptanceFact]
    public async Task Reconciliation_aggregates_and_orders_unlocated_stock_using_sql_server()
    {
        var configuredConnection = Environment.GetEnvironmentVariable("AIERP_REPORT_TEST_SQL_CONNECTION_STRING");
        Assert.False(string.IsNullOrWhiteSpace(configuredConnection));

        var tenantId = Guid.NewGuid();
        var databaseName = $"AIERP_LocationReconciliation_{Guid.NewGuid():N}";
        var connection = new SqlConnectionStringBuilder(configuredConnection)
        {
            InitialCatalog = databaseName,
            ConnectTimeout = 15,
            TrustServerCertificate = true
        }.ConnectionString;
        var options = new DbContextOptionsBuilder<TenantDbContext>().UseSqlServer(connection).Options;
        await using var seedDb = new TenantDbContext(options);
        var databaseCreated = false;

        try
        {
            databaseCreated = await seedDb.Database.EnsureCreatedAsync();
            Assert.True(databaseCreated);

            var tenant = new Tenant { Id = tenantId, Name = "Synthetic location reconciliation", Slug = $"location-recon-{tenantId:N}" };
            var warehouse = new Warehouse { TenantId = tenantId, Tenant = tenant, Code = "WH-SYN", Name = "Synthetic warehouse" };
            var itemB = new StockItem { TenantId = tenantId, Tenant = tenant, Code = "MAT-B", Name = "Material B", UnitCode = "EA" };
            var itemA = new StockItem { TenantId = tenantId, Tenant = tenant, Code = "MAT-A", Name = "Material A", UnitCode = "EA" };
            var location = new WarehouseLocation { TenantId = tenantId, WarehouseId = warehouse.Id, Warehouse = warehouse, Code = "BIN-1", Name = "Bin 1" };
            seedDb.Tenants.Add(tenant);
            seedDb.Warehouses.Add(warehouse);
            seedDb.StockItems.AddRange(itemA, itemB);
            seedDb.WarehouseLocations.Add(location);
            seedDb.InventoryTransactions.AddRange(
                new InventoryTransaction { TenantId = tenantId, WarehouseId = warehouse.Id, Warehouse = warehouse, StorageLocationId = location.Id, StorageLocation = location,
                    StockItemId = itemB.Id, StockItem = itemB, EntryDate = new DateOnly(2026, 10, 1), Direction = InventoryDirection.Receipt, Quantity = 8m,
                    Description = "Located receipt" },
                new InventoryTransaction { TenantId = tenantId, WarehouseId = warehouse.Id, Warehouse = warehouse, StockItemId = itemB.Id, StockItem = itemB,
                    EntryDate = new DateOnly(2026, 10, 1), Direction = InventoryDirection.Receipt, Quantity = 3m, Description = "Unlocated receipt" },
                new InventoryTransaction { TenantId = tenantId, WarehouseId = warehouse.Id, Warehouse = warehouse, StockItemId = itemA.Id, StockItem = itemA,
                    EntryDate = new DateOnly(2026, 10, 1), Direction = InventoryDirection.Receipt, Quantity = 5m, Description = "Earlier unlocated receipt" });
            await seedDb.SaveChangesAsync();

            var builder = WebApplication.CreateBuilder();
            builder.WebHost.UseTestServer();
            builder.Services.AddDbContext<TenantDbContext>(db => db.UseSqlServer(connection));
            builder.Services.AddAuthentication("location-test")
                .AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("location-test", _ => { });
            builder.Services.AddAuthorization();
            await using var app = builder.Build();
            app.UseAuthentication();
            app.UseAuthorization();
            app.MapGroup("/api/warehouses").RequireAuthorization().MapWarehouseLocationEndpoints();
            await app.StartAsync();
            using var client = app.GetTestClient();
            client.DefaultRequestHeaders.Add("X-Test-Tenant", tenantId.ToString("D"));

            using var response = await client.GetAsync($"/api/warehouses/{warehouse.Id:D}/location-reconciliation?asOfDate=2026-10-02");
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            var items = json.RootElement.GetProperty("items").EnumerateArray().ToArray();
            Assert.Equal(2, items.Length);
            Assert.Equal("MAT-A", items[0].GetProperty("stockItemCode").GetString());
            Assert.Equal(5m, items[0].GetProperty("warehouseQuantity").GetDecimal());
            Assert.Equal(0m, items[0].GetProperty("locatedQuantity").GetDecimal());
            Assert.Equal(5m, items[0].GetProperty("unlocatedQuantity").GetDecimal());
            Assert.Equal("MAT-B", items[1].GetProperty("stockItemCode").GetString());
            Assert.Equal(11m, items[1].GetProperty("warehouseQuantity").GetDecimal());
            Assert.Equal(8m, items[1].GetProperty("locatedQuantity").GetDecimal());
            Assert.Equal(3m, items[1].GetProperty("unlocatedQuantity").GetDecimal());
        }
        finally
        {
            if (databaseCreated)
                await seedDb.Database.EnsureDeletedAsync();
        }
    }
}
