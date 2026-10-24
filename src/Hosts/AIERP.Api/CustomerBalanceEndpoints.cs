using System.Security.Claims;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

public static class CustomerBalanceEndpoints
{
    public static RouteGroupBuilder MapCustomerBalanceEndpoint(this RouteGroupBuilder customers)
    {
        customers.MapGet("/{id:guid}/balance", async (Guid id, ClaimsPrincipal principal, TenantDbContext db) =>
        {
            if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
            var customer = await db.CustomerAccounts.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id);
            if (customer is null) return Results.NotFound();
            var entries = db.CustomerLedgerEntries.Where(x => x.TenantId == tenantId && x.CustomerId == id);
            var debit = await entries.Where(x => x.Direction == CustomerLedgerDirection.Debit).SumAsync(x => (decimal?)x.Amount) ?? 0m;
            var credit = await entries.Where(x => x.Direction == CustomerLedgerDirection.Credit).SumAsync(x => (decimal?)x.Amount) ?? 0m;
            return Results.Ok(CustomerLedgerBalanceCalculator.Calculate(customer.CurrencyCode, debit, credit, customer.RiskLimit));
        });
        return customers;
    }

    private static bool TryGetTenantId(ClaimsPrincipal principal, out Guid tenantId) =>
        Guid.TryParse(principal.FindFirstValue("tenant_id"), out tenantId);
}
