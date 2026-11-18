using System.Security.Claims;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;

namespace AIERP.Api;

/// <summary>
/// Per-card warehouse balances. The permission catalog maps this route to <c>erp.warehouses</c> (not
/// <c>erp.stock-items</c>): it exposes warehouse balances, so a user denied warehouses cannot read them via /api/stock.
/// </summary>
public static class StockItemBalanceEndpoints
{
    public static RouteGroupBuilder MapStockItemBalanceEndpoints(this RouteGroupBuilder stockItems)
    {
        // One row per active warehouse ordered by code, zero rows included; the figures use the same formulas as
        // GET /api/warehouses/{warehouseId}/balances, grouped by warehouse with one query per source table.
        stockItems.MapGet("/{id:guid}/balances", async (Guid id, ClaimsPrincipal principal, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
            if (!await db.StockItems.AsNoTracking().AnyAsync(x => x.TenantId == tenantId && x.Id == id, ct)) return Results.NotFound();
            var warehouses = await db.Warehouses.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive)
                .OrderBy(x => x.Code).Select(x => new { x.Id, x.Code, x.Name }).ToListAsync(ct);
            var warehouseIds = warehouses.Select(x => x.Id).ToArray();
            var baseCurrency = await db.Tenants.AsNoTracking().Where(x => x.Id == tenantId).Select(x => x.BaseCurrencyCode).SingleAsync(ct);
            var totals = await db.InventoryTransactions.AsNoTracking()
                .Where(x => x.TenantId == tenantId && x.StockItemId == id && warehouseIds.Contains(x.WarehouseId))
                .GroupBy(x => x.WarehouseId).Select(g => new { WarehouseId = g.Key,
                    Quantity = g.Sum(x => x.Direction == InventoryDirection.Receipt ? x.Quantity : -x.Quantity),
                    Valuation = g.Sum(x => (decimal?)(x.UnitCostBase == null ? 0m : (x.Direction == InventoryDirection.Receipt ? x.Quantity : -x.Quantity) * x.UnitCostBase.Value)) ?? 0m,
                    Unvalued = g.Sum(x => (decimal?)(x.UnitCostBase == null ? (x.Direction == InventoryDirection.Receipt ? x.Quantity : -x.Quantity) : 0m)) ?? 0m })
                .ToDictionaryAsync(x => x.WarehouseId, ct);
            var valueAdjustments = await db.InventoryCostAdjustmentLines.AsNoTracking()
                .Where(x => x.TenantId == tenantId && x.StockItemId == id && warehouseIds.Contains(x.WarehouseId))
                .GroupBy(x => x.WarehouseId).Select(g => new { WarehouseId = g.Key, Amount = g.Sum(x => x.AmountBase) })
                .ToDictionaryAsync(x => x.WarehouseId, x => x.Amount, ct);
            var reserved = await db.SalesOrderReservations.AsNoTracking()
                .Where(x => x.TenantId == tenantId && warehouseIds.Contains(x.WarehouseId) && x.Status == SalesOrderReservationStatus.Active
                    && x.OrderLine.StockItemId == id)
                .GroupBy(x => x.WarehouseId).Select(g => new { WarehouseId = g.Key, Quantity = g.Sum(x => x.Quantity - x.FulfilledQuantity) })
                .ToDictionaryAsync(x => x.WarehouseId, x => x.Quantity, ct);
            return Results.Ok(warehouses.Select(warehouse =>
            {
                var total = totals.GetValueOrDefault(warehouse.Id);
                var quantity = total?.Quantity ?? 0m;
                var reservedQuantity = reserved.GetValueOrDefault(warehouse.Id);
                return new StockItemWarehouseBalanceView(warehouse.Id, warehouse.Code, warehouse.Name, quantity, reservedQuantity,
                    Math.Max(0m, quantity - reservedQuantity), (total?.Valuation ?? 0m) + valueAdjustments.GetValueOrDefault(warehouse.Id),
                    Math.Max(0m, total?.Unvalued ?? 0m), baseCurrency);
            }).ToList());
        });
        return stockItems;
    }

    private static bool TryGetTenantId(ClaimsPrincipal principal, out Guid tenantId)
        => Guid.TryParse(principal.FindFirstValue("tenant_id"), out tenantId);
}
