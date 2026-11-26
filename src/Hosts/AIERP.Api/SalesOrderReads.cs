using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace AIERP.Api;

/// <summary>The sales order detail read shared by <c>GET /api/sales/orders/{id}</c> and the order's document view.</summary>
internal static class SalesOrderReads
{
    internal static async Task<SalesOrderView?> ViewAsync(TenantDbContext db, Guid tenantId, Guid id, CancellationToken ct)
    {
        var order = await db.SalesOrders.AsNoTracking().Include(x => x.Quote).Include(x => x.Customer).Include(x => x.Lines)
            .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
        if (order is null) return null;
        var delivered = await db.SalesDeliveryLines.AsNoTracking().Where(x => x.TenantId == tenantId && x.OrderId == id && x.Delivery.Status == SalesDeliveryStatus.Posted)
            .GroupBy(x => x.OrderLineNumber).Select(g => new { LineNumber = g.Key, Quantity = g.Sum(x => x.Quantity) }).ToDictionaryAsync(x => x.LineNumber, x => x.Quantity, ct);
        var reservations = await db.SalesOrderReservations.AsNoTracking().Include(x => x.Warehouse)
            .Where(x => x.TenantId == tenantId && x.OrderId == id && x.Status == SalesOrderReservationStatus.Active)
            .ToDictionaryAsync(x => x.OrderLineNumber, ct);
        var lines = order.Lines.OrderBy(x => x.LineNumber).Select(x =>
        {
            reservations.TryGetValue(x.LineNumber, out var reservation);
            var deliveredQuantity = delivered.GetValueOrDefault(x.LineNumber);
            return new SalesOrderLineView(x.LineNumber, x.StockItemId, x.StockCode, x.StockName, x.UnitCode, x.Quantity,
                x.UnitPrice, x.DiscountPercent, x.VatPercent, x.LineSubtotal, x.DiscountAmount, x.TaxAmount, x.LineTotal,
                deliveredQuantity, Math.Max(0m, x.Quantity - deliveredQuantity), reservation?.Id, reservation?.WarehouseId,
                reservation?.Warehouse.Name, reservation is null ? 0m : reservation.Quantity - reservation.FulfilledQuantity,
                x.EnteredCurrencyCode, x.EnteredUnitPrice, x.EnteredUnitCode, x.IsVatIncluded, x.ExchangeRateToOrderCurrency);
        }).ToList();
        var customFields = await (from definition in db.SalesOrderCustomFieldDefinitions.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive)
            join value in db.SalesOrderCustomFieldValues.AsNoTracking().Where(x => x.TenantId == tenantId && x.OrderId == id) on new { definition.TenantId, DefinitionId = definition.Id } equals new { value.TenantId, value.DefinitionId } into grouped
            from value in grouped.DefaultIfEmpty() orderby definition.Label select new SalesOrderCustomFieldValueView(definition.Id, definition.Code, definition.Label, definition.DataType, definition.MaxLength, definition.Version, definition.IsRequired, value == null ? "" : value.Value)).ToListAsync(ct);
        return new SalesOrderView(order.Id, order.Code, order.QuoteId, order.Quote?.Code ?? "Bağımsız", order.CustomerId, order.Customer.Name,
            order.OrderDate, order.CurrencyCode, order.Status, order.Subtotal, order.DiscountTotal, order.TaxTotal, order.GrandTotal, order.CreatedAt, lines, customFields, order.RequestedDeliveryDate, order.SalespersonEmployeeId);
    }
}
