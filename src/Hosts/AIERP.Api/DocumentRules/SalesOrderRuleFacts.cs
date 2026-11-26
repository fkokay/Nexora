using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace AIERP.Api.DocumentRules;

/// <summary>The facts of a satış siparişi that Onayla rules read (DocumentRuleSchema field codes); the order's lines must be loaded.</summary>
internal static class SalesOrderRuleFacts
{
    internal static async Task<IReadOnlyDictionary<string, object?>> BuildAsync(TenantDbContext db, Guid tenantId, SalesOrder order, CancellationToken ct)
    {
        var customer = await db.CustomerAccounts.AsNoTracking().Where(x => x.TenantId == tenantId && x.Id == order.CustomerId)
            .Select(x => new { x.Name, Group = x.Group == null ? null : x.Group.Name }).SingleOrDefaultAsync(ct);
        var salesperson = order.SalespersonEmployeeId is { } employeeId
            ? await db.EmployeeRecords.AsNoTracking().Where(x => x.TenantId == tenantId && x.Id == employeeId).Select(x => x.FullName).SingleOrDefaultAsync(ct)
            : null;
        // Amounts compare in the tenant's base currency (latest manual rate on or before the order date); a missing rate leaves
        // them empty, so a comparison rule does not match (only "boş" does) instead of comparing unconverted foreign amounts.
        var rate = await PurchaseReceiptCosting.RateToBaseAsync(db, tenantId, order.CurrencyCode, order.OrderDate, ct);
        decimal? Base(decimal amount) => rate is { } r ? decimal.Round(amount * r, 2, MidpointRounding.AwayFromZero) : null;
        return new Dictionary<string, object?>
        {
            ["grandTotal"] = Base(order.GrandTotal),
            ["subtotal"] = Base(order.Subtotal),
            ["discountTotal"] = Base(order.DiscountTotal),
            ["lineCount"] = (decimal)order.Lines.Count,
            ["maxLineDiscount"] = order.Lines.Count == 0 ? 0m : order.Lines.Max(x => x.DiscountPercent),
            ["customer"] = customer?.Name,
            ["customerGroup"] = customer?.Group,
            ["currency"] = order.CurrencyCode,
            ["salesperson"] = salesperson,
            ["orderDate"] = order.OrderDate,
            ["deliveryDate"] = order.RequestedDeliveryDate
        };
    }
}
