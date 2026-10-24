using System.Net;
using System.Text.Json;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace AIERP.Api.IntegrationTests;

public sealed class InventoryTrackingInquiryIntegrationTests
{
    private static readonly Guid TenantA = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid TenantB = Guid.Parse("22222222-2222-2222-2222-222222222222");

    [Fact]
    public async Task Tracking_balances_are_net_of_movements_searchable_paginated_and_tenant_scoped()
    {
        await using var app = await StartApplicationAsync();
        await using (var scope = app.Services.CreateAsyncScope())
        {
            var verifyDb = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            Assert.Equal(4, await verifyDb.InventoryTransactionTraces.CountAsync());
        }
        using var client = app.GetTestClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/inventory-tracking/balances")).StatusCode);
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());

        using var response = await client.GetAsync("/api/inventory-tracking/balances");
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(2, json.RootElement.GetProperty("totalCount").GetInt32());
        var lot = Assert.Single(json.RootElement.GetProperty("items").EnumerateArray(), x => x.GetProperty("trackingCode").GetString() == "LOT-A");
        Assert.Equal("LOT-A", lot.GetProperty("trackingCode").GetString());
        Assert.Equal(6m, lot.GetProperty("quantityOnHand").GetDecimal());
        Assert.Equal("MAIN", lot.GetProperty("warehouseCode").GetString());
        Assert.Equal("2027-12-31", lot.GetProperty("expiryDate").GetString());

        using var serials = await client.GetAsync("/api/inventory-tracking/balances?trackingMode=Serial");
        using var serialJson = JsonDocument.Parse(await serials.Content.ReadAsStringAsync());
        Assert.Equal(1, serialJson.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal("SN-A", serialJson.RootElement.GetProperty("items")[0].GetProperty("trackingCode").GetString());

        using var invalid = await client.GetAsync("/api/inventory-tracking/balances?q=" + new string('x', 121));
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);

        using var searched = await client.GetAsync("/api/inventory-tracking/balances?q=ITEM-LOT&pageSize=1");
        using var searchedJson = JsonDocument.Parse(await searched.Content.ReadAsStringAsync());
        Assert.Equal(1, searchedJson.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(1, searchedJson.RootElement.GetProperty("items").GetArrayLength());

        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantB.ToString());
        using var otherTenant = await client.GetAsync("/api/inventory-tracking/balances");
        using var otherJson = JsonDocument.Parse(await otherTenant.Content.ReadAsStringAsync());
        Assert.Equal(1, otherJson.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal("SN-B", otherJson.RootElement.GetProperty("items")[0].GetProperty("trackingCode").GetString());
    }

    private static async Task<WebApplication> StartApplicationAsync()
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        var root = new InMemoryDatabaseRoot();
        var databaseName = $"trace-inquiry-{Guid.NewGuid():N}";
        builder.Services.AddDbContext<TenantDbContext>(options => options.UseInMemoryDatabase(databaseName, root));
        builder.Services.AddAuthentication("trace-test").AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("trace-test", _ => { });
        builder.Services.AddAuthorization();
        var app = builder.Build();
        app.UseAuthentication(); app.UseAuthorization();
        app.MapInventoryTrackingInquiryEndpoints();
        await app.StartAsync();

        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        await db.Database.EnsureCreatedAsync();
        var tenantA = new Tenant { Id = TenantA, Name = "Tenant A", Slug = "trace-a" };
        var tenantB = new Tenant { Id = TenantB, Name = "Tenant B", Slug = "trace-b" };
        var warehouse = new Warehouse { TenantId = TenantA, Code = "MAIN", Name = "Ana depo" };
        var otherWarehouse = new Warehouse { TenantId = TenantB, Code = "OTHER", Name = "Başka depo" };
        var lotItem = new StockItem { TenantId = TenantA, Code = "ITEM-LOT", Name = "Lotlu ürün", UnitCode = "EA", TrackingMode = InventoryTrackingMode.Lot };
        var serialItem = new StockItem { TenantId = TenantA, Code = "ITEM-SERIAL", Name = "Seri ürün", UnitCode = "EA", TrackingMode = InventoryTrackingMode.Serial };
        var otherItem = new StockItem { TenantId = TenantB, Code = "ITEM-OTHER", Name = "Tenant B ürünü", UnitCode = "EA", TrackingMode = InventoryTrackingMode.Serial };
        db.Tenants.AddRange(tenantA, tenantB);
        db.Warehouses.AddRange(warehouse, otherWarehouse);
        db.StockItems.AddRange(lotItem, serialItem, otherItem);
        var lotReceipt = Movement(TenantA, warehouse, lotItem, InventoryDirection.Receipt, 10m, "lot entry");
        var lotIssue = Movement(TenantA, warehouse, lotItem, InventoryDirection.Issue, 4m, "lot issue");
        var serialReceipt = Movement(TenantA, warehouse, serialItem, InventoryDirection.Receipt, 1m, "serial entry");
        var otherReceipt = Movement(TenantB, otherWarehouse, otherItem, InventoryDirection.Receipt, 2m, "other tenant entry");
        db.InventoryTransactions.AddRange(lotReceipt, lotIssue, serialReceipt, otherReceipt);
        db.InventoryTransactionTraces.AddRange(
            Trace(TenantA, lotReceipt, lotItem, "LOT-A", 10m, new DateOnly(2027, 12, 31), InventoryTrackingMode.Lot),
            Trace(TenantA, lotIssue, lotItem, "LOT-A", 4m, new DateOnly(2027, 12, 31), InventoryTrackingMode.Lot),
            Trace(TenantA, serialReceipt, serialItem, "SN-A", 1m, null, InventoryTrackingMode.Serial),
            Trace(TenantB, otherReceipt, otherItem, "SN-B", 2m, null, InventoryTrackingMode.Serial));
        await db.SaveChangesAsync();
        return app;
    }

    private static InventoryTransaction Movement(Guid tenantId, Warehouse warehouse, StockItem item, InventoryDirection direction, decimal quantity, string description) => new()
    {
        TenantId = tenantId, WarehouseId = warehouse.Id, Warehouse = warehouse, StockItemId = item.Id, StockItem = item,
        Direction = direction, Quantity = quantity, EntryDate = new DateOnly(2026, 10, 20), Description = description
    };

    private static InventoryTransactionTrace Trace(Guid tenantId, InventoryTransaction movement, StockItem item, string code, decimal quantity, DateOnly? expiry, InventoryTrackingMode mode) => new()
    {
        TenantId = tenantId, InventoryTransactionId = movement.Id, InventoryTransaction = movement, StockItemId = item.Id,
        TrackingMode = mode, TrackingCode = code, Quantity = quantity, ExpiryDate = expiry
    };
}
