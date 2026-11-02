using System.Security.Claims;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

public static class SalesOrderAssistantSummaryEndpoints
{
    public static void MapSalesOrderAssistantSummaryEndpoint(this RouteGroupBuilder group)
    {
        group.MapGet("/assistant-summary", async (ClaimsPrincipal principal, TenantDbContext db, PlatformDbContext platformDb,
            string? code, CancellationToken ct) =>
        {
            if (!Guid.TryParse(principal.FindFirstValue("tenant_id"), out var tenantId) ||
                !Guid.TryParse(principal.FindFirstValue("sub"), out var userId) ||
                string.IsNullOrWhiteSpace(principal.FindFirstValue("role")))
                return Results.Forbid();

            var orderCode = code?.Trim();
            if (orderCode is null || orderCode.Length is < 2 or > 100)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["code"] = ["Sipariş kodu 2–100 karakter olmalıdır."] });

            var query = db.SalesOrders.AsNoTracking().Where(x => x.TenantId == tenantId && x.Code == orderCode);
            query = await PermissionStatusFilter.ApplyAsync(platformDb, tenantId, userId,
                principal.FindFirstValue("role")!, "erp.sales-orders.read", "erp.sales-orders",
                query, x => x.Status, customerSelector: x => x.CustomerId, cancellationToken: ct) ?? query;
            var order = await query.Select(x => new
            {
                x.Id, x.Code, x.OrderDate, x.RequestedDeliveryDate, x.CurrencyCode, x.Status,
                x.Subtotal, x.DiscountTotal, x.TaxTotal, x.GrandTotal,
                LineCount = x.Lines.Count
            }).SingleOrDefaultAsync(ct);
            if (order is null) return Results.NotFound();

            const int maxLines = 50;
            var lines = await db.SalesOrderLines.AsNoTracking()
                .Where(x => x.TenantId == tenantId && x.OrderId == order.Id)
                .OrderBy(x => x.LineNumber)
                .Take(maxLines)
                .Select(x => new
                {
                    lineNumber = x.LineNumber,
                    stockCode = x.StockCode,
                    stockName = x.StockName,
                    unitCode = x.UnitCode,
                    quantity = x.Quantity,
                    unitPrice = x.UnitPrice,
                    discountPercent = x.DiscountPercent,
                    vatPercent = x.VatPercent,
                    lineSubtotal = x.LineSubtotal,
                    taxAmount = x.TaxAmount,
                    lineTotal = x.LineTotal
                }).ToListAsync(ct);
            var lineNumbers = lines.Select(x => x.lineNumber).ToArray();
            var deliveredByLine = await db.SalesDeliveryLines.AsNoTracking()
                .Where(x => x.TenantId == tenantId && x.OrderId == order.Id && lineNumbers.Contains(x.OrderLineNumber) &&
                    x.Delivery.Status == SalesDeliveryStatus.Posted)
                .GroupBy(x => x.OrderLineNumber)
                .Select(g => new { LineNumber = g.Key, Quantity = g.Sum(x => x.Quantity) })
                .ToDictionaryAsync(x => x.LineNumber, x => x.Quantity, ct);
            var lineProgress = lines.Select(line =>
            {
                var delivered = deliveredByLine.GetValueOrDefault(line.lineNumber);
                return new
                {
                    line.lineNumber,
                    line.stockCode,
                    line.stockName,
                    line.unitCode,
                    line.quantity,
                    deliveredQuantity = delivered,
                    outstandingQuantity = Math.Max(0m, line.quantity - delivered),
                    line.unitPrice,
                    line.discountPercent,
                    line.vatPercent,
                    line.lineSubtotal,
                    line.taxAmount,
                    line.lineTotal
                };
            }).ToArray();

            return Results.Ok(new
            {
                orderCode = order.Code,
                orderDate = order.OrderDate,
                requestedDeliveryDate = order.RequestedDeliveryDate,
                status = order.Status.ToString(),
                currencyCode = order.CurrencyCode,
                subtotal = order.Subtotal,
                discountTotal = order.DiscountTotal,
                taxTotal = order.TaxTotal,
                grandTotal = order.GrandTotal,
                lineCount = order.LineCount,
                returnedLines = lineProgress.Length,
                hasMoreLines = order.LineCount > lineProgress.Length,
                lines = lineProgress
            });
        }).RequireAuthorization().WithTags("Satış Siparişleri");
    }
}
