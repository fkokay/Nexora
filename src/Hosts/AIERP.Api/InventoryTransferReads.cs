using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace AIERP.Api;

/// <summary>The warehouse transfer detail read shared by <c>GET /api/warehouses/transfers/{id}</c> and the transfer's document view.</summary>
internal static class InventoryTransferReads
{
    internal static async Task<InventoryTransferDetailView?> ViewAsync(TenantDbContext db, Guid tenantId, Guid transferId, CancellationToken ct = default)
    {
        var transferRecord = await db.InventoryTransfers.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == transferId, ct);
        if (transferRecord is null) return null;
        var fromName = await db.Warehouses.AsNoTracking().Where(x => x.TenantId == tenantId && x.Id == transferRecord.FromWarehouseId).Select(x => x.Name).SingleAsync(ct);
        var toName = await db.Warehouses.AsNoTracking().Where(x => x.TenantId == tenantId && x.Id == transferRecord.ToWarehouseId).Select(x => x.Name).SingleAsync(ct);
        var lineCount = await db.InventoryTransactions.CountAsync(x => x.TenantId == tenantId && x.InventoryTransferId == transferRecord.Id && x.WarehouseId == transferRecord.FromWarehouseId, ct);
        var summary = new InventoryTransferSummary(transferRecord.Id, transferRecord.Code, transferRecord.FromWarehouseId, fromName,
            transferRecord.ToWarehouseId, toName, transferRecord.TransferDate, transferRecord.Status, lineCount, transferRecord.CreatedAt);
        var sourceLines = await db.InventoryTransactions.AsNoTracking().Where(x => x.TenantId == tenantId && x.InventoryTransferId == transferRecord.Id && x.WarehouseId == transferRecord.FromWarehouseId)
            .OrderBy(x => x.StockItem.Code).Select(x => new { x.StockItemId, x.StockItem.Code, x.StockItem.Name, x.StockItem.UnitCode, x.Quantity,
                x.EnteredQuantity, x.EnteredUnitCode, x.StorageLocationId }).ToListAsync(ct);
        var targetLocations = await db.InventoryTransactions.AsNoTracking().Where(x => x.TenantId == tenantId && x.InventoryTransferId == transferRecord.Id && x.WarehouseId == transferRecord.ToWarehouseId)
            .Select(x => new { x.StockItemId, x.StorageLocationId }).ToDictionaryAsync(x => x.StockItemId, x => x.StorageLocationId, ct);
        var locationIds = sourceLines.Where(x => x.StorageLocationId.HasValue).Select(x => x.StorageLocationId!.Value)
            .Concat(targetLocations.Values.Where(x => x.HasValue).Select(x => x!.Value)).Distinct().ToArray();
        var locations = await db.WarehouseLocations.AsNoTracking().Where(x => x.TenantId == tenantId && locationIds.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, ct);
        var lines = sourceLines.Select(x =>
        {
            var targetLocationId = targetLocations.GetValueOrDefault(x.StockItemId);
            locations.TryGetValue(x.StorageLocationId ?? Guid.Empty, out var fromLocation);
            locations.TryGetValue(targetLocationId ?? Guid.Empty, out var toLocation);
            return new InventoryTransferLineView(x.StockItemId, x.Code, x.Name, x.UnitCode, x.Quantity, x.EnteredQuantity, x.EnteredUnitCode,
                x.StorageLocationId, fromLocation?.Code, fromLocation?.Name, targetLocationId, toLocation?.Code, toLocation?.Name);
        }).ToList();
        return new InventoryTransferDetailView(summary, lines);
    }
}

/// <summary>
/// The row locks of the transfer write handlers. SQL Server takes <c>UPDLOCK, HOLDLOCK</c> (the retry and concurrency guarantees of the
/// transfer); other providers (the InMemory test provider) read the row plainly so the handlers stay testable without SQL Server.
/// </summary>
internal static class InventoryTransferLocks
{
    internal static IQueryable<StockItem> StockItem(TenantDbContext db, Guid tenantId, Guid id) => db.Database.IsRelational()
        ? db.StockItems.FromSqlInterpolated($"SELECT * FROM [dbo].[StockItems] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}")
        : db.StockItems.Where(x => x.TenantId == tenantId && x.Id == id);

    internal static IQueryable<Warehouse> Warehouse(TenantDbContext db, Guid tenantId, Guid id) => db.Database.IsRelational()
        ? db.Warehouses.FromSqlInterpolated($"SELECT * FROM [dbo].[Warehouses] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}")
        : db.Warehouses.Where(x => x.TenantId == tenantId && x.Id == id);

    internal static IQueryable<InventoryTransfer> Transfer(TenantDbContext db, Guid tenantId, Guid id) => db.Database.IsRelational()
        ? db.InventoryTransfers.FromSqlInterpolated($"SELECT * FROM [dbo].[InventoryTransfers] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}")
        : db.InventoryTransfers.Where(x => x.TenantId == tenantId && x.Id == id);
}
