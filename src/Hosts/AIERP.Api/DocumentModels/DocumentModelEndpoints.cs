using System.Security.Claims;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace AIERP.Api.DocumentModels;

/// <summary>
/// Read-only document model routes (belge kuralları): the model, a sales order as a document, and "alan değişince" fills.
/// All resolve as <c>erp.sales-orders.read</c>; nothing is written.
/// </summary>
internal static class DocumentModelEndpoints
{
    internal static void MapDocumentModelEndpoints(this WebApplication app)
    {
        var models = app.MapGroup("/api/document-models").WithTags("Belge modelleri").RequireAuthorization();
        models.MapGet("/{code}", (string code) =>
            code == SalesOrderDocumentModel.Code ? Results.Ok(SalesOrderDocumentModel.Model) : Results.NotFound());
        // One literal route per model (the ERP operation catalog matches routes literally); satis.siparis is the only model so far.
        models.MapPost("/" + SalesOrderDocumentModel.Code + "/fill", async (DocumentFillRequest request, ClaimsPrincipal principal, TenantDbContext db, CancellationToken ct) =>
        {
            if (!Guid.TryParse(principal.FindFirstValue("tenant_id"), out var tenantId)) return Results.Forbid();
            if (request.Field != "stockItemId") return Results.Ok(new DocumentFillResult(new Dictionary<string, object?>()));
            if (!Guid.TryParse(request.Value, out var stockItemId)) return Results.ValidationProblem(new Dictionary<string, string[]> { ["value"] = ["Stok kartı seçin."] });
            var item = await db.StockItems.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == stockItemId && x.IsActive, ct);
            if (item is null) return Results.NotFound();
            var available = await StockAvailability.AvailableAsync(db, tenantId, [item.Id], ct);
            return Results.Ok(new DocumentFillResult(new Dictionary<string, object?>
            {
                ["unitCode"] = item.UnitCode,
                ["unitPrice"] = item.SalesListPrice,
                ["vatPercent"] = item.SalesVatPercent,
                ["discountPercent"] = item.SalesDiscountPercent,
                ["currencyCode"] = item.PriceCurrencyCode,
                ["availableQuantity"] = available.GetValueOrDefault(item.Id)
            }));
        });

        app.MapGroup("/api/sales/orders").WithTags("Satış Siparişleri").RequireAuthorization()
            .MapGet("/{id:guid}/document", async (Guid id, ClaimsPrincipal principal, TenantDbContext db, IPlatformPermissionAuthorizer authorizer,
                CancellationToken ct) =>
            {
                if (!Guid.TryParse(principal.FindFirstValue("tenant_id"), out var tenantId)) return Results.Forbid();
                if (await SalesOrderReads.ViewAsync(db, tenantId, id, ct) is not { } order) return Results.NotFound();
                var vat = await db.SalesOrderLines.AsNoTracking().Where(x => x.TenantId == tenantId && x.OrderId == id)
                    .GroupBy(x => x.VatPercent)
                    .Select(g => new DocumentVatRow(g.Key, g.Sum(x => x.LineSubtotal - x.DiscountAmount), g.Sum(x => x.TaxAmount)))
                    .ToListAsync(ct);
                var activity = await DocumentActivityLog.ReadAsync(db, tenantId, SalesOrderDocumentModel.Code, id, ct);
                return Results.Ok(new SalesOrderDocumentView(order,
                    new DocumentAmounts(order.CurrencyCode, order.Subtotal, order.DiscountTotal, order.TaxTotal, order.GrandTotal, vat.OrderBy(x => x.Rate).ToList()),
                    await AllowedTransitionsAsync(db, authorizer, principal, tenantId, order, ct), activity,
                    activity.Count == 0 && order.Status != SalesOrderStatus.Draft));
            });
    }

    private static async Task<IReadOnlyList<string>> AllowedTransitionsAsync(TenantDbContext db, IPlatformPermissionAuthorizer authorizer,
        ClaimsPrincipal principal, Guid tenantId, SalesOrderView order, CancellationToken ct)
    {
        var hasDeliveries = await db.SalesDeliveries.AnyAsync(x => x.TenantId == tenantId && x.OrderId == order.Id && x.Status == SalesDeliveryStatus.Posted, ct);
        var hasInvoices = await db.SalesInvoices.AnyAsync(x => x.TenantId == tenantId && x.OrderId == order.Id && x.Status == SalesInvoiceStatus.Posted, ct);
        var hasReservations = await db.SalesOrderReservations.AnyAsync(x => x.TenantId == tenantId && x.OrderId == order.Id, ct);
        var candidates = new List<string>();
        if (SalesOrderLifecycle.CanApprove(order.Status)) candidates.Add(SalesOrderTransitionEndpoints.Approve);
        if (SalesOrderLifecycle.CanUnapprove(order.Status, hasDeliveries, hasInvoices, hasReservations)) candidates.Add(SalesOrderTransitionEndpoints.Unapprove);
        if (SalesOrderLifecycle.CanCancel(order.Status, hasDeliveries || hasInvoices)) candidates.Add(SalesOrderTransitionEndpoints.Cancel);
        if (candidates.Count == 0) return candidates;

        var role = principal.FindFirstValue("role") ?? "";
        if (!Guid.TryParse(principal.FindFirstValue("sub") ?? principal.FindFirstValue(ClaimTypes.NameIdentifier), out var userId)) return [];
        var execute = PlatformPermissionCatalog.Definitions.Single(x => x.ResourceType == "erp.sales-orders" && x.Action == "execute");
        var attributes = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["subject.userId"] = userId.ToString("D"), ["subject.role"] = role,
            ["resource.type"] = execute.ResourceType, ["resource.tenantId"] = tenantId.ToString("D"),
            ["resource.route.id"] = order.Id.ToString("D"), ["resource.status"] = order.Status.ToString(),
            ["resource.customerId"] = order.CustomerId.ToString("D"),
            ["request.method"] = "POST", ["request.action"] = "execute"
        };
        return await authorizer.IsAllowedAsync(tenantId, userId, role, new ResolvedPlatformPermission(execute, attributes), ct) ? candidates : [];
    }
}
