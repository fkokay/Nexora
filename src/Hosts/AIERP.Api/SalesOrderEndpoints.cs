using System.Security.Claims;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

public static class SalesOrderEndpoints
{
    public static void MapSalesOrderEndpoints(this WebApplication app)
    {
        var orders = app.MapGroup("/api/sales/orders").WithTags("Satış Siparişleri").RequireAuthorization();
        orders.MapPut("/{id:guid}/delivery-date", async (Guid id, SalesOrderDeliveryDateWriteRequest request,
            ClaimsPrincipal principal, TenantDbContext db, CancellationToken ct) =>
        {
            if (!Guid.TryParse(principal.FindFirstValue("tenant_id"), out var tenantId)) return Results.Forbid();
            var userId = Guid.TryParse(principal.FindFirstValue("sub") ?? principal.FindFirstValue(ClaimTypes.NameIdentifier), out var parsedUserId)
                ? parsedUserId : (Guid?)null;
            var order = await db.SalesOrders.Include(x => x.Quote).Include(x => x.Customer).Include(x => x.Lines)
                .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (order is null) return Results.NotFound();
            if (order.Status != SalesOrderStatus.Open)
                return Results.Conflict(new { error = "Yalnızca açık satış siparişlerinin teslim tarihi düzenlenebilir." });
            if (request.RequestedDeliveryDate is { } date && date < order.OrderDate)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["requestedDeliveryDate"] = ["İstenen teslim tarihi sipariş tarihinden önce olamaz."] });

            var previous = order.RequestedDeliveryDate;
            order.RequestedDeliveryDate = request.RequestedDeliveryDate;
            db.AuditEvents.Add(new AuditEvent
            {
                TenantId = tenantId, UserId = userId, Action = "sales-order.delivery-date-updated",
                Resource = $"{order.Code}:{previous?.ToString("yyyy-MM-dd") ?? "unspecified"}->{request.RequestedDeliveryDate?.ToString("yyyy-MM-dd") ?? "unspecified"}"
            });
            await db.SaveChangesAsync(ct);
            return Results.Ok(new SalesOrderSummary(order.Id, order.Code, order.QuoteId, order.Quote.Code, order.CustomerId,
                order.Customer.Name, order.OrderDate, order.CurrencyCode, order.Status, order.GrandTotal, order.Lines.Count,
                order.CreatedAt, order.RequestedDeliveryDate));
        });
    }
}
