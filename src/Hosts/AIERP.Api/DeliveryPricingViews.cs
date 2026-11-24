using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace AIERP.Api;

/// <summary>Line price view fields shared by every delivery / receipt line view (irsaliye fiyatı ve bedelsiz satır).</summary>
public sealed record DeliveryLinePriceView(decimal? UnitPrice, decimal? DiscountPercent, decimal? VatPercent, bool IsFreeOfCharge,
    decimal? LineNetAmount, decimal? LineVatAmount, decimal? LineTotal);

/// <summary>Reads stored delivery / receipt prices into the view fields and header summaries; tenant-scoped, read-only.</summary>
internal static class DeliveryPricingViews
{
    private sealed record PricedRow(Guid ParentId, decimal? UnitPrice, decimal? DiscountPercent, decimal? VatPercent, bool IsFreeOfCharge,
        decimal Quantity, decimal? EnteredQuantity);

    internal static DeliveryLinePrice Price(decimal? unitPrice, decimal? discountPercent, decimal? vatPercent, bool isFreeOfCharge) =>
        DeliveryLinePricing.FromStored(unitPrice, discountPercent, vatPercent, isFreeOfCharge);

    internal static DeliveryLinePriceView Line(decimal? unitPrice, decimal? discountPercent, decimal? vatPercent, bool isFreeOfCharge,
        decimal quantity, decimal? enteredQuantity)
    {
        var price = Price(unitPrice, discountPercent, vatPercent, isFreeOfCharge);
        var amounts = DeliveryLinePricing.Amounts(price, quantity, enteredQuantity);
        return new DeliveryLinePriceView(price.UnitPrice, price.DiscountPercent, price.VatPercent, price.IsFreeOfCharge,
            amounts.LineNetAmount, amounts.LineVatAmount, amounts.LineTotal);
    }

    internal static DeliveryPricingSummary Summary(IEnumerable<(decimal? UnitPrice, decimal? DiscountPercent, decimal? VatPercent, bool IsFreeOfCharge,
        decimal Quantity, decimal? EnteredQuantity)> lines) =>
        DeliveryLinePricing.Summarize(lines.Select(x => (Price(x.UnitPrice, x.DiscountPercent, x.VatPercent, x.IsFreeOfCharge), x.Quantity, x.EnteredQuantity)));

    /// <summary>
    /// One purchase receipt line view from the stored line (prices per entered unit). The receipt detail and the order detail's
    /// receipts both use it, so the two never drift. <paramref name="orderPrices"/> is the order's base-unit line price by line number.
    /// </summary>
    internal static PurchaseReceiptLineView ReceiptLine(PurchaseReceiptLine x, IReadOnlyDictionary<int, decimal> orderPrices, bool costPending,
        Guid? storageLocationId = null)
    {
        var price = Line(x.UnitPrice, x.DiscountPercent, x.VatPercent, x.IsFreeOfCharge, x.Quantity, x.EnteredQuantity);
        return new PurchaseReceiptLineView(x.OrderLineNumber, x.StockItemId, x.StockCode, x.StockName, x.UnitCode, x.Quantity, null,
            x.EnteredQuantity, x.EnteredUnitCode, storageLocationId,
            UnitPrice: price.UnitPrice, DiscountPercent: price.DiscountPercent, VatPercent: price.VatPercent, IsFreeOfCharge: price.IsFreeOfCharge,
            LineNetAmount: price.LineNetAmount, LineVatAmount: price.LineVatAmount, LineTotal: price.LineTotal,
            OrderUnitPrice: orderPrices.TryGetValue(x.OrderLineNumber, out var orderPrice) ? DeliveryLinePricing.FromBaseUnitPrice(orderPrice, x.Quantity, x.EnteredQuantity) : null,
            CostPending: costPending);
    }

    /// <summary>Header pricing of a purchase receipt from its stored lines.</summary>
    internal static DeliveryPricingSummary Summary(IEnumerable<PurchaseReceiptLine> lines) =>
        Summary(lines.Select(x => (x.UnitPrice, x.DiscountPercent, x.VatPercent, x.IsFreeOfCharge, x.Quantity, x.EnteredQuantity)));

    /// <summary>Header pricing of a sales delivery from its stored lines.</summary>
    internal static DeliveryPricingSummary Summary(IEnumerable<SalesDeliveryLine> lines) =>
        Summary(lines.Select(x => (x.UnitPrice, x.DiscountPercent, x.VatPercent, x.IsFreeOfCharge, x.Quantity, x.EnteredQuantity)));

