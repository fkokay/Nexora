using System.Security.Claims;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

public static class PurchaseOrderAssistantSummaryEndpoints
{
    public static void MapPurchaseOrderAssistantSummaryEndpoint(this RouteGroupBuilder group)
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

            var query = db.PurchaseOrders.AsNoTracking().Where(x => x.TenantId == tenantId && x.Code == orderCode);
            query = await PermissionStatusFilter.ApplyAsync(platformDb, tenantId, userId,
                principal.FindFirstValue("role")!, "erp.purchase-orders.read", "erp.purchase-orders",
                query, x => x.Status, supplierSelector: x => x.SupplierId, cancellationToken: ct) ?? query;
            var order = await query.Select(x => new
            {
                x.Id, x.Code, x.OrderDate, x.CurrencyCode, x.Status, x.Subtotal, x.DiscountTotal, x.TaxTotal, x.GrandTotal,
                LineCount = x.Lines.Count
            }).SingleOrDefaultAsync(ct);
            if (order is null) return Results.NotFound();

            const int maxLines = 50;
            var lines = await db.PurchaseOrderLines.AsNoTracking()
                .Where(x => x.TenantId == tenantId && x.PurchaseOrderId == order.Id)
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

            return Results.Ok(new
            {
                orderCode = order.Code,
                orderDate = order.OrderDate,
                status = order.Status.ToString(),
                currencyCode = order.CurrencyCode,
                subtotal = order.Subtotal,
                discountTotal = order.DiscountTotal,
                taxTotal = order.TaxTotal,
                grandTotal = order.GrandTotal,
                lineCount = order.LineCount,
                returnedLines = lines.Count,
                hasMoreLines = order.LineCount > lines.Count,
                lines
            });
        }).RequireAuthorization().WithTags("Satın Alma Siparişleri");
    }
}
