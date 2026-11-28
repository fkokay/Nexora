using System.Security.Claims;
using AIERP.Api;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

/// <summary>Orderless dispatches and receipts. Drafts do not affect stock; posting is atomic with inventory movements.</summary>
public static class StandaloneInventoryDocumentEndpoints
{
    public static void MapStandaloneInventoryDocumentEndpoints(this WebApplication app)
    {
        var sales = app.MapGroup("/api/sales/standalone-deliveries").RequireAuthorization().WithTags("Satış İrsaliyeleri");
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
                    date = x.DeliveryDate, status = x.Status.ToString(), lineCount = x.Lines.Count, x.CreatedAt,
                    invoiceId = db.SalesInvoices.Where(invoice => invoice.TenantId == tenantId && invoice.StandaloneDeliveryId == x.Id).Select(invoice => (Guid?)invoice.Id).FirstOrDefault(),
                    currencyCode = x.CurrencyCode ?? x.Customer.CurrencyCode }).ToListAsync(ct);
            var pricing = await DeliveryPricingViews.StandaloneSalesDeliveriesAsync(db, tenantId, items.Select(x => x.Id).ToList(), ct);
            return Results.Ok(new { items = items.Select(x => new { x.Id, x.Code, x.CustomerId, x.customerName, x.WarehouseId, x.warehouseName, x.date, x.status,
                x.lineCount, x.CreatedAt, x.invoiceId, x.currencyCode, pricing[x.Id].PricedNetTotal, pricing[x.Id].PricedVatTotal, pricing[x.Id].PricedGrandTotal,
                pricing[x.Id].FreeLineCount, pricing[x.Id].UnpricedLineCount, pricing[x.Id].PricingState }), page, pageSize, totalCount = total });
        });
        sales.MapPost("/", async (StandaloneSalesDeliveryWrite request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!Tenant(user, out var tenantId)) return Results.Forbid();
            var errors = Validate(request.RequestId, request.Code, request.Lines?.Select(x => (x.StockItemId, x.Quantity, x.UnitCode, x.TrackingCode, x.ExpiryDate)).ToList())
                ?? ValidatePrices(request.Lines?.Select(x => x.Price));
            if (errors is not null) return Results.ValidationProblem(errors);
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            var replay = await db.StandaloneSalesDeliveries.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.RequestId == request.RequestId, ct);
            if (replay is not null) return replay.Code == request.Code.Trim() ? Results.Ok(new { replay.Id, replay.Code, status = replay.Status.ToString() }) : Results.Conflict(new { error = "İstek anahtarı farklı bir belge için kullanılmış." });
            var customerCurrency = await db.CustomerAccounts.Where(x => x.TenantId == tenantId && x.Id == request.CustomerId && x.IsActive && x.Type != CounterpartyType.Supplier && x.Type != CounterpartyType.Employee)
                .Select(x => x.CurrencyCode).SingleOrDefaultAsync(ct);
            if (customerCurrency is null)
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
                Code = request.Code.Trim(), DeliveryDate = request.DeliveryDate, CurrencyCode = customerCurrency };
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
                var salesLine = new StandaloneSalesDeliveryLine { TenantId = tenantId, LineNumber = i + 1, StockItemId = item.Id, StockCode = item.Code, StockName = item.Name,
                    UnitCode = item.UnitCode, Quantity = qty, EnteredQuantity = line.Quantity, EnteredUnitCode = unit,
                    TrackingCode = string.IsNullOrWhiteSpace(line.TrackingCode) ? null : line.TrackingCode.Trim(), ExpiryDate = line.ExpiryDate, StorageLocationId = line.StorageLocationId };
                ApplyPrice(salesLine, line.Price, SalesListPriceDefault(item, customerCurrency, qty, line.Quantity));
                doc.Lines.Add(salesLine);
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
                invoiceId = db.SalesInvoices.Where(invoice => invoice.TenantId == tenantId && invoice.StandaloneDeliveryId == doc.Id).Select(invoice => (Guid?)invoice.Id).FirstOrDefault(),
                currencyCode = doc.CurrencyCode ?? doc.Customer.CurrencyCode,
                pricing = DeliveryPricingViews.Summary(doc.Lines.Select(x => (x.UnitPrice, x.DiscountPercent, x.VatPercent, x.IsFreeOfCharge, x.Quantity, x.EnteredQuantity))),
                lines = doc.Lines.OrderBy(x => x.LineNumber).Select(x => (Line: x, Price: DeliveryPricingViews.Line(x.UnitPrice, x.DiscountPercent, x.VatPercent, x.IsFreeOfCharge, x.Quantity, x.EnteredQuantity)))
                    .Select(x => new { x.Line.Id, x.Line.LineNumber, x.Line.StockItemId, x.Line.StockCode, x.Line.StockName, x.Line.UnitCode, x.Line.Quantity, x.Line.EnteredQuantity,
                        x.Line.EnteredUnitCode, x.Line.TrackingCode, x.Line.ExpiryDate, x.Line.StorageLocationId, x.Price.UnitPrice, x.Price.DiscountPercent, x.Price.VatPercent,
                        x.Price.IsFreeOfCharge, x.Price.LineNetAmount, x.Price.LineVatAmount, x.Price.LineTotal }) });
        });
        sales.MapDelete("/{id:guid}", async (Guid id, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!Tenant(user, out var tenantId)) return Results.Forbid();
            var doc = await db.StandaloneSalesDeliveries.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (doc is null) return Results.NotFound(); if (doc.Status != StandaloneInventoryDocumentStatus.Draft) return Results.Conflict(new { error = "Yalnızca taslak irsaliye silinebilir." });
            db.StandaloneSalesDeliveries.Remove(doc); db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = UserId(user), Action = "sales.standalone-delivery.draft-deleted", Resource = doc.Code });
            await db.SaveChangesAsync(ct); return Results.NoContent();
        });
        sales.MapPost("/{id:guid}/invoice", CreateSalesInvoice);
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
                    date = x.ReceiptDate, status = x.Status.ToString(), lineCount = x.Lines.Count, x.CreatedAt, currencyCode = x.CurrencyCode ?? x.Supplier.CurrencyCode }).ToListAsync(ct);
            var pricing = await DeliveryPricingViews.StandalonePurchaseReceiptsAsync(db, tenantId, items.Select(x => x.Id).ToList(), ct);
            return Results.Ok(new { items = items.Select(x => new { x.Id, x.Code, x.SupplierId, x.supplierName, x.WarehouseId, x.warehouseName, x.date, x.status,
                x.lineCount, x.CreatedAt, x.currencyCode, pricing[x.Id].PricedNetTotal, pricing[x.Id].PricedVatTotal, pricing[x.Id].PricedGrandTotal,
                pricing[x.Id].FreeLineCount, pricing[x.Id].UnpricedLineCount, pricing[x.Id].PricingState }), page, pageSize, totalCount = total });
        });
        purchasing.MapPost("/", async (StandalonePurchaseReceiptWrite request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!Tenant(user, out var tenantId)) return Results.Forbid();
            var errors = Validate(request.RequestId, request.Code, request.Lines?.Select(x => (x.StockItemId, x.Quantity, x.UnitCode, x.TrackingCode, x.ExpiryDate)).ToList())
                ?? ValidatePrices(request.Lines?.Select(x => x.Price));
            if (errors is not null) return Results.ValidationProblem(errors);
            if (request.Lines!.Any(x => x.UnitCostBase < 0m || x.UnitCostBase > 999999999999.99999999m)) return Results.ValidationProblem(new Dictionary<string, string[]> { ["lines"] = ["Birim maliyet sıfır veya daha büyük olmalıdır."] });
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            var replay = await db.StandalonePurchaseReceipts.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.RequestId == request.RequestId, ct);
            if (replay is not null) return replay.Code == request.Code.Trim() ? Results.Ok(new { replay.Id, replay.Code, status = replay.Status.ToString() }) : Results.Conflict(new { error = "İstek anahtarı farklı bir belge için kullanılmış." });
            var supplierCurrency = await db.CustomerAccounts.Where(x => x.TenantId == tenantId && x.Id == request.SupplierId && x.IsActive && x.Type != CounterpartyType.Customer)
                .Select(x => x.CurrencyCode).SingleOrDefaultAsync(ct);
            if (supplierCurrency is null)
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
                Code = request.Code.Trim(), ReceiptDate = request.ReceiptDate, CurrencyCode = supplierCurrency };
            foreach (var (line, i) in purchaseLines.Select((x, i) => (x, i)))
            {
                var item = stock[line.StockItemId]; var unit = Unit(line.UnitCode, item.UnitCode); var factor = await UnitFactor(db, tenantId, item, unit, ct);
                if (factor is null) return Results.ValidationProblem(new Dictionary<string, string[]> { [$"lines[{i}].unitCode"] = ["Stok kartı için etkin birim değil."] });
                var qty = line.Quantity * factor.Value; if (!ValidQty(qty)) return Results.ValidationProblem(new Dictionary<string, string[]> { [$"lines[{i}].quantity"] = ["Temel birim miktarı geçersiz."] });
                if (TrackingValidation(item.TrackingMode, qty, line.TrackingCode, line.ExpiryDate) is { } trackingError)
                    return Results.ValidationProblem(new Dictionary<string, string[]> { [$"lines[{i}].trackingCode"] = [trackingError] });
                var receiptLine = new StandalonePurchaseReceiptLine { TenantId = tenantId, LineNumber = i + 1, StockItemId = item.Id, StockCode = item.Code, StockName = item.Name,
                    UnitCode = item.UnitCode, Quantity = qty, EnteredQuantity = line.Quantity, EnteredUnitCode = unit,
                    TrackingCode = string.IsNullOrWhiteSpace(line.TrackingCode) ? null : line.TrackingCode.Trim(), ExpiryDate = line.ExpiryDate, StorageLocationId = line.StorageLocationId };
                if (await ApplyPurchasePriceAsync(db, tenantId, receiptLine, line, item, supplierCurrency, request.ReceiptDate, factor.Value, ct) is { } priceError) return priceError;
                doc.Lines.Add(receiptLine);
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
                currencyCode = doc.CurrencyCode ?? doc.Supplier.CurrencyCode,
                pricing = DeliveryPricingViews.Summary(doc.Lines.Select(x => (x.UnitPrice, x.DiscountPercent, x.VatPercent, x.IsFreeOfCharge, x.Quantity, x.EnteredQuantity))),
                lines = doc.Lines.OrderBy(x => x.LineNumber).Select(x => (Line: x, Price: DeliveryPricingViews.Line(x.UnitPrice, x.DiscountPercent, x.VatPercent, x.IsFreeOfCharge, x.Quantity, x.EnteredQuantity)))
                    .Select(x => new { x.Line.Id, x.Line.LineNumber, x.Line.StockItemId, x.Line.StockCode, x.Line.StockName, x.Line.UnitCode, x.Line.Quantity, x.Line.UnitCostBase,
                        x.Line.EnteredQuantity, x.Line.EnteredUnitCode, x.Line.TrackingCode, x.Line.ExpiryDate, x.Line.StorageLocationId, x.Price.UnitPrice, x.Price.DiscountPercent,
                        x.Price.VatPercent, x.Price.IsFreeOfCharge, x.Price.LineNetAmount, x.Price.LineVatAmount, x.Price.LineTotal,
                        costPending = db.InventoryTransactions.Any(m => m.TenantId == tenantId && m.StandalonePurchaseReceiptLineId == x.Line.Id && m.ReversalOfId == null && m.CostPending)
                            && !db.PurchaseInvoiceDraftLines.Any(l => l.TenantId == tenantId && l.StandalonePurchaseReceiptLineId == x.Line.Id && l.PurchaseInvoiceDraft.Status == PurchaseInvoiceDraftStatus.Posted) }) });
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

    private static async Task<IResult> CreateSalesInvoice(Guid id, StandaloneSalesDeliveryInvoiceWrite request,
        ClaimsPrincipal user, TenantDbContext db, CancellationToken ct)
    {
        if (!Tenant(user, out var tenantId)) return Results.Forbid();
        if (SalesInvoiceEDocumentFieldsValidation.Validate(request.EDocument) is { } metadataErrors) return Results.ValidationProblem(metadataErrors);
        if (SalesInvoiceNotesValidation.Validate(request.Notes) is { } notesErrors) return Results.ValidationProblem(notesErrors);
        var eDocument = SalesInvoiceEDocumentFieldsValidation.Normalize(request.EDocument);
        var invoiceNotes = SalesInvoiceNotesValidation.Normalize(request.Notes);
        var requestLines = request.Lines ?? [];
        var priceErrors = new Dictionary<string, string[]>();
        for (var index = 0; index < requestLines.Count; index++) DeliveryLinePricing.Validate(requestLines[index].Price, $"lines[{index}]", priceErrors);
        if (priceErrors.Count > 0) return Results.ValidationProblem(priceErrors);
        if (requestLines.Count > 200 || requestLines.Any(x => x.LineNumber < 1)
            || requestLines.Select(x => x.LineNumber).Distinct().Count() != requestLines.Count)
            return Results.ValidationProblem(new Dictionary<string, string[]> { ["lines"] = ["Fatura satırları için geçerli satır numarası, birim fiyat, iskonto ve KDV oranları girin."] });

        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        if (!await FiscalYearCloseEndpoints.LockTenantForPostingAsync(db, tenantId, ct)) return Results.NotFound();
        var deliveryQuery = db.StandaloneSalesDeliveries;
        var delivery = await (db.Database.IsSqlServer()
            ? deliveryQuery.FromSqlInterpolated($"SELECT * FROM [dbo].[StandaloneSalesDeliveries] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}")
            : deliveryQuery.Where(x => x.TenantId == tenantId && x.Id == id))
            .Include(x => x.Lines).Include(x => x.Customer).SingleOrDefaultAsync(ct);
        if (delivery is null) return Results.NotFound();
        var existing = await db.SalesInvoices.AsNoTracking().Include(x => x.Customer)
            .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.StandaloneDeliveryId == delivery.Id, ct);
        if (existing is not null)
        {
            if (!string.Equals(existing.EDocumentScenario, eDocument?.Scenario, StringComparison.Ordinal) ||
                !string.Equals(existing.EDocumentTypeCode, eDocument?.TypeCode, StringComparison.Ordinal) ||
                !string.Equals(existing.EDocumentRecipientAlias, eDocument?.RecipientAlias, StringComparison.Ordinal) ||
                !string.Equals(existing.ECommercePurchaseUrl, eDocument?.PurchaseUrl, StringComparison.Ordinal) ||
                !string.Equals(existing.ECommercePaymentTaxId, eDocument?.PaymentTaxId, StringComparison.Ordinal) ||
                !string.Equals(existing.ECommercePaymentTitle, eDocument?.PaymentTitle, StringComparison.Ordinal) ||
                !string.Equals(existing.ECommercePaymentAlias, eDocument?.PaymentAlias, StringComparison.Ordinal) ||
                !string.Equals(existing.ECommercePaymentAgentName, eDocument?.PaymentAgentName, StringComparison.Ordinal) ||
                !string.Equals(existing.ECommercePaymentType, eDocument?.PaymentType, StringComparison.Ordinal) ||
                existing.ECommercePaymentDate != eDocument?.PaymentDate || existing.ECommercePaymentDueDate != eDocument?.PaymentDueDate ||
                !string.Equals(existing.ECommercePaymentMeans, eDocument?.PaymentMeans, StringComparison.Ordinal) ||
                !string.Equals(existing.ECommercePaymentInstructionNote, eDocument?.PaymentInstructionNote, StringComparison.Ordinal) ||
                !string.Equals(existing.ECommerceIntermediaryCountry, eDocument?.IntermediaryCountry, StringComparison.Ordinal) ||
                !string.Equals(existing.ECommerceIntermediaryCountryCode, eDocument?.IntermediaryCountryCode, StringComparison.Ordinal) ||
                !string.Equals(existing.ECommerceIntermediaryCity, eDocument?.IntermediaryCity, StringComparison.Ordinal) ||
                !string.Equals(existing.ECommerceIntermediaryDistrict, eDocument?.IntermediaryDistrict, StringComparison.Ordinal) ||
                !string.Equals(existing.DeliveryCarrierTaxId, eDocument?.CarrierTaxId, StringComparison.Ordinal) ||
                !string.Equals(existing.DeliveryCarrierName, eDocument?.CarrierName, StringComparison.Ordinal) ||
                !string.Equals(existing.DeliveryCarrierSurname, eDocument?.CarrierSurname, StringComparison.Ordinal) ||
                existing.DeliverySentAt != eDocument?.SentAt)
                return Results.Conflict(new { error = "Bu irsaliye için fatura daha önce farklı e-belge bilgileriyle oluşturulmuş." });
            return Results.Ok(new { id = existing.Id, code = existing.Code, status = existing.Status.ToString(), existing.InvoiceDate,
                existing.CurrencyCode, existing.GrandTotal, standaloneDeliveryId = delivery.Id, deliveryCode = delivery.Code });
        }
        if (delivery.Status != StandaloneInventoryDocumentStatus.Posted)
            return Results.Conflict(new { error = "Yalnızca kaydedilmiş satış irsaliyesinden fatura oluşturulabilir." });
        if (delivery.Lines.Count == 0 || requestLines.Any(input => delivery.Lines.All(line => line.LineNumber != input.LineNumber)))
            return Results.ValidationProblem(new Dictionary<string, string[]> { ["lines"] = ["Fatura satırları irsaliye satırlarıyla eşleşmelidir."] });
        if (!delivery.Customer.IsActive || delivery.Customer.Type is not (CounterpartyType.Customer or CounterpartyType.Both or CounterpartyType.Dealer))
            return Results.Conflict(new { error = "İrsaliyedeki müşteri kartı etkin bir müşteri değil." });
        if (FiscalYearCloseEndpoints.CreateClosedPeriodConflict(
                await FiscalYearCloseEndpoints.FindClosedPeriodAsync(db, tenantId, request.InvoiceDate, ct), "satış faturası") is { } closedConflict)
            return closedConflict;
        var customFields = await SalesInvoiceCustomFieldSupport.PrepareAsync(db, tenantId, request.CustomFields, ct);
        if (customFields.Errors is { Count: > 0 }) return Results.ValidationProblem(customFields.Errors);
        // Invoice price per line: the request override, else the delivery line price; free / unpriced lines need an entered amount.
        var resolved = delivery.Lines.OrderBy(x => x.LineNumber).Select(line => (Line: line, Price: DeliveryLinePricing.ResolveInvoicePrice(
            requestLines.FirstOrDefault(x => x.LineNumber == line.LineNumber)?.Price,
            DeliveryLinePricing.FromStored(line.UnitPrice, line.DiscountPercent, line.VatPercent, line.IsFreeOfCharge), null,
            line.Quantity, line.EnteredQuantity))).ToArray();
        if (resolved.Where(x => x.Price is null).Select(x => x.Line.LineNumber).ToArray() is { Length: > 0 } missingPriceLines)
            return Results.Conflict(new { error = DeliveryLinePricing.InvoiceAmountRequiredMessage, lines = missingPriceLines });
        var rows = resolved.Select(x =>
        {
            var pricing = (UnitPrice: x.Price!.Value.UnitPrice, DiscountPercent: x.Price.Value.DiscountPercent, VatPercent: x.Price.Value.VatPercent);
            var amounts = SalesQuoteValidation.Calculate(new SalesQuoteLineWriteRequest(x.Line.StockItemId, x.Line.Quantity,
                pricing.UnitPrice, pricing.DiscountPercent, pricing.VatPercent));
            return (x.Line, Pricing: pricing, Amounts: amounts);
        }).ToArray();
        SalesQuoteTotals totals;
        try { totals = SalesQuoteValidation.Sum(rows.Select(x => x.Amounts)); }
        catch (OverflowException) { return Results.Conflict(new { error = "Fatura toplamı desteklenen decimal(18,2) sınırını aşıyor." }); }
        if (totals.GrandTotal <= 0m) return Results.Conflict(new { error = "Cari borç kaydı oluşturulabilmesi için fatura toplamı sıfırdan büyük olmalıdır." });
        var customer = delivery.Customer;
        if (customer.RiskLimit is { } limit)
        {
            var debit = await db.CustomerLedgerEntries.Where(x => x.TenantId == tenantId && x.CustomerId == customer.Id && x.Direction == CustomerLedgerDirection.Debit).SumAsync(x => (decimal?)x.Amount, ct) ?? 0m;
            var credit = await db.CustomerLedgerEntries.Where(x => x.TenantId == tenantId && x.CustomerId == customer.Id && x.Direction == CustomerLedgerDirection.Credit).SumAsync(x => (decimal?)x.Amount, ct) ?? 0m;
            var projected = debit - credit + totals.GrandTotal;
            if (projected > limit) return Results.Conflict(new { error = "Fatura tutarı müşteri risk limitini aşacağı için kaydedilmedi.", currentBalance = debit - credit, projectedBalance = projected, riskLimit = limit });
        }
        var invoiceSeries = TenantDocumentNumbering.InvoiceSeries(eDocument?.Scenario);
        var code = await TenantDocumentNumbering.NextAsync(db, tenantId, invoiceSeries.Type, invoiceSeries.Scenario, request.InvoiceDate, ct);
        var invoice = new SalesInvoice { TenantId = tenantId, StandaloneDeliveryId = delivery.Id, CustomerId = customer.Id,
            Code = code, InvoiceDate = request.InvoiceDate, CurrencyCode = customer.CurrencyCode,
            Subtotal = totals.Subtotal, DiscountTotal = totals.DiscountTotal, TaxTotal = totals.TaxTotal, GrandTotal = totals.GrandTotal,
            EDocumentScenario = eDocument?.Scenario, EDocumentTypeCode = eDocument?.TypeCode,
            EDocumentRecipientAlias = eDocument?.RecipientAlias, ECommercePurchaseUrl = eDocument?.PurchaseUrl,
            ECommercePaymentTaxId = eDocument?.PaymentTaxId, ECommercePaymentTitle = eDocument?.PaymentTitle,
            ECommercePaymentAlias = eDocument?.PaymentAlias, ECommercePaymentAgentName = eDocument?.PaymentAgentName,
            ECommercePaymentType = eDocument?.PaymentType, ECommercePaymentDate = eDocument?.PaymentDate,
            ECommercePaymentDueDate = eDocument?.PaymentDueDate, ECommercePaymentMeans = eDocument?.PaymentMeans,
            ECommercePaymentInstructionNote = eDocument?.PaymentInstructionNote,
            ECommerceIntermediaryCountry = eDocument?.IntermediaryCountry, ECommerceIntermediaryCountryCode = eDocument?.IntermediaryCountryCode,
            ECommerceIntermediaryCity = eDocument?.IntermediaryCity, ECommerceIntermediaryDistrict = eDocument?.IntermediaryDistrict,
            DeliveryCarrierTaxId = eDocument?.CarrierTaxId,
            DeliveryCarrierName = eDocument?.CarrierName, DeliveryCarrierSurname = eDocument?.CarrierSurname,
            DeliverySentAt = eDocument?.SentAt, Notes = invoiceNotes };
        foreach (var row in rows)
            invoice.Lines.Add(new SalesInvoiceLine { TenantId = tenantId, Invoice = invoice, StandaloneDeliveryLineId = row.Line.Id,
                OrderLineNumber = row.Line.LineNumber, StockItemId = row.Line.StockItemId, StockCode = row.Line.StockCode,
                StockName = row.Line.StockName, UnitCode = row.Line.UnitCode, Quantity = row.Line.Quantity,
                UnitPrice = row.Pricing.UnitPrice, DiscountPercent = row.Pricing.DiscountPercent, VatPercent = row.Pricing.VatPercent,
                LineSubtotal = row.Amounts.LineSubtotal, DiscountAmount = row.Amounts.DiscountAmount, TaxAmount = row.Amounts.TaxAmount, LineTotal = row.Amounts.LineTotal });
        db.SalesInvoices.Add(invoice);
        db.CustomerLedgerEntries.Add(new CustomerLedgerEntry { TenantId = tenantId, CustomerId = customer.Id, SalesInvoice = invoice,
            EntryDate = invoice.InvoiceDate, Direction = CustomerLedgerDirection.Debit, Amount = totals.GrandTotal,
            CurrencyCode = invoice.CurrencyCode, Description = $"Satış faturası {code}" });
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = UserId(user), Action = "sales.standalone-delivery.invoiced", Resource = $"{delivery.Code}:{code}" });
        DocumentActivityLog.Add(db, tenantId, DocumentActivityLog.SalesInvoice, invoice.Id, "kes", "Fatura kesildi (irsaliyeden)", "core", "done", null, UserId(user));
        await db.SaveChangesAsync(ct);
        SalesInvoiceCustomFieldSupport.AddValues(db, tenantId, invoice.Id, customFields.Values, UserId(user));
        if (customFields.Values.Count > 0) await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        return Results.Created($"/api/sales/invoices/{invoice.Id}", new { id = invoice.Id, code, status = invoice.Status.ToString(), invoice.InvoiceDate,
            invoice.CurrencyCode, invoice.GrandTotal, standaloneDeliveryId = delivery.Id, deliveryCode = delivery.Code });
    }

    private static async Task<IResult> UpdateSalesDraft(Guid id, StandaloneSalesDeliveryWrite request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct)
    {
        if (!Tenant(user, out var tenantId)) return Results.Forbid();
        var errors = Validate(request.RequestId, request.Code, request.Lines?.Select(x => (x.StockItemId, x.Quantity, x.UnitCode, x.TrackingCode, x.ExpiryDate)).ToList())
            ?? ValidatePrices(request.Lines?.Select(x => x.Price));
        if (errors is not null) return Results.ValidationProblem(errors);
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var query = db.StandaloneSalesDeliveries.Where(x => x.TenantId == tenantId && x.Id == id);
        var doc = await (db.Database.IsSqlServer()
            ? db.StandaloneSalesDeliveries.FromSqlInterpolated($"SELECT * FROM [dbo].[StandaloneSalesDeliveries] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}")
            : query).Include(x => x.Lines).SingleOrDefaultAsync(ct);
        if (doc is null) return Results.NotFound();
        if (doc.Status != StandaloneInventoryDocumentStatus.Draft) return Results.Conflict(new { error = "Yalnızca taslak irsaliye düzenlenebilir." });
        var customerCurrency = await db.CustomerAccounts.Where(x => x.TenantId == tenantId && x.Id == request.CustomerId && x.IsActive && x.Type != CounterpartyType.Supplier && x.Type != CounterpartyType.Employee)
            .Select(x => x.CurrencyCode).SingleOrDefaultAsync(ct);
        if (customerCurrency is null)
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
        doc.CurrencyCode = customerCurrency;
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
            ApplyPrice(target, line.Price, SalesListPriceDefault(item, customerCurrency, qty, line.Quantity));
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
        var errors = Validate(request.RequestId, request.Code, request.Lines?.Select(x => (x.StockItemId, x.Quantity, x.UnitCode, x.TrackingCode, x.ExpiryDate)).ToList())
            ?? ValidatePrices(request.Lines?.Select(x => x.Price));
        if (errors is not null) return Results.ValidationProblem(errors);
        if (request.Lines!.Any(x => x.UnitCostBase < 0m || x.UnitCostBase > 999999999999.99999999m)) return Results.ValidationProblem(new Dictionary<string, string[]> { ["lines"] = ["Birim maliyet sıfır veya daha büyük olmalıdır."] });
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var query = db.StandalonePurchaseReceipts.Where(x => x.TenantId == tenantId && x.Id == id);
        var doc = await (db.Database.IsSqlServer()
            ? db.StandalonePurchaseReceipts.FromSqlInterpolated($"SELECT * FROM [dbo].[StandalonePurchaseReceipts] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}")
            : query).Include(x => x.Lines).SingleOrDefaultAsync(ct);
        if (doc is null) return Results.NotFound();
        if (doc.Status != StandaloneInventoryDocumentStatus.Draft) return Results.Conflict(new { error = "Yalnızca taslak mal kabul düzenlenebilir." });
        var supplierCurrency = await db.CustomerAccounts.Where(x => x.TenantId == tenantId && x.Id == request.SupplierId && x.IsActive && x.Type != CounterpartyType.Customer)
            .Select(x => x.CurrencyCode).SingleOrDefaultAsync(ct);
        if (supplierCurrency is null)
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
        doc.CurrencyCode = supplierCurrency;
        foreach (var (line, i) in input.Select((x, i) => (x, i)))
        {
            var item = stock[line.StockItemId]; var unit = Unit(line.UnitCode, item.UnitCode); var factor = await UnitFactor(db, tenantId, item, unit, ct);
            if (factor is null) return Results.ValidationProblem(new Dictionary<string, string[]> { [$"lines[{i}].unitCode"] = ["Stok kartı için etkin birim değil."] });
            var qty = line.Quantity * factor.Value;
            if (!ValidQty(qty)) return Results.ValidationProblem(new Dictionary<string, string[]> { [$"lines[{i}].quantity"] = ["Temel birim miktarı geçersiz."] });
            if (TrackingValidation(item.TrackingMode, qty, line.TrackingCode, line.ExpiryDate) is { } trackingError) return Results.ValidationProblem(new Dictionary<string, string[]> { [$"lines[{i}].trackingCode"] = [trackingError] });
            var target = i < existingLines.Count ? existingLines[i] : new StandalonePurchaseReceiptLine { TenantId = tenantId };
            target.LineNumber = i + 1; target.StockItemId = item.Id; target.StockCode = item.Code; target.StockName = item.Name; target.UnitCode = item.UnitCode;
            target.Quantity = qty; target.EnteredQuantity = line.Quantity; target.EnteredUnitCode = unit;
            if (await ApplyPurchasePriceAsync(db, tenantId, target, line, item, supplierCurrency, request.ReceiptDate, factor.Value, ct) is { } priceError) return priceError;
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
            var closed = await FiscalYearCloseEndpoints.FindClosedPeriodAsync(db, tenantId, doc.DeliveryDate); if (FiscalYearCloseEndpoints.CreateClosedPeriodConflict(closed, "satış irsaliyesi") is { } conflict) return conflict;
            var posted = await PostLines(db, tenantId, doc.WarehouseId, doc.DeliveryDate, doc.Code, doc.Lines.Select(x => new PostLine(x.Id, x.StockItemId, x.Quantity, null, true, x.TrackingCode, x.ExpiryDate, x.StorageLocationId)).ToList(), request, ct);
            if (posted is not null) return posted;
            doc.Status = StandaloneInventoryDocumentStatus.Posted;
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = UserId(user), Action = "sales.standalone-delivery.posted", Resource = doc.Code });
            DocumentActivityLog.Add(db, tenantId, DocumentActivityLog.SalesDelivery, doc.Id, "sevket", "İrsaliye sevk edildi", "core", "done", null, UserId(user));
        }
        else
        {
            var purchaseQuery = db.Database.IsSqlServer()
                ? db.StandalonePurchaseReceipts.FromSqlInterpolated($"SELECT * FROM [dbo].[StandalonePurchaseReceipts] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {docId}")
                : db.StandalonePurchaseReceipts.Where(x => x.TenantId == tenantId && x.Id == docId);
            var doc = await purchaseQuery.Include(x => x.Lines).SingleOrDefaultAsync(ct);
            if (doc is null) return Results.NotFound(); if (doc.Status == StandaloneInventoryDocumentStatus.Posted) return Results.Ok(new { id, status = "Posted" }); if (doc.Status != StandaloneInventoryDocumentStatus.Draft) return Results.Conflict(new { error = "Belge taslak durumda değil." });
            var closed = await FiscalYearCloseEndpoints.FindClosedPeriodAsync(db, tenantId, doc.ReceiptDate); if (FiscalYearCloseEndpoints.CreateClosedPeriodConflict(closed, "siparişsiz satın alma mal kabulü") is { } conflict) return conflict;
            var postLines = new List<PostLine>();
            foreach (var x in doc.Lines)
            {
                // Free line, or unpriced line without a cost: provisional weighted-average cost, marked pending; the line keeps that cost.
                var pending = x.IsFreeOfCharge || (x.UnitPrice is null && x.UnitCostBase == 0m);
                if (pending)
                {
                    var stockItem = await db.StockItems.AsNoTracking().SingleOrDefaultAsync(s => s.TenantId == tenantId && s.Id == x.StockItemId, ct);
                    if (stockItem is null) return Results.Conflict(new { error = "Stok kartı bulunamadı veya pasif." });
                    x.UnitCostBase = await PurchaseReceiptCosting.ProvisionalUnitCostBaseAsync(db, tenantId, stockItem, doc.ReceiptDate, ct);
                }
                postLines.Add(new PostLine(x.Id, x.StockItemId, x.Quantity, x.UnitCostBase, false, x.TrackingCode, x.ExpiryDate, x.StorageLocationId, pending));
            }
            var posted = await PostLines(db, tenantId, doc.WarehouseId, doc.ReceiptDate, doc.Code, postLines, request, ct);
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
        var documentTrackingCodes = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var line in lines)
        {
            var item = await db.StockItems.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == line.StockItemId && x.IsActive, ct);
            if (item is null) return Results.Conflict(new { error = "Stok kartı bulunamadı veya pasif." });
            // Allocations sent with the post request win; otherwise the line's own lot/serial code covers the whole quantity.
            var sentAllocations = request.Tracking?.Where(x => x.LineId == line.Id).ToList() ?? [];
            var allocations = sentAllocations.Count > 0 ? sentAllocations
                : string.IsNullOrWhiteSpace(line.TrackingCode) ? []
                : [new StandaloneTrackingAllocation(line.Id, line.TrackingCode, line.Quantity, line.ExpiryDate)];
            if (item.TrackingMode == InventoryTrackingMode.None && allocations.Count > 0) return Results.ValidationProblem(new Dictionary<string, string[]> { ["tracking"] = ["Takipsiz stok satırına lot/seri bilgisi verilemez."] });
            if (item.TrackingMode != InventoryTrackingMode.None && (allocations.Count == 0 || allocations.Any(x => string.IsNullOrWhiteSpace(x.TrackingCode) || x.Quantity <= 0m)))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["tracking"] = ["Takipli stok için toplam miktarı karşılayan geçerli lot/seri bilgisi gereklidir."] });
            if (item.TrackingMode != InventoryTrackingMode.None && allocations.Sum(x => x.Quantity) != line.Quantity)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["tracking"] = ["Takip satırlarının toplamı hareket miktarına eşit olmalıdır."] });
            if (item.TrackingMode == InventoryTrackingMode.Serial && allocations.Any(x => x.Quantity != 1m || x.ExpiryDate is not null)) return Results.ValidationProblem(new Dictionary<string, string[]> { ["tracking"] = ["Seri numarası başına miktar 1 olmalı; son kullanım tarihi girilmemelidir."] });
            if (item.TrackingMode == InventoryTrackingMode.Lot && allocations.Any(x => x.ExpiryDate is null)) return Results.ValidationProblem(new Dictionary<string, string[]> { ["tracking"] = ["Lot satırlarında son kullanım tarihi gereklidir."] });
            foreach (var allocation in allocations)
            {
                if (!documentTrackingCodes.Add($"{item.Id:N}:{allocation.TrackingCode.Trim()}"))
                    return Results.ValidationProblem(new Dictionary<string, string[]> { ["tracking"] = ["Aynı mal kabul içinde takip kodu tekrarlanamaz."] });
                var prior = await db.InventoryTransactionTraces.AsNoTracking().Where(x => x.TenantId == tenantId && x.StockItemId == item.Id
                    && x.TrackingCode == allocation.TrackingCode.Trim()).ToListAsync(ct);
                if (item.TrackingMode == InventoryTrackingMode.Serial && prior.Count > 0)
                    return Results.Conflict(new { error = $"Seri numarası {allocation.TrackingCode} daha önce kullanılmış." });
                if (item.TrackingMode == InventoryTrackingMode.Lot && prior.Any(x => x.ExpiryDate != allocation.ExpiryDate))
                    return Results.Conflict(new { error = $"Lot {allocation.TrackingCode} için son kullanma tarihi değiştirilemez." });
            }
            var direction = line.IsSales ? InventoryDirection.Issue : InventoryDirection.Receipt;
            var movement = new InventoryTransaction { TenantId = tenantId, WarehouseId = warehouseId, StorageLocationId = line.StorageLocationId, StockItemId = item.Id, EntryDate = date, Direction = direction,
                Quantity = line.Quantity, UnitCostBase = line.UnitCost, CostPending = line.CostPending, Description = $"{(line.IsSales ? "Satış irsaliyesi" : "Siparişsiz satın alma mal kabulü")} {code}",
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
        if (FiscalYearCloseEndpoints.CreateClosedPeriodConflict(closed, sales ? "satış irsaliyesi iptali" : "siparişsiz mal kabul iptali") is { } conflict) return conflict;
        var originals = sales
            ? await db.InventoryTransactions.Where(x => x.TenantId == tenantId && x.StandaloneSalesDeliveryLine != null && x.StandaloneSalesDeliveryLine.DeliveryId == id && x.ReversalOfId == null).Include(x => x.Tracking).ToListAsync(ct)
            : await db.InventoryTransactions.Where(x => x.TenantId == tenantId && x.StandalonePurchaseReceiptLine != null && x.StandalonePurchaseReceiptLine.ReceiptId == id && x.ReversalOfId == null).Include(x => x.Tracking).ToListAsync(ct);
        if (sales)
        {
            var doc = await db.StandaloneSalesDeliveries.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (doc is null) return Results.NotFound(); if (doc.Status == StandaloneInventoryDocumentStatus.Voided) return Results.Ok(new { id, status = "Voided", reversalCount = 0 }); if (doc.Status != StandaloneInventoryDocumentStatus.Posted) return Results.Conflict(new { error = "Yalnızca kaydedilmiş irsaliye iptal edilebilir." });
            if (await db.SalesInvoices.AnyAsync(x => x.TenantId == tenantId && x.StandaloneDeliveryId == doc.Id && x.Status == SalesInvoiceStatus.Posted, ct))
                return Results.Conflict(new { error = "Bu irsaliyeye ait satış faturası kaydedilmiş. Önce faturayı iade/ters kayıt süreciyle düzeltin; irsaliye bundan sonra iptal edilebilir." });
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
                Description = $"{(sales ? "Satış irsaliyesi" : "Siparişsiz mal kabulü")} iptal ters hareketi", ReversalOfId = original.Id };
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
    private static Dictionary<string, string[]>? ValidatePrices(IEnumerable<DeliveryLinePriceInput>? prices)
    {
        var errors = new Dictionary<string, string[]>();
        foreach (var (price, i) in (prices ?? []).Select((x, i) => (x, i))) DeliveryLinePricing.Validate(price, $"lines[{i}]", errors);
        return errors.Count == 0 ? null : errors;
    }

    /// <summary>
    /// S2 default when no price is sent: the stock card sales list price (with its discount / VAT) if it is in the customer's
    /// currency; there is no customer-specific price list, so otherwise the line stays unpriced.
    /// </summary>
    internal static DeliveryLinePrice? SalesListPriceDefault(StockItem item, string? documentCurrency, decimal baseQuantity, decimal enteredQuantity) =>
        item.SalesListPrice is { } listPrice && string.Equals(item.PriceCurrencyCode, documentCurrency, StringComparison.OrdinalIgnoreCase)
            ? new DeliveryLinePrice(DeliveryLinePricing.FromBaseUnitPrice(listPrice, baseQuantity, enteredQuantity), item.SalesDiscountPercent, item.SalesVatPercent, false)
            : new DeliveryLinePrice(null, null, item.SalesVatPercent, false);

    private static void ApplyPrice(StandaloneSalesDeliveryLine line, DeliveryLinePriceInput input, DeliveryLinePrice? defaults)
    {
        var price = DeliveryLinePricing.Resolve(input, defaults);
        (line.UnitPrice, line.DiscountPercent, line.VatPercent, line.IsFreeOfCharge) = (price.UnitPrice, price.DiscountPercent, price.VatPercent, price.IsFreeOfCharge);
    }

    /// <summary>
    /// P2 line price (no default: an omitted price stays unpriced) and its derived base-currency cost per base unit. A priced line
    /// needs the supplier-currency rate on the receipt date; an unpriced line keeps the given <c>unitCostBase</c> (0 when none);
    /// a free line stores 0 until posting writes the provisional cost.
    /// </summary>
    private static async Task<IResult?> ApplyPurchasePriceAsync(TenantDbContext db, Guid tenantId, StandalonePurchaseReceiptLine line,
        StandalonePurchaseReceiptLineWrite input, StockItem item, string supplierCurrency, DateOnly receiptDate, decimal factor, CancellationToken ct)
    {
        var price = DeliveryLinePricing.Resolve(input.Price, new DeliveryLinePrice(null, null, item.PurchaseVatPercent, false));
        (line.UnitPrice, line.DiscountPercent, line.VatPercent, line.IsFreeOfCharge) = (price.UnitPrice, price.DiscountPercent, price.VatPercent, price.IsFreeOfCharge);
        if (price.IsPriced)
        {
            var rate = await PurchaseReceiptCosting.RateToBaseAsync(db, tenantId, supplierCurrency, receiptDate, ct);
            if (rate is null) return Results.Conflict(new { error = $"{supplierCurrency} için {receiptDate:yyyy-MM-dd} tarihinde veya öncesinde tenant baz para birimine çevrilebilen kur yok. Önce Finans ekranından kuru kaydedin." });
            var cost = await PurchaseReceiptCosting.ResolveAsync(db, tenantId, item, price, line.Quantity, line.EnteredQuantity, null, rate.Value, receiptDate, ct);
            if (cost.UnitCostBase > 999999999999.99999999m) return Results.ValidationProblem(new Dictionary<string, string[]> { ["lines"] = ["Birim maliyet desteklenen sınırı aşıyor."] });
            line.UnitCostBase = cost.UnitCostBase!.Value;
        }
        else line.UnitCostBase = price.IsFreeOfCharge ? 0m : decimal.Round((input.UnitCostBase ?? 0m) / factor, 8);
        return null;
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
    private sealed record PostLine(Guid Id, Guid StockItemId, decimal Quantity, decimal? UnitCost, bool IsSales, string? TrackingCode, DateOnly? ExpiryDate, Guid? StorageLocationId, bool CostPending = false);
}

public sealed record StandaloneSalesDeliveryWrite(Guid RequestId, string Code, Guid CustomerId, Guid WarehouseId, DateOnly DeliveryDate, List<StandaloneSalesDeliveryLineWrite>? Lines);
public sealed record StandaloneSalesDeliveryLineWrite(Guid StockItemId, decimal Quantity, string? UnitCode, string? TrackingCode, DateOnly? ExpiryDate, Guid? StorageLocationId = null,
    decimal? UnitPrice = null, decimal? DiscountPercent = null, decimal? VatPercent = null, bool? IsFreeOfCharge = null)
{
    public DeliveryLinePriceInput Price => new(UnitPrice, DiscountPercent, VatPercent, IsFreeOfCharge);
}
public sealed record StandaloneSalesDeliveryInvoiceWrite(DateOnly InvoiceDate, IReadOnlyList<StandaloneSalesDeliveryInvoiceLineWrite>? Lines, IReadOnlyDictionary<string, string?>? CustomFields = null, SalesInvoiceEDocumentFields? EDocument = null, string? Notes = null);
/// <summary>Invoice price of a standalone delivery line (per entered unit); omitted fields come from the delivery line. Free / unpriced lines need a unit price (0 allowed).</summary>
public sealed record StandaloneSalesDeliveryInvoiceLineWrite(int LineNumber, decimal? UnitPrice = null, decimal? DiscountPercent = null, decimal? VatPercent = null)
{
    public DeliveryLinePriceInput Price => new(UnitPrice, DiscountPercent, VatPercent);
}
public sealed record StandalonePurchaseReceiptWrite(Guid RequestId, string Code, Guid SupplierId, Guid WarehouseId, DateOnly ReceiptDate, List<StandalonePurchaseReceiptLineWrite>? Lines);
public sealed record StandalonePurchaseReceiptDraftResult(Guid Id, string Code, string Status);
/// <summary>
/// Standalone receipt line. <c>UnitPrice</c> (supplier currency, per entered unit) / discount / VAT / <c>IsFreeOfCharge</c> as on the other
/// receipts; the stock cost is derived from the price. <c>UnitCostBase</c> (base currency, per entered unit) is the older way to give a cost
/// and is used only for an unpriced, non-free line; a free or cost-less line posts with a provisional cost marked pending.
/// </summary>
public sealed record StandalonePurchaseReceiptLineWrite(Guid StockItemId, decimal Quantity, string? UnitCode, decimal? UnitCostBase, string? TrackingCode, DateOnly? ExpiryDate, Guid? StorageLocationId = null,
    decimal? UnitPrice = null, decimal? DiscountPercent = null, decimal? VatPercent = null, bool? IsFreeOfCharge = null)
{
    public DeliveryLinePriceInput Price => new(UnitPrice, DiscountPercent, VatPercent, IsFreeOfCharge);
}
/// <summary>The answer of the standalone sales delivery draft writes (create / update).</summary>
public sealed record StandaloneSalesDeliveryDraftResult(Guid Id, string Code, string Status);
public sealed record StandalonePostRequest(List<StandaloneTrackingAllocation>? Tracking);
public sealed record StandaloneTrackingAllocation(Guid LineId, string TrackingCode, decimal Quantity, DateOnly? ExpiryDate);
