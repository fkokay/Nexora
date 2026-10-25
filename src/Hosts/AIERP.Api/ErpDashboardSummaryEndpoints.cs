using System.Security.Claims;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

internal static class ErpDashboardSummaryEndpoints
{
    public static void MapErpDashboardSummaryEndpoints(this WebApplication app)
    {
        app.MapGet("/api/dashboard/erp-summary", async (ClaimsPrincipal user, TenantDbContext db,
            PlatformDbContext platformDb, IPlatformPermissionAuthorizer authorizer, CancellationToken ct) =>
        {
            if (!Guid.TryParse(user.FindFirstValue("tenant_id"), out var tenantId)
                || !Guid.TryParse(user.FindFirstValue("sub") ?? user.FindFirstValue(ClaimTypes.NameIdentifier), out var userId)
                || string.IsNullOrWhiteSpace(user.FindFirstValue("role"))) return Results.Forbid();

            var role = user.FindFirstValue("role")!;
            var baseCurrencyCode = await db.Tenants.AsNoTracking().Where(x => x.Id == tenantId)
                .Select(x => x.BaseCurrencyCode).SingleOrDefaultAsync(ct);
            // A few older provisioned tenant databases do not contain their local
            // Tenant catalogue row. The platform tenant record supplies its default.
            if (string.IsNullOrWhiteSpace(baseCurrencyCode))
                baseCurrencyCode = await platformDb.Tenants.AsNoTracking().Where(x => x.Id == tenantId && x.IsActive)
                    .Select(x => x.BaseCurrencyCode).SingleOrDefaultAsync(ct);
            if (string.IsNullOrWhiteSpace(baseCurrencyCode)) return Results.NotFound(new { error = "Firma baz para birimi bulunamadı." });

            async Task<bool> CanRead(string permissionCode, bool collectionRowsFiltered = false)
            {
                var permission = PlatformPermissionCatalog.Definitions.FirstOrDefault(x => x.Code == permissionCode);
                if (permission is null) return false;
                var attributes = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
                {
                    ["subject.userId"] = userId.ToString("D"), ["subject.role"] = role,
                    ["resource.type"] = permission.ResourceType, ["resource.tenantId"] = tenantId.ToString("D"),
                    ["request.method"] = "GET", ["request.action"] = "read"
                };
                if (collectionRowsFiltered) attributes["resource.collectionRowsFiltered"] = "true";
                return await authorizer.IsAllowedAsync(tenantId, userId, role,
                    new ResolvedPlatformPermission(permission, attributes), ct);
            }

            var canReadSalesOrders = await CanRead("erp.sales-orders.read", collectionRowsFiltered: true);
            var canReadSalesInvoices = await CanRead("erp.sales-invoices.read", collectionRowsFiltered: true);
            var canReadPurchaseOrders = await CanRead("erp.purchase-orders.read", collectionRowsFiltered: true);
            var canReadPurchaseInvoices = await CanRead("erp.purchase-invoices.read", collectionRowsFiltered: true);
            var canReadWarehouses = await CanRead("erp.warehouses.read");
            var canReadStockItems = await CanRead("erp.stock-items.read");

            var today = DateOnly.FromDateTime(DateTime.UtcNow);
            var currentMonth = new DateOnly(today.Year, today.Month, 1);
            var firstMonth = currentMonth.AddMonths(-5);
            var nextMonth = currentMonth.AddMonths(1);
            IReadOnlyList<ErpDashboardMonthTotal> EmptyMonths() => Enumerable.Range(0, 6)
                .Select(index => new ErpDashboardMonthTotal(firstMonth.AddMonths(index).Year,
                    firstMonth.AddMonths(index).Month, 0m)).ToArray();

            IReadOnlyList<ErpDashboardCurrencyTotal> salesInvoiceTotals = [];
            IReadOnlyList<ErpDashboardMonthTotal> monthlySales = EmptyMonths();
            IReadOnlyList<ErpDashboardRecentOrder> recentSalesOrders = [];
            int? openSalesOrderCount = null;
            if (canReadSalesInvoices)
            {
                var invoices = db.SalesInvoices.AsNoTracking().Where(x => x.TenantId == tenantId && x.Status == SalesInvoiceStatus.Posted);
                invoices = await PermissionStatusFilter.ApplyAsync(platformDb, tenantId, userId, role,
                    "erp.sales-invoices.read", "erp.sales-invoices", invoices, x => x.Status, x => x.CustomerId,
                    cancellationToken: ct) ?? invoices;
                var totalRows = await invoices.GroupBy(x => x.CurrencyCode)
                    .Select(group => new { CurrencyCode = group.Key, Amount = group.Sum(x => x.GrandTotal), Count = group.Count() })
                    .ToListAsync(ct);
                salesInvoiceTotals = totalRows.OrderBy(x => x.CurrencyCode)
                    .Select(x => new ErpDashboardCurrencyTotal(x.CurrencyCode, x.Amount, x.Count)).ToArray();
                var monthRows = await invoices.Where(x => x.CurrencyCode == baseCurrencyCode
                        && x.InvoiceDate >= firstMonth && x.InvoiceDate < nextMonth)
                    .GroupBy(x => new { x.InvoiceDate.Year, x.InvoiceDate.Month })
                    .Select(group => new { group.Key.Year, group.Key.Month, Amount = group.Sum(x => x.GrandTotal) })
                    .ToListAsync(ct);
                monthlySales = MergeMonths(firstMonth, monthRows.Select(x => new ErpDashboardMonthTotal(x.Year, x.Month, x.Amount)));
            }

            IReadOnlyList<ErpDashboardMonthTotal> monthlyPurchases = EmptyMonths();
            if (canReadPurchaseInvoices)
            {
                var invoices = db.PurchaseInvoices.AsNoTracking().Where(x => x.TenantId == tenantId && x.Status == PurchaseInvoiceStatus.Posted);
                invoices = await PermissionStatusFilter.ApplyAsync(platformDb, tenantId, userId, role,
                    "erp.purchase-invoices.read", "erp.purchase-invoices", invoices, x => x.Status,
                    supplierSelector: x => x.SupplierId, cancellationToken: ct) ?? invoices;
                var monthRows = await invoices.Where(x => x.CurrencyCode == baseCurrencyCode
                        && x.InvoiceDate >= firstMonth && x.InvoiceDate < nextMonth)
                    .GroupBy(x => new { x.InvoiceDate.Year, x.InvoiceDate.Month })
                    .Select(group => new { group.Key.Year, group.Key.Month, Amount = group.Sum(x => x.GrandTotal) })
                    .ToListAsync(ct);
                monthlyPurchases = MergeMonths(firstMonth, monthRows.Select(x => new ErpDashboardMonthTotal(x.Year, x.Month, x.Amount)));
            }

            IReadOnlyList<ErpDashboardCurrencyTotal> openPurchaseTotals = [];
            int? openPurchaseOrderCount = null;
            if (canReadPurchaseOrders)
            {
                var orders = db.PurchaseOrders.AsNoTracking().Where(x => x.TenantId == tenantId
                    && (x.Status == PurchaseOrderStatus.Open || x.Status == PurchaseOrderStatus.PartiallyReceived));
                orders = await PermissionStatusFilter.ApplyAsync(platformDb, tenantId, userId, role,
                    "erp.purchase-orders.read", "erp.purchase-orders", orders, x => x.Status,
                    supplierSelector: x => x.SupplierId, cancellationToken: ct) ?? orders;
                var totalRows = await orders.GroupBy(x => x.CurrencyCode)
                    .Select(group => new { CurrencyCode = group.Key, Amount = group.Sum(x => x.GrandTotal), Count = group.Count() })
                    .ToListAsync(ct);
                openPurchaseTotals = totalRows.OrderBy(x => x.CurrencyCode)
                    .Select(x => new ErpDashboardCurrencyTotal(x.CurrencyCode, x.Amount, x.Count)).ToArray();
                openPurchaseOrderCount = openPurchaseTotals.Sum(x => x.Count);
            }

            if (canReadSalesOrders)
            {
                var orders = db.SalesOrders.AsNoTracking().Where(x => x.TenantId == tenantId && x.Status == SalesOrderStatus.Open);
                orders = await PermissionStatusFilter.ApplyAsync(platformDb, tenantId, userId, role,
                    "erp.sales-orders.read", "erp.sales-orders", orders, x => x.Status, x => x.CustomerId,
                    cancellationToken: ct) ?? orders;
                openSalesOrderCount = await orders.CountAsync(ct);
                recentSalesOrders = await orders.OrderByDescending(x => x.OrderDate).ThenByDescending(x => x.CreatedAt)
                    .Take(5).Select(x => new ErpDashboardRecentOrder(x.Id, x.Code, x.OrderDate,
                        x.Customer.Name, x.GrandTotal, x.CurrencyCode)).ToListAsync(ct);
            }

            // Aggregates cannot safely honor item-by-item warehouse/stock-card rules. In that
            // case hide the inventory block instead of revealing totals over unauthorized rows.
            var hasInventoryRowScopes = !string.Equals(role, "TenantAdmin", StringComparison.Ordinal)
                && await platformDb.TenantPermissionRules.AsNoTracking().AnyAsync(x => x.TenantId == tenantId && x.IsActive
                    && (x.SubjectUserId == userId || x.SubjectRole == role)
                    && (x.PermissionCode == "erp.stock-items.read" || x.PermissionCode == "erp.warehouses.read")
                    && x.AttributeName != null && x.AttributeName.ToLower().StartsWith("resource.")
                    && !x.AttributeName.ToLower().StartsWith("resource.route."), ct);
            var canReadInventory = canReadWarehouses && canReadStockItems && !hasInventoryRowScopes;
            decimal? inventoryValueBase = null;
            int? activeStockItemCount = null;
            int? activeWarehouseCount = null;
            IReadOnlyList<ErpDashboardStockItem> topStockItems = [];
            if (canReadInventory)
            {
                var activeWarehouses = db.Warehouses.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive);
                var activeItems = db.StockItems.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive);
                activeWarehouseCount = await activeWarehouses.CountAsync(ct);
                activeStockItemCount = await activeItems.CountAsync(ct);

                var movementValues = db.InventoryTransactions.AsNoTracking()
                    .Where(x => x.TenantId == tenantId && activeWarehouses.Select(w => w.Id).Contains(x.WarehouseId))
                    .GroupBy(x => x.StockItemId)
                    .Select(group => new { StockItemId = group.Key, Amount = group.Sum(x =>
                        (x.UnitCostBase ?? 0m) * (x.Direction == InventoryDirection.Receipt ? x.Quantity : -x.Quantity)) });
                var adjustmentValues = db.InventoryCostAdjustmentLines.AsNoTracking()
                    .Where(x => x.TenantId == tenantId && activeWarehouses.Select(w => w.Id).Contains(x.WarehouseId))
                    .GroupBy(x => x.StockItemId)
                    .Select(group => new { StockItemId = group.Key, Amount = group.Sum(x => x.AmountBase) });
                var values = from item in activeItems
                    join movement in movementValues on item.Id equals movement.StockItemId into movementGroup
                    from movement in movementGroup.DefaultIfEmpty()
                    join adjustment in adjustmentValues on item.Id equals adjustment.StockItemId into adjustmentGroup
                    from adjustment in adjustmentGroup.DefaultIfEmpty()
                    select new { item.Id, item.Code, item.Name,
                        Amount = (movement == null ? 0m : movement.Amount) + (adjustment == null ? 0m : adjustment.Amount) };
                // Keep the overall aggregate separate from the left-joined per-item query.
                // SQL Server's EF provider cannot translate Sum over that joined projection.
                var movementTotal = await movementValues.Select(x => x.Amount).SumAsync(ct);
                var adjustmentTotal = await adjustmentValues.Select(x => x.Amount).SumAsync(ct);
                inventoryValueBase = movementTotal + adjustmentTotal;
                // SQL Server translates the left-joined projection, but not predicates/orderings
                // over its nullable aggregate expression. Materialize only the per-item summary
                // rows (one per active stock card), then rank that compact projection here.
                var itemValues = await values.ToListAsync(ct);
                var topRows = itemValues.Where(x => x.Amount != 0m).OrderByDescending(x => x.Amount)
                    .ThenBy(x => x.Code).Take(5).ToArray();
                topStockItems = topRows.Select(x => new ErpDashboardStockItem(x.Id, x.Code, x.Name, x.Amount)).ToArray();
            }

            return Results.Ok(new ErpDashboardSummaryView(baseCurrencyCode,
                canReadSalesInvoices, salesInvoiceTotals, monthlySales,
                canReadSalesOrders, openSalesOrderCount, recentSalesOrders,
                canReadPurchaseInvoices, monthlyPurchases,
                canReadPurchaseOrders, openPurchaseOrderCount, openPurchaseTotals,
                canReadInventory, inventoryValueBase, activeStockItemCount, activeWarehouseCount, topStockItems));
        }).RequireAuthorization();
    }

    private static IReadOnlyList<ErpDashboardMonthTotal> MergeMonths(DateOnly firstMonth,
        IEnumerable<ErpDashboardMonthTotal> rows)
    {
        var totals = rows.ToDictionary(x => (x.Year, x.Month), x => x.Amount);
        return Enumerable.Range(0, 6).Select(index =>
        {
            var date = firstMonth.AddMonths(index);
            return new ErpDashboardMonthTotal(date.Year, date.Month, totals.GetValueOrDefault((date.Year, date.Month)));
        }).ToArray();
    }
}

