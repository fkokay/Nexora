using System.Security.Claims;
using AIERP.Platform.Application;
using Microsoft.AspNetCore.Authorization;

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
        var routeValues = http.Request.RouteValues.ToDictionary(x => x.Key, x => x.Value?.ToString(), StringComparer.OrdinalIgnoreCase);
        var routePattern = (http.GetEndpoint() as RouteEndpoint)?.RoutePattern.RawText ?? string.Empty;
        if (!PlatformPermissionCatalog.TryResolve(http.Request.Path.Value ?? string.Empty, http.Request.Method,
                routePattern, routeValues, tenantId, userId, role, out var resolved) || resolved is null) return;
        if (await authorizer.IsAllowedAsync(tenantId, userId, role, resolved, http.RequestAborted)) context.Succeed(requirement);
    }
}
