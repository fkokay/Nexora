using System.Security.Claims;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

public static class InventoryStockWidgetEndpoints
{
    public static void MapInventoryStockWidgetEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/inventory-stock-widgets")
            .WithTags("Inventory stock widgets")
            .RequireAuthorization();

        group.MapGet("/summary", async (ClaimsPrincipal user, TenantDbContext db, PlatformDbContext platformDb, CancellationToken ct) =>
        {
            if (!Guid.TryParse(user.FindFirstValue("tenant_id"), out var tenantId)) return Results.Forbid();

            var now = DateTime.UtcNow;
            var activeWarehouses = await db.Warehouses.AsNoTracking()
                .Where(x => x.TenantId == tenantId && x.IsActive)
                .Select(x => new { x.Id, x.Code, x.Name })
                .ToListAsync(ct);
            var warehouseIds = activeWarehouses.Select(x => x.Id).ToArray();
            var stockItems = await db.StockItems.AsNoTracking()
                .Where(x => x.TenantId == tenantId && x.IsActive)
                .Select(x => new { x.Id, x.Code, x.Name, x.UnitCode, x.Category, x.MinimumStock, x.CreatedAt, x.TrackingMode })
                .ToListAsync(ct);
            var movementBalances = await db.InventoryTransactions.AsNoTracking()
                .Where(x => x.TenantId == tenantId && warehouseIds.Contains(x.WarehouseId))
                .GroupBy(x => new { x.WarehouseId, x.StockItemId })
                .Select(g => new
                {
                    g.Key.WarehouseId,
                    g.Key.StockItemId,
                    Quantity = g.Sum(x => x.Direction == InventoryDirection.Receipt ? x.Quantity : -x.Quantity),
                    Value = g.Sum(x => (decimal?)(x.UnitCostBase == null ? 0m : (x.Direction == InventoryDirection.Receipt ? x.Quantity : -x.Quantity) * x.UnitCostBase.Value)) ?? 0m,
                })
                .ToListAsync(ct);
            var adjustments = await db.InventoryCostAdjustmentLines.AsNoTracking()
                .Where(x => x.TenantId == tenantId && warehouseIds.Contains(x.WarehouseId))
                .GroupBy(x => new { x.WarehouseId, x.StockItemId })
                .Select(g => new { g.Key.WarehouseId, g.Key.StockItemId, Value = g.Sum(x => x.AmountBase) })
                .ToListAsync(ct);
            var reservations = await db.SalesOrderReservations.AsNoTracking()
                .Where(x => x.TenantId == tenantId && warehouseIds.Contains(x.WarehouseId) && x.Status == SalesOrderReservationStatus.Active)
                .GroupBy(x => new { x.WarehouseId, StockItemId = x.OrderLine.StockItemId })
                .Select(g => new { g.Key.WarehouseId, g.Key.StockItemId, Quantity = g.Sum(x => x.Quantity - x.FulfilledQuantity) })
                .ToListAsync(ct);
            var lastMovements = await db.InventoryTransactions.AsNoTracking()
                .Where(x => x.TenantId == tenantId && warehouseIds.Contains(x.WarehouseId))
                .GroupBy(x => x.StockItemId)
                .Select(g => new { StockItemId = g.Key, LastMovementAt = g.Max(x => x.EntryDate) })
                .ToDictionaryAsync(x => x.StockItemId, x => x.LastMovementAt, ct);
            var recentMovementVolumes = await db.InventoryTransactions.AsNoTracking()
                .Where(x => x.TenantId == tenantId && warehouseIds.Contains(x.WarehouseId) && x.EntryDate >= DateOnly.FromDateTime(now.AddDays(-30)))
                .GroupBy(x => x.StockItemId)
                .Select(g => new { StockItemId = g.Key, Quantity = g.Sum(x => x.Quantity) })
                .ToDictionaryAsync(x => x.StockItemId, x => x.Quantity, ct);
            var expiryStart = DateOnly.FromDateTime(now);
            var expiryEnd = expiryStart.AddDays(30);
            var expiringLots = await (from trace in db.InventoryTransactionTraces.AsNoTracking()
                join movement in db.InventoryTransactions.AsNoTracking()
                    on new { trace.TenantId, trace.InventoryTransactionId } equals new { movement.TenantId, InventoryTransactionId = movement.Id }
                join item in db.StockItems.AsNoTracking()
                    on new { trace.TenantId, trace.StockItemId } equals new { item.TenantId, StockItemId = item.Id }
                join warehouse in db.Warehouses.AsNoTracking()
                    on new { movement.TenantId, movement.WarehouseId } equals new { warehouse.TenantId, WarehouseId = warehouse.Id }
                where trace.TenantId == tenantId && movement.TenantId == tenantId && item.TenantId == tenantId
                    && warehouse.TenantId == tenantId && warehouse.IsActive && item.IsActive
                    && trace.ExpiryDate >= expiryStart && trace.ExpiryDate <= expiryEnd
                group new { trace, movement, item, warehouse } by new
                {
                    item.Code,
                    StockItemName = item.Name,
                    item.UnitCode,
                    WarehouseName = warehouse.Name,
                    trace.TrackingCode,
                    trace.ExpiryDate,
                } into rows
                select new
                {
                    rows.Key.Code,
                    rows.Key.StockItemName,
                    rows.Key.UnitCode,
                    rows.Key.WarehouseName,
                    rows.Key.TrackingCode,
                    rows.Key.ExpiryDate,
                    QuantityOnHand = rows.Sum(x => x.movement.Direction == InventoryDirection.Receipt ? x.trace.Quantity : -x.trace.Quantity),
                }).Where(x => x.QuantityOnHand > 0m)
                .OrderBy(x => x.ExpiryDate)
                .Take(5)
                .Select(x => new
                {
                    stockItemCode = x.Code,
                    stockItemName = x.StockItemName,
                    unitCode = x.UnitCode,
                    warehouseName = x.WarehouseName,
                    trackingCode = x.TrackingCode,
                    expiryDate = x.ExpiryDate,
                    quantityOnHand = x.QuantityOnHand,
                }).ToListAsync(ct);
            var baseCurrency = await db.Tenants.AsNoTracking()
                .Where(x => x.Id == tenantId)
                .Select(x => x.BaseCurrencyCode)
                .SingleOrDefaultAsync(ct);
            if (string.IsNullOrWhiteSpace(baseCurrency))
                baseCurrency = await platformDb.Tenants.AsNoTracking()
                    .Where(x => x.Id == tenantId && x.IsActive)
                    .Select(x => x.BaseCurrencyCode)
                    .SingleOrDefaultAsync(ct);
            if (string.IsNullOrWhiteSpace(baseCurrency))
                return Results.NotFound(new { error = "Firma baz para birimi bulunamadı." });

            var quantityByItem = movementBalances.GroupBy(x => x.StockItemId)
                .ToDictionary(g => g.Key, g => g.Sum(x => x.Quantity));
            var valueByItem = movementBalances.GroupBy(x => x.StockItemId)
                .ToDictionary(g => g.Key, g => g.Sum(x => x.Value));
            foreach (var groupAdjustment in adjustments.GroupBy(x => x.StockItemId))
                valueByItem[groupAdjustment.Key] = valueByItem.GetValueOrDefault(groupAdjustment.Key) + groupAdjustment.Sum(x => x.Value);
            var reservedByItem = reservations.GroupBy(x => x.StockItemId)
                .ToDictionary(g => g.Key, g => g.Sum(x => x.Quantity));
            var itemRows = stockItems.Select(item => new
            {
                item.Id,
                item.Code,
                item.Name,
                item.UnitCode,
                item.Category,
                item.MinimumStock,
                item.CreatedAt,
                item.TrackingMode,
                Quantity = quantityByItem.GetValueOrDefault(item.Id),
                ReservedQuantity = reservedByItem.GetValueOrDefault(item.Id),
                Value = valueByItem.GetValueOrDefault(item.Id),
                LastMovementAt = lastMovements.ContainsKey(item.Id) ? lastMovements[item.Id] : (DateOnly?)null,
                MovementQuantity30Days = recentMovementVolumes.GetValueOrDefault(item.Id),
            }).ToList();
            var warehouseSummaries = activeWarehouses.Select(warehouse =>
            {
                var warehouseRows = movementBalances.Where(x => x.WarehouseId == warehouse.Id).ToArray();
                var warehouseAdjustment = adjustments.Where(x => x.WarehouseId == warehouse.Id).Sum(x => x.Value);
                return new
                {
                    warehouse.Id,
                    warehouse.Code,
                    warehouse.Name,
                    StockItemCount = warehouseRows.Count(x => x.Quantity > 0m),
                    Quantity = warehouseRows.Sum(x => x.Quantity),
                    StockValueBase = warehouseRows.Sum(x => x.Value) + warehouseAdjustment,
                };
            }).OrderByDescending(x => x.StockValueBase).ToArray();
            var soon = DateOnly.FromDateTime(now.AddDays(-90));

            return Results.Ok(new
            {
                asOf = now,
                baseCurrencyCode = baseCurrency,
                totals = new
                {
                    stockItemCount = stockItems.Count,
                    belowMinimumCount = itemRows.Count(x => x.Quantity < x.MinimumStock),
                    zeroStockCount = itemRows.Count(x => x.Quantity <= 0m),
                    reservedItemCount = itemRows.Count(x => x.ReservedQuantity > 0m),
                    stockValueBase = itemRows.Sum(x => x.Value),
                    noRecentMovementCount = itemRows.Count(x => x.Quantity > 0m && (!x.LastMovementAt.HasValue || x.LastMovementAt.Value < soon)),
                },
                warehouses = warehouseSummaries,
                lowStockItems = itemRows.Where(x => x.Quantity < x.MinimumStock)
                    .OrderBy(x => x.Quantity - x.MinimumStock).Take(5),
                zeroStockItems = itemRows.Where(x => x.Quantity <= 0m)
                    .OrderBy(x => x.Name).Take(5),
                reservedItems = itemRows.Where(x => x.ReservedQuantity > 0m)
                    .OrderByDescending(x => x.ReservedQuantity).Take(5),
                topMovingItems = itemRows.Where(x => x.MovementQuantity30Days > 0m)
                    .OrderByDescending(x => x.MovementQuantity30Days).Take(5),
                slowMovingItems = itemRows.Where(x => x.Quantity > 0m && (!x.LastMovementAt.HasValue || x.LastMovementAt.Value < soon))
                    .OrderBy(x => x.LastMovementAt).Take(5),
                recentlyAddedItems = itemRows.OrderByDescending(x => x.CreatedAt).Take(5),
                expiringLots,
            });
        });
    }
}
