using System.Security.Claims;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

public static class PurchaseInvoiceEntryEndpoints
{
    public static void MapPurchaseInvoiceEntryEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/purchasing/invoices/entry").WithTags("Alış faturası girişi").RequireAuthorization();

        group.MapGet("/receipts", async (string? q, int page, int pageSize, ClaimsPrincipal user,
            TenantDbContext db, PlatformDbContext platformDb, CancellationToken ct) =>
        {
            if (!Guid.TryParse(user.FindFirstValue("tenant_id"), out var tenantId)
                || !Guid.TryParse(user.FindFirstValue("sub") ?? user.FindFirstValue(ClaimTypes.NameIdentifier), out var userId)
                || string.IsNullOrWhiteSpace(user.FindFirstValue("role"))) return Results.Forbid();
            if (q?.Trim().Length > 120) return Results.BadRequest(new { error = "Arama metni en fazla 120 karakter olabilir." });

            page = Math.Max(1, page);
            pageSize = Math.Clamp(pageSize, 1, 100);
            var orders = db.PurchaseOrders.AsNoTracking().Where(x => x.TenantId == tenantId);
            orders = await PermissionStatusFilter.ApplyAsync(platformDb, tenantId, userId,
                user.FindFirstValue("role")!, "erp.purchase-invoices.create", "erp.purchase-invoices",
                orders, x => x.Status, null, x => x.SupplierId, cancellationToken: ct) ?? orders;
            var orderIds = orders.Select(x => x.Id);
            var query = db.PurchaseReceipts.AsNoTracking().Where(x => x.TenantId == tenantId
                && x.Status == PurchaseReceiptStatus.Posted && orderIds.Contains(x.PurchaseOrderId)
                && x.Lines.Any() && !db.PurchaseInvoices.Any(i => i.TenantId == tenantId
                    && i.PurchaseReceiptId == x.Id && i.Status == PurchaseInvoiceStatus.Posted));

            var term = q?.Trim();
            if (!string.IsNullOrEmpty(term))
                query = query.Where(x => x.Code.Contains(term) || x.PurchaseOrder.Code.Contains(term)
                    || x.PurchaseOrder.Supplier.Name.Contains(term) || x.Warehouse.Name.Contains(term));

            var total = await query.CountAsync(ct);
            var items = await query.OrderByDescending(x => x.ReceiptDate).ThenByDescending(x => x.CreatedAt)
                .Skip((page - 1) * pageSize).Take(pageSize)
                .Select(x => new PurchaseInvoiceEntryReceiptView(x.Id, x.Code, x.PurchaseOrderId,
                    x.PurchaseOrder.Code, x.PurchaseOrder.SupplierId, x.PurchaseOrder.Supplier.Name,
                    x.ReceiptDate, x.WarehouseId, x.Warehouse.Code, x.Warehouse.Name, x.Lines.Count,
                    x.PurchaseOrder.CurrencyCode, x.PurchaseOrder.GrandTotal))
                .ToListAsync(ct);
            return Results.Ok(new PurchaseInvoiceEntryReceiptPage(items, page, pageSize, total));
        });
    }
}

public sealed record PurchaseInvoiceEntryReceiptPage(IReadOnlyList<PurchaseInvoiceEntryReceiptView> Items,
    int Page, int PageSize, int TotalCount);
public sealed record PurchaseInvoiceEntryReceiptView(Guid Id, string ReceiptCode, Guid PurchaseOrderId,
    string PurchaseOrderCode, Guid SupplierId, string SupplierName, DateOnly ReceiptDate, Guid WarehouseId,
    string WarehouseCode, string WarehouseName, int LineCount, string CurrencyCode, decimal PurchaseOrderTotal);
