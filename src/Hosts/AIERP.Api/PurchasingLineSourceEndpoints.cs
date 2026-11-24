using System.Security.Claims;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace AIERP.Api;

/// <summary>
/// Satınalma Faz 2 line sources: the remaining quantities a line document may still take, computed by the same rules as the
/// write that consumes them, so a system page can prefill its line grid (supplier delivery note from the order, supplier
/// return from the invoice). Plain reads; no locks and no writes.
/// </summary>
internal static class PurchasingLineSourceEndpoints
{
    internal static void MapPurchasingLineSourceEndpoints(this WebApplication app)
    {
        // Resolves to erp.purchase-invoices.read with the invoice's own record attributes ({id}), like GET /invoices/{id}.
        app.MapGroup("/api/purchasing/invoices").WithTags("Alış faturaları").RequireAuthorization()
            .MapGet("/{id:guid}/returnable-lines", async (Guid id, ClaimsPrincipal principal, TenantDbContext db, CancellationToken ct) =>
            {
                if (!Guid.TryParse(principal.FindFirstValue("tenant_id"), out var tenantId)) return Results.Forbid();
                if (!await db.PurchaseInvoices.AsNoTracking().AnyAsync(x => x.TenantId == tenantId && x.Id == id, ct)) return Results.NotFound();
                var lines = await db.PurchaseInvoiceLines.AsNoTracking().Where(x => x.TenantId == tenantId && x.PurchaseInvoiceId == id)
                    .OrderBy(x => x.OrderLineNumber).ToListAsync(ct);
                var lineIds = lines.Select(x => x.Id).ToArray();
                // Same as the return handler's priorRows: posted returns only.
                var returned = await db.SupplierReturnLines.AsNoTracking()
                    .Where(x => x.TenantId == tenantId && lineIds.Contains(x.PurchaseInvoiceLineId) && x.SupplierReturn.Status == SupplierReturnStatus.Posted)
                    .GroupBy(x => x.PurchaseInvoiceLineId).Select(g => new { Id = g.Key, Quantity = g.Sum(x => x.Quantity) })
                    .ToDictionaryAsync(x => x.Id, x => x.Quantity, ct);
                return Results.Ok(lines.Select(x =>
                {
                    var done = returned.GetValueOrDefault(x.Id);
                    return new PurchaseInvoiceReturnableLineView(x.Id, x.OrderLineNumber, x.StockItemId, x.StockCode, x.StockName, x.UnitCode,
                        x.Quantity, done, Math.Max(0m, x.Quantity - done), x.UnitPrice, x.DiscountPercent, x.VatPercent);
                }).ToList());
            });

        // Resolves to erp.purchase-delivery-notes.read; the order must pass the caller's purchase order read rules, as on every
        // other delivery note route (otherwise 404).
        app.MapGroup("/api/purchasing/delivery-notes").WithTags("Tedarikçi irsaliyeleri").RequireAuthorization()
            .MapGet("/orders/{orderId:guid}/lines", async (Guid orderId, ClaimsPrincipal principal, TenantDbContext db, PlatformDbContext platformDb,
                CancellationToken ct) =>
            {
                if (!Guid.TryParse(principal.FindFirstValue("tenant_id"), out var tenantId)
                    || !Guid.TryParse(principal.FindFirstValue("sub"), out var userId)
                    || principal.FindFirstValue("role") is not { Length: > 0 } role) return Results.Forbid();
                var orders = db.PurchaseOrders.AsNoTracking().Where(x => x.TenantId == tenantId);
                orders = await PermissionStatusFilter.ApplyAsync(platformDb, tenantId, userId, role, "erp.purchase-orders.read", "erp.purchase-orders",
                    orders, x => x.Status, null, x => x.SupplierId, cancellationToken: ct) ?? orders;
                if (!await orders.AnyAsync(x => x.Id == orderId, ct)) return Results.NotFound();
                var lines = await db.PurchaseOrderLines.AsNoTracking().Where(x => x.TenantId == tenantId && x.PurchaseOrderId == orderId)
                    .OrderBy(x => x.LineNumber).ToListAsync(ct);
                // Same as the delivery note handler: every recorded note of the order counts, linked to a receipt or not.
                var noted = await db.PurchaseDeliveryNoteLines.AsNoTracking().Where(x => x.TenantId == tenantId && x.PurchaseOrderId == orderId)
                    .GroupBy(x => x.OrderLineNumber).Select(g => new { LineNumber = g.Key, Quantity = g.Sum(x => x.Quantity) })
                    .ToDictionaryAsync(x => x.LineNumber, x => x.Quantity, ct);
                return Results.Ok(lines.Select(x =>
                {
                    var done = noted.GetValueOrDefault(x.LineNumber);
                    return new PurchaseDeliveryNoteOrderLineView(x.LineNumber, x.StockItemId, x.StockCode, x.StockName, x.UnitCode, x.Quantity,
                        done, Math.Max(0m, x.Quantity - done));
                }).ToList());
            });
    }
}

/// <summary>An order line with the quantity a supplier delivery note may still record (ordered minus every recorded note).</summary>
public sealed record PurchaseDeliveryNoteOrderLineView(int OrderLineNumber, Guid StockItemId, string StockCode, string StockName,
    string UnitCode, decimal OrderedQuantity, decimal NotedQuantity, decimal RemainingQuantity);
