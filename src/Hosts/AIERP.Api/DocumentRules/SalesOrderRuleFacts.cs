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
        return new Dictionary<string, object?>
        {
            ["grandTotal"] = order.GrandTotal,
            ["subtotal"] = order.Subtotal,
            ["discountTotal"] = order.DiscountTotal,
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
