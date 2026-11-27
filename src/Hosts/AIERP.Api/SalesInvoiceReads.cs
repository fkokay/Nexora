using AIERP.Api.DocumentModels;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace AIERP.Api;

/// <summary>The sales invoice as a document (<c>GET /api/sales/invoices/{id}/document</c>): header, lines with the stored amounts, warehouse and custom fields.</summary>
internal static class SalesInvoiceReads
{
    internal static async Task<SalesInvoiceDocumentRecord?> DocumentAsync(TenantDbContext db, Guid tenantId, Guid id, CancellationToken ct)
    {
        var invoice = await db.SalesInvoices.AsNoTracking().Include(x => x.Customer).Include(x => x.Lines).Include(x => x.Order).Include(x => x.Delivery)
            .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
        if (invoice is null) return null;
        // The warehouse is not on the invoice: it is the one of the delivery the invoice was cut with (order-based, siparişsiz or standalone).
        Guid? warehouseId = invoice.Delivery?.WarehouseId;
        string? deliveryCode = invoice.Delivery?.Code;
        if (invoice.StandaloneDeliveryId is { } standaloneId)
        {
            var standalone = await db.StandaloneSalesDeliveries.AsNoTracking().Where(x => x.TenantId == tenantId && x.Id == standaloneId)
                .Select(x => new { x.WarehouseId, x.Code }).SingleOrDefaultAsync(ct);
            warehouseId ??= standalone?.WarehouseId;
            deliveryCode ??= standalone?.Code;
        }
        var warehouseName = warehouseId is { } wid
            ? await db.Warehouses.AsNoTracking().Where(x => x.TenantId == tenantId && x.Id == wid).Select(x => x.Name).SingleOrDefaultAsync(ct) : null;
        var customFields = await (from definition in db.SalesInvoiceCustomFieldDefinitions.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive)
            join value in db.SalesInvoiceCustomFieldValues.AsNoTracking().Where(x => x.TenantId == tenantId && x.InvoiceId == id) on new { definition.TenantId, DefinitionId = definition.Id } equals new { value.TenantId, value.DefinitionId } into grouped
            from value in grouped.DefaultIfEmpty() orderby definition.Label select new SalesInvoiceCustomFieldValueView(definition.Id, definition.Code, definition.Label, definition.DataType, definition.MaxLength, definition.Version, definition.IsRequired, value == null ? "" : value.Value)).ToListAsync(ct);
        var lines = invoice.Lines.OrderBy(x => x.OrderLineNumber).ThenBy(x => x.StockCode)
            .Select((x, index) => new SalesInvoiceDocumentLine(index + 1, x.StockItemId, x.StockCode, x.StockName, x.UnitCode, x.Quantity, x.UnitPrice,
                x.DiscountPercent, x.VatPercent, x.LineSubtotal, x.DiscountAmount, x.TaxAmount, x.LineTotal)).ToList();
        return new SalesInvoiceDocumentRecord(invoice.Id, invoice.Code, invoice.CustomerId, invoice.Customer.Name, invoice.InvoiceDate, invoice.CurrencyCode,
            SalesInvoiceDocumentModel.StateOf(invoice.Status), invoice.InvoiceType, invoice.AccountingProfileCode, invoice.EDocumentScenario,
            invoice.EDocumentTypeCode, invoice.EDocumentRecipientAlias, invoice.Notes, warehouseId, warehouseName, deliveryCode, invoice.Order?.Code, lines, customFields);
    }
}
