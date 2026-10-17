using AIERP.ModuleSDK;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

internal sealed record ModulePermissionPolicyDefinition(
    string ModuleCode,
    string ModulePermissionCode,
    PermissionDefinition Entity,
    PlatformPermissionDefinition Policy);

internal static class ModulePermissionPolicy
{
    public static IReadOnlyList<ModulePermissionPolicyDefinition> FromManifest(ModuleManifest manifest)
        => AIERP.ModuleSDK.ModulePermissionCatalog.Build(manifest).Select(permission =>
        {
            var entity = new PermissionDefinition { Code = permission.Code, ResourceType = permission.ResourceType,
                Action = permission.Action, Description = permission.Description };
            return new ModulePermissionPolicyDefinition(permission.ModuleCode, permission.ModulePermissionCode, entity,
                new PlatformPermissionDefinition(permission.Code, permission.ResourceType, permission.Action, permission.Description));
        }).ToArray();

    public static async Task<IReadOnlyList<ModulePermissionPolicyDefinition>> ForTenantAsync(
        PlatformDbContext db, Guid tenantId, CancellationToken cancellationToken)
    {
        var manifests = await (from activation in db.TenantModuleActivations.AsNoTracking()
                               join release in db.PlatformModuleReleases.AsNoTracking()
                                 on new { activation.ModuleCode, activation.Version } equals new { release.ModuleCode, release.Version }
                               where activation.TenantId == tenantId && release.Status == "Published"
                               select release.ManifestJson).ToListAsync(cancellationToken);
        try
        {
            return manifests.SelectMany(json => FromManifest(JsonSerializer.Deserialize<ModuleManifest>(
                    json, new JsonSerializerOptions(JsonSerializerDefaults.Web))
                ?? throw new JsonException("Module manifest is empty.")))
                .DistinctBy(x => x.Policy.Code, StringComparer.Ordinal)
                .ToArray();
        }
        catch (JsonException exception)
        {
            throw new InvalidDataException("An active module has an invalid signed manifest.", exception);
        }
    }

    public static IReadOnlyDictionary<string, string> Attributes(Guid tenantId, Guid userId, string role,
        string moduleCode, string menuEntryCode, IReadOnlyDictionary<string, string>? resourceAttributes = null)
    {
        var attributes = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["subject.userId"] = userId.ToString("D"),
            ["subject.role"] = role,
            ["resource.type"] = $"erp.module.{moduleCode}",
            ["resource.tenantId"] = tenantId.ToString("D"),
            ["request.method"] = "POST",
            ["request.action"] = "execute",
            ["resource.route.moduleCode"] = moduleCode,
            ["resource.route.menuEntryCode"] = menuEntryCode
        };
        if (resourceAttributes is not null)
            foreach (var attribute in resourceAttributes) attributes[attribute.Key] = attribute.Value;
        return attributes;
    }
}