public sealed record ErpDashboardSummaryView(string BaseCurrencyCode,
    bool CanReadSalesInvoices, IReadOnlyList<ErpDashboardCurrencyTotal> SalesInvoiceTotals,
    IReadOnlyList<ErpDashboardMonthTotal> MonthlySalesInvoices,
    bool CanReadSalesOrders, int? OpenSalesOrderCount, IReadOnlyList<ErpDashboardRecentOrder> RecentOpenSalesOrders,
    bool CanReadPurchaseInvoices, IReadOnlyList<ErpDashboardMonthTotal> MonthlyPurchaseInvoices,
    bool CanReadPurchaseOrders, int? OpenPurchaseOrderCount, IReadOnlyList<ErpDashboardCurrencyTotal> OpenPurchaseOrderTotals,
    bool CanReadInventory, decimal? InventoryValueBase, int? ActiveStockItemCount, int? ActiveWarehouseCount,
    IReadOnlyList<ErpDashboardStockItem> TopStockItems);

public sealed record ErpDashboardCurrencyTotal(string CurrencyCode, decimal Amount, int Count);
public sealed record ErpDashboardMonthTotal(int Year, int Month, decimal Amount);
public sealed record ErpDashboardRecentOrder(Guid Id, string Code, DateOnly OrderDate, string CustomerName,
    decimal GrandTotal, string CurrencyCode);
public sealed record ErpDashboardStockItem(Guid Id, string Code, string Name, decimal AmountBase);