    internal static PurchaseReceiptSummary WithPricing(this PurchaseReceiptSummary summary, string? currencyCode, DeliveryPricingSummary p) =>
        summary with { CurrencyCode = currencyCode, PricedNetTotal = p.PricedNetTotal, PricedVatTotal = p.PricedVatTotal, PricedGrandTotal = p.PricedGrandTotal,
            FreeLineCount = p.FreeLineCount, UnpricedLineCount = p.UnpricedLineCount, PricingState = p.PricingState };

    internal static SalesDeliverySummary WithPricing(this SalesDeliverySummary summary, string? currencyCode, DeliveryPricingSummary p) =>
        summary with { CurrencyCode = currencyCode, PricedNetTotal = p.PricedNetTotal, PricedVatTotal = p.PricedVatTotal, PricedGrandTotal = p.PricedGrandTotal,
            FreeLineCount = p.FreeLineCount, UnpricedLineCount = p.UnpricedLineCount, PricingState = p.PricingState };

    private static Dictionary<Guid, DeliveryPricingSummary> Group(IEnumerable<PricedRow> rows, IEnumerable<Guid> ids)
    {
        var byParent = rows.GroupBy(x => x.ParentId).ToDictionary(g => g.Key, g => Summary(g.Select(x =>
            (x.UnitPrice, x.DiscountPercent, x.VatPercent, x.IsFreeOfCharge, x.Quantity, x.EnteredQuantity))));
        foreach (var id in ids) byParent.TryAdd(id, DeliveryLinePricing.Summarize([]));
        return byParent;
    }

    internal static async Task<Dictionary<Guid, DeliveryPricingSummary>> SalesDeliveriesAsync(TenantDbContext db, Guid tenantId,
        IReadOnlyCollection<Guid> ids, CancellationToken ct = default) => ids.Count == 0 ? [] : Group(await db.SalesDeliveryLines.AsNoTracking()
            .Where(x => x.TenantId == tenantId && ids.Contains(x.DeliveryId))
            .Select(x => new PricedRow(x.DeliveryId, x.UnitPrice, x.DiscountPercent, x.VatPercent, x.IsFreeOfCharge, x.Quantity, x.EnteredQuantity))
            .ToListAsync(ct), ids);

    internal static async Task<Dictionary<Guid, DeliveryPricingSummary>> StandaloneSalesDeliveriesAsync(TenantDbContext db, Guid tenantId,
        IReadOnlyCollection<Guid> ids, CancellationToken ct = default) => ids.Count == 0 ? [] : Group(await db.StandaloneSalesDeliveryLines.AsNoTracking()
            .Where(x => x.TenantId == tenantId && ids.Contains(x.DeliveryId))
            .Select(x => new PricedRow(x.DeliveryId, x.UnitPrice, x.DiscountPercent, x.VatPercent, x.IsFreeOfCharge, x.Quantity, x.EnteredQuantity))
            .ToListAsync(ct), ids);

    internal static async Task<Dictionary<Guid, DeliveryPricingSummary>> PurchaseReceiptsAsync(TenantDbContext db, Guid tenantId,
        IReadOnlyCollection<Guid> ids, CancellationToken ct = default) => ids.Count == 0 ? [] : Group(await db.PurchaseReceiptLines.AsNoTracking()
            .Where(x => x.TenantId == tenantId && ids.Contains(x.ReceiptId))
            .Select(x => new PricedRow(x.ReceiptId, x.UnitPrice, x.DiscountPercent, x.VatPercent, x.IsFreeOfCharge, x.Quantity, x.EnteredQuantity))
            .ToListAsync(ct), ids);

    internal static async Task<Dictionary<Guid, DeliveryPricingSummary>> StandalonePurchaseReceiptsAsync(TenantDbContext db, Guid tenantId,
        IReadOnlyCollection<Guid> ids, CancellationToken ct = default) => ids.Count == 0 ? [] : Group(await db.StandalonePurchaseReceiptLines.AsNoTracking()
            .Where(x => x.TenantId == tenantId && ids.Contains(x.ReceiptId))
            .Select(x => new PricedRow(x.ReceiptId, x.UnitPrice, x.DiscountPercent, x.VatPercent, x.IsFreeOfCharge, x.Quantity, x.EnteredQuantity))
            .ToListAsync(ct), ids);

    internal static async Task<Dictionary<Guid, DeliveryPricingSummary>> PurchaseDeliveryNotesAsync(TenantDbContext db, Guid tenantId,
        IReadOnlyCollection<Guid> ids, CancellationToken ct = default) => ids.Count == 0 ? [] : Group(await db.PurchaseDeliveryNoteLines.AsNoTracking()
            .Where(x => x.TenantId == tenantId && ids.Contains(x.DeliveryNoteId))
            .Select(x => new PricedRow(x.DeliveryNoteId, x.UnitPrice, x.DiscountPercent, x.VatPercent, x.IsFreeOfCharge, x.Quantity, (decimal?)null))
            .ToListAsync(ct), ids);
}
