using System.Globalization;
using System.Security.Claims;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace AIERP.Api;

/// <summary>
/// The sales order's state transitions (belge kuralları, PR 1): Onayla (Taslak → Onaylı), Onayı geri al (Onaylı → Taslak) and
/// İptal et. Each runs in one transaction with the order row locked, writes the işlem günlüğü and an audit event, and is
/// idempotent per <see cref="SalesOrderTransitionRequest.RequestId"/>. The routes resolve as <c>erp.sales-orders.execute</c>.
/// </summary>
internal static class SalesOrderTransitionEndpoints
{
    internal const string Approve = "onayla";
    internal const string Unapprove = "onayiGeriAl";
    internal const string Cancel = "iptal";

    internal static void MapSalesOrderTransitionEndpoints(this WebApplication app)
    {
        var orders = app.MapGroup("/api/sales/orders").WithTags("Satış Siparişleri").RequireAuthorization();
        orders.MapPost("/{id:guid}/approve", (Guid id, SalesOrderTransitionRequest? request, ClaimsPrincipal principal, TenantDbContext db, CancellationToken ct) =>
            RunAsync(id, Approve, request ?? new(), principal, db, ct));
        orders.MapPost("/{id:guid}/unapprove", (Guid id, SalesOrderTransitionRequest? request, ClaimsPrincipal principal, TenantDbContext db, CancellationToken ct) =>
            RunAsync(id, Unapprove, request ?? new(), principal, db, ct));
        orders.MapPost("/{id:guid}/cancel", (Guid id, SalesOrderTransitionRequest? request, ClaimsPrincipal principal, TenantDbContext db, CancellationToken ct) =>
            RunAsync(id, Cancel, request ?? new(), principal, db, ct));
    }

