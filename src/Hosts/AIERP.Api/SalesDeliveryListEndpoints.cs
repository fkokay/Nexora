using System.Security.Claims;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

/// <summary>
/// One row of the unified sales delivery list. <c>Kind</c>: <c>Order</c> (order-based sales delivery), <c>Invoice</c> (the
/// sales delivery a standalone invoice wrote; no order, always invoiced) or <c>Standalone</c> (a siparişsiz delivery
/// document of its own table). <c>IsStandalone</c> marks the rows the <c>/api/sales/deliveries/{id}</c> routes do not know.
/// Status is text because the two tables have different status sets (Draft exists only for standalone documents).
/// <c>SalesDeliveryId</c> is the id again for SalesDeliveries rows and null for standalone ones, so a page binds the
/// <c>/api/sales/deliveries/{id}</c> reads to it and they never run for a standalone row.
/// </summary>
internal sealed record SalesDeliveryListItem(Guid Id, string Kind, bool IsStandalone, Guid? SalesDeliveryId, string Code, Guid? OrderId, string? OrderCode,
    Guid? CustomerId, string? CustomerName, Guid WarehouseId, string WarehouseName, DateOnly DeliveryDate, string Status, int LineCount,
    DateTimeOffset CreatedAt, bool HasSalesInvoice, Guid? InvoiceId, string? InvoiceCode, string? InvoiceStatus,
    string? CurrencyCode = null, decimal PricedNetTotal = 0, decimal PricedVatTotal = 0, decimal PricedGrandTotal = 0,
    int FreeLineCount = 0, int UnpricedLineCount = 0, string PricingState = DeliveryLinePricing.Priced);

internal static class SalesDeliveryListItemPricing
{
    internal static SalesDeliveryListItem WithPricing(this SalesDeliveryListItem item, string? currencyCode, DeliveryPricingSummary pricing) =>
        item with { CurrencyCode = currencyCode, PricedNetTotal = pricing.PricedNetTotal, PricedVatTotal = pricing.PricedVatTotal,
            PricedGrandTotal = pricing.PricedGrandTotal, FreeLineCount = pricing.FreeLineCount, UnpricedLineCount = pricing.UnpricedLineCount,
            PricingState = pricing.PricingState };
}

internal sealed record SalesDeliveryListPage(IReadOnlyList<SalesDeliveryListItem> Items, int Page, int PageSize, int TotalCount);

/// <summary>
/// <c>GET /api/sales/deliveries/all</c>: order-based and standalone sales deliveries in one paged list. The route resolves to
/// the existing <c>erp.sales-deliveries.read</c> (no new permission) as a row-filtered collection; the handler then decides
/// each kind exactly as its old list route would for the caller, so the list never widens access:
/// <list type="bullet">
/// <item>SalesDeliveries rows: as <c>GET /api/sales/deliveries</c> (no row filter, no row-filtered collection flag).</item>
/// <item>Standalone rows: as <c>GET /api/sales/standalone-deliveries</c> (row-filtered collection plus the status / customer
/// row rules through <see cref="PermissionStatusFilter"/>).</item>
/// </list>
/// Paging runs two keyed queries (each source's first page × pageSize keys in the list order), merges them in memory and
/// then reads the details of the page's rows only; the window is bounded by <see cref="MaxWindow"/>.
/// </summary>
internal static class SalesDeliveryListEndpoints
{
    internal const string Route = "/api/sales/deliveries/all";
    internal const string OrderBasedListRoute = "/api/sales/deliveries";
    internal const string StandaloneListRoute = "/api/sales/standalone-deliveries";
    /// <summary>Largest page × pageSize the merge reads from each source.</summary>
    internal const int MaxWindow = 5000;

    private sealed record Key(Guid Id, bool Standalone, DateOnly DeliveryDate, DateTimeOffset CreatedAt);

