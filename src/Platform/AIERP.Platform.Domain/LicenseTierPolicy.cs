namespace AIERP.Platform.Domain;

public sealed record LicenseTierPolicy(string Code, int MaxUsers, int MaxCustomModules, int MaxStorageGb,
    bool AdvancedWorkflow, bool CustomModuleSource, bool HighAvailability);

public static class LicenseTierCatalog
{
    public static IReadOnlyDictionary<string, LicenseTierPolicy> All { get; } =
        new Dictionary<string, LicenseTierPolicy>(StringComparer.OrdinalIgnoreCase)
        {
            ["Small"] = new("Small", 10, 3, 10, false, false, false),
            ["Medium"] = new("Medium", 50, 15, 100, true, true, false),
            ["Large"] = new("Large", int.MaxValue, int.MaxValue, int.MaxValue, true, true, true)
        };

    public static bool TryGet(string? code, out LicenseTierPolicy policy)
    {
        if (code is not null && All.TryGetValue(code, out var found))
        {
            policy = found;
            return true;
        }

        policy = null!;
        return false;
    }

    /// <summary>Checks that persisted license metadata still matches its signed package profile.</summary>
    public static bool IsValidStoredLicense(TenantLicense? license)
    {
        if (license is null || license.LicenseId == Guid.Empty || !TryGet(license.Tier, out var policy)) return false;
        return license.MaxUsers == policy.MaxUsers
            && license.MaxCustomModules == policy.MaxCustomModules
            && license.MaxStorageGb == policy.MaxStorageGb
            && license.GrantSha256 is { Length: 64 } digest
            && digest.All(Uri.IsHexDigit);
    }
}
