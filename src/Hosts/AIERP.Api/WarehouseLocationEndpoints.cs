using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Data.SqlClient;

namespace AIERP.Api;

public static class WarehouseLocationEndpoints
{
    public static RouteGroupBuilder MapWarehouseLocationEndpoints(this RouteGroupBuilder warehouses)
    {
        warehouses.MapGet("/{warehouseId:guid}/locations", async (Guid warehouseId, ClaimsPrincipal principal, TenantDbContext db) =>
        {
            if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
            if (!await db.Warehouses.AsNoTracking().AnyAsync(x => x.TenantId == tenantId && x.Id == warehouseId)) return Results.NotFound();
            var items = await db.WarehouseLocations.AsNoTracking().Where(x => x.TenantId == tenantId && x.WarehouseId == warehouseId)
                .OrderBy(x => x.Code).Select(x => new WarehouseLocationView(x.Id, x.WarehouseId, x.Code, x.Name, x.ParentLocationId, x.IsActive, x.RowVersion)).ToListAsync();
            return Results.Ok(items);
        });

        warehouses.MapPost("/{warehouseId:guid}/locations", async (Guid warehouseId, WarehouseLocationWriteRequest request, ClaimsPrincipal principal, TenantDbContext db) =>
        {
            if (!TryGetTenantId(principal, out var tenantId) || principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
            var errors = InventoryValidation.Validate(request);
            if (errors is not null) return Results.ValidationProblem(errors);
            var warehouse = await db.Warehouses.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == warehouseId);
            if (warehouse is null) return Results.NotFound();
            if (!warehouse.IsActive) return Results.Conflict(new { error = "Pasif depoya konum eklenemez." });
            var code = request.Code!.Trim().ToUpperInvariant();
            if (await db.WarehouseLocations.AnyAsync(x => x.TenantId == tenantId && x.WarehouseId == warehouseId && x.Code == code))
                return Results.Conflict(new { error = "Bu konum kodu bu depoda zaten kullanılıyor." });
            if (request.ParentLocationId is { } parentId && !await db.WarehouseLocations.AnyAsync(x => x.TenantId == tenantId && x.WarehouseId == warehouseId && x.Id == parentId && x.IsActive))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["parentLocationId"] = ["Üst konum aynı etkin depoda bulunmalıdır."] });
            var location = new WarehouseLocation { TenantId = tenantId, WarehouseId = warehouseId, ParentLocationId = request.ParentLocationId,
                Code = code, Name = request.Name!.Trim() };
            db.WarehouseLocations.Add(location);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "warehouse-location.created", Resource = $"{warehouse.Code}/{code}" });
            try { await db.SaveChangesAsync(); }
            catch (DbUpdateException ex) when (IsUniqueViolation(ex)) { return Results.Conflict(new { error = "Bu konum kodu bu depoda zaten kullanılıyor." }); }
            return Results.Created($"/api/warehouses/{warehouseId}/locations/{location.Id}",
                new WarehouseLocationView(location.Id, location.WarehouseId, location.Code, location.Name, location.ParentLocationId, location.IsActive, location.RowVersion));
        });

        warehouses.MapPut("/{warehouseId:guid}/locations/{locationId:guid}", async (Guid warehouseId, Guid locationId, WarehouseLocationUpdateRequest request, ClaimsPrincipal principal, TenantDbContext db) =>
        {
            if (!TryGetTenantId(principal, out var tenantId) || principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
            var errors = InventoryValidation.Validate(request);
            if (errors is not null) return Results.ValidationProblem(errors);
            await using var transaction = await db.Database.BeginTransactionAsync();
            var location = await db.WarehouseLocations.FromSqlInterpolated($"SELECT * FROM [dbo].[WarehouseLocations] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [WarehouseId] = {warehouseId} AND [Id] = {locationId}").SingleOrDefaultAsync();
            if (location is null) return Results.NotFound();
            if (!location.RowVersion.SequenceEqual(request.RowVersion!)) return Results.Conflict(new { error = "Konum başka bir işlemde değiştirildi. Güncel kaydı yükleyip yeniden deneyin." });
            if (request.ParentLocationId == location.Id) return Results.ValidationProblem(new Dictionary<string, string[]> { ["parentLocationId"] = ["Konum kendisinin üst konumu olamaz."] });
            if (request.ParentLocationId is { } parentId)
            {
                var parent = await db.WarehouseLocations.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.WarehouseId == warehouseId && x.Id == parentId && x.IsActive);
                if (parent is null) return Results.ValidationProblem(new Dictionary<string, string[]> { ["parentLocationId"] = ["Üst konum aynı etkin depoda bulunmalıdır."] });
                var visited = new HashSet<Guid> { location.Id };
                var ancestorId = parent.ParentLocationId;
                while (ancestorId is { } currentId)
                {
                    if (!visited.Add(currentId)) return Results.Conflict(new { error = "Konum ağacında döngü bulundu." });
                    ancestorId = await db.WarehouseLocations.AsNoTracking().Where(x => x.TenantId == tenantId && x.WarehouseId == warehouseId && x.Id == currentId)
                        .Select(x => x.ParentLocationId).SingleOrDefaultAsync();
                }
            }
            var code = request.Code!.Trim().ToUpperInvariant();
            if (await db.WarehouseLocations.AnyAsync(x => x.TenantId == tenantId && x.WarehouseId == warehouseId && x.Code == code && x.Id != locationId))
                return Results.Conflict(new { error = "Bu konum kodu bu depoda zaten kullanılıyor." });
            if (!request.IsActive && location.IsActive)
            {
                if (await db.WarehouseLocations.AnyAsync(x => x.TenantId == tenantId && x.WarehouseId == warehouseId && x.ParentLocationId == locationId && x.IsActive))
                    return Results.Conflict(new { error = "Etkin alt konumları bulunan konum devre dışı bırakılamaz." });
                var balance = await db.InventoryTransactions.AsNoTracking().Where(x => x.TenantId == tenantId && x.WarehouseId == warehouseId && x.StorageLocationId == locationId)
                    .GroupBy(x => x.StockItemId).Select(g => g.Sum(x => x.Direction == InventoryDirection.Receipt ? x.Quantity : -x.Quantity)).FirstOrDefaultAsync(x => x != 0m);
                if (balance != 0m) return Results.Conflict(new { error = "Stok bakiyesi sıfır olmadan konum devre dışı bırakılamaz.", currentBalance = balance });
            }
            location.Code = code; location.Name = request.Name!.Trim(); location.ParentLocationId = request.ParentLocationId; location.IsActive = request.IsActive;
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "warehouse-location.updated", Resource = $"{warehouseId:N}/{location.Code}" });
            try { await db.SaveChangesAsync(); }
            catch (DbUpdateException ex) when (IsUniqueViolation(ex)) { return Results.Conflict(new { error = "Bu konum kodu bu depoda zaten kullanılıyor." }); }
            catch (DbUpdateConcurrencyException) { return Results.Conflict(new { error = "Konum eşzamanlı olarak değiştirildi. Güncel kaydı yükleyip yeniden deneyin." }); }
            await transaction.CommitAsync();
            return Results.Ok(new WarehouseLocationView(location.Id, location.WarehouseId, location.Code, location.Name, location.ParentLocationId, location.IsActive, location.RowVersion));
        });

        warehouses.MapGet("/{warehouseId:guid}/locations/{locationId:guid}/balances", async (Guid warehouseId, Guid locationId, DateOnly? asOfDate, ClaimsPrincipal principal, TenantDbContext db) =>
        {
            if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
            var location = await db.WarehouseLocations.AsNoTracking().Where(x => x.TenantId == tenantId && x.WarehouseId == warehouseId && x.Id == locationId)
                .Select(x => new { x.Id, x.WarehouseId, x.Code, x.Name }).SingleOrDefaultAsync();
            if (location is null) return Results.NotFound();
            var cutoff = asOfDate ?? DateOnly.FromDateTime(DateTime.UtcNow);
            var balances = await db.InventoryTransactions.AsNoTracking().Where(x => x.TenantId == tenantId && x.WarehouseId == warehouseId
                    && x.StorageLocationId == locationId && x.EntryDate <= cutoff)
                .GroupBy(x => x.StockItemId).Select(g => new { StockItemId = g.Key, Quantity = g.Sum(x => x.Direction == InventoryDirection.Receipt ? x.Quantity : -x.Quantity) })
                .Where(x => x.Quantity != 0m).Join(db.StockItems.AsNoTracking().Where(x => x.TenantId == tenantId), x => x.StockItemId, item => item.Id,
                    (x, item) => new WarehouseLocationBalanceView(item.Id, item.Code, item.Name, item.UnitCode, x.Quantity)).OrderBy(x => x.StockItemCode).ToListAsync();
            return Results.Ok(new { location.Id, location.WarehouseId, location.Code, location.Name, asOfDate = cutoff, items = balances });
        });

        warehouses.MapGet("/{warehouseId:guid}/location-reconciliation", async (Guid warehouseId, DateOnly? asOfDate, ClaimsPrincipal principal, TenantDbContext db) =>
        {
            if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
            var warehouse = await db.Warehouses.AsNoTracking().Where(x => x.TenantId == tenantId && x.Id == warehouseId)
                .Select(x => new { x.Id, x.Code, x.Name }).SingleOrDefaultAsync();
            if (warehouse is null) return Results.NotFound();
            var cutoff = asOfDate ?? DateOnly.FromDateTime(DateTime.UtcNow);
            var balances = await db.InventoryTransactions.AsNoTracking()
                .Where(x => x.TenantId == tenantId && x.WarehouseId == warehouseId && x.EntryDate <= cutoff)
                .GroupBy(x => x.StockItemId)
                .Select(group => new
                {
                    StockItemId = group.Key,
                    WarehouseQuantity = group.Sum(x => x.Direction == InventoryDirection.Receipt ? x.Quantity : -x.Quantity),
                    LocatedQuantity = group.Sum(x => x.StorageLocationId != null
                        ? (x.Direction == InventoryDirection.Receipt ? x.Quantity : -x.Quantity) : 0m),
                    UnlocatedQuantity = group.Sum(x => x.StorageLocationId == null
                        ? (x.Direction == InventoryDirection.Receipt ? x.Quantity : -x.Quantity) : 0m)
                })
                .Where(x => x.UnlocatedQuantity != 0m)
                .Join(db.StockItems.AsNoTracking().Where(x => x.TenantId == tenantId), balance => balance.StockItemId, item => item.Id,
                    (balance, item) => new { Balance = balance, Item = item })
                .OrderBy(x => x.Item.Code)
                .Select(x => new WarehouseLocationReconciliationItemView(x.Item.Id, x.Item.Code, x.Item.Name, x.Item.UnitCode,
                    x.Balance.WarehouseQuantity, x.Balance.LocatedQuantity, x.Balance.UnlocatedQuantity))
                .ToListAsync();
            return Results.Ok(new { warehouse.Id, warehouse.Code, warehouse.Name, asOfDate = cutoff, items = balances });
        });
        return warehouses;
    }

    private static bool TryGetTenantId(ClaimsPrincipal principal, out Guid tenantId)
        => Guid.TryParse(principal.FindFirstValue("tenant_id"), out tenantId);
    private static Guid? GetUserId(ClaimsPrincipal principal)
        => Guid.TryParse(principal.FindFirstValue(JwtRegisteredClaimNames.Sub), out var id) ? id : null;
    private static bool IsUniqueViolation(DbUpdateException exception)
        => exception.InnerException is SqlException { Number: 2601 or 2627 };
}