    internal static void MapSalesDeliveryListEndpoints(this WebApplication app)
    {
        app.MapGet(Route, async (string? q, string? status, bool? unbilledOnly, ClaimsPrincipal user, TenantDbContext db,
            [FromServices] PlatformDbContext platformDb, [FromServices] IPlatformPermissionAuthorizer authorizer,
            int page = 1, int pageSize = 25, CancellationToken ct = default) =>
        {
            if (!Guid.TryParse(user.FindFirstValue("tenant_id"), out var tenantId) || !Guid.TryParse(user.FindFirstValue("sub"), out var userId))
                return Results.Forbid();
            var role = user.FindFirstValue("role");
            if (string.IsNullOrWhiteSpace(role)) return Results.Forbid();
            page = Math.Max(1, page); pageSize = Math.Clamp(pageSize, 1, 100);
            if ((long)page * pageSize > MaxWindow)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["page"] = [$"Birleşik irsaliye listesi en fazla {MaxWindow} kayıt sayfalar; aramayı daraltın."] });
            var statusText = string.IsNullOrWhiteSpace(status) ? null : status.Trim();
            if (statusText is not (null or "Draft" or "Posted" or "Voided"))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["status"] = ["Durum Draft, Posted veya Voided olmalıdır."] });

            var orderBasedAllowed = await OldListAllowedAsync(OrderBasedListRoute, tenantId, userId, role, authorizer, ct);
            var standaloneAllowed = await OldListAllowedAsync(StandaloneListRoute, tenantId, userId, role, authorizer, ct);
            if (!orderBasedAllowed && !standaloneAllowed) return Results.Forbid();
            var term = string.IsNullOrWhiteSpace(q) ? null : q.Trim();

            var sales = db.SalesDeliveries.AsNoTracking().Where(x => x.TenantId == tenantId && x.Status != SalesDeliveryStatus.Deleted);
            if (!orderBasedAllowed || statusText == "Draft") sales = sales.Where(_ => false);
            else if (statusText is not null) { var wanted = Enum.Parse<SalesDeliveryStatus>(statusText); sales = sales.Where(x => x.Status == wanted); }
            if (unbilledOnly == true) sales = sales.Where(x => x.Status == SalesDeliveryStatus.Posted
                && !db.SalesInvoices.Any(invoice => invoice.TenantId == tenantId && invoice.DeliveryId == x.Id));
            if (term is not null)
                sales = sales.Where(x => x.Code.Contains(term) || (x.Order != null && (x.Order.Code.Contains(term) || x.Order.Customer.Name.Contains(term)))
                    || db.SalesInvoices.Any(i => i.TenantId == tenantId && i.DeliveryId == x.Id && i.Customer.Name.Contains(term)));

            var standalone = db.StandaloneSalesDeliveries.AsNoTracking().Where(x => x.TenantId == tenantId);
            if (!standaloneAllowed) standalone = standalone.Where(_ => false);
            else standalone = await PermissionStatusFilter.ApplyAsync(platformDb, tenantId, userId, role, "erp.sales-deliveries.read",
                "erp.sales-deliveries", standalone, x => x.Status, x => x.CustomerId, cancellationToken: ct) ?? standalone;
            if (statusText is not null) { var wanted = Enum.Parse<StandaloneInventoryDocumentStatus>(statusText); standalone = standalone.Where(x => x.Status == wanted); }
            if (unbilledOnly == true) standalone = standalone.Where(x => x.Status == StandaloneInventoryDocumentStatus.Posted
                && !db.SalesInvoices.Any(invoice => invoice.TenantId == tenantId && invoice.StandaloneDeliveryId == x.Id));
            if (term is not null) standalone = standalone.Where(x => x.Code.Contains(term) || x.Customer.Name.Contains(term));

            var total = await sales.CountAsync(ct) + await standalone.CountAsync(ct);
            var window = page * pageSize;
            var salesKeys = await sales.OrderByDescending(x => x.DeliveryDate).ThenByDescending(x => x.CreatedAt).ThenBy(x => x.Id).Take(window)
                .Select(x => new { x.Id, x.DeliveryDate, x.CreatedAt }).ToListAsync(ct);
            var standaloneKeys = await standalone.OrderByDescending(x => x.DeliveryDate).ThenByDescending(x => x.CreatedAt).ThenBy(x => x.Id).Take(window)
                .Select(x => new { x.Id, x.DeliveryDate, x.CreatedAt }).ToListAsync(ct);
            var pageKeys = salesKeys.Select(x => new Key(x.Id, false, x.DeliveryDate, x.CreatedAt))
                .Concat(standaloneKeys.Select(x => new Key(x.Id, true, x.DeliveryDate, x.CreatedAt)))
                .OrderByDescending(x => x.DeliveryDate).ThenByDescending(x => x.CreatedAt).ThenBy(x => x.Standalone).ThenBy(x => x.Id)
                .Skip((page - 1) * pageSize).Take(pageSize).ToList();

            var salesIds = pageKeys.Where(x => !x.Standalone).Select(x => x.Id).ToList();
            var standaloneIds = pageKeys.Where(x => x.Standalone).Select(x => x.Id).ToList();
            var rows = new Dictionary<Guid, SalesDeliveryListItem>();
            if (salesIds.Count > 0)
            {
                var details = await db.SalesDeliveries.AsNoTracking().Where(x => x.TenantId == tenantId && salesIds.Contains(x.Id))
                    .Select(x => new
                    {
                        x.Id, x.Code, x.OrderId, OrderCode = x.Order == null ? null : x.Order.Code,
                        OrderCustomerId = x.Order == null ? (Guid?)null : x.Order.CustomerId,
                        OrderCustomerName = x.Order == null ? null : x.Order.Customer.Name,
                        x.WarehouseId, WarehouseName = x.Warehouse.Name, x.DeliveryDate, x.Status, LineCount = x.Lines.Count, x.CreatedAt,
                        CurrencyCode = x.CurrencyCode ?? (x.Order == null ? null : x.Order.CurrencyCode)
                    }).ToListAsync(ct);
                var pricing = await AIERP.Api.DeliveryPricingViews.SalesDeliveriesAsync(db, tenantId, salesIds, ct);
                var invoices = await db.SalesInvoices.AsNoTracking()
                    .Where(x => x.TenantId == tenantId && x.DeliveryId != null && salesIds.Contains(x.DeliveryId.Value))
                    .Select(x => new { DeliveryId = x.DeliveryId!.Value, x.Id, x.Code, x.Status, x.CustomerId, CustomerName = x.Customer.Name })
                    .ToListAsync(ct);
                var invoiceByDelivery = invoices.GroupBy(x => x.DeliveryId).ToDictionary(x => x.Key, x => x.First());
                foreach (var x in details)
                {
                    var invoice = invoiceByDelivery.GetValueOrDefault(x.Id);
                    rows[x.Id] = new SalesDeliveryListItem(x.Id, x.OrderId is null ? "Invoice" : "Order", false, x.Id, x.Code, x.OrderId, x.OrderCode,
                        x.OrderCustomerId ?? invoice?.CustomerId, x.OrderCustomerName ?? invoice?.CustomerName, x.WarehouseId, x.WarehouseName,
                        x.DeliveryDate, x.Status.ToString(), x.LineCount, x.CreatedAt, invoice is not null, invoice?.Id, invoice?.Code,
                        invoice?.Status.ToString()).WithPricing(x.CurrencyCode, pricing[x.Id]);
                }
            }
            if (standaloneIds.Count > 0)
            {
                var details = await db.StandaloneSalesDeliveries.AsNoTracking().Where(x => x.TenantId == tenantId && standaloneIds.Contains(x.Id))
                    .Select(x => new
                    {
                        x.Id, x.Code, x.CustomerId, CustomerName = x.Customer.Name, x.WarehouseId, WarehouseName = x.Warehouse.Name,
                        x.DeliveryDate, x.Status, LineCount = x.Lines.Count, x.CreatedAt, x.CurrencyCode
                    }).ToListAsync(ct);
                var pricing = await AIERP.Api.DeliveryPricingViews.StandaloneSalesDeliveriesAsync(db, tenantId, standaloneIds, ct);
                var invoices = await db.SalesInvoices.AsNoTracking()
                    .Where(x => x.TenantId == tenantId && x.StandaloneDeliveryId != null && standaloneIds.Contains(x.StandaloneDeliveryId.Value))
                    .Select(x => new { DeliveryId = x.StandaloneDeliveryId!.Value, x.Id, x.Code, x.Status })
                    .ToListAsync(ct);
                var invoiceByDelivery = invoices.GroupBy(x => x.DeliveryId).ToDictionary(x => x.Key, x => x.First());
                foreach (var x in details)
                {
                    var invoice = invoiceByDelivery.GetValueOrDefault(x.Id);
                    rows[x.Id] = new SalesDeliveryListItem(x.Id, "Standalone", true, null, x.Code, null, null, x.CustomerId, x.CustomerName,
                        x.WarehouseId, x.WarehouseName, x.DeliveryDate, x.Status.ToString(), x.LineCount, x.CreatedAt, invoice is not null,
                        invoice?.Id, invoice?.Code, invoice?.Status.ToString()).WithPricing(x.CurrencyCode, pricing[x.Id]);
                }
            }
            var items = pageKeys.Where(x => rows.ContainsKey(x.Id)).Select(x => rows[x.Id]).ToList();
            return Results.Ok(new SalesDeliveryListPage(items, page, pageSize, total));
        }).WithTags("Satış İrsaliyeleri").RequireAuthorization();
    }

    /// <summary>
    /// Whether the caller may read an old delivery list route: the same resolution and evaluation the request permission
    /// handler applies to that route (including its row-filtered collection flag), without its record attributes.
    /// </summary>
    internal static async Task<bool> OldListAllowedAsync(string path, Guid tenantId, Guid userId, string role,
        IPlatformPermissionAuthorizer authorizer, CancellationToken ct)
    {
        if (!PlatformPermissionCatalog.TryResolve(path, "GET", path + "/", new Dictionary<string, string?>(), tenantId, userId, role, out var resolved)
            || resolved is null) return false;
        if (PermissionAuthorizationHandler.IsStatusFilteredCollection("GET", path, resolved.Permission.ResourceType))
            resolved = resolved with
            {
                Attributes = new Dictionary<string, string>(resolved.Attributes, StringComparer.OrdinalIgnoreCase) { ["resource.collectionRowsFiltered"] = "true" }
            };
        return await authorizer.IsAllowedAsync(tenantId, userId, role, resolved, ct);
    }
}
