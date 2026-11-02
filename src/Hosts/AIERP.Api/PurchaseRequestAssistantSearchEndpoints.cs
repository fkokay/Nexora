using System.Security.Claims;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

public static class PurchaseRequestAssistantSearchEndpoints
{
    public static void MapPurchaseRequestAssistantSearchEndpoint(this RouteGroupBuilder group)
    {
        group.MapGet("/search", async (ClaimsPrincipal principal, TenantDbContext db, PlatformDbContext platformDb, string? q, CancellationToken ct) =>
        {
            if (!Guid.TryParse(principal.FindFirstValue("tenant_id"), out var tenantId) ||
                !Guid.TryParse(principal.FindFirstValue("sub"), out var userId) ||
                string.IsNullOrWhiteSpace(principal.FindFirstValue("role")))
                return Results.Forbid();

            var term = q?.Trim();
            if (term is null || term.Length is < 2 or > 100)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["q"] = ["Talep araması 2–100 karakter olmalıdır."] });

            var normalized = term.ToUpperInvariant();
            var query = db.PurchaseRequests.AsNoTracking()
                .Where(x => x.TenantId == tenantId &&
                    (x.Code.ToUpper().Contains(normalized) || x.Description.ToUpper().Contains(normalized) ||
                     x.Lines.Any(line => line.TenantId == tenantId &&
                         (line.StockCode.ToUpper().Contains(normalized) || line.StockName.ToUpper().Contains(normalized)))));
            query = await PermissionStatusFilter.ApplyAsync(platformDb, tenantId, userId,
                principal.FindFirstValue("role")!, "erp.purchase-requests.read", "erp.purchase-requests",
                query, x => x.Status, null, null, x => x.RequestedByUserId, ct) ?? query;

            var totalCount = await query.CountAsync(ct);
            var items = await query.OrderByDescending(x => x.RequestDate).ThenByDescending(x => x.CreatedAt).ThenBy(x => x.Code)
                .Take(10)
                .Select(x => new
                {
                    code = x.Code,
                    requestDate = x.RequestDate,
                    neededByDate = x.NeededByDate,
                    status = x.Status.ToString(),
                    lineCount = x.Lines.Count,
                    purchaseOrderCode = x.PurchaseOrder == null ? null : x.PurchaseOrder.Code
                }).ToListAsync(ct);

            return Results.Ok(new { totalCount, returned = items.Count, hasMore = totalCount > items.Count, items });
        }).RequireAuthorization().WithTags("Satınalma Talepleri");
    }
}
