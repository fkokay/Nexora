using System.Security.Claims;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

public static class PurchaseReceiptSearchEndpoints
{
    public static void MapPurchaseReceiptSearchEndpoints(this WebApplication app)
    {
        app.MapGet("/api/purchasing/receipts/search", async (ClaimsPrincipal principal, TenantDbContext db, string? q, CancellationToken ct) =>
        {
            if (!Guid.TryParse(principal.FindFirstValue("tenant_id"), out var tenantId)) return Results.Forbid();
            var term = q?.Trim().ToUpperInvariant();
            if (term is null || term.Length is < 2 or > 100)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["q"] = ["Mal kabul araması 2–100 karakter olmalıdır."] });

            var query = db.PurchaseReceipts.AsNoTracking()
                .Where(x => x.TenantId == tenantId && (x.Code.Contains(term) || x.PurchaseOrder.Code.Contains(term)));
            var totalCount = await query.CountAsync(ct);
            var items = await query.OrderByDescending(x => x.ReceiptDate).ThenByDescending(x => x.CreatedAt).ThenBy(x => x.Code)
                .Take(10)
                .Select(x => new
                {
                    code = x.Code,
                    purchaseOrderCode = x.PurchaseOrder.Code,
                    receiptDate = x.ReceiptDate,
                    status = x.Status.ToString(),
                    lineCount = x.Lines.Count
                }).ToListAsync(ct);

            return Results.Ok(new { totalCount, returned = items.Count, hasMore = totalCount > items.Count, items });
        }).RequireAuthorization().WithTags("Satınalma Mal Kabulleri");
    }
}
