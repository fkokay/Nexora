using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace AIERP.Api;

internal static class SalesDeliveryLocationGuard
{
    public static async Task<SalesDeliveryLocationResolution> ResolveAsync(
        TenantDbContext db, Guid tenantId, Guid warehouseId, IReadOnlyCollection<Guid> locationIds, CancellationToken cancellationToken = default)
    {
        if (locationIds.Count == 0)
            return new SalesDeliveryLocationResolution(SalesDeliveryLocationFailure.None, new Dictionary<Guid, WarehouseLocation>());

        var candidates = await db.WarehouseLocations.AsNoTracking()
            .Where(x => x.TenantId == tenantId && x.WarehouseId == warehouseId && locationIds.Contains(x.Id))
            .ToListAsync(cancellationToken);
        return Validate(tenantId, warehouseId, locationIds, candidates);
    }

    public static SalesDeliveryLocationResolution Validate(
        Guid tenantId, Guid warehouseId, IReadOnlyCollection<Guid> locationIds, IEnumerable<WarehouseLocation> candidates)
    {
        var requested = locationIds.ToHashSet();
        var locations = candidates.Where(x => x.TenantId == tenantId && x.WarehouseId == warehouseId && requested.Contains(x.Id))
            .GroupBy(x => x.Id).ToDictionary(x => x.Key, x => x.First());
        if (locations.Count != locationIds.Distinct().Count())
            return new SalesDeliveryLocationResolution(SalesDeliveryLocationFailure.NotFound, locations);
        if (locations.Values.Any(x => !x.IsActive))
            return new SalesDeliveryLocationResolution(SalesDeliveryLocationFailure.Inactive, locations);
        return new SalesDeliveryLocationResolution(SalesDeliveryLocationFailure.None, locations);
    }

    public static async Task<decimal> GetBalanceAsync(
        TenantDbContext db, Guid tenantId, Guid warehouseId, Guid stockItemId, Guid locationId, CancellationToken cancellationToken = default) =>
        await db.InventoryTransactions.AsNoTracking()
            .Where(x => x.TenantId == tenantId && x.WarehouseId == warehouseId && x.StockItemId == stockItemId && x.StorageLocationId == locationId)
            .SumAsync(x => (decimal?)(x.Direction == InventoryDirection.Receipt ? x.Quantity : -x.Quantity), cancellationToken) ?? 0m;
}

internal enum SalesDeliveryLocationFailure { None, NotFound, Inactive }

internal sealed record SalesDeliveryLocationResolution(SalesDeliveryLocationFailure Failure, IReadOnlyDictionary<Guid, WarehouseLocation> Locations);
