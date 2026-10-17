namespace AIERP.ModuleSDK;

/// <summary>Stable platform ABAC identity for a permission declared by a signed module manifest.</summary>
public sealed record ModulePermissionDescriptor(
    string Code,
    string ResourceType,
    string Action,
    string Description,
    string ModuleCode,
    string ModulePermissionCode);

public static class ModulePermissionCatalog
{
    public static IReadOnlyList<ModulePermissionDescriptor> Build(ModuleManifest manifest)
    {
        ArgumentNullException.ThrowIfNull(manifest);
        var resourceType = $"erp.module.{manifest.ModuleCode}";
        if (resourceType.Length > 80) throw new InvalidDataException("Module permission resource identifier exceeds the platform limit.");
        return manifest.Permissions.Select(permission =>
        {
            var code = $"{resourceType}.{permission.Code}";
            var description = $"{manifest.DisplayName} · {permission.Description}";
            if (code.Length > 120 || description.Length > 240)
                throw new InvalidDataException("Module permission metadata exceeds the platform limit.");
            return new ModulePermissionDescriptor(code, resourceType, "execute", description, manifest.ModuleCode, permission.Code);
        }).ToArray();
    }
}
