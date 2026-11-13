using System.Security.Claims;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

/// <summary>
/// Satış iadesi ve alış iadesi için salt okunur liste ve detay, tedarikçi teklifi ve mal kabul için
/// detay uç noktaları. Yetki, rota önekinden çözülen `{kaynak}.read` izniyle denetlenir.
/// </summary>
public static class DocumentListEndpoints
{
    public static void MapDocumentListEndpoints(this WebApplication app)
    {
        var salesReturns = app.MapGroup("/api/sales/returns").WithTags("Satış İadeleri").RequireAuthorization();
        salesReturns.MapGet("/", async (ClaimsPrincipal principal, TenantDbContext db, CancellationToken ct, string? q = null, int page = 1, int pageSize = 25) =>
        {
            if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
            (page, pageSize) = Clamp(page, pageSize);
            var query = db.SalesReturns.AsNoTracking().Where(x => x.TenantId == tenantId);
            if (!string.IsNullOrWhiteSpace(q))
            {
                var term = q.Trim();
                query = query.Where(x => x.Code.Contains(term) || x.SalesInvoice.Code.Contains(term) || x.Customer.Name.Contains(term));
            }
            var total = await query.CountAsync(ct);
            var rows = await query.OrderByDescending(x => x.ReturnDate).ThenByDescending(x => x.CreatedAt).Skip((page - 1) * pageSize).Take(pageSize)
                .Select(x => new SalesReturnListItem(x.Id, x.Code, x.SalesInvoiceId, x.SalesInvoice.Code, x.CustomerId, x.Customer.Name,
                    x.WarehouseId, x.Warehouse.Name, x.ReturnDate, x.Status, x.SalesInvoice.CurrencyCode, x.GrandTotal, x.Lines.Count, x.CreatedAt))
                .ToListAsync(ct);
            return Results.Ok(new SalesReturnListPage(rows, page, pageSize, total));
        });
        salesReturns.MapGet("/{id:guid}", async (Guid id, ClaimsPrincipal principal, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
            var item = await db.SalesReturns.AsNoTracking().Include(x => x.SalesInvoice).Include(x => x.Customer).Include(x => x.Warehouse).Include(x => x.Lines)
                .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (item is null) return Results.NotFound();
            var lines = item.Lines.OrderBy(x => x.OrderLineNumber).Select(x => new SalesReturnLineView(x.SalesInvoiceLineId, x.OrderLineNumber, x.StockCode,
                x.StockName, x.UnitCode, x.Quantity, x.UnitPrice, x.DiscountPercent, x.VatPercent, x.LineSubtotal, x.DiscountAmount, x.TaxAmount,
                x.LineTotal, x.EnteredQuantity, x.EnteredUnitCode)).ToList();
            return Results.Ok(new SalesReturnDetail(item.Id, item.Code, item.SalesInvoiceId, item.SalesInvoice.Code, item.SalesInvoice.Status,
                item.CustomerId, item.Customer.Name, item.WarehouseId, item.Warehouse.Name, item.ReturnDate, item.Status,
                item.SalesInvoice.CurrencyCode, item.Subtotal, item.DiscountTotal, item.TaxTotal, item.GrandTotal, item.CreatedAt, lines));
        });

        var supplierReturns = app.MapGroup("/api/purchasing/returns").WithTags("Alış İadeleri").RequireAuthorization();
        supplierReturns.MapGet("/", async (ClaimsPrincipal principal, TenantDbContext db, CancellationToken ct, string? q = null, int page = 1, int pageSize = 25) =>
        {
            if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
            (page, pageSize) = Clamp(page, pageSize);
            var query = db.SupplierReturns.AsNoTracking().Where(x => x.TenantId == tenantId);
            if (!string.IsNullOrWhiteSpace(q))
            {
                var term = q.Trim();
                query = query.Where(x => x.Code.Contains(term) || x.PurchaseInvoice.Code.Contains(term) || x.Supplier.Name.Contains(term));
            }
            var total = await query.CountAsync(ct);
            var rows = await query.OrderByDescending(x => x.ReturnDate).ThenByDescending(x => x.CreatedAt).Skip((page - 1) * pageSize).Take(pageSize)
                .Select(x => new SupplierReturnListItem(x.Id, x.Code, x.PurchaseInvoiceId, x.PurchaseInvoice.Code, x.SupplierId, x.Supplier.Name,
                    x.WarehouseId, x.Warehouse.Name, x.ReturnDate, x.Status, x.PurchaseInvoice.CurrencyCode, x.GrandTotal, x.Lines.Count, x.CreatedAt))
                .ToListAsync(ct);
            return Results.Ok(new SupplierReturnListPage(rows, page, pageSize, total));
        });
        supplierReturns.MapGet("/{id:guid}", async (Guid id, ClaimsPrincipal principal, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
            var item = await db.SupplierReturns.AsNoTracking().Include(x => x.PurchaseInvoice).Include(x => x.Supplier).Include(x => x.Warehouse).Include(x => x.Lines)
                .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (item is null) return Results.NotFound();
            var lines = item.Lines.OrderBy(x => x.OrderLineNumber).Select(x => new SupplierReturnLineView(x.PurchaseInvoiceLineId, x.OrderLineNumber, x.StockCode,
                x.StockName, x.UnitCode, x.Quantity, x.UnitPrice, x.DiscountPercent, x.VatPercent, x.LineSubtotal, x.DiscountAmount, x.TaxAmount,
                x.LineTotal, x.EnteredQuantity, x.EnteredUnitCode)).ToList();
            return Results.Ok(new SupplierReturnDetail(item.Id, item.Code, item.PurchaseInvoiceId, item.PurchaseInvoice.Code, item.PurchaseInvoice.Status,
                item.PurchaseInvoice.PurchaseOrderId, item.SupplierId, item.Supplier.Name, item.WarehouseId, item.Warehouse.Name, item.ReturnDate, item.Status,
                item.PurchaseInvoice.CurrencyCode, item.Subtotal, item.DiscountTotal, item.TaxTotal, item.GrandTotal, item.CreatedAt, lines));
        });

        var supplierQuotes = app.MapGroup("/api/purchasing/supplier-quotes").WithTags("Tedarikçi Teklifleri").RequireAuthorization();
        supplierQuotes.MapGet("/{id:guid}", async (Guid id, ClaimsPrincipal principal, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
            var quote = await db.PurchaseSupplierQuotes.AsNoTracking().Include(x => x.PurchaseRequest).Include(x => x.Supplier).Include(x => x.Lines)
                .Include(x => x.CustomFieldValues).Include(x => x.PurchaseOrder)
                .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (quote is null) return Results.NotFound();
            var baseCurrency = await db.Tenants.AsNoTracking().Where(x => x.Id == tenantId).Select(x => x.BaseCurrencyCode).SingleAsync(ct);
            decimal? conversion = 1m;
            DateOnly? rateDate = null;
            if (quote.CurrencyCode != baseCurrency)
            {
                // Talep ekranındaki karşılaştırmayla aynı kural: teklif tarihinde geçerli en son kur, o günün en yüksek revizyonu.
                var rates = await db.TenantExchangeRates.AsNoTracking()
                    .Where(x => x.TenantId == tenantId && x.CurrencyCode == quote.CurrencyCode && x.RateDate <= quote.QuoteDate).ToListAsync(ct);
                var applied = rates.OrderByDescending(x => x.RateDate).ThenByDescending(x => x.Revision).FirstOrDefault();
                conversion = applied?.Rate;
                rateDate = applied?.RateDate;
            }
            decimal? comparable = null;
            if (conversion is not null) { try { comparable = decimal.Round(quote.GrandTotal * conversion.Value, 2, MidpointRounding.AwayFromZero); } catch (OverflowException) { } }
            var definitions = await db.PurchaseSupplierQuoteCustomFieldDefinitions.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive).OrderBy(x => x.Label).ToListAsync(ct);
            var lines = quote.Lines.OrderBy(x => x.RequestLineNumber).Select(x => new PurchaseSupplierQuoteLineView(x.RequestLineNumber, x.StockCode, x.StockName,
                x.UnitCode, x.Quantity, x.UnitPrice, x.DiscountPercent, x.VatPercent, x.LineSubtotal, x.DiscountAmount, x.TaxAmount, x.LineTotal)).ToList();
            var fields = definitions.Select(field => new PurchaseSupplierQuoteCustomFieldValueView(field.Id, field.Code, field.Label, field.DataType, field.MaxLength,
                field.Version, field.IsRequired, quote.CustomFieldValues.FirstOrDefault(value => value.DefinitionId == field.Id)?.Value ?? "")).ToList();
            return Results.Ok(new PurchaseSupplierQuoteDetail(quote.Id, quote.PurchaseRequestId, quote.PurchaseRequest.Code, quote.PurchaseRequest.Status, quote.Code,
                quote.SupplierId, quote.Supplier.Name, quote.QuoteDate, quote.ValidUntil, quote.CurrencyCode, quote.Status, quote.Subtotal, quote.DiscountTotal,
                quote.TaxTotal, quote.GrandTotal, quote.Notes, quote.CreatedAt, lines, baseCurrency, comparable, conversion, rateDate, fields,
                quote.PurchaseOrder?.Id, quote.PurchaseOrder?.Code));
        });

