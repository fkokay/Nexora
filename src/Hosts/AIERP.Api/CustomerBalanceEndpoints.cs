using System.Security.Claims;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

public static class CustomerBalanceEndpoints
{
    public static RouteGroupBuilder MapCustomerBalanceEndpoint(this RouteGroupBuilder customers)
    {
        customers.MapGet("/{id:guid}/balance", async (Guid id, ClaimsPrincipal principal, TenantDbContext db,
            PlatformDbContext platformDb, CancellationToken cancellationToken) =>
        {
            if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
            var userId = TryGetUserId(principal);
            if (userId is null) return Results.Forbid();
            var query = db.CustomerAccounts.AsNoTracking().Where(x => x.TenantId == tenantId && x.Id == id);
            query = await CustomerCollectionPermissionFilter.ApplyAsync(platformDb, tenantId, userId.Value,
                principal.FindFirstValue("role") ?? string.Empty, query, cancellationToken);
            var customer = await query.SingleOrDefaultAsync(cancellationToken);
            if (customer is null) return Results.NotFound();
            var entries = db.CustomerLedgerEntries.Where(x => x.TenantId == tenantId && x.CustomerId == id);
            var debit = await entries.Where(x => x.Direction == CustomerLedgerDirection.Debit).SumAsync(x => (decimal?)x.Amount) ?? 0m;
            var credit = await entries.Where(x => x.Direction == CustomerLedgerDirection.Credit).SumAsync(x => (decimal?)x.Amount) ?? 0m;
            return Results.Ok(CustomerLedgerBalanceCalculator.Calculate(customer.CurrencyCode, debit, credit, customer.RiskLimit));
        });
        return customers;
    }

    /// <summary>
    /// <c>GET /api/customers/counts</c>: the Cari Hesaplar counters in one read (the list screen used one paged request
    /// per counter). Same tenant scope, search and row-visibility filter as the list; type and status are not applied.
    /// </summary>
    public static RouteGroupBuilder MapCustomerCountsEndpoint(this RouteGroupBuilder customers)
    {
        customers.MapGet("/counts", async (string? q, ClaimsPrincipal principal, TenantDbContext db, PlatformDbContext platformDb,
            CancellationToken cancellationToken) =>
        {
            if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
            var userId = TryGetUserId(principal);
            if (userId is null) return Results.Forbid();
            var query = db.CustomerAccounts.AsNoTracking().Where(x => x.TenantId == tenantId);
            query = await CustomerCollectionPermissionFilter.ApplyAsync(platformDb, tenantId, userId.Value,
                principal.FindFirstValue("role") ?? string.Empty, query, cancellationToken);
            if (!string.IsNullOrWhiteSpace(q))
            {
                var term = q.Trim();
                query = query.Where(x => x.Code.Contains(term) || x.Name.Contains(term) || (x.TaxNumber != null && x.TaxNumber.Contains(term)));
            }
            var counts = await query.GroupBy(_ => 1).Select(g => new CustomerCounts(
                g.Count(), g.Count(x => x.IsActive), g.Count(x => !x.IsActive),
                g.Count(x => x.Type == CounterpartyType.Customer), g.Count(x => x.Type == CounterpartyType.Supplier),
                g.Count(x => x.Type == CounterpartyType.Both), g.Count(x => x.Type == CounterpartyType.Dealer),
                g.Count(x => x.Type == CounterpartyType.Employee), g.Count(x => x.IsEInvoiceRegistered),
                g.Count(x => x.RiskLimit != null))).SingleOrDefaultAsync(cancellationToken);
            return Results.Ok(counts ?? new CustomerCounts(0, 0, 0, 0, 0, 0, 0, 0, 0, 0));
        });
        return customers;
    }

    private static Guid? TryGetUserId(ClaimsPrincipal principal) =>
        Guid.TryParse(principal.FindFirstValue(ClaimTypes.NameIdentifier), out var userId) && userId != Guid.Empty
            ? userId
            : Guid.TryParse(principal.FindFirstValue("sub"), out userId) && userId != Guid.Empty ? userId : null;

    private static bool TryGetTenantId(ClaimsPrincipal principal, out Guid tenantId) =>
        Guid.TryParse(principal.FindFirstValue("tenant_id"), out tenantId);
}
