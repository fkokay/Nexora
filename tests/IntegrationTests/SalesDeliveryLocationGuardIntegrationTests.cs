using AIERP.Api;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace AIERP.Api.IntegrationTests;

public sealed class SalesDeliveryLocationGuardIntegrationTests
{
    [Fact]
    public void Document_location_validation_rejects_foreign_warehouse_tenant_and_inactive_bins()
    {
        var tenantA = Guid.NewGuid();
        var tenantB = Guid.NewGuid();
        var warehouseA = Guid.NewGuid();
        var warehouseB = Guid.NewGuid();
        var active = new WarehouseLocation { TenantId = tenantA, WarehouseId = warehouseA, Code = "A-01", Name = "Active" };
        var inactive = new WarehouseLocation { TenantId = tenantA, WarehouseId = warehouseA, Code = "A-02", Name = "Inactive", IsActive = false };
        var otherWarehouse = new WarehouseLocation { TenantId = tenantA, WarehouseId = warehouseB, Code = "B-01", Name = "Other warehouse" };
        var otherTenant = new WarehouseLocation { TenantId = tenantB, WarehouseId = warehouseA, Code = "C-01", Name = "Other tenant" };
        var candidates = new[] { active, inactive, otherWarehouse, otherTenant };

        Assert.Equal(SalesDeliveryLocationFailure.None,
            SalesDeliveryLocationGuard.Validate(tenantA, warehouseA, [active.Id], candidates).Failure);
        Assert.Equal(SalesDeliveryLocationFailure.Inactive,
            SalesDeliveryLocationGuard.Validate(tenantA, warehouseA, [inactive.Id], candidates).Failure);
        Assert.Equal(SalesDeliveryLocationFailure.NotFound,
            SalesDeliveryLocationGuard.Validate(tenantA, warehouseA, [otherWarehouse.Id], candidates).Failure);
        Assert.Equal(SalesDeliveryLocationFailure.NotFound,
            SalesDeliveryLocationGuard.Validate(tenantA, warehouseA, [otherTenant.Id], candidates).Failure);
        Assert.Equal(SalesDeliveryLocationFailure.NotFound,
            SalesDeliveryLocationGuard.Validate(tenantA, warehouseA, [Guid.NewGuid()], candidates).Failure);
    }

    [Fact]
    public async Task Sales_delivery_location_guard_enforces_tenant_warehouse_active_state_and_location_balance()
    {
        var options = new DbContextOptionsBuilder<TenantDbContext>()
            .UseInMemoryDatabase($"sales-delivery-locations-{Guid.NewGuid():N}").Options;
        await using var db = new TenantDbContext(options);
        await db.Database.EnsureCreatedAsync();

        var tenantA = new Tenant { Name = "Tenant A", Slug = "tenant-a" };
        var tenantB = new Tenant { Name = "Tenant B", Slug = "tenant-b" };
        var warehouseA = new Warehouse { TenantId = tenantA.Id, Tenant = tenantA, Code = "A", Name = "Warehouse A" };
        var warehouseA2 = new Warehouse { TenantId = tenantA.Id, Tenant = tenantA, Code = "A2", Name = "Warehouse A2" };
        var warehouseB = new Warehouse { TenantId = tenantB.Id, Tenant = tenantB, Code = "B", Name = "Warehouse B" };
        var stockItem = new StockItem { TenantId = tenantA.Id, Tenant = tenantA, Code = "SKU-1", Name = "Stock", UnitCode = "EA" };
        var active = new WarehouseLocation { TenantId = tenantA.Id, WarehouseId = warehouseA.Id, Warehouse = warehouseA, Code = "A-01", Name = "A-01" };
        var inactive = new WarehouseLocation { TenantId = tenantA.Id, WarehouseId = warehouseA.Id, Warehouse = warehouseA, Code = "A-02", Name = "A-02", IsActive = false };
        var otherWarehouse = new WarehouseLocation { TenantId = tenantA.Id, WarehouseId = warehouseA2.Id, Warehouse = warehouseA2, Code = "A2-01", Name = "A2-01" };
        var otherTenant = new WarehouseLocation { TenantId = tenantB.Id, WarehouseId = warehouseB.Id, Warehouse = warehouseB, Code = "B-01", Name = "B-01" };
        db.Tenants.AddRange(tenantA, tenantB);
        db.Warehouses.AddRange(warehouseA, warehouseA2, warehouseB);
        db.StockItems.Add(stockItem);
        db.WarehouseLocations.AddRange(active, inactive, otherWarehouse, otherTenant);
        db.InventoryTransactions.AddRange(
            new InventoryTransaction { TenantId = tenantA.Id, WarehouseId = warehouseA.Id, StockItemId = stockItem.Id, StorageLocationId = active.Id,
                EntryDate = new DateOnly(2026, 10, 20), Direction = InventoryDirection.Receipt, Quantity = 8m, Description = "Location receipt" },
            new InventoryTransaction { TenantId = tenantA.Id, WarehouseId = warehouseA.Id, StockItemId = stockItem.Id, StorageLocationId = active.Id,
                EntryDate = new DateOnly(2026, 10, 20), Direction = InventoryDirection.Issue, Quantity = 3m, Description = "Location issue" },
            new InventoryTransaction { TenantId = tenantA.Id, WarehouseId = warehouseA.Id, StockItemId = stockItem.Id,
                EntryDate = new DateOnly(2026, 10, 20), Direction = InventoryDirection.Receipt, Quantity = 100m, Description = "Unassigned receipt" });
        await db.SaveChangesAsync();

        var resolved = await SalesDeliveryLocationGuard.ResolveAsync(db, tenantA.Id, warehouseA.Id, [active.Id]);
        Assert.Equal(SalesDeliveryLocationFailure.None, resolved.Failure);
        Assert.Contains(active.Id, resolved.Locations.Keys);
        Assert.Equal(SalesDeliveryLocationFailure.Inactive,
            (await SalesDeliveryLocationGuard.ResolveAsync(db, tenantA.Id, warehouseA.Id, [inactive.Id])).Failure);
        Assert.Equal(SalesDeliveryLocationFailure.NotFound,
            (await SalesDeliveryLocationGuard.ResolveAsync(db, tenantA.Id, warehouseA.Id, [otherWarehouse.Id])).Failure);
        Assert.Equal(SalesDeliveryLocationFailure.NotFound,
            (await SalesDeliveryLocationGuard.ResolveAsync(db, tenantA.Id, warehouseA.Id, [otherTenant.Id])).Failure);
        Assert.Equal(5m, await SalesDeliveryLocationGuard.GetBalanceAsync(db, tenantA.Id, warehouseA.Id, stockItem.Id, active.Id));
    }
}
