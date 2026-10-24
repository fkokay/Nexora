using System.Security.Claims;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

public static class SalesPlanningInquiryEndpoints
{
    public static void MapSalesPlanningInquiryEndpoints(this WebApplication app)
    {
        var distribution = app.MapGroup("/api/sales/orders").WithTags("Satış dağıtım planı").RequireAuthorization();
        distribution.MapGet("/distribution-plan", async (Guid? warehouseId, string? q, int? page, int? pageSize,
            ClaimsPrincipal user, TenantDbContext db, PlatformDbContext platformDb, IPlatformPermissionAuthorizer authorizer, CancellationToken ct) =>
        {
            if (!Guid.TryParse(user.FindFirstValue("tenant_id"), out var tenantId)) return Results.Forbid();
            if (warehouseId is null || warehouseId == Guid.Empty) return Results.BadRequest(new { error = "Geçerli bir depo seçilmelidir." });
            var callerRole = user.FindFirstValue("role");
            if (!Guid.TryParse(user.FindFirstValue("sub") ?? user.FindFirstValue(ClaimTypes.NameIdentifier), out var callerId)
                || string.IsNullOrWhiteSpace(callerRole)) return Results.Forbid();
            if (!string.Equals(callerRole, "TenantAdmin", StringComparison.Ordinal))
            {
                foreach (var resourceType in new[] { "erp.warehouses", "erp.stock-items" })
                {
                    var permission = PlatformPermissionCatalog.Definitions.Single(x => x.ResourceType == resourceType && x.Action == "read");
                    var attributes = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
                    {
                        ["subject.userId"] = callerId.ToString("D"), ["subject.role"] = callerRole,
                        ["resource.type"] = resourceType, ["resource.tenantId"] = tenantId.ToString("D"),
                        ["request.method"] = "GET", ["request.action"] = "read"
                    };
                    if (!await authorizer.IsAllowedAsync(tenantId, callerId, callerRole,
                            new ResolvedPlatformPermission(permission, attributes), ct)) return Results.Forbid();
                }
            }
            var search = q?.Trim();
            if (search?.Length > 120) return Results.BadRequest(new { error = "Arama metni en fazla 120 karakter olabilir." });
            var pageNumber = Math.Max(1, page ?? 1);
            var size = Math.Clamp(pageSize ?? 25, 1, 100);

            var orders = db.SalesOrders.AsNoTracking().Where(x => x.TenantId == tenantId && x.Status == SalesOrderStatus.Open);
            if (Guid.TryParse(user.FindFirstValue("sub") ?? user.FindFirstValue(ClaimTypes.NameIdentifier), out var userId)
                && !string.IsNullOrWhiteSpace(user.FindFirstValue("role")))
                orders = await PermissionStatusFilter.ApplyAsync(platformDb, tenantId, userId, user.FindFirstValue("role")!,
                    "erp.sales-orders.read", "erp.sales-orders", orders, x => x.Status, x => x.CustomerId, cancellationToken: ct) ?? orders;
            var orderIds = orders.Select(x => x.Id);
            var orderLines = db.SalesOrderLines.AsNoTracking().Where(x => x.TenantId == tenantId && orderIds.Contains(x.OrderId));
            var reservationRows = db.SalesOrderReservations.AsNoTracking().Where(x => x.TenantId == tenantId && x.WarehouseId == warehouseId
                && x.Status == SalesOrderReservationStatus.Active && orderIds.Contains(x.OrderId));

            var itemLines = orderLines.GroupBy(x => new { x.StockItemId, x.StockCode, x.StockName, x.UnitCode })
                .Select(g => new { g.Key.StockItemId, g.Key.StockCode, g.Key.StockName, g.Key.UnitCode,
                    GrossDemand = g.Sum(x => x.Quantity),
                    Fulfilled = g.Sum(x => db.SalesOrderReservations.Where(r => r.TenantId == tenantId && r.OrderId == x.OrderId
                        && r.OrderLineNumber == x.LineNumber).Sum(r => (decimal?)r.FulfilledQuantity) ?? 0m),
                    OrderCount = g.Select(x => x.OrderId).Distinct().Count() });
            if (!string.IsNullOrEmpty(search)) itemLines = itemLines.Where(x => x.StockCode.Contains(search) || x.StockName.Contains(search));

            var warehouse = warehouseId is { } selected
                ? await db.Warehouses.AsNoTracking().Where(x => x.TenantId == tenantId && x.Id == selected).Select(x => new { x.Id, x.Code, x.Name }).SingleOrDefaultAsync(ct)
                : null;
            if (warehouseId is not null && warehouse is null) return Results.NotFound();
            var total = await itemLines.CountAsync(ct);
            var summaries = await itemLines.OrderBy(x => x.StockCode).Skip((pageNumber - 1) * size).Take(size).ToListAsync(ct);
            var ids = summaries.Select(x => x.StockItemId).ToArray();
            var onHand = warehouse is null ? new Dictionary<Guid, decimal>() : await db.InventoryTransactions.AsNoTracking()
                .Where(x => x.TenantId == tenantId && x.WarehouseId == warehouse.Id && ids.Contains(x.StockItemId))
                .GroupBy(x => x.StockItemId).Select(g => new { Id = g.Key, Quantity = g.Sum(x => x.Direction == InventoryDirection.Receipt ? x.Quantity : -x.Quantity) })
                .ToDictionaryAsync(x => x.Id, x => x.Quantity, ct);
            var reserved = warehouse is null ? new Dictionary<Guid, decimal>() : await reservationRows.Where(x => ids.Contains(x.OrderLine.StockItemId))
                .GroupBy(x => x.OrderLine.StockItemId).Select(g => new { Id = g.Key, Quantity = g.Sum(x => x.Quantity - x.FulfilledQuantity) })
                .ToDictionaryAsync(x => x.Id, x => x.Quantity, ct);
            var result = summaries.Select(x =>
            {
                var stock = onHand.GetValueOrDefault(x.StockItemId);
                var held = reserved.GetValueOrDefault(x.StockItemId);
                var available = stock - held;
                var openDemand = Math.Max(0m, x.GrossDemand - x.Fulfilled);
                return new DistributionNeedView(x.StockItemId, x.StockCode, x.StockName, x.UnitCode, openDemand,
                    stock, held, available, Math.Max(0m, openDemand - Math.Max(0m, available)), x.OrderCount);
            }).ToArray();
            return Results.Ok(new DistributionNeedPage(warehouse, result, pageNumber, size, total,
                "Talep, karşılanan miktar ve aktif rezervasyonlardan hesaplanır. Kullanılabilir stok = depo mevcudu − aktif rezervasyon. Sonuç salt okunurdur; sipariş önceliği veya dağıtım tahsisi varsayılmaz."));
        });

        var campaignReport = app.MapGroup("/api/sales/quotes").WithTags("Kampanya performans raporu").RequireAuthorization();
        campaignReport.MapGet("/campaign-performance", async (DateOnly? from, DateOnly? through, string? q, int? page, int? pageSize,
            ClaimsPrincipal user, TenantDbContext db, PlatformDbContext platformDb, IPlatformPermissionAuthorizer authorizer, CancellationToken ct) =>
        {
            if (!Guid.TryParse(user.FindFirstValue("tenant_id"), out var tenantId)) return Results.Forbid();
            if (from is { } start && through is { } end && end < start) return Results.BadRequest(new { error = "Bitiş tarihi başlangıç tarihinden önce olamaz." });
            var search = q?.Trim();
            if (search?.Length > 120) return Results.BadRequest(new { error = "Arama metni en fazla 120 karakter olabilir." });
            var pageNumber = Math.Max(1, page ?? 1); var size = Math.Clamp(pageSize ?? 25, 1, 100);
            var campaigns = db.SalesPromotionCampaigns.AsNoTracking().Where(x => x.TenantId == tenantId);
            if (!string.IsNullOrEmpty(search)) campaigns = campaigns.Where(x => x.Code.Contains(search) || x.Name.Contains(search));
            var total = await campaigns.CountAsync(ct);
            var campaignRows = await campaigns.OrderBy(x => x.Code).Skip((pageNumber - 1) * size).Take(size)
                .Select(x => new { x.Id, x.Code, x.Name, x.DiscountPercent, x.EffectiveFrom, x.EffectiveThrough, x.IsActive }).ToListAsync(ct);
            var campaignIds = campaignRows.Select(x => x.Id).ToArray();
            var quotes = db.SalesQuotes.AsNoTracking().Where(x => x.TenantId == tenantId);
            if (Guid.TryParse(user.FindFirstValue("sub") ?? user.FindFirstValue(ClaimTypes.NameIdentifier), out var userId)
                && !string.IsNullOrWhiteSpace(user.FindFirstValue("role")))
                quotes = await PermissionStatusFilter.ApplyAsync(platformDb, tenantId, userId, user.FindFirstValue("role")!,
                    "erp.sales-quotes.read", "erp.sales-quotes", quotes, x => x.Status, x => x.CustomerId, cancellationToken: ct) ?? quotes;
            var quoteIds = quotes.Select(x => x.Id);
            var applications = db.SalesPromotionApplications.AsNoTracking().Where(x => x.TenantId == tenantId
                && campaignIds.Contains(x.CampaignId) && quoteIds.Contains(x.QuoteId));
            if (from is { } startDate) applications = applications.Where(x => x.AppliedOn >= startDate);
            if (through is { } endDate) applications = applications.Where(x => x.AppliedOn <= endDate);
            var applicationRows = await (from application in applications
                join quote in quotes on new { application.TenantId, application.QuoteId } equals new { quote.TenantId, QuoteId = quote.Id }
                select new { application.CampaignId, application.QuoteId, application.DiscountAmount, quote.CurrencyCode }).ToListAsync(ct);
            var summaries = applicationRows.GroupBy(x => x.CampaignId).ToDictionary(g => g.Key,
                g => new { Applications = g.Count(), QuoteIds = g.Select(x => x.QuoteId).Distinct().ToArray(),
                    DiscountTotals = g.GroupBy(x => x.CurrencyCode).OrderBy(currency => currency.Key)
                        .Select(currency => new CurrencyAmount(currency.Key, currency.Sum(x => x.DiscountAmount))).ToArray() });
            var scopedQuoteIds = applicationRows.Select(x => x.QuoteId).Distinct().ToArray();
            IQueryable<SalesOrder> linkedOrderQuery = db.SalesOrders.AsNoTracking().Where(x => x.TenantId == tenantId && scopedQuoteIds.Contains(x.QuoteId)
                    && x.Status != SalesOrderStatus.Cancelled);
            if (Guid.TryParse(user.FindFirstValue("sub") ?? user.FindFirstValue(ClaimTypes.NameIdentifier), out var orderReaderId)
                && !string.IsNullOrWhiteSpace(user.FindFirstValue("role")))
            {
                var role = user.FindFirstValue("role")!;
                var orderRead = PlatformPermissionCatalog.Definitions.Single(x => x.ResourceType == "erp.sales-orders" && x.Action == "read");
                var attributes = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
                {
                    ["subject.userId"] = orderReaderId.ToString("D"), ["subject.role"] = role,
                    ["resource.type"] = orderRead.ResourceType, ["resource.tenantId"] = tenantId.ToString("D"),
                    ["request.method"] = "GET", ["request.action"] = "read"
                };
                if (!string.Equals(role, "TenantAdmin", StringComparison.Ordinal)
                    && !await authorizer.IsAllowedAsync(tenantId, orderReaderId, role, new ResolvedPlatformPermission(orderRead, attributes), ct))
                    return Results.Forbid();
                linkedOrderQuery = await PermissionStatusFilter.ApplyAsync(platformDb, tenantId, orderReaderId, role,
                    "erp.sales-orders.read", "erp.sales-orders", linkedOrderQuery, x => x.Status, x => x.CustomerId, cancellationToken: ct) ?? linkedOrderQuery;
            }
            var linkedOrders = await linkedOrderQuery
                .Select(x => new { x.QuoteId, x.CurrencyCode, x.GrandTotal }).ToListAsync(ct);
            var rows = campaignRows.Select(x =>
            {
                summaries.TryGetValue(x.Id, out var summary);
                var appliedQuotes = summary?.QuoteIds ?? [];
                var orderRows = linkedOrders.Where(o => appliedQuotes.Contains(o.QuoteId)).ToArray();
                return new CampaignPerformanceView(x.Id, x.Code, x.Name, x.DiscountPercent, x.EffectiveFrom, x.EffectiveThrough,
                    x.IsActive, summary?.Applications ?? 0, summary?.DiscountTotals ?? [], appliedQuotes.Length,
                    orderRows.Length, orderRows.GroupBy(o => o.CurrencyCode).OrderBy(g => g.Key)
                        .Select(g => new CurrencyAmount(g.Key, g.Sum(o => o.GrandTotal))).ToArray());
            }).ToArray();
            return Results.Ok(new CampaignPerformancePage(rows, pageNumber, size, total, from, through,
                "Performans, kayıtlı kampanya uygulamalarına ve aynı tekliften oluşmuş iptal edilmemiş siparişlere dayanır; kampanya artımlı etkisi veya nedensellik çıkarımı içermez."));
        });
    }
}

public sealed record DistributionNeedView(Guid StockItemId, string StockCode, string StockName, string UnitCode,
    decimal OpenDemand, decimal OnHand, decimal ActiveReserved, decimal Available, decimal Uncovered, int OpenOrderCount);
public sealed record DistributionNeedPage(object? Warehouse, IReadOnlyList<DistributionNeedView> Items, int Page, int PageSize,
    int TotalCount, string Method);
public sealed record CampaignPerformanceView(Guid CampaignId, string Code, string Name, decimal DiscountPercent,
    DateOnly EffectiveFrom, DateOnly EffectiveThrough, bool IsActive, int Applications, IReadOnlyList<CurrencyAmount> DiscountTotals,
    int AppliedQuotes, int LinkedOrders, IReadOnlyList<CurrencyAmount> LinkedOrderTotals);
public sealed record CurrencyAmount(string CurrencyCode, decimal Amount);
public sealed record CampaignPerformancePage(IReadOnlyList<CampaignPerformanceView> Items, int Page, int PageSize,
    int TotalCount, DateOnly? From, DateOnly? Through, string Method);
