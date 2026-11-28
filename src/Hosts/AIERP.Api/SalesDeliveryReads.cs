using AIERP.Api.DocumentModels;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace AIERP.Api;

/// <summary>
/// The sales delivery as a document (<c>GET /api/sales/deliveries/{id}/document</c>). The id may name an order-based / invoice-born
/// delivery (<c>SalesDeliveries</c>) or a siparişsiz one (<c>StandaloneSalesDeliveries</c>); ids are unique across both tables.
/// </summary>
internal static class SalesDeliveryReads
{
    internal sealed record DeliveryRead(SalesDeliveryDocumentRecord Record, string StatusName, bool HasInvoice);

    private static SalesDeliveryDocumentLine Line(int number, Guid stockItemId, string code, string name, string unit, decimal quantity, decimal? enteredQuantity,
        string? enteredUnit, decimal? unitPrice, decimal? discount, decimal? vat, bool free, string? tracking, DateOnly? expiry, Guid? location)
    {
        var price = DeliveryPricingViews.Line(unitPrice, discount, vat, free, quantity, enteredQuantity);
        var shownQuantity = enteredQuantity ?? quantity;
        var gross = price.UnitPrice is { } p ? decimal.Round(shownQuantity * p, 2, MidpointRounding.AwayFromZero) : 0m;
        var net = price.LineNetAmount ?? 0m;
        return new SalesDeliveryDocumentLine(number, stockItemId, code, name, enteredUnit ?? unit, shownQuantity, price.UnitPrice, price.DiscountPercent, price.VatPercent,
            price.IsFreeOfCharge, tracking, expiry, location, gross, gross - net, price.LineVatAmount ?? 0m, price.LineTotal ?? 0m);
    }

    internal static async Task<DeliveryRead?> DocumentAsync(TenantDbContext db, Guid tenantId, Guid id, CancellationToken ct)
    {
        var delivery = await db.SalesDeliveries.AsNoTracking().Include(x => x.Order).ThenInclude(x => x!.Customer).Include(x => x.Warehouse).Include(x => x.Lines)
            .Include(x => x.Invoice).ThenInclude(x => x!.Customer)
            .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id && x.Status != SalesDeliveryStatus.Deleted, ct);
        if (delivery is not null)
        {
            var lineIds = delivery.Lines.Select(x => x.Id).ToArray();
            var locations = await db.InventoryTransactions.AsNoTracking().Where(x => x.TenantId == tenantId && x.SalesDeliveryLineId.HasValue
                    && lineIds.Contains(x.SalesDeliveryLineId.Value) && x.ReversalOfId == null)
                .ToDictionaryAsync(x => x.SalesDeliveryLineId!.Value, x => x.StorageLocationId, ct);
            var customer = delivery.Order?.Customer ?? delivery.Invoice?.Customer;
            var lines = delivery.Lines.OrderBy(x => x.OrderLineNumber).Select((x, index) => Line(index + 1, x.StockItemId, x.StockCode, x.StockName, x.UnitCode,
                x.Quantity, x.EnteredQuantity, x.EnteredUnitCode, x.UnitPrice, x.DiscountPercent, x.VatPercent, x.IsFreeOfCharge, null, null,
                locations.GetValueOrDefault(x.Id))).ToList();
            var record = new SalesDeliveryDocumentRecord(delivery.Id, delivery.Code, customer?.Id, customer?.Name ?? "", delivery.DeliveryDate,
                delivery.CurrencyCode ?? delivery.Order?.CurrencyCode ?? customer?.CurrencyCode ?? "TRY", SalesDeliveryDocumentModel.StateOf(delivery.Status),
                delivery.WarehouseId, delivery.Warehouse.Name, false, delivery.Order?.Code, delivery.Invoice?.Code, lines);
            return new DeliveryRead(record, delivery.Status.ToString(), delivery.Invoice is not null);
        }
        var standalone = await db.StandaloneSalesDeliveries.AsNoTracking().Include(x => x.Customer).Include(x => x.Warehouse).Include(x => x.Lines)
            .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
        if (standalone is null) return null;
        var invoice = await db.SalesInvoices.AsNoTracking().Where(x => x.TenantId == tenantId && x.StandaloneDeliveryId == id)
            .Select(x => new { x.Code }).FirstOrDefaultAsync(ct);
        var standaloneLines = standalone.Lines.OrderBy(x => x.LineNumber).Select(x => Line(x.LineNumber, x.StockItemId, x.StockCode, x.StockName, x.UnitCode,
            x.Quantity, x.EnteredQuantity, x.EnteredUnitCode, x.UnitPrice, x.DiscountPercent, x.VatPercent, x.IsFreeOfCharge, x.TrackingCode, x.ExpiryDate,
            x.StorageLocationId)).ToList();
        var standaloneRecord = new SalesDeliveryDocumentRecord(standalone.Id, standalone.Code, standalone.CustomerId, standalone.Customer.Name, standalone.DeliveryDate,
            standalone.CurrencyCode ?? standalone.Customer.CurrencyCode, SalesDeliveryDocumentModel.StateOf(standalone.Status), standalone.WarehouseId,
            standalone.Warehouse.Name, true, null, invoice?.Code, standaloneLines);
        return new DeliveryRead(standaloneRecord, standalone.Status.ToString(), invoice is not null);
    }
}
