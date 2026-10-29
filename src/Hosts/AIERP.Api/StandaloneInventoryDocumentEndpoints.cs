using System.Security.Claims;
using AIERP.Api;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

/// <summary>Orderless dispatches and receipts. Drafts do not affect stock; posting is atomic with inventory movements.</summary>
public static class StandaloneInventoryDocumentEndpoints
{
    public static void MapStandaloneInventoryDocumentEndpoints(this WebApplication app)
    {
        var sales = app.MapGroup("/api/sales/standalone-deliveries").RequireAuthorization().WithTags("Siparişsiz Satış İrsaliyeleri");
        sales.MapGet("/", async (ClaimsPrincipal user, TenantDbContext db, [Microsoft.AspNetCore.Mvc.FromServices] PlatformDbContext platformDb, int page = 1, int pageSize = 50, CancellationToken ct = default) =>
        {
            if (!Tenant(user, out var tenantId)) return Results.Forbid();
            page = Math.Max(1, page); pageSize = Math.Clamp(pageSize, 1, 100);
            var query = db.StandaloneSalesDeliveries.AsNoTracking().Where(x => x.TenantId == tenantId);
            if (UserId(user) is not { } userId) return Results.Forbid();
            query = await PermissionStatusFilter.ApplyAsync(platformDb, tenantId, userId, user.FindFirstValue("role") ?? string.Empty,
                "erp.sales-deliveries.read", "erp.sales-deliveries", query, x => x.Status, x => x.CustomerId, cancellationToken: ct) ?? query;
            var total = await query.CountAsync(ct);
            var items = await query.OrderByDescending(x => x.DeliveryDate).ThenByDescending(x => x.CreatedAt)
                .Skip((page - 1) * pageSize).Take(pageSize)
                .Select(x => new { x.Id, x.Code, x.CustomerId, customerName = x.Customer.Name, x.WarehouseId, warehouseName = x.Warehouse.Name,
                    date = x.DeliveryDate, status = x.Status.ToString(), lineCount = x.Lines.Count, x.CreatedAt }).ToListAsync(ct);
            return Results.Ok(new { items, page, pageSize, totalCount = total });
        });
        sales.MapPost("/", async (StandaloneSalesDeliveryWrite request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!Tenant(user, out var tenantId)) return Results.Forbid();
            var errors = Validate(request.RequestId, request.Code, request.Lines?.Select(x => (x.StockItemId, x.Quantity, x.UnitCode, x.TrackingCode, x.ExpiryDate)).ToList());
            if (errors is not null) return Results.ValidationProblem(errors);
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            var replay = await db.StandaloneSalesDeliveries.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.RequestId == request.RequestId, ct);
            if (replay is not null) return replay.Code == request.Code.Trim() ? Results.Ok(new { replay.Id, replay.Code, status = replay.Status.ToString() }) : Results.Conflict(new { error = "İstek anahtarı farklı bir belge için kullanılmış." });
            if (!await db.CustomerAccounts.AnyAsync(x => x.TenantId == tenantId && x.Id == request.CustomerId && x.IsActive && x.Type != CounterpartyType.Supplier, ct))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["customerId"] = ["Etkin müşteri kartı bulunamadı."] });
            var warehouse = await db.Warehouses.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == request.WarehouseId, ct);
            if (warehouse is null) return Results.ValidationProblem(new Dictionary<string, string[]> { ["warehouseId"] = ["Depo bulunamadı."] });
            if (!warehouse.IsActive) return Results.Conflict(new { error = "Pasif depoda irsaliye oluşturulamaz." });
            if (await ValidateLocations(db, tenantId, request.WarehouseId, request.Lines!.Select(x => x.StorageLocationId), ct) is { } locationError) return locationError;
            if (await db.StandaloneSalesDeliveries.AnyAsync(x => x.TenantId == tenantId && x.Code == request.Code.Trim(), ct)) return Results.Conflict(new { error = "İrsaliye kodu zaten kullanılıyor." });
            var ids = request.Lines!.Select(x => x.StockItemId).Distinct().ToArray();
            var stock = await db.StockItems.Where(x => x.TenantId == tenantId && ids.Contains(x.Id)).ToDictionaryAsync(x => x.Id, ct);
            if (stock.Count != ids.Length || stock.Values.Any(x => !x.IsActive)) return Results.ValidationProblem(new Dictionary<string, string[]> { ["lines"] = ["Etkin stok kartları seçin."] });
            var doc = new StandaloneSalesDelivery { TenantId = tenantId, RequestId = request.RequestId, CustomerId = request.CustomerId, WarehouseId = request.WarehouseId,
                Code = request.Code.Trim(), DeliveryDate = request.DeliveryDate };
            var salesLines = request.Lines!;
            foreach (var (line, i) in salesLines.Select((x, i) => (x, i)))
            {
                var item = stock[line.StockItemId]; var unit = Unit(line.UnitCode, item.UnitCode);
                var factor = await UnitFactor(db, tenantId, item, unit, ct);
                if (factor is null) return Results.ValidationProblem(new Dictionary<string, string[]> { [$"lines[{i}].unitCode"] = ["Stok kartı için etkin birim değil."] });
                var qty = line.Quantity * factor.Value;
                if (!ValidQty(qty)) return Results.ValidationProblem(new Dictionary<string, string[]> { [$"lines[{i}].quantity"] = ["Temel birim miktarı geçersiz."] });
                if (TrackingValidation(item.TrackingMode, qty, line.TrackingCode, line.ExpiryDate) is { } trackingError)
                    return Results.ValidationProblem(new Dictionary<string, string[]> { [$"lines[{i}].trackingCode"] = [trackingError] });
                doc.Lines.Add(new StandaloneSalesDeliveryLine { TenantId = tenantId, LineNumber = i + 1, StockItemId = item.Id, StockCode = item.Code, StockName = item.Name,
                    UnitCode = item.UnitCode, Quantity = qty, EnteredQuantity = line.Quantity, EnteredUnitCode = unit,
                    TrackingCode = string.IsNullOrWhiteSpace(line.TrackingCode) ? null : line.TrackingCode.Trim(), ExpiryDate = line.ExpiryDate, StorageLocationId = line.StorageLocationId });
            }
            db.StandaloneSalesDeliveries.Add(doc);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = UserId(user), Action = "sales.standalone-delivery.draft-created", Resource = doc.Code });
            await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
            return Results.Created($"/api/sales/standalone-deliveries/{doc.Id}", new { doc.Id, doc.Code, status = doc.Status.ToString() });
        });
        sales.MapPut("/{id:guid}", UpdateSalesDraft);
        sales.MapGet("/{id:guid}", async (Guid id, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!Tenant(user, out var tenantId)) return Results.Forbid();
            var doc = await db.StandaloneSalesDeliveries.AsNoTracking().Include(x => x.Lines).Include(x => x.Customer).Include(x => x.Warehouse)
                .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            return doc is null ? Results.NotFound() : Results.Ok(new { doc.Id, doc.Code, doc.CustomerId, customerName = doc.Customer.Name, doc.WarehouseId,
                warehouseName = doc.Warehouse.Name, doc.DeliveryDate, status = doc.Status.ToString(), doc.CreatedAt,
                lines = doc.Lines.OrderBy(x => x.LineNumber).Select(x => new { x.Id, x.LineNumber, x.StockItemId, x.StockCode, x.StockName, x.UnitCode, x.Quantity, x.EnteredQuantity, x.EnteredUnitCode, x.TrackingCode, x.ExpiryDate, x.StorageLocationId }) });
        });
        sales.MapDelete("/{id:guid}", async (Guid id, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!Tenant(user, out var tenantId)) return Results.Forbid();
            var doc = await db.StandaloneSalesDeliveries.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (doc is null) return Results.NotFound(); if (doc.Status != StandaloneInventoryDocumentStatus.Draft) return Results.Conflict(new { error = "Yalnızca taslak irsaliye silinebilir." });
            db.StandaloneSalesDeliveries.Remove(doc); db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = UserId(user), Action = "sales.standalone-delivery.draft-deleted", Resource = doc.Code });
            await db.SaveChangesAsync(ct); return Results.NoContent();
        });
        sales.MapPost("/{id:guid}/post", (Guid id, StandalonePostRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) => Post(id, request, user, db, true, ct));
        sales.MapPost("/{id:guid}/void", (Guid id, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) => Void(id, user, db, true, ct));

        var purchasing = app.MapGroup("/api/purchasing/standalone-receipts").RequireAuthorization().WithTags("Siparişsiz Satın Alma Mal Kabulleri");
        purchasing.MapGet("/", async (ClaimsPrincipal user, TenantDbContext db, [Microsoft.AspNetCore.Mvc.FromServices] PlatformDbContext platformDb, int page = 1, int pageSize = 50, CancellationToken ct = default) =>
        {
            if (!Tenant(user, out var tenantId)) return Results.Forbid();
            page = Math.Max(1, page); pageSize = Math.Clamp(pageSize, 1, 100);
            var query = db.StandalonePurchaseReceipts.AsNoTracking().Where(x => x.TenantId == tenantId);
            if (UserId(user) is not { } userId) return Results.Forbid();
            query = await PermissionStatusFilter.ApplyAsync(platformDb, tenantId, userId, user.FindFirstValue("role") ?? string.Empty,
                "erp.purchase-receipts.read", "erp.purchase-receipts", query, x => x.Status, supplierSelector: x => x.SupplierId, cancellationToken: ct) ?? query;
            var total = await query.CountAsync(ct);
            var items = await query.OrderByDescending(x => x.ReceiptDate).ThenByDescending(x => x.CreatedAt).Skip((page - 1) * pageSize).Take(pageSize)
                .Select(x => new { x.Id, x.Code, x.SupplierId, supplierName = x.Supplier.Name, x.WarehouseId, warehouseName = x.Warehouse.Name,
                    date = x.ReceiptDate, status = x.Status.ToString(), lineCount = x.Lines.Count, x.CreatedAt }).ToListAsync(ct);
            return Results.Ok(new { items, page, pageSize, totalCount = total });
        });
        purchasing.MapPost("/", async (StandalonePurchaseReceiptWrite request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!Tenant(user, out var tenantId)) return Results.Forbid();
            var errors = Validate(request.RequestId, request.Code, request.Lines?.Select(x => (x.StockItemId, x.Quantity, x.UnitCode, x.TrackingCode, x.ExpiryDate)).ToList());
            if (errors is not null) return Results.ValidationProblem(errors);
            if (request.Lines!.Any(x => x.UnitCostBase < 0m || x.UnitCostBase > 999999999999.99999999m)) return Results.ValidationProblem(new Dictionary<string, string[]> { ["lines"] = ["Birim maliyet sıfır veya daha büyük olmalıdır."] });
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            var replay = await db.StandalonePurchaseReceipts.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.RequestId == request.RequestId, ct);
            if (replay is not null) return replay.Code == request.Code.Trim() ? Results.Ok(new { replay.Id, replay.Code, status = replay.Status.ToString() }) : Results.Conflict(new { error = "İstek anahtarı farklı bir belge için kullanılmış." });
            if (!await db.CustomerAccounts.AnyAsync(x => x.TenantId == tenantId && x.Id == request.SupplierId && x.IsActive && x.Type != CounterpartyType.Customer, ct))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["supplierId"] = ["Etkin tedarikçi kartı bulunamadı."] });
            var warehouse = await db.Warehouses.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == request.WarehouseId, ct);
            if (warehouse is null) return Results.ValidationProblem(new Dictionary<string, string[]> { ["warehouseId"] = ["Depo bulunamadı."] });
            if (!warehouse.IsActive) return Results.Conflict(new { error = "Pasif depoya mal kabul yapılamaz." });
            if (await ValidateLocations(db, tenantId, request.WarehouseId, request.Lines!.Select(x => x.StorageLocationId), ct) is { } locationError) return locationError;
            if (await db.StandalonePurchaseReceipts.AnyAsync(x => x.TenantId == tenantId && x.Code == request.Code.Trim(), ct)) return Results.Conflict(new { error = "Mal kabul kodu zaten kullanılıyor." });
            var purchaseLines = request.Lines!;
            var ids = purchaseLines.Select(x => x.StockItemId).Distinct().ToArray(); var stock = await db.StockItems.Where(x => x.TenantId == tenantId && ids.Contains(x.Id)).ToDictionaryAsync(x => x.Id, ct);
            if (stock.Count != ids.Length || stock.Values.Any(x => !x.IsActive)) return Results.ValidationProblem(new Dictionary<string, string[]> { ["lines"] = ["Etkin stok kartları seçin."] });
            var doc = new StandalonePurchaseReceipt { TenantId = tenantId, RequestId = request.RequestId, SupplierId = request.SupplierId, WarehouseId = request.WarehouseId,
                Code = request.Code.Trim(), ReceiptDate = request.ReceiptDate };
            foreach (var (line, i) in purchaseLines.Select((x, i) => (x, i)))
            {
                var item = stock[line.StockItemId]; var unit = Unit(line.UnitCode, item.UnitCode); var factor = await UnitFactor(db, tenantId, item, unit, ct);
                if (factor is null) return Results.ValidationProblem(new Dictionary<string, string[]> { [$"lines[{i}].unitCode"] = ["Stok kartı için etkin birim değil."] });
                var qty = line.Quantity * factor.Value; if (!ValidQty(qty)) return Results.ValidationProblem(new Dictionary<string, string[]> { [$"lines[{i}].quantity"] = ["Temel birim miktarı geçersiz."] });
                if (TrackingValidation(item.TrackingMode, qty, line.TrackingCode, line.ExpiryDate) is { } trackingError)
                    return Results.ValidationProblem(new Dictionary<string, string[]> { [$"lines[{i}].trackingCode"] = [trackingError] });
                doc.Lines.Add(new StandalonePurchaseReceiptLine { TenantId = tenantId, LineNumber = i + 1, StockItemId = item.Id, StockCode = item.Code, StockName = item.Name,
                    UnitCode = item.UnitCode, Quantity = qty, UnitCostBase = decimal.Round(line.UnitCostBase / factor.Value, 8), EnteredQuantity = line.Quantity, EnteredUnitCode = unit,
                    TrackingCode = string.IsNullOrWhiteSpace(line.TrackingCode) ? null : line.TrackingCode.Trim(), ExpiryDate = line.ExpiryDate, StorageLocationId = line.StorageLocationId });
            }
            db.StandalonePurchaseReceipts.Add(doc);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = UserId(user), Action = "purchasing.standalone-receipt.draft-created", Resource = doc.Code });
            await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
            return Results.Created($"/api/purchasing/standalone-receipts/{doc.Id}", new { doc.Id, doc.Code, status = doc.Status.ToString() });
        });
        purchasing.MapPut("/{id:guid}", UpdatePurchaseDraft);
        purchasing.MapGet("/{id:guid}", async (Guid id, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!Tenant(user, out var tenantId)) return Results.Forbid();
            var doc = await db.StandalonePurchaseReceipts.AsNoTracking().Include(x => x.Lines).Include(x => x.Supplier).Include(x => x.Warehouse)
                .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            return doc is null ? Results.NotFound() : Results.Ok(new { doc.Id, doc.Code, doc.SupplierId, supplierName = doc.Supplier.Name, doc.WarehouseId,
                warehouseName = doc.Warehouse.Name, doc.ReceiptDate, status = doc.Status.ToString(), doc.CreatedAt,
                lines = doc.Lines.OrderBy(x => x.LineNumber).Select(x => new { x.Id, x.LineNumber, x.StockItemId, x.StockCode, x.StockName, x.UnitCode, x.Quantity, x.UnitCostBase, x.EnteredQuantity, x.EnteredUnitCode, x.TrackingCode, x.ExpiryDate, x.StorageLocationId }) });
        });
        purchasing.MapDelete("/{id:guid}", async (Guid id, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!Tenant(user, out var tenantId)) return Results.Forbid();
            var doc = await db.StandalonePurchaseReceipts.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (doc is null) return Results.NotFound(); if (doc.Status != StandaloneInventoryDocumentStatus.Draft) return Results.Conflict(new { error = "Yalnızca taslak mal kabul silinebilir." });
            db.StandalonePurchaseReceipts.Remove(doc); db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = UserId(user), Action = "purchasing.standalone-receipt.draft-deleted", Resource = doc.Code });
            await db.SaveChangesAsync(ct); return Results.NoContent();
        });
        purchasing.MapPost("/{id:guid}/post", (Guid id, StandalonePostRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) => Post(id, request, user, db, false, ct));
        purchasing.MapPost("/{id:guid}/void", (Guid id, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) => Void(id, user, db, false, ct));
    }

    private static async Task<IResult> UpdateSalesDraft(Guid id, StandaloneSalesDeliveryWrite request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct)
    {
        if (!Tenant(user, out var tenantId)) return Results.Forbid();
        var errors = Validate(request.RequestId, request.Code, request.Lines?.Select(x => (x.StockItemId, x.Quantity, x.UnitCode, x.TrackingCode, x.ExpiryDate)).ToList());
        if (errors is not null) return Results.ValidationProblem(errors);
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var query = db.StandaloneSalesDeliveries.Where(x => x.TenantId == tenantId && x.Id == id);
        var doc = await (db.Database.IsSqlServer()
            ? db.StandaloneSalesDeliveries.FromSqlInterpolated($"SELECT * FROM [dbo].[StandaloneSalesDeliveries] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}")
            : query).Include(x => x.Lines).SingleOrDefaultAsync(ct);
        if (doc is null) return Results.NotFound();
        if (doc.Status != StandaloneInventoryDocumentStatus.Draft) return Results.Conflict(new { error = "Yalnızca taslak irsaliye düzenlenebilir." });
        if (!await db.CustomerAccounts.AnyAsync(x => x.TenantId == tenantId && x.Id == request.CustomerId && x.IsActive && x.Type != CounterpartyType.Supplier, ct))
            return Results.ValidationProblem(new Dictionary<string, string[]> { ["customerId"] = ["Etkin müşteri kartı bulunamadı."] });
        var warehouse = await db.Warehouses.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == request.WarehouseId, ct);
        if (warehouse is null || !warehouse.IsActive) return Results.ValidationProblem(new Dictionary<string, string[]> { ["warehouseId"] = ["Etkin depo bulunamadı."] });
        if (await ValidateLocations(db, tenantId, request.WarehouseId, request.Lines!.Select(x => x.StorageLocationId), ct) is { } locationError) return locationError;
        if (await db.StandaloneSalesDeliveries.AnyAsync(x => x.TenantId == tenantId && x.Id != id && x.Code == request.Code.Trim(), ct)) return Results.Conflict(new { error = "İrsaliye kodu zaten kullanılıyor." });
        var input = request.Lines!; var ids = input.Select(x => x.StockItemId).Distinct().ToArray();
        var stock = await db.StockItems.Where(x => x.TenantId == tenantId && ids.Contains(x.Id)).ToDictionaryAsync(x => x.Id, ct);
        if (stock.Count != ids.Length || stock.Values.Any(x => !x.IsActive)) return Results.ValidationProblem(new Dictionary<string, string[]> { ["lines"] = ["Etkin stok kartları seçin."] });
        var existingLines = doc.Lines.OrderBy(x => x.LineNumber).ToList();
        doc.Code = request.Code.Trim(); doc.CustomerId = request.CustomerId; doc.WarehouseId = request.WarehouseId; doc.DeliveryDate = request.DeliveryDate;
        foreach (var (line, i) in input.Select((x, i) => (x, i)))
        {
            var item = stock[line.StockItemId]; var unit = Unit(line.UnitCode, item.UnitCode); var factor = await UnitFactor(db, tenantId, item, unit, ct);
            if (factor is null) return Results.ValidationProblem(new Dictionary<string, string[]> { [$"lines[{i}].unitCode"] = ["Stok kartı için etkin birim değil."] });
            var qty = line.Quantity * factor.Value;
            if (!ValidQty(qty)) return Results.ValidationProblem(new Dictionary<string, string[]> { [$"lines[{i}].quantity"] = ["Temel birim miktarı geçersiz."] });
            if (TrackingValidation(item.TrackingMode, qty, line.TrackingCode, line.ExpiryDate) is { } trackingError) return Results.ValidationProblem(new Dictionary<string, string[]> { [$"lines[{i}].trackingCode"] = [trackingError] });
            var target = i < existingLines.Count ? existingLines[i] : new StandaloneSalesDeliveryLine { TenantId = tenantId };
            target.LineNumber = i + 1; target.StockItemId = item.Id; target.StockCode = item.Code; target.StockName = item.Name; target.UnitCode = item.UnitCode;
            target.Quantity = qty; target.EnteredQuantity = line.Quantity; target.EnteredUnitCode = unit;
            target.TrackingCode = string.IsNullOrWhiteSpace(line.TrackingCode) ? null : line.TrackingCode.Trim(); target.ExpiryDate = line.ExpiryDate; target.StorageLocationId = line.StorageLocationId;
            if (i >= existingLines.Count) doc.Lines.Add(target);
        }
        foreach (var removed in existingLines.Skip(input.Count)) db.StandaloneSalesDeliveryLines.Remove(removed);
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = UserId(user), Action = "sales.standalone-delivery.draft-updated", Resource = doc.Code });
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
        return Results.Ok(new { doc.Id, doc.Code, status = doc.Status.ToString() });
    }

    private static async Task<IResult> UpdatePurchaseDraft(Guid id, StandalonePurchaseReceiptWrite request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct)
    {
        if (!Tenant(user, out var tenantId)) return Results.Forbid();
        var errors = Validate(request.RequestId, request.Code, request.Lines?.Select(x => (x.StockItemId, x.Quantity, x.UnitCode, x.TrackingCode, x.ExpiryDate)).ToList());
        if (errors is not null) return Results.ValidationProblem(errors);
        if (request.Lines!.Any(x => x.UnitCostBase < 0m || x.UnitCostBase > 999999999999.99999999m)) return Results.ValidationProblem(new Dictionary<string, string[]> { ["lines"] = ["Birim maliyet sıfır veya daha büyük olmalıdır."] });
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var query = db.StandalonePurchaseReceipts.Where(x => x.TenantId == tenantId && x.Id == id);
        var doc = await (db.Database.IsSqlServer()
            ? db.StandalonePurchaseReceipts.FromSqlInterpolated($"SELECT * FROM [dbo].[StandalonePurchaseReceipts] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}")
            : query).Include(x => x.Lines).SingleOrDefaultAsync(ct);
        if (doc is null) return Results.NotFound();
        if (doc.Status != StandaloneInventoryDocumentStatus.Draft) return Results.Conflict(new { error = "Yalnızca taslak mal kabul düzenlenebilir." });
        if (!await db.CustomerAccounts.AnyAsync(x => x.TenantId == tenantId && x.Id == request.SupplierId && x.IsActive && x.Type != CounterpartyType.Customer, ct))
            return Results.ValidationProblem(new Dictionary<string, string[]> { ["supplierId"] = ["Etkin tedarikçi kartı bulunamadı."] });
        var warehouse = await db.Warehouses.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == request.WarehouseId, ct);
        if (warehouse is null || !warehouse.IsActive) return Results.ValidationProblem(new Dictionary<string, string[]> { ["warehouseId"] = ["Etkin depo bulunamadı."] });
        if (await ValidateLocations(db, tenantId, request.WarehouseId, request.Lines!.Select(x => x.StorageLocationId), ct) is { } locationError) return locationError;
        if (await db.StandalonePurchaseReceipts.AnyAsync(x => x.TenantId == tenantId && x.Id != id && x.Code == request.Code.Trim(), ct)) return Results.Conflict(new { error = "Mal kabul kodu zaten kullanılıyor." });
        var input = request.Lines!; var ids = input.Select(x => x.StockItemId).Distinct().ToArray();
        var stock = await db.StockItems.Where(x => x.TenantId == tenantId && ids.Contains(x.Id)).ToDictionaryAsync(x => x.Id, ct);
        if (stock.Count != ids.Length || stock.Values.Any(x => !x.IsActive)) return Results.ValidationProblem(new Dictionary<string, string[]> { ["lines"] = ["Etkin stok kartları seçin."] });
        var existingLines = doc.Lines.OrderBy(x => x.LineNumber).ToList();
        doc.Code = request.Code.Trim(); doc.SupplierId = request.SupplierId; doc.WarehouseId = request.WarehouseId; doc.ReceiptDate = request.ReceiptDate;
        foreach (var (line, i) in input.Select((x, i) => (x, i)))
        {
            var item = stock[line.StockItemId]; var unit = Unit(line.UnitCode, item.UnitCode); var factor = await UnitFactor(db, tenantId, item, unit, ct);
            if (factor is null) return Results.ValidationProblem(new Dictionary<string, string[]> { [$"lines[{i}].unitCode"] = ["Stok kartı için etkin birim değil."] });
            var qty = line.Quantity * factor.Value;
            if (!ValidQty(qty)) return Results.ValidationProblem(new Dictionary<string, string[]> { [$"lines[{i}].quantity"] = ["Temel birim miktarı geçersiz."] });
            if (TrackingValidation(item.TrackingMode, qty, line.TrackingCode, line.ExpiryDate) is { } trackingError) return Results.ValidationProblem(new Dictionary<string, string[]> { [$"lines[{i}].trackingCode"] = [trackingError] });
            var target = i < existingLines.Count ? existingLines[i] : new StandalonePurchaseReceiptLine { TenantId = tenantId };
            target.LineNumber = i + 1; target.StockItemId = item.Id; target.StockCode = item.Code; target.StockName = item.Name; target.UnitCode = item.UnitCode;
            target.Quantity = qty; target.UnitCostBase = decimal.Round(line.UnitCostBase / factor.Value, 8); target.EnteredQuantity = line.Quantity; target.EnteredUnitCode = unit;
            target.TrackingCode = string.IsNullOrWhiteSpace(line.TrackingCode) ? null : line.TrackingCode.Trim(); target.ExpiryDate = line.ExpiryDate; target.StorageLocationId = line.StorageLocationId;
            if (i >= existingLines.Count) doc.Lines.Add(target);
        }
        foreach (var removed in existingLines.Skip(input.Count)) db.StandalonePurchaseReceiptLines.Remove(removed);
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = UserId(user), Action = "purchasing.standalone-receipt.draft-updated", Resource = doc.Code });
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
        return Results.Ok(new { doc.Id, doc.Code, status = doc.Status.ToString() });
    }

    private static async Task<IResult> Post(Guid id, StandalonePostRequest request, ClaimsPrincipal user, TenantDbContext db, bool sales, CancellationToken ct)
    {
        if (!Tenant(user, out var tenantId)) return Results.Forbid();
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        if (!await FiscalYearCloseEndpoints.LockTenantForPostingAsync(db, tenantId)) return Results.NotFound();
        var docId = id;
        if (sales)
        {
            var salesQuery = db.Database.IsSqlServer()
                ? db.StandaloneSalesDeliveries.FromSqlInterpolated($"SELECT * FROM [dbo].[StandaloneSalesDeliveries] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {docId}")
                : db.StandaloneSalesDeliveries.Where(x => x.TenantId == tenantId && x.Id == docId);
            var doc = await salesQuery.Include(x => x.Lines).SingleOrDefaultAsync(ct);
            if (doc is null) return Results.NotFound(); if (doc.Status == StandaloneInventoryDocumentStatus.Posted) return Results.Ok(new { id, status = "Posted" }); if (doc.Status != StandaloneInventoryDocumentStatus.Draft) return Results.Conflict(new { error = "Belge taslak durumda değil." });
            var closed = await FiscalYearCloseEndpoints.FindClosedPeriodAsync(db, tenantId, doc.DeliveryDate); if (FiscalYearCloseEndpoints.CreateClosedPeriodConflict(closed, "siparişsiz satış irsaliyesi") is { } conflict) return conflict;
            var posted = await PostLines(db, tenantId, doc.WarehouseId, doc.DeliveryDate, doc.Code, doc.Lines.Select(x => new PostLine(x.Id, x.StockItemId, x.Quantity, null, true, x.TrackingCode, x.ExpiryDate, x.StorageLocationId)).ToList(), request, ct);
            if (posted is not null) return posted;
            doc.Status = StandaloneInventoryDocumentStatus.Posted;
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = UserId(user), Action = "sales.standalone-delivery.posted", Resource = doc.Code });
        }
        else
        {
            var purchaseQuery = db.Database.IsSqlServer()
                ? db.StandalonePurchaseReceipts.FromSqlInterpolated($"SELECT * FROM [dbo].[StandalonePurchaseReceipts] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {docId}")
                : db.StandalonePurchaseReceipts.Where(x => x.TenantId == tenantId && x.Id == docId);
            var doc = await purchaseQuery.Include(x => x.Lines).SingleOrDefaultAsync(ct);
            if (doc is null) return Results.NotFound(); if (doc.Status == StandaloneInventoryDocumentStatus.Posted) return Results.Ok(new { id, status = "Posted" }); if (doc.Status != StandaloneInventoryDocumentStatus.Draft) return Results.Conflict(new { error = "Belge taslak durumda değil." });
            var closed = await FiscalYearCloseEndpoints.FindClosedPeriodAsync(db, tenantId, doc.ReceiptDate); if (FiscalYearCloseEndpoints.CreateClosedPeriodConflict(closed, "siparişsiz satın alma mal kabulü") is { } conflict) return conflict;
            var posted = await PostLines(db, tenantId, doc.WarehouseId, doc.ReceiptDate, doc.Code, doc.Lines.Select(x => new PostLine(x.Id, x.StockItemId, x.Quantity, x.UnitCostBase, false, x.TrackingCode, x.ExpiryDate, x.StorageLocationId)).ToList(), request, ct);
            if (posted is not null) return posted;
            doc.Status = StandaloneInventoryDocumentStatus.Posted;
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = UserId(user), Action = "purchasing.standalone-receipt.posted", Resource = doc.Code });
        }
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return Results.Ok(new { id, status = "Posted" });
    }

    private static async Task<IResult?> PostLines(TenantDbContext db, Guid tenantId, Guid warehouseId, DateOnly date, string code, List<PostLine> lines, StandalonePostRequest request, CancellationToken ct)
    {
        var warehouse = await db.Warehouses.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == warehouseId, ct);
        if (warehouse is null || !warehouse.IsActive) return Results.Conflict(new { error = "Depo bulunamadı veya pasif." });
        foreach (var group in lines.Where(x => x.IsSales).GroupBy(x => x.StockItemId))
        {
            var item = await db.StockItems.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == group.Key && x.IsActive, ct);
            if (item is null) return Results.Conflict(new { error = "Stok kartı bulunamadı veya pasif." });
            var current = await db.InventoryTransactions.Where(x => x.TenantId == tenantId && x.WarehouseId == warehouseId && x.StockItemId == group.Key)
                .SumAsync(x => (decimal?)(x.Direction == InventoryDirection.Receipt ? x.Quantity : -x.Quantity), ct) ?? 0m;
            var reserved = await db.SalesOrderReservations.Where(x => x.TenantId == tenantId && x.WarehouseId == warehouseId && x.Status == SalesOrderReservationStatus.Active && x.OrderLine.StockItemId == group.Key)
                .SumAsync(x => (decimal?)(x.Quantity - x.FulfilledQuantity), ct) ?? 0m;
            var allowNegative = await TenantOperationalSettingsEndpoints.AllowsNegativeStockAsync(db, tenantId, ct);
            var requested = group.Sum(x => x.Quantity);
            if (requested > current - reserved && !TenantOperationalSettingsEndpoints.CanPostNegativeBalance(allowNegative, reserved, item.TrackingMode, false))
                return Results.Conflict(new { error = $"{item.Code} için kullanılabilir stok yetersiz.", currentBalance = current, reservedQuantity = reserved, requestedQuantity = requested });
        }
        foreach (var group in lines.Where(x => x.IsSales && x.StorageLocationId is not null).GroupBy(x => (x.StockItemId, x.StorageLocationId)))
        {
            var locationBalance = await SalesDeliveryLocationGuard.GetBalanceAsync(db, tenantId, warehouseId, group.Key.StockItemId, group.Key.StorageLocationId!.Value, ct);
            var item = await db.StockItems.AsNoTracking().SingleAsync(x => x.TenantId == tenantId && x.Id == group.Key.StockItemId, ct);
            var allowNegative = await TenantOperationalSettingsEndpoints.AllowsNegativeStockAsync(db, tenantId, ct);
            var requested = group.Sum(x => x.Quantity);
            if (requested > locationBalance && !allowNegative && item.TrackingMode == InventoryTrackingMode.None)
                return Results.Conflict(new { error = $"{item.Code} için seçilen depo gözünde stok yetersiz.", locationBalance, requestedQuantity = requested });
        }
        foreach (var line in lines)
        {
            var item = await db.StockItems.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == line.StockItemId && x.IsActive, ct);
            if (item is null) return Results.Conflict(new { error = "Stok kartı bulunamadı veya pasif." });
            var allocations = string.IsNullOrWhiteSpace(line.TrackingCode)
                ? request.Tracking?.Where(x => x.LineId == line.Id).ToList() ?? []
                : [new StandaloneTrackingAllocation(line.Id, line.TrackingCode, line.Quantity, line.ExpiryDate)];
            if (item.TrackingMode == InventoryTrackingMode.None && allocations.Count > 0) return Results.ValidationProblem(new Dictionary<string, string[]> { ["tracking"] = ["Takipsiz stok satırına lot/seri bilgisi verilemez."] });
            if (item.TrackingMode != InventoryTrackingMode.None && (allocations.Count == 0 || allocations.Sum(x => x.Quantity) != line.Quantity || allocations.Any(x => string.IsNullOrWhiteSpace(x.TrackingCode) || x.Quantity <= 0m)))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["tracking"] = ["Takipli stok için toplam miktarı karşılayan geçerli lot/seri bilgisi gereklidir."] });
            if (item.TrackingMode == InventoryTrackingMode.Serial && allocations.Any(x => x.Quantity != 1m || x.ExpiryDate is not null)) return Results.ValidationProblem(new Dictionary<string, string[]> { ["tracking"] = ["Seri numarası başına miktar 1 olmalı; son kullanım tarihi girilmemelidir."] });
            if (item.TrackingMode == InventoryTrackingMode.Lot && allocations.Any(x => x.ExpiryDate is null)) return Results.ValidationProblem(new Dictionary<string, string[]> { ["tracking"] = ["Lot satırlarında son kullanım tarihi gereklidir."] });
            var direction = line.IsSales ? InventoryDirection.Issue : InventoryDirection.Receipt;
            var movement = new InventoryTransaction { TenantId = tenantId, WarehouseId = warehouseId, StorageLocationId = line.StorageLocationId, StockItemId = item.Id, EntryDate = date, Direction = direction,
                Quantity = line.Quantity, UnitCostBase = line.UnitCost, Description = $"{(line.IsSales ? "Siparişsiz satış irsaliyesi" : "Siparişsiz satın alma mal kabulü")} {code}",
                StandaloneSalesDeliveryLineId = line.IsSales ? line.Id : null, StandalonePurchaseReceiptLineId = line.IsSales ? null : line.Id };
            foreach (var allocation in allocations) movement.Tracking.Add(new InventoryTransactionTrace { TenantId = tenantId, StockItemId = item.Id, TrackingMode = item.TrackingMode,
                TrackingCode = allocation.TrackingCode.Trim(), Quantity = allocation.Quantity, ExpiryDate = allocation.ExpiryDate });
            db.InventoryTransactions.Add(movement);
        }
        return null;
    }

    private static async Task<IResult> Void(Guid id, ClaimsPrincipal user, TenantDbContext db, bool sales, CancellationToken ct)
    {
        if (!Tenant(user, out var tenantId)) return Results.Forbid(); await using var tx = await db.Database.BeginTransactionAsync(ct);
        if (!await FiscalYearCloseEndpoints.LockTenantForPostingAsync(db, tenantId)) return Results.NotFound();
        var date = DateOnly.FromDateTime(DateTime.UtcNow); var closed = await FiscalYearCloseEndpoints.FindClosedPeriodAsync(db, tenantId, date);
        if (FiscalYearCloseEndpoints.CreateClosedPeriodConflict(closed, sales ? "siparişsiz irsaliye iptali" : "siparişsiz mal kabul iptali") is { } conflict) return conflict;
        var originals = sales
            ? await db.InventoryTransactions.Where(x => x.TenantId == tenantId && x.StandaloneSalesDeliveryLine != null && x.StandaloneSalesDeliveryLine.DeliveryId == id && x.ReversalOfId == null).Include(x => x.Tracking).ToListAsync(ct)
            : await db.InventoryTransactions.Where(x => x.TenantId == tenantId && x.StandalonePurchaseReceiptLine != null && x.StandalonePurchaseReceiptLine.ReceiptId == id && x.ReversalOfId == null).Include(x => x.Tracking).ToListAsync(ct);
        if (sales)
        {
            var doc = await db.StandaloneSalesDeliveries.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (doc is null) return Results.NotFound(); if (doc.Status == StandaloneInventoryDocumentStatus.Voided) return Results.Ok(new { id, status = "Voided", reversalCount = 0 }); if (doc.Status != StandaloneInventoryDocumentStatus.Posted) return Results.Conflict(new { error = "Yalnızca kaydedilmiş irsaliye iptal edilebilir." });
            if (await Reverse(db, tenantId, originals, date, sales, ct) is { } reverseConflict) return reverseConflict; doc.Status = StandaloneInventoryDocumentStatus.Voided;
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = UserId(user), Action = "sales.standalone-delivery.voided", Resource = doc.Code });
        }
        else
        {
            var doc = await db.StandalonePurchaseReceipts.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (doc is null) return Results.NotFound(); if (doc.Status == StandaloneInventoryDocumentStatus.Voided) return Results.Ok(new { id, status = "Voided", reversalCount = 0 }); if (doc.Status != StandaloneInventoryDocumentStatus.Posted) return Results.Conflict(new { error = "Yalnızca kaydedilmiş mal kabul iptal edilebilir." });
            if (await db.PurchaseInvoiceDraftLines.AnyAsync(line => line.TenantId == tenantId
                && line.StandalonePurchaseReceiptLine != null && line.StandalonePurchaseReceiptLine.ReceiptId == doc.Id
                && line.PurchaseInvoiceDraft.Status == PurchaseInvoiceDraftStatus.Posted, ct))
                return Results.Conflict(new { error = "Bu mal kabul için fatura muhasebeleştirilmiş. Önce faturayı iade/ters kayıt süreciyle düzeltin; mal kabulün ters stok hareketi bundan sonra oluşturulabilir." });
            if (await Reverse(db, tenantId, originals, date, sales, ct) is { } reverseConflict) return reverseConflict; doc.Status = StandaloneInventoryDocumentStatus.Voided;
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = UserId(user), Action = "purchasing.standalone-receipt.voided", Resource = doc.Code });
        }
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return Results.Ok(new { id, status = "Voided", reversalCount = originals.Count });
    }

    private static async Task<IResult?> Reverse(TenantDbContext db, Guid tenantId, List<InventoryTransaction> originals, DateOnly date, bool sales, CancellationToken ct)
    {
        if (originals.Count == 0) return Results.Conflict(new { error = "Kaydedilmiş belge için stok hareketi bulunamadı." });
        foreach (var original in originals)
        {
            var direction = original.Direction == InventoryDirection.Receipt ? InventoryDirection.Issue : InventoryDirection.Receipt;
            if (direction == InventoryDirection.Issue)
            {
                var current = await db.InventoryTransactions.Where(x => x.TenantId == tenantId && x.WarehouseId == original.WarehouseId && x.StockItemId == original.StockItemId)
                    .SumAsync(x => (decimal?)(x.Direction == InventoryDirection.Receipt ? x.Quantity : -x.Quantity), ct) ?? 0m;
                var item = await db.StockItems.SingleAsync(x => x.TenantId == tenantId && x.Id == original.StockItemId, ct);
                var reserved = await db.SalesOrderReservations.Where(x => x.TenantId == tenantId && x.WarehouseId == original.WarehouseId && x.Status == SalesOrderReservationStatus.Active && x.OrderLine.StockItemId == item.Id)
                    .SumAsync(x => (decimal?)(x.Quantity - x.FulfilledQuantity), ct) ?? 0m;
                if (original.Quantity > current - reserved) return Results.Conflict(new { error = $"{item.Code} stok bakiyesi nedeniyle belge iptal edilemedi." });
            }
            var reverse = new InventoryTransaction { TenantId = tenantId, WarehouseId = original.WarehouseId, StorageLocationId = original.StorageLocationId,
                StockItemId = original.StockItemId, EntryDate = date, Direction = direction, Quantity = original.Quantity, UnitCostBase = original.UnitCostBase,
                Description = $"{(sales ? "Siparişsiz satış irsaliyesi" : "Siparişsiz mal kabulü")} iptal ters hareketi", ReversalOfId = original.Id };
            foreach (var t in original.Tracking) reverse.Tracking.Add(new InventoryTransactionTrace { TenantId = tenantId, StockItemId = t.StockItemId, TrackingMode = t.TrackingMode,
                TrackingCode = t.TrackingCode, Quantity = t.Quantity, ExpiryDate = t.ExpiryDate });
            db.InventoryTransactions.Add(reverse);
        }
        return null;
    }

    private static Dictionary<string, string[]>? Validate(Guid requestId, string? code, List<(Guid StockItemId, decimal Quantity, string? UnitCode, string? TrackingCode, DateOnly? ExpiryDate)>? lines)
    {
        var e = new Dictionary<string, string[]>();
        if (requestId == Guid.Empty) e["requestId"] = ["İstek kimliği gerekli."];
        if (string.IsNullOrWhiteSpace(code) || code.Trim().Length > 40 || code.Any(char.IsControl)) e["code"] = ["Belge kodu 1–40 karakter olmalıdır."];
        if (lines is null || lines.Count is < 1 or > 200) e["lines"] = ["1–200 satır gereklidir."];
        else if (lines.Any(x => x.StockItemId == Guid.Empty || !ValidQty(x.Quantity) || string.IsNullOrWhiteSpace(x.UnitCode) || x.UnitCode.Trim().Length > 8 || x.TrackingCode?.Length > 80 || x.TrackingCode?.Any(char.IsControl) == true)) e["lines"] = ["Stok, pozitif miktar ve geçerli birim girin."];
        return e.Count == 0 ? null : e;
    }
    private static bool ValidQty(decimal x) => x > 0m && x <= 99999999999999.9999m && x == decimal.Round(x, 4);
    private static string? TrackingValidation(InventoryTrackingMode mode, decimal quantity, string? code, DateOnly? expiry) => mode switch
    {
        InventoryTrackingMode.None when !string.IsNullOrWhiteSpace(code) || expiry is not null => "Takipsiz stok satırında lot/seri bilgisi kullanılamaz.",
        InventoryTrackingMode.Serial when quantity != 1m || string.IsNullOrWhiteSpace(code) || expiry is not null => "Her seri numarası için miktarı 1 olan ayrı satır girin; son kullanma tarihi seri için kullanılmaz.",
        InventoryTrackingMode.Lot when string.IsNullOrWhiteSpace(code) || expiry is null => "Lot numarası ve son kullanma tarihi gereklidir.",
        _ => null
    };
    private static string Unit(string? value, string fallback) => string.IsNullOrWhiteSpace(value) ? fallback : value.Trim().ToUpperInvariant();
    private static async Task<IResult?> ValidateLocations(TenantDbContext db, Guid tenantId, Guid warehouseId, IEnumerable<Guid?> requestedIds, CancellationToken ct)
    {
        var ids = requestedIds.Where(x => x.HasValue).Select(x => x!.Value).Distinct().ToArray();
        if (ids.Length == 0) return null;
        var resolution = await SalesDeliveryLocationGuard.ResolveAsync(db, tenantId, warehouseId, ids, ct);
        return resolution.Failure switch
        {
            SalesDeliveryLocationFailure.NotFound => Results.ValidationProblem(new Dictionary<string, string[]> { ["lines.storageLocationId"] = ["Depo gözü seçili depoya ait değil veya bulunamadı."] }),
            SalesDeliveryLocationFailure.Inactive => Results.Conflict(new { error = "Pasif depo gözü kullanılamaz." }),
            _ => null
        };
    }
    private static async Task<decimal?> UnitFactor(TenantDbContext db, Guid tenantId, StockItem item, string unit, CancellationToken ct) =>
        string.Equals(unit, item.UnitCode, StringComparison.OrdinalIgnoreCase) ? 1m : await db.StockItemUnitConversions.AsNoTracking()
            .Where(x => x.TenantId == tenantId && x.StockItemId == item.Id && x.IsActive && x.UnitCode == unit).Select(x => (decimal?)x.FactorToBase).SingleOrDefaultAsync(ct);
    private static bool Tenant(ClaimsPrincipal principal, out Guid id) => Guid.TryParse(principal.FindFirstValue("tenant_id"), out id);
    private static Guid? UserId(ClaimsPrincipal user) => Guid.TryParse(user.FindFirstValue(ClaimTypes.NameIdentifier) ?? user.FindFirstValue("sub"), out var id) ? id : null;
    private sealed record PostLine(Guid Id, Guid StockItemId, decimal Quantity, decimal? UnitCost, bool IsSales, string? TrackingCode, DateOnly? ExpiryDate, Guid? StorageLocationId);
}

public sealed record StandaloneSalesDeliveryWrite(Guid RequestId, string Code, Guid CustomerId, Guid WarehouseId, DateOnly DeliveryDate, List<StandaloneSalesDeliveryLineWrite>? Lines);
public sealed record StandaloneSalesDeliveryLineWrite(Guid StockItemId, decimal Quantity, string? UnitCode, string? TrackingCode, DateOnly? ExpiryDate, Guid? StorageLocationId = null);
public sealed record StandalonePurchaseReceiptWrite(Guid RequestId, string Code, Guid SupplierId, Guid WarehouseId, DateOnly ReceiptDate, List<StandalonePurchaseReceiptLineWrite>? Lines);
public sealed record StandalonePurchaseReceiptLineWrite(Guid StockItemId, decimal Quantity, string? UnitCode, decimal UnitCostBase, string? TrackingCode, DateOnly? ExpiryDate, Guid? StorageLocationId = null);
public sealed record StandalonePostRequest(List<StandaloneTrackingAllocation>? Tracking);
public sealed record StandaloneTrackingAllocation(Guid LineId, string TrackingCode, decimal Quantity, DateOnly? ExpiryDate);
