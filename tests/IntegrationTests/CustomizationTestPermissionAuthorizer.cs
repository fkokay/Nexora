using AIERP.Platform.Application;

namespace AIERP.Api.IntegrationTests;

// These isolated endpoint fixtures exercise the preconfigured administrator and reader roles.
internal sealed class CustomizationTestPermissionAuthorizer : IPlatformPermissionAuthorizer
{
    public Task<bool> IsAllowedAsync(Guid tenantId, Guid userId, string role,
        ResolvedPlatformPermission permission, CancellationToken cancellationToken = default)
    {
        var allowed = role == "TenantAdmin" || (role == "TenantUser" &&
            (permission.Permission.Action == "read" ||
             (permission.Permission.ResourceType == "erp.custom-forms" &&
              permission.Permission.Action == "create" && permission.Attributes.ContainsKey("resource.route.formId"))));
        return Task.FromResult(allowed);
    }
}