    private static async Task<IResult> RunAsync(Guid id, string transition, SalesOrderTransitionRequest request, ClaimsPrincipal principal,
        TenantDbContext db, CancellationToken ct)
    {
        if (!Guid.TryParse(principal.FindFirstValue("tenant_id"), out var tenantId)) return Results.Forbid();
        Guid? userId = Guid.TryParse(principal.FindFirstValue("sub") ?? principal.FindFirstValue(ClaimTypes.NameIdentifier), out var parsed) ? parsed : null;
        var reason = request.Reason?.Trim();
        if (transition == Cancel && (string.IsNullOrEmpty(reason) || reason.Length > 500))
            return Results.ValidationProblem(new Dictionary<string, string[]> { ["reason"] = ["İptal gerekçesi 1–500 karakter olmalıdır."] });

        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var order = db.Database.IsRelational()
            ? await db.SalesOrders.FromSqlInterpolated($"SELECT * FROM [dbo].[SalesOrders] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync(ct)
            : await db.SalesOrders.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
        if (order is null) return Results.NotFound();
        if (request.RequestId is { } requestId && await db.TenantDocumentActivities.AnyAsync(x => x.TenantId == tenantId
                && x.DocumentType == DocumentActivityLog.SalesOrder && x.DocumentId == id && x.Transition == transition && x.RequestId == requestId, ct))
            return Results.Ok(new SalesOrderTransitionResult(order.Id, order.Code, order.Status, []));

        // Only posted documents count: an order whose deliveries / invoices were all voided can be cancelled or unapproved again.
        var hasDeliveries = await db.SalesDeliveries.AnyAsync(x => x.TenantId == tenantId && x.OrderId == id && x.Status == SalesDeliveryStatus.Posted, ct);
        var hasInvoices = await db.SalesInvoices.AnyAsync(x => x.TenantId == tenantId && x.OrderId == id && x.Status == SalesInvoiceStatus.Posted, ct);
        var warnings = new List<string>();
        switch (transition)
        {
            case Approve:
                if (!SalesOrderLifecycle.CanApprove(order.Status))
                    return Results.Conflict(new { error = "Yalnızca taslak siparişler onaylanabilir." });
                if (await ApproveChecksAsync(db, tenantId, order, warnings, ct) is { } failed) return failed;
                DocumentActivityLog.Add(db, tenantId, DocumentActivityLog.SalesOrder, id, transition, "Kontroller", "core", "done",
                    "Zorunlu alanlar, satırlar ve cari risk limiti", userId);
                foreach (var warning in warnings)
                    DocumentActivityLog.Add(db, tenantId, DocumentActivityLog.SalesOrder, id, transition, "Stok yeterliliği", "core", "warned", warning, userId);
                order.Status = SalesOrderStatus.Open;
                DocumentActivityLog.Add(db, tenantId, DocumentActivityLog.SalesOrder, id, transition, "Onaylandı", "core", "done", null, userId, request.RequestId);
                db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "sales-order.approved", Resource = order.Code });
                break;
            case Unapprove:
                var hasReservations = await db.SalesOrderReservations.AnyAsync(x => x.TenantId == tenantId && x.OrderId == id, ct);
                if (!SalesOrderLifecycle.CanUnapprove(order.Status, hasDeliveries, hasInvoices, hasReservations))
                    return Results.Conflict(new { error = "Yalnızca sevkiyat, fatura veya rezervasyonu olmayan onaylı siparişin onayı geri alınabilir." });
                order.Status = SalesOrderStatus.Draft;
                DocumentActivityLog.Add(db, tenantId, DocumentActivityLog.SalesOrder, id, transition, "Taslağa alındı", "core", "done", null, userId, request.RequestId);
                db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "sales-order.unapproved", Resource = order.Code });
                break;
            default:
                if (!SalesOrderLifecycle.CanCancel(order.Status, hasDeliveries || hasInvoices))
                    return Results.Conflict(new { error = "Yalnızca taslak ya da sevk kaydı olmayan onaylı sipariş iptal edilebilir." });
                var now = DateTimeOffset.UtcNow;
                var active = await db.SalesOrderReservations.Where(x => x.TenantId == tenantId && x.OrderId == id
                    && x.Status == SalesOrderReservationStatus.Active).ToListAsync(ct);
                foreach (var reservation in active) { reservation.Status = SalesOrderReservationStatus.Released; reservation.ReleasedAt = now; }
                if (active.Count > 0)
                    DocumentActivityLog.Add(db, tenantId, DocumentActivityLog.SalesOrder, id, transition, "Stok rezervasyonu bırakıldı", "core", "done", null, userId);
                order.Status = SalesOrderStatus.Cancelled;
                DocumentActivityLog.Add(db, tenantId, DocumentActivityLog.SalesOrder, id, transition, "İptal edildi", "core", "done", reason, userId, request.RequestId);
                db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "sales-order.cancelled",
                    Resource = AuditResourceSanitizer.Sanitize($"{order.Code}:{reason}") });
                break;
        }
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        return Results.Ok(new SalesOrderTransitionResult(order.Id, order.Code, order.Status, warnings));
    }

    /// <summary>
    /// The core checks of Onayla, in the write's wording: the draft still satisfies the write validation (active sales customer in the
    /// order currency, active salesperson, active stock cards, 1–200 lines, required custom fields) and the customer's risk limit. Short
    /// stock is a warning, not a block. Amounts were normalized at the order date with that date's rates, so they are not re-derived.
    /// </summary>
    private static async Task<IResult?> ApproveChecksAsync(TenantDbContext db, Guid tenantId, SalesOrder order, List<string> warnings, CancellationToken ct)
    {
        var lines = await db.SalesOrderLines.AsNoTracking().Where(x => x.TenantId == tenantId && x.OrderId == order.Id).ToListAsync(ct);
        if (lines.Count is < 1 or > 200)
            return Results.ValidationProblem(new Dictionary<string, string[]> { ["lines"] = ["Sipariş 1–200 stok satırı içermelidir."] });
        var customer = await db.CustomerAccounts.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == order.CustomerId && x.IsActive, ct);
        if (customer is null || customer.Type is not (CounterpartyType.Customer or CounterpartyType.Both or CounterpartyType.Dealer))
            return Results.ValidationProblem(new Dictionary<string, string[]> { ["customerId"] = ["Aktif müşteri türünde bir cari seçilmelidir."] });
        if (order.CurrencyCode != customer.CurrencyCode)
            return Results.ValidationProblem(new Dictionary<string, string[]> { ["currencyCode"] = [$"Sipariş dövizi seçilen carinin döviziyle ({customer.CurrencyCode}) aynı olmalıdır."] });
        if (order.SalespersonEmployeeId is { } salespersonId && !await db.EmployeeRecords.AsNoTracking()
                .AnyAsync(x => x.TenantId == tenantId && x.Id == salespersonId && x.Status == EmployeeEmploymentStatus.Active, ct))
            return Results.ValidationProblem(new Dictionary<string, string[]> { ["salespersonEmployeeId"] = ["Aktif bir plasiyer seçilmelidir."] });
        var itemIds = lines.Select(x => x.StockItemId).Distinct().ToArray();
        var activeItems = await db.StockItems.AsNoTracking().CountAsync(x => x.TenantId == tenantId && x.IsActive && itemIds.Contains(x.Id), ct);
        if (activeItems != itemIds.Length)
            return Results.ValidationProblem(new Dictionary<string, string[]> { ["lines"] = ["Satırlardaki stok kartlarından biri bulunamadı veya pasif."] });
        var missing = await db.SalesOrderCustomFieldDefinitions.AsNoTracking()
            .Where(x => x.TenantId == tenantId && x.IsActive && x.IsRequired
                && !db.SalesOrderCustomFieldValues.Any(v => v.TenantId == tenantId && v.OrderId == order.Id && v.DefinitionId == x.Id && v.Value != ""))
            .Select(x => new { x.Code, x.Label }).FirstOrDefaultAsync(ct);
        if (missing is not null)
            return Results.ValidationProblem(new Dictionary<string, string[]> { [$"customFields.{missing.Code}"] = [$"'{missing.Label}' alanı zorunludur."] });

        if (await CustomerRiskLimit.ProjectAsync(db, tenantId, customer, order.GrandTotal, ct) is { Exceeded: true } risk)
            return Results.Conflict(new { error = "Sipariş tutarı müşteri risk limitini aşacağı için onaylanamadı.",
                currentBalance = risk.CurrentBalance, projectedBalance = risk.ProjectedBalance, riskLimit = risk.Limit });

        var available = await StockAvailability.AvailableAsync(db, tenantId, itemIds, ct);
        foreach (var group in lines.GroupBy(x => new { x.StockItemId, x.StockCode, x.UnitCode }))
        {
            var requested = group.Sum(x => x.Quantity);
            var free = available.GetValueOrDefault(group.Key.StockItemId);
            if (requested > free)
                warnings.Add(string.Create(CultureInfo.GetCultureInfo("tr-TR"),
                    $"{group.Key.StockCode}: kullanılabilir {free:0.####} {group.Key.UnitCode}, istenen {requested:0.####} {group.Key.UnitCode}"));
        }
        return null;
    }
}

