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
    }
}