        var purchaseReceipts = app.MapGroup("/api/purchasing/receipts").WithTags("Mal Kabuller").RequireAuthorization();
        purchaseReceipts.MapGet("/{id:guid}", async (Guid id, ClaimsPrincipal principal, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
            var receipt = await db.PurchaseReceipts.AsNoTracking().Include(x => x.PurchaseOrder).ThenInclude(x => x.Supplier).Include(x => x.Warehouse)
                .Include(x => x.Lines).Include(x => x.CustomFieldValues)
                .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (receipt is null) return Results.NotFound();
            var invoice = await db.PurchaseInvoices.AsNoTracking().Where(x => x.TenantId == tenantId && x.PurchaseReceiptId == id && x.Status == PurchaseInvoiceStatus.Posted)
                .Select(x => new
                {
                    x.Id, x.Code, x.SupplierId, SupplierName = x.Supplier.Name, x.InvoiceDate, x.DueDate, x.CurrencyCode, x.Status, x.GrandTotal,
                    Paid = x.Payments.Where(p => p.Status == SupplierPaymentStatus.Posted).Sum(p => (decimal?)p.Amount) ?? 0m,
                    Returned = x.Returns.Where(r => r.Status == SupplierReturnStatus.Posted).Sum(r => (decimal?)r.GrandTotal) ?? 0m,
                    LineCount = x.Lines.Count, x.CreatedAt
                }).FirstOrDefaultAsync(ct);
            var invoiceSummary = invoice is null ? null : new PurchaseInvoiceSummary(invoice.Id, invoice.Code, receipt.Id, receipt.Code, receipt.PurchaseOrderId,
                receipt.PurchaseOrder.Code, invoice.SupplierId, invoice.SupplierName, invoice.InvoiceDate, invoice.DueDate, invoice.CurrencyCode, invoice.Status,
                invoice.GrandTotal, invoice.Paid, PurchaseInvoiceWorkflow.Outstanding(invoice.GrandTotal, invoice.Paid, invoice.Returned), invoice.LineCount, invoice.CreatedAt);
            var definitions = await db.PurchaseReceiptCustomFieldDefinitions.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive).OrderBy(x => x.Label).ToListAsync(ct);
            var lines = receipt.Lines.OrderBy(x => x.OrderLineNumber).Select(x => new PurchaseReceiptLineView(x.OrderLineNumber, x.StockItemId, x.StockCode,
                x.StockName, x.UnitCode, x.Quantity, null, x.EnteredQuantity, x.EnteredUnitCode)).ToList();
            var fields = definitions.Select(field => new PurchaseReceiptCustomFieldValueView(field.Id, field.Code, field.Label, field.DataType, field.MaxLength,
                field.Version, field.IsRequired, receipt.CustomFieldValues.FirstOrDefault(value => value.DefinitionId == field.Id)?.Value ?? "")).ToList();
            return Results.Ok(new PurchaseReceiptDetail(receipt.Id, receipt.Code, receipt.PurchaseOrderId, receipt.PurchaseOrder.Code, receipt.PurchaseOrder.SupplierId,
                receipt.PurchaseOrder.Supplier.Name, receipt.WarehouseId, receipt.Warehouse.Name, receipt.ReceiptDate, receipt.Status, receipt.CreatedAt,
                lines, invoiceSummary, fields));
        });
    }

    private static bool TryGetTenantId(ClaimsPrincipal principal, out Guid tenantId) =>
        Guid.TryParse(principal.FindFirstValue("tenant_id"), out tenantId);

    private static (int Page, int PageSize) Clamp(int page, int pageSize) => (Math.Max(1, page), Math.Clamp(pageSize, 1, 100));
}