/// <summary>The customer risk limit rule shared by invoices (from delivery) and order approval: debit − credit + amount &gt; limit.</summary>
internal static class CustomerRiskLimit
{
    internal sealed record Projection(bool Exceeded, decimal CurrentBalance, decimal ProjectedBalance, decimal Limit);

    internal static async Task<Projection?> ProjectAsync(TenantDbContext db, Guid tenantId, CustomerAccount customer, decimal amount, CancellationToken ct)
    {
        if (customer.RiskLimit is not { } limit || customer.Type is not (CounterpartyType.Customer or CounterpartyType.Both or CounterpartyType.Dealer)) return null;
        var debit = await db.CustomerLedgerEntries.Where(x => x.TenantId == tenantId && x.CustomerId == customer.Id && x.Direction == CustomerLedgerDirection.Debit)
            .SumAsync(x => (decimal?)x.Amount, ct) ?? 0m;
        var credit = await db.CustomerLedgerEntries.Where(x => x.TenantId == tenantId && x.CustomerId == customer.Id && x.Direction == CustomerLedgerDirection.Credit)
            .SumAsync(x => (decimal?)x.Amount, ct) ?? 0m;
        var projected = debit - credit + amount;
        return new Projection(projected > limit, debit - credit, projected, limit);
    }
}

/// <summary>Free stock per stock card in base units: balance in active warehouses minus active reservations there (lots and locations ignored).</summary>
internal static class StockAvailability
{
    internal static async Task<Dictionary<Guid, decimal>> AvailableAsync(TenantDbContext db, Guid tenantId, IReadOnlyCollection<Guid> stockItemIds, CancellationToken ct)
    {
        var activeWarehouses = db.Warehouses.Where(x => x.TenantId == tenantId && x.IsActive).Select(x => x.Id);
        var balances = await db.InventoryTransactions.AsNoTracking()
            .Where(x => x.TenantId == tenantId && stockItemIds.Contains(x.StockItemId) && activeWarehouses.Contains(x.WarehouseId))
            .GroupBy(x => x.StockItemId)
            .Select(g => new { g.Key, Quantity = g.Sum(x => x.Direction == InventoryDirection.Receipt ? x.Quantity : -x.Quantity) })
            .ToListAsync(ct);
        var reserved = await (from reservation in db.SalesOrderReservations.AsNoTracking()
                              join line in db.SalesOrderLines.AsNoTracking()
                                  on new { reservation.TenantId, reservation.OrderId, LineNumber = reservation.OrderLineNumber }
                                  equals new { line.TenantId, line.OrderId, line.LineNumber }
                              where reservation.TenantId == tenantId && reservation.Status == SalesOrderReservationStatus.Active
                                  && stockItemIds.Contains(line.StockItemId) && activeWarehouses.Contains(reservation.WarehouseId)
                              group reservation by line.StockItemId into g
                              select new { g.Key, Quantity = g.Sum(x => x.Quantity - x.FulfilledQuantity) }).ToListAsync(ct);
        var result = stockItemIds.ToDictionary(x => x, _ => 0m);
        foreach (var row in balances) result[row.Key] += row.Quantity;
        foreach (var row in reserved) result[row.Key] -= row.Quantity;
        return result;
    }
}
