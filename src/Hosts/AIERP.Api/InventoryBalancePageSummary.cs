using AIERP.Platform.Application;

namespace AIERP.Api;

/// <summary>
/// Row status and page summary shared by both balance page routes. The summary covers the returned page items only,
/// as the legacy summary cards do.
/// </summary>
internal static class InventoryBalancePageSummary
{
    /// <summary>Legacy priority: the first matching rule wins.</summary>
    internal static string Status(bool isActive, InventoryBalanceView balance) =>
        !isActive ? "Pasif"
        : balance.BelowMinimum ? "Minimum altı"
        : balance.UnvaluedQuantity > 0 ? "Maliyetsiz"
        : "Yeterli";

    internal static InventoryBalancePage Page(IReadOnlyList<InventoryBalancePageItem> items, int page, int pageSize, int totalCount,
        int belowMinimumCount, string baseCurrency)
    {
        var units = items.Select(x => x.Balance.UnitCode).Distinct(StringComparer.Ordinal).Take(2).ToArray();
        return new InventoryBalancePage(items, page, pageSize, totalCount, belowMinimumCount,
            PageValuationAmountBase: items.Sum(x => x.Balance.ValuationAmountBase),
            PageAvailableQuantity: items.Sum(x => x.Balance.AvailableQuantity),
            PageUnitCode: units.Length == 1 ? units[0] : null,
            PageAvailableCount: items.Count(x => x.Balance.AvailableQuantity > 0),
            PageUnvaluedCount: items.Count(x => x.Balance.UnvaluedQuantity > 0),
            BaseCurrencyCode: baseCurrency);
    }
}
