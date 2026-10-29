using System.Security.Claims;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

internal sealed class PermissionRequirement : IAuthorizationRequirement;

internal sealed class PermissionAuthorizationHandler(IPlatformPermissionAuthorizer authorizer)
    : AuthorizationHandler<PermissionRequirement>
{
    protected override async Task HandleRequirementAsync(AuthorizationHandlerContext context, PermissionRequirement requirement)
    {
        if (context.Resource is not HttpContext http || context.User.Identity?.IsAuthenticated != true) return;
        if (string.Equals(http.Request.Path.Value, "/api/auth/select-tenant", StringComparison.OrdinalIgnoreCase))
        {
            context.Succeed(requirement);
            return;
        }
        if (!Guid.TryParse(context.User.FindFirstValue("tenant_id"), out var tenantId)
            || !Guid.TryParse(context.User.FindFirstValue("sub"), out var userId)) return;
        var role = context.User.FindFirstValue("role");
        if (string.IsNullOrWhiteSpace(role)) return;
        if (http.Request.Path.StartsWithSegments("/api/tenant-license"))
        {
            // Company license routes are intentionally restricted to the current tenant admin.
            // They are not part of the configurable permission catalog because license changes
            // must not be granted through ordinary per-user or per-role permission rules.
            if (string.Equals(role, "TenantAdmin", StringComparison.Ordinal)
                && await authorizer.IsAllowedAsync(tenantId, userId, role,
                    new ResolvedPlatformPermission(
                        new PlatformPermissionDefinition("erp.tenant-license.manage", "erp.tenant-license", "manage", "Company license and quota management"),
                        new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)), http.RequestAborted))
                context.Succeed(requirement);
            return;
        }
        var routeValues = http.Request.RouteValues.ToDictionary(x => x.Key, x => x.Value?.ToString(), StringComparer.OrdinalIgnoreCase);
        var routePattern = (http.GetEndpoint() as RouteEndpoint)?.RoutePattern.RawText ?? string.Empty;
        if (!PlatformPermissionCatalog.TryResolve(http.Request.Path.Value ?? string.Empty, http.Request.Method,
                routePattern, routeValues, tenantId, userId, role, out var resolved) || resolved is null) return;
        if (IsStatusFilteredCollection(http.Request.Method, http.Request.Path.Value, resolved.Permission.ResourceType))
        {
            var attributes = new Dictionary<string, string>(resolved.Attributes, StringComparer.OrdinalIgnoreCase)
            {
                ["resource.collectionRowsFiltered"] = "true"
            };
            resolved = resolved with { Attributes = attributes };
        }
        if (!string.Equals(role, "TenantAdmin", StringComparison.Ordinal)
            && routeValues.TryGetValue("id", out var rawId) && Guid.TryParse(rawId, out var resourceId))
        {
            // Resolve the tenant database only for resource-level checks. Authentication
            // and tenant selection run before a tenant database has been selected.
            var tenantDb = http.RequestServices.GetRequiredService<TenantDbContext>();
            var resourceAttributes = await ResolveResourceAttributesAsync(tenantDb, tenantId, resolved.Permission.ResourceType, resourceId, http.RequestAborted);
            if (resourceAttributes is not null)
            {
                var attributes = new Dictionary<string, string>(resolved.Attributes, StringComparer.OrdinalIgnoreCase);
                foreach (var (key, value) in resourceAttributes) attributes[key] = value;
                resolved = resolved with { Attributes = attributes };
            }
        }
        if (await authorizer.IsAllowedAsync(tenantId, userId, role, resolved, http.RequestAborted)) context.Succeed(requirement);
    }

    private static bool IsStatusFilteredCollection(string method, string? path, string resourceType)
    {
        if (!string.Equals(method, "GET", StringComparison.OrdinalIgnoreCase) || path is null) return false;
        var route = path.TrimEnd('/');
        return (resourceType, route) is
            ("erp.customers", "/api/customers") or
            ("erp.sales-deliveries", "/api/sales/standalone-deliveries") or
            ("erp.purchase-receipts", "/api/purchasing/standalone-receipts") or
            ("erp.sales-quotes", "/api/sales/quotes") or
            ("erp.sales-orders", "/api/sales/orders") or
            ("erp.sales-invoices", "/api/sales/invoices") or
            ("erp.purchase-requests", "/api/purchasing/requests") or
            ("erp.purchase-orders", "/api/purchasing/orders") or
            ("erp.purchase-invoices", "/api/purchasing/invoices") or
            ("erp.purchase-invoices", "/api/purchasing/standalone-invoices") or
            ("erp.purchase-invoices", "/api/purchasing/standalone-invoices/suppliers");
    }

    private static async Task<Dictionary<string, string>?> ResolveResourceAttributesAsync(TenantDbContext db, Guid tenantId, string resourceType, Guid id,
        CancellationToken cancellationToken)
    {
        if (resourceType == "erp.sales-quotes")
        {
            var value = await db.SalesQuotes.AsNoTracking().Where(x => x.TenantId == tenantId && x.Id == id)
                .Select(x => new { x.Status, x.CustomerId }).SingleOrDefaultAsync(cancellationToken);
            return value is null ? null : ResourceAttributes(value.Status.ToString(), customerId: value.CustomerId);
        }
        if (resourceType == "erp.sales-orders")
        {
            var value = await db.SalesOrders.AsNoTracking().Where(x => x.TenantId == tenantId && x.Id == id)
                .Select(x => new { x.Status, x.CustomerId }).SingleOrDefaultAsync(cancellationToken);
            return value is null ? null : ResourceAttributes(value.Status.ToString(), customerId: value.CustomerId);
        }
        if (resourceType == "erp.purchase-requests")
        {
            var value = await db.PurchaseRequests.AsNoTracking().Where(x => x.TenantId == tenantId && x.Id == id)
                .Select(x => new { x.Status, OwnerUserId = x.RequestedByUserId }).SingleOrDefaultAsync(cancellationToken);
            return value is null ? null : ResourceAttributes(value.Status.ToString(), ownerUserId: value.OwnerUserId);
        }
        if (resourceType == "erp.purchase-orders")
        {
            var value = await db.PurchaseOrders.AsNoTracking().Where(x => x.TenantId == tenantId && x.Id == id)
                .Select(x => new { x.Status, x.SupplierId }).SingleOrDefaultAsync(cancellationToken);
            return value is null ? null : ResourceAttributes(value.Status.ToString(), supplierId: value.SupplierId);
        }
        if (resourceType == "erp.sales-invoices")
        {
            var value = await db.SalesInvoices.AsNoTracking().Where(x => x.TenantId == tenantId && x.Id == id)
                .Select(x => new { x.Status, x.CustomerId }).SingleOrDefaultAsync(cancellationToken);
            return value is null ? null : ResourceAttributes(value.Status.ToString(), customerId: value.CustomerId);
        }
        if (resourceType == "erp.sales-deliveries")
        {
            var value = await db.StandaloneSalesDeliveries.AsNoTracking().Where(x => x.TenantId == tenantId && x.Id == id)
                .Select(x => new { x.Status, x.CustomerId }).SingleOrDefaultAsync(cancellationToken);
            return value is null ? null : ResourceAttributes(value.Status.ToString(), customerId: value.CustomerId);
        }
        if (resourceType == "erp.purchase-receipts")
        {
            var value = await db.StandalonePurchaseReceipts.AsNoTracking().Where(x => x.TenantId == tenantId && x.Id == id)
                .Select(x => new { x.Status, x.SupplierId }).SingleOrDefaultAsync(cancellationToken);
            return value is null ? null : ResourceAttributes(value.Status.ToString(), supplierId: value.SupplierId);
        }
        if (resourceType == "erp.purchase-invoices")
        {
            var value = await db.PurchaseInvoices.AsNoTracking().Where(x => x.TenantId == tenantId && x.Id == id)
                .Select(x => new { x.Status, x.SupplierId }).SingleOrDefaultAsync(cancellationToken);
            if (value is not null) return ResourceAttributes(value.Status.ToString(), supplierId: value.SupplierId);
            var draft = await db.PurchaseInvoiceDrafts.AsNoTracking().Where(x => x.TenantId == tenantId && x.Id == id)
                .Select(x => new { x.Status, x.SupplierId }).SingleOrDefaultAsync(cancellationToken);
            return draft is null ? null : ResourceAttributes(draft.Status.ToString(), supplierId: draft.SupplierId);
        }
        if (resourceType == "erp.customers")
        {
            // Customer detail and balance routes share the same {id} route value.
            // Resolve the tenant-owned account before evaluating record-level rules;
            // never trust a caller-supplied customerId attribute for these APIs.
            var value = await db.CustomerAccounts.AsNoTracking().Where(x => x.TenantId == tenantId && x.Id == id)
                .Select(x => new { x.Type, x.IsActive }).SingleOrDefaultAsync(cancellationToken);
            return value is null ? null : CustomerResourceAttributes(id, value.Type.ToString(), value.IsActive);
        }
        return null;
    }

    private static Dictionary<string, string> CustomerResourceAttributes(Guid customerId, string customerType, bool isActive) =>
        new(StringComparer.OrdinalIgnoreCase)
        {
            ["resource.customerId"] = customerId.ToString("D"),
            ["resource.customerType"] = customerType,
            ["resource.customerActive"] = isActive.ToString().ToLowerInvariant()
        };

    private static Dictionary<string, string> ResourceAttributes(string status, Guid? customerId = null,
        Guid? supplierId = null, Guid? ownerUserId = null)
    {
        var attributes = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase) { ["resource.status"] = status };
        if (customerId is not null) attributes["resource.customerId"] = customerId.Value.ToString("D");
        if (supplierId is not null) attributes["resource.supplierId"] = supplierId.Value.ToString("D");
        if (ownerUserId is not null) attributes["resource.ownerUserId"] = ownerUserId.Value.ToString("D");
        return attributes;
    }
}
