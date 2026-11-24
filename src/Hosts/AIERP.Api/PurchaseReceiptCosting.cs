using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace AIERP.Api;

/// <summary>
/// Stock movement unit cost of a purchase receipt line (P1 mal kabul, P2 siparişsiz mal kabul), approved decision 2:
/// <list type="bullet">
/// <item>Priced line: price per base unit × (1 − discount) × rate to the tenant base currency.</item>
/// <item>Free or unpriced line: never 0 and never null (null makes the weighted average unvalued). The item's current weighted-average
/// cost is written as a provisional cost and the movement is marked <see cref="InventoryTransaction.CostPending"/>. With no average
/// (no valued stock yet) the stock card purchase list price (with its discount, converted to base) is used; with neither, 0.</item>
/// </list>
/// The real cost arrives with the purchase invoice; the movement is never updated (append-only ledger).
/// </summary>
internal static class PurchaseReceiptCosting
{
    internal sealed record Cost(decimal? UnitCostBase, bool CostPending);

    internal static async Task<Cost> ResolveAsync(TenantDbContext db, Guid tenantId, StockItem item, DeliveryLinePrice price,
        decimal baseQuantity, decimal? enteredQuantity, decimal? knownBaseUnitPrice, decimal rateToBase, DateOnly receiptDate,
        CancellationToken ct = default)
    {
        if (price.IsPriced)
        {
            var basePrice = DeliveryLinePricing.ToBaseUnitPrice(price.UnitPrice!.Value, baseQuantity, enteredQuantity, knownBaseUnitPrice);
            return new Cost(decimal.Round(basePrice * (1m - (price.DiscountPercent ?? 0m) / 100m) * rateToBase, 8, MidpointRounding.AwayFromZero), false);
        }
        return new Cost(await ProvisionalUnitCostBaseAsync(db, tenantId, item, receiptDate, ct), true);
    }

    internal static async Task<decimal> ProvisionalUnitCostBaseAsync(TenantDbContext db, Guid tenantId, StockItem item, DateOnly asOfDate,
        CancellationToken ct = default)
    {
        if (await WeightedAverageUnitCostBaseAsync(db, tenantId, item.Id, asOfDate, ct) is { } average) return average;
        if (item.PurchaseListPrice is { } listPrice && await RateToBaseAsync(db, tenantId, item.PriceCurrencyCode, asOfDate, ct) is { } rate)
            return decimal.Round(listPrice * (1m - item.PurchaseDiscountPercent / 100m) * rate, 8, MidpointRounding.AwayFromZero);
        return 0m;
    }

    /// <summary>Weighted-average unit cost in base currency as of a date; null when nothing is on hand or a movement is unvalued.</summary>
    internal static async Task<decimal?> WeightedAverageUnitCostBaseAsync(TenantDbContext db, Guid tenantId, Guid stockItemId, DateOnly asOfDate,
        CancellationToken ct = default)
    {
        var totals = await db.InventoryTransactions.AsNoTracking().Where(x => x.TenantId == tenantId && x.StockItemId == stockItemId && x.EntryDate <= asOfDate)
            .GroupBy(_ => 1).Select(g => new
            {
                OnHand = g.Sum(x => x.Direction == InventoryDirection.Receipt ? x.Quantity : -x.Quantity),
                Unvalued = g.Sum(x => (decimal?)(x.UnitCostBase == null ? (x.Direction == InventoryDirection.Receipt ? x.Quantity : -x.Quantity) : 0m)) ?? 0m,
                Value = g.Sum(x => (decimal?)(x.UnitCostBase == null ? 0m : (x.Direction == InventoryDirection.Receipt ? x.Quantity : -x.Quantity) * x.UnitCostBase.Value)) ?? 0m
            }).SingleOrDefaultAsync(ct);
        if (totals is null || totals.OnHand <= 0m || totals.Unvalued > 0m) return null;
        var costAdjustments = await db.InventoryCostAdjustmentLines.AsNoTracking()
            .Where(x => x.TenantId == tenantId && x.StockItemId == stockItemId && x.Adjustment.EntryDate <= asOfDate)
            .SumAsync(x => (decimal?)x.AmountBase, ct) ?? 0m;
        return decimal.Round((totals.Value + costAdjustments) / totals.OnHand, 8, MidpointRounding.AwayFromZero);
    }

    internal static async Task<decimal?> RateToBaseAsync(TenantDbContext db, Guid tenantId, string currencyCode, DateOnly rateDate, CancellationToken ct = default)
    {
        var baseCurrency = await db.Tenants.AsNoTracking().Where(x => x.Id == tenantId).Select(x => x.BaseCurrencyCode).SingleAsync(ct);
        if (string.Equals(currencyCode, baseCurrency, StringComparison.OrdinalIgnoreCase)) return 1m;
        return await db.TenantExchangeRates.AsNoTracking().Where(x => x.TenantId == tenantId && x.CurrencyCode == currencyCode && x.RateDate <= rateDate)
            .OrderByDescending(x => x.RateDate).ThenByDescending(x => x.Revision).Select(x => (decimal?)x.Rate).FirstOrDefaultAsync(ct);
    }
}
