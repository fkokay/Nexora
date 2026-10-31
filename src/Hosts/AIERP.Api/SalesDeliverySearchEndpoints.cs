using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using AIERP.Platform.Infrastructure;

public static class SalesDeliverySearchEndpoints
{
    public static void MapSalesDeliverySearchEndpoints(this WebApplication app)
    {
        var deliveries = app.MapGroup("/api/sales/deliveries").WithTags("Satış İrsaliyeleri").RequireAuthorization();
        deliveries.MapGet("/search", async (ClaimsPrincipal principal, TenantDbContext db, string? q, CancellationToken ct) =>
        {
            if (!Guid.TryParse(principal.FindFirstValue("tenant_id"), out var tenantId)) return Results.Forbid();
            var term = q?.Trim().ToUpperInvariant();
            if (term is null || term.Length is < 2 or > 100)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["q"] = ["İrsaliye araması 2–100 karakter olmalıdır."] });

            var query = db.SalesDeliveries.AsNoTracking()
                .Where(x => x.TenantId == tenantId && (x.Code.Contains(term) || x.Order.Code.Contains(term)));
            var totalCount = await query.CountAsync(ct);
            var items = await query.OrderByDescending(x => x.DeliveryDate).ThenByDescending(x => x.CreatedAt).ThenBy(x => x.Code)
                .Take(10)
                .Select(x => new
                {
                    code = x.Code,
                    orderCode = x.Order.Code,
                    deliveryDate = x.DeliveryDate,
                    status = x.Status.ToString(),
                    lineCount = x.Lines.Count,
                    invoiced = db.SalesInvoices.Any(invoice => invoice.TenantId == tenantId && invoice.DeliveryId == x.Id)
                }).ToListAsync(ct);
            return Results.Ok(new { totalCount, returned = items.Count, hasMore = totalCount > items.Count, items });
        });

        // Assistant-facing exact-code lookup: keep the query tenant-scoped and return only
        // a bounded set of operational line facts, never names, locations, costs or IDs.
        deliveries.MapGet("/search/details", async (ClaimsPrincipal principal, TenantDbContext db, string? code, CancellationToken ct) =>
        {
            if (!Guid.TryParse(principal.FindFirstValue("tenant_id"), out var tenantId)) return Results.Forbid();
            var term = code?.Trim();
            if (term is null || term.Length is < 2 or > 100 || term.Any(char.IsControl))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["code"] = ["İrsaliye kodu 2–100 karakter olmalıdır."] });

            var matches = await db.SalesDeliveries.AsNoTracking()
                .Where(x => x.TenantId == tenantId && x.Code.ToUpper() == term.ToUpper())
                .OrderBy(x => x.CreatedAt)
                .Take(2)
                .Select(x => new
                {
                    code = x.Code,
                    orderCode = x.Order.Code,
                    deliveryDate = x.DeliveryDate,
                    status = x.Status.ToString(),
                    lineCount = x.Lines.Count,
                    lines = x.Lines.OrderBy(line => line.OrderLineNumber).Take(51)
                        .Select(line => new { lineNumber = line.OrderLineNumber, stockCode = line.StockCode, unitCode = line.UnitCode, quantity = line.Quantity })
                        .ToList()
                })
                .ToListAsync(ct);

            if (matches.Count == 0) return Results.NotFound(new { errorCode = "sales_delivery_not_found" });
            if (matches.Count > 1) return Results.Conflict(new { errorCode = "sales_delivery_not_unique" });

            var delivery = matches[0];
            return Results.Ok(new
            {
                delivery.code,
                delivery.orderCode,
                deliveryDate = delivery.deliveryDate.ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture),
                delivery.status,
                delivery.lineCount,
                returnedLines = Math.Min(delivery.lineCount, 50),
                hasMoreLines = delivery.lineCount > 50,
                lines = delivery.lines.Take(50)
            });
        });
    }
}
