using System.Security.Claims;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

internal static class CustomerRowVisibilityEndpointFilter
{
    public static RouteGroupBuilder RequireVisibleCustomerRows(this RouteGroupBuilder customers)
    {
        customers.AddEndpointFilter(async (context, next) =>
        {
            var httpContext = context.HttpContext;
            if (!HttpMethods.IsGet(httpContext.Request.Method)
                || !httpContext.Request.RouteValues.TryGetValue("id", out var routeCustomerId)
                || !Guid.TryParse(routeCustomerId?.ToString(), out var customerId))
                return await next(context);

            var principal = httpContext.User;
            if (!Guid.TryParse(principal.FindFirstValue("tenant_id"), out var tenantId))
                return Results.Forbid();
            var userId = GetUserId(principal);
            if (userId is null) return Results.Forbid();

            var db = httpContext.RequestServices.GetRequiredService<TenantDbContext>();
            var platformDb = httpContext.RequestServices.GetRequiredService<PlatformDbContext>();
            var cancellationToken = httpContext.RequestAborted;
            var query = db.CustomerAccounts.AsNoTracking().Where(x => x.TenantId == tenantId && x.Id == customerId);
            query = await CustomerCollectionPermissionFilter.ApplyAsync(platformDb, tenantId, userId.Value,
                principal.FindFirstValue("role") ?? string.Empty, query, cancellationToken);
            return await query.AnyAsync(cancellationToken) ? await next(context) : Results.NotFound();
        });
        return customers;
    }

    private static Guid? GetUserId(ClaimsPrincipal principal) =>
        Guid.TryParse(principal.FindFirstValue(ClaimTypes.NameIdentifier) ?? principal.FindFirstValue("sub"), out var id)
            && id != Guid.Empty ? id : null;
}
