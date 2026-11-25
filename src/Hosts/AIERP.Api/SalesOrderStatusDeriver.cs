using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace AIERP.Api;

/// <summary>
/// Re-derives a sales order's status from what is saved (belge kuralları): fully delivered by posted deliveries → Sevk edildi,
/// and every posted delivery invoiced by a posted invoice → Faturalandı; otherwise Onaylı. Drafts, pending and cancelled orders
/// are left alone. Callers save their own delivery / invoice change first (inside their transaction), then call this and save again.
/// </summary>
internal static class SalesOrderStatusDeriver
{
    internal static async Task RecomputeAsync(TenantDbContext db, SalesOrder order, Guid? actorUserId, CancellationToken ct)
    {
        var tenantId = order.TenantId;
        var lines = await db.SalesOrderLines.AsNoTracking().Where(x => x.TenantId == tenantId && x.OrderId == order.Id)
            .Select(x => new { x.LineNumber, x.Quantity }).ToListAsync(ct);
        var delivered = await db.SalesDeliveryLines.AsNoTracking()
            .Where(x => x.TenantId == tenantId && x.OrderId == order.Id && x.Delivery.Status == SalesDeliveryStatus.Posted)
            .GroupBy(x => x.OrderLineNumber).Select(g => new { LineNumber = g.Key, Quantity = g.Sum(x => x.Quantity) })
            .ToDictionaryAsync(x => x.LineNumber, x => x.Quantity, ct);
        var postedDeliveries = db.SalesDeliveries.Where(x => x.TenantId == tenantId && x.OrderId == order.Id && x.Status == SalesDeliveryStatus.Posted);
        var hasPostedDelivery = await postedDeliveries.AnyAsync(ct);
        var allInvoiced = !await postedDeliveries.AnyAsync(d => !db.SalesInvoices.Any(i => i.TenantId == tenantId && i.DeliveryId == d.Id
            && i.Status == SalesInvoiceStatus.Posted), ct);
        var fullyDelivered = lines.Count > 0 && lines.All(x => delivered.GetValueOrDefault(x.LineNumber) >= x.Quantity);
        var next = SalesOrderLifecycle.Derive(order.Status, fullyDelivered, allInvoiced, hasPostedDelivery);
        if (next == order.Status) return;
        var step = next switch
        {
            SalesOrderStatus.Fulfilled => "Sevk edildi",
            SalesOrderStatus.Invoiced => "Faturalandı",
            _ => "Onaylıya döndü"
        };
        order.Status = next;
        DocumentActivityLog.Add(db, tenantId, DocumentActivityLog.SalesOrder, order.Id, "durum", step, "core", "done", null, actorUserId);
    }
}
