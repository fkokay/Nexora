using System.Security.Claims;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

public static class InventoryTrackingInquiryEndpoints
{
    public static void MapInventoryTrackingInquiryEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/inventory-tracking").WithTags("Inventory lot and serial traceability").RequireAuthorization();

        group.MapGet("/balances", async (string? q, Guid? warehouseId, InventoryTrackingMode? trackingMode, int? page, int? pageSize,
            ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!Guid.TryParse(user.FindFirstValue("tenant_id"), out var tenantId)) return Results.Forbid();
            if (trackingMode is not null and not (InventoryTrackingMode.Lot or InventoryTrackingMode.Serial))
                return Results.BadRequest(new { error = "Takip türü Lot veya Serial olmalıdır." });
            var search = q?.Trim();
            if (search?.Length > 120) return Results.BadRequest(new { error = "Arama metni en fazla 120 karakter olabilir." });
            var pageNumber = Math.Max(1, page ?? 1);
            var size = Math.Clamp(pageSize ?? 25, 1, 100);

            var traced = from trace in db.InventoryTransactionTraces.AsNoTracking()
                         join movement in db.InventoryTransactions.AsNoTracking()
                             on new { trace.TenantId, trace.InventoryTransactionId } equals new { movement.TenantId, InventoryTransactionId = movement.Id }
                         join item in db.StockItems.AsNoTracking()
                             on new { trace.TenantId, trace.StockItemId } equals new { item.TenantId, StockItemId = item.Id }
                         join warehouse in db.Warehouses.AsNoTracking()
                             on new { movement.TenantId, movement.WarehouseId } equals new { warehouse.TenantId, WarehouseId = warehouse.Id }
                         where trace.TenantId == tenantId && movement.TenantId == tenantId && item.TenantId == tenantId && warehouse.TenantId == tenantId
                         select new { trace, movement, item, warehouse };

            if (warehouseId is { } selectedWarehouse) traced = traced.Where(x => x.movement.WarehouseId == selectedWarehouse);
            if (trackingMode is { } selectedMode) traced = traced.Where(x => x.trace.TrackingMode == selectedMode);
            if (!string.IsNullOrEmpty(search)) traced = traced.Where(x => x.trace.TrackingCode.Contains(search)
                || x.item.Code.Contains(search) || x.item.Name.Contains(search)
                || x.warehouse.Code.Contains(search) || x.warehouse.Name.Contains(search));

            var grouped = traced.GroupBy(x => new
                {
                    x.item.Id, x.item.Code, x.item.Name, x.item.UnitCode, x.item.TrackingMode,
                    WarehouseId = x.warehouse.Id, WarehouseCode = x.warehouse.Code, WarehouseName = x.warehouse.Name,
                    x.trace.TrackingCode, x.trace.ExpiryDate
                })
                .Select(rows => new
                {
                    StockItemId = rows.Key.Id, StockItemCode = rows.Key.Code, StockItemName = rows.Key.Name,
                    rows.Key.UnitCode, rows.Key.TrackingMode, rows.Key.WarehouseId, rows.Key.WarehouseCode,
                    rows.Key.WarehouseName, rows.Key.TrackingCode, rows.Key.ExpiryDate,
                    QuantityOnHand = rows.Sum(x => x.movement.Direction == InventoryDirection.Receipt ? x.trace.Quantity : -x.trace.Quantity),
                    LastMovementDate = rows.Max(x => x.movement.EntryDate)
                })
                .Where(x => x.QuantityOnHand != 0m);
            var total = await grouped.CountAsync(ct);
            var rows = await grouped.OrderBy(x => x.ExpiryDate).ThenBy(x => x.TrackingCode).ThenBy(x => x.StockItemCode).ThenBy(x => x.WarehouseCode)
                .Skip((pageNumber - 1) * size).Take(size).ToListAsync(ct);
            var items = rows.Select(x => new InventoryTrackingBalanceView(x.StockItemId, x.StockItemCode, x.StockItemName, x.UnitCode,
                x.TrackingMode, x.WarehouseId, x.WarehouseCode, x.WarehouseName, x.TrackingCode, x.ExpiryDate, x.QuantityOnHand, x.LastMovementDate)).ToArray();
            return Results.Ok(new InventoryTrackingBalancePage(items, pageNumber, size, total));
        });
    }
}

public sealed record InventoryTrackingBalanceView(Guid StockItemId, string StockItemCode, string StockItemName, string UnitCode,
    InventoryTrackingMode TrackingMode, Guid WarehouseId, string WarehouseCode, string WarehouseName, string TrackingCode,
    DateOnly? ExpiryDate, decimal QuantityOnHand, DateOnly LastMovementDate);

public sealed record InventoryTrackingBalancePage(IReadOnlyList<InventoryTrackingBalanceView> Items, int Page, int PageSize, int TotalCount);
