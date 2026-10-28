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

        group.MapGet("/genealogy", async (Guid? stockItemId, string? stockItemCode, string? trackingCode, int? pageSize,
            ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!Guid.TryParse(user.FindFirstValue("tenant_id"), out var tenantId)) return Results.Forbid();
            var itemCode = stockItemCode?.Trim();
            var code = trackingCode?.Trim();
            if ((stockItemId is null) == string.IsNullOrWhiteSpace(itemCode) || stockItemId == Guid.Empty ||
                (itemCode is not null && (itemCode.Length is < 2 or > 100 || itemCode.Any(char.IsControl))) ||
                string.IsNullOrWhiteSpace(code) || code.Length > 120 || code.Any(char.IsControl))
                return Results.BadRequest(new { error = "Stok kartı ve en fazla 120 karakterlik lot/seri kodu gereklidir." });
            var item = await db.StockItems.AsNoTracking().Where(x => x.TenantId == tenantId &&
                    (stockItemId.HasValue ? x.Id == stockItemId.Value : x.Code == itemCode))
                .Select(x => new { x.Id, x.Code, x.Name, x.UnitCode, x.TrackingMode }).SingleOrDefaultAsync(ct);
            if (item is null) return Results.NotFound();
            if (item.TrackingMode is not (InventoryTrackingMode.Lot or InventoryTrackingMode.Serial))
                return Results.BadRequest(new { error = "Bu stok kartında lot/seri takibi etkin değil." });

            const int hardLimit = 200;
            var size = Math.Clamp(pageSize ?? 100, 1, hardLimit);
            var query = from trace in db.InventoryTransactionTraces.AsNoTracking()
                        join movement in db.InventoryTransactions.AsNoTracking()
                            on new { trace.TenantId, trace.InventoryTransactionId } equals new { movement.TenantId, InventoryTransactionId = movement.Id }
                        join warehouse in db.Warehouses.AsNoTracking()
                            on new { movement.TenantId, movement.WarehouseId } equals new { warehouse.TenantId, WarehouseId = warehouse.Id }
                        where trace.TenantId == tenantId && movement.TenantId == tenantId
                            && warehouse.TenantId == tenantId && trace.StockItemId == item.Id && trace.TrackingCode == code
                        orderby movement.EntryDate, movement.CreatedAt, movement.Id
                        select new { trace, movement, warehouse.Code };
            var total = await query.CountAsync(ct);
            var rows = await query.Take(size + 1).ToListAsync(ct);
            var truncated = rows.Count > size || total > size;
            if (rows.Count > size) rows.RemoveAt(rows.Count - 1);

            // Resolve document labels only through persisted foreign keys, always within this tenant.
            var purchaseLineIds = rows.Where(x => x.movement.PurchaseReceiptLineId != null).Select(x => x.movement.PurchaseReceiptLineId!.Value).Distinct().ToArray();
            var deliveryLineIds = rows.Where(x => x.movement.SalesDeliveryLineId != null).Select(x => x.movement.SalesDeliveryLineId!.Value).Distinct().ToArray();
            var salesReturnLineIds = rows.Where(x => x.movement.SalesReturnLineId != null).Select(x => x.movement.SalesReturnLineId!.Value).Distinct().ToArray();
            var supplierReturnLineIds = rows.Where(x => x.movement.SupplierReturnLineId != null).Select(x => x.movement.SupplierReturnLineId!.Value).Distinct().ToArray();
            var manufacturingIds = rows.Where(x => x.movement.ManufacturingOrderId != null).Select(x => x.movement.ManufacturingOrderId!.Value).Distinct().ToArray();
            var transferIds = rows.Where(x => x.movement.InventoryTransferId != null).Select(x => x.movement.InventoryTransferId!.Value).Distinct().ToArray();
            var reversalIds = rows.Where(x => x.movement.ReversalOfId != null).Select(x => x.movement.ReversalOfId!.Value).Distinct().ToArray();
            var purchases = await (from line in db.PurchaseReceiptLines.AsNoTracking() join doc in db.PurchaseReceipts.AsNoTracking()
                on new { line.TenantId, Id = line.ReceiptId } equals new { doc.TenantId, doc.Id }
                where line.TenantId == tenantId && doc.TenantId == tenantId && purchaseLineIds.Contains(line.Id)
                select new { LineId = line.Id, doc.Code }).ToDictionaryAsync(x => x.LineId, x => x.Code, ct);
            var deliveries = await (from line in db.SalesDeliveryLines.AsNoTracking() join doc in db.SalesDeliveries.AsNoTracking()
                on new { line.TenantId, Id = line.DeliveryId } equals new { doc.TenantId, doc.Id }
                where line.TenantId == tenantId && doc.TenantId == tenantId && deliveryLineIds.Contains(line.Id)
                select new { LineId = line.Id, doc.Code }).ToDictionaryAsync(x => x.LineId, x => x.Code, ct);
            var salesReturns = await (from line in db.SalesReturnLines.AsNoTracking() join doc in db.SalesReturns.AsNoTracking()
                on new { line.TenantId, Id = line.SalesReturnId } equals new { doc.TenantId, doc.Id }
                where line.TenantId == tenantId && doc.TenantId == tenantId && salesReturnLineIds.Contains(line.Id)
                select new { LineId = line.Id, doc.Code }).ToDictionaryAsync(x => x.LineId, x => x.Code, ct);
            var supplierReturns = await (from line in db.SupplierReturnLines.AsNoTracking() join doc in db.SupplierReturns.AsNoTracking()
                on new { line.TenantId, Id = line.SupplierReturnId } equals new { doc.TenantId, doc.Id }
                where line.TenantId == tenantId && doc.TenantId == tenantId && supplierReturnLineIds.Contains(line.Id)
                select new { LineId = line.Id, doc.Code }).ToDictionaryAsync(x => x.LineId, x => x.Code, ct);
            var manufacturing = await db.ManufacturingOrders.AsNoTracking().Where(x => x.TenantId == tenantId && manufacturingIds.Contains(x.Id))
                .ToDictionaryAsync(x => x.Id, x => x.Code, ct);
            var transfers = await db.InventoryTransfers.AsNoTracking().Where(x => x.TenantId == tenantId && transferIds.Contains(x.Id))
                .ToDictionaryAsync(x => x.Id, x => x.Code, ct);
            var tenantReversalIds = await db.InventoryTransactions.AsNoTracking().Where(x => x.TenantId == tenantId && reversalIds.Contains(x.Id))
                .Select(x => x.Id).ToHashSetAsync(ct);

            var events = rows.Select(x =>
            {
                var movement = x.movement;
                string? sourceType = null; string? sourceCode = null;
                if (movement.PurchaseReceiptLineId is { } purchase && purchases.TryGetValue(purchase, out var purchaseCode)) { sourceType = "purchaseReceipt"; sourceCode = purchaseCode; }
                else if (movement.SalesDeliveryLineId is { } delivery && deliveries.TryGetValue(delivery, out var deliveryCode)) { sourceType = "salesDelivery"; sourceCode = deliveryCode; }
                else if (movement.SalesReturnLineId is { } salesReturn && salesReturns.TryGetValue(salesReturn, out var salesReturnCode)) { sourceType = "salesReturn"; sourceCode = salesReturnCode; }
                else if (movement.SupplierReturnLineId is { } supplierReturn && supplierReturns.TryGetValue(supplierReturn, out var supplierReturnCode)) { sourceType = "supplierReturn"; sourceCode = supplierReturnCode; }
                else if (movement.ManufacturingOrderId is { } order && manufacturing.TryGetValue(order, out var orderCode)) { sourceType = "manufacturingOrder"; sourceCode = orderCode; }
                else if (movement.InventoryTransferId is { } transfer && transfers.TryGetValue(transfer, out var transferCode)) { sourceType = "inventoryTransfer"; sourceCode = transferCode; }
                else if (movement.ReversalOfId is { } reversal && tenantReversalIds.Contains(reversal)) sourceType = "reversal";
                return new InventoryTrackingGenealogyEvent(movement.EntryDate, movement.Direction, x.trace.Quantity, x.Code,
                    sourceType, sourceCode, movement.ReversalOfId is not null, sourceType is not null);
            }).ToArray();
            var complete = !truncated && events.All(x => x.SourceResolved);
            return Results.Ok(new InventoryTrackingGenealogyView(item.Code, item.Name, item.UnitCode, item.TrackingMode, code,
                events, total, complete, complete ? "complete" : "incomplete", size));
        });
    }
}

public sealed record InventoryTrackingBalanceView(Guid StockItemId, string StockItemCode, string StockItemName, string UnitCode,
    InventoryTrackingMode TrackingMode, Guid WarehouseId, string WarehouseCode, string WarehouseName, string TrackingCode,
    DateOnly? ExpiryDate, decimal QuantityOnHand, DateOnly LastMovementDate);

public sealed record InventoryTrackingBalancePage(IReadOnlyList<InventoryTrackingBalanceView> Items, int Page, int PageSize, int TotalCount);

public sealed record InventoryTrackingGenealogyEvent(DateOnly Date, InventoryDirection Direction, decimal Quantity, string WarehouseCode,
    string? SourceType, string? SourceCode, bool IsReversal, bool SourceResolved);

public sealed record InventoryTrackingGenealogyView(string StockItemCode, string StockItemName, string UnitCode, InventoryTrackingMode TrackingMode,
    string TrackingCode, IReadOnlyList<InventoryTrackingGenealogyEvent> Events, int TotalEvents, bool IsComplete, string Coverage, int Limit);
