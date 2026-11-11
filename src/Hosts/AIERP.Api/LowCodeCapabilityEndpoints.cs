using System.Security.Claims;
using AIERP.Platform.Application;

internal static class LowCodeCapabilityEndpoints
{
    private static readonly (string Name, string Resource)[] Resources =
    [
        ("customForms", "erp.custom-forms"),
        ("customData", "erp.custom-data"),
        ("businessRules", "erp.business-rules"),
        ("workflows", "erp.workflows"),
        ("customMenus", "erp.custom-menus"),
        ("screenViews", "erp.screen-views"),
        // Draft and publish routes for custom pages are authorized by this resource family.
        ("customPages", "erp.tenant-customizations"),
        ("customizationPackages", "erp.tenant-customizations")
    ];

    public static void MapLowCodeCapabilityEndpoints(this WebApplication app)
    {
        app.MapGet("/api/low-code/capabilities", async (ClaimsPrincipal user,
            IPlatformPermissionAuthorizer authorizer, CancellationToken ct) =>
        {
            if (!Guid.TryParse(user.FindFirstValue("tenant_id"), out var tenantId)
                || !Guid.TryParse(user.FindFirstValue("sub"), out var userId)
                || string.IsNullOrWhiteSpace(user.FindFirstValue("role"))) return Results.Forbid();

            var role = user.FindFirstValue("role")!;
            var result = new Dictionary<string, LowCodeResourceCapabilities>(StringComparer.Ordinal);
            foreach (var (name, resourceType) in Resources)
            {
                async Task<bool> Allows(string action)
                {
                    var definition = PlatformPermissionCatalog.Definitions.Single(x =>
                        x.ResourceType == resourceType && x.Action == action);
                    var permission = new ResolvedPlatformPermission(definition,
                        new Dictionary<string, string>(StringComparer.Ordinal)
                        {
                            ["subject.userId"] = userId.ToString("D"),
                            ["subject.role"] = role,
                            ["resource.type"] = resourceType,
                            ["resource.tenantId"] = tenantId.ToString("D"),
                            ["request.action"] = action
                        });
                    return await authorizer.IsAllowedAsync(tenantId, userId, role, permission, ct);
                }

                var read = await Allows("read");
                var create = await Allows("create");
                var update = await Allows("update");
                var publish = await Allows("execute");
                var delete = await Allows("delete");
                result[name] = new LowCodeResourceCapabilities(read, create, update, publish, delete);
            }

            return Results.Ok(result);
        }).RequireAuthorization(policy => policy.RequireAuthenticatedUser());
    }
}

internal sealed record LowCodeResourceCapabilities(bool CanRead, bool CanCreate, bool CanUpdate, bool CanPublish, bool CanDelete);
