using System.Text.RegularExpressions;

namespace AIERP.Platform.Application;

public sealed record TenantProvisioningRequestData(
    string Name,
    string Slug,
    string BaseCurrencyCode,
    string AdminEmail,
    string AdminDisplayName);

public static partial class TenantProvisioningRequestNormalizer
{
    public static TenantProvisioningRequestData Normalize(
        string? name,
        string? slug,
        string? baseCurrencyCode,
        string? adminEmail,
        string? adminDisplayName)
    {
        name = name?.Trim();
        slug = slug?.Trim().ToLowerInvariant();
        var currency = (baseCurrencyCode ?? "TRY").Trim().ToUpperInvariant();
        var email = adminEmail?.Trim().ToLowerInvariant();
        var displayName = adminDisplayName?.Trim();

        if (string.IsNullOrWhiteSpace(name) || name.Length > 200)
            throw new ArgumentException("TenantProvisioning:Name is required and must be at most 200 characters.");
        if (string.IsNullOrWhiteSpace(slug) || slug.Length > 100 || !SlugPattern().IsMatch(slug))
            throw new ArgumentException("TenantProvisioning:Slug must contain lowercase letters, digits, and single hyphens only.");
        if (!CurrencyPattern().IsMatch(currency))
            throw new ArgumentException("TenantProvisioning:BaseCurrencyCode must be a three-letter ISO currency code.");
        if (string.IsNullOrWhiteSpace(email) || email.Length > 320 || !email.Contains('@'))
            throw new ArgumentException("TenantProvisioning:AdminEmail must be a valid email address.");
        if (string.IsNullOrWhiteSpace(displayName) || displayName.Length > 160)
            throw new ArgumentException("TenantProvisioning:AdminDisplayName is required and must be at most 160 characters.");

        return new TenantProvisioningRequestData(name, slug, currency, email, displayName);
    }

    [GeneratedRegex("^[a-z0-9]+(?:-[a-z0-9]+)*$", RegexOptions.CultureInvariant)]
    private static partial Regex SlugPattern();

    [GeneratedRegex("^[A-Z]{3}$", RegexOptions.CultureInvariant)]
    private static partial Regex CurrencyPattern();
}
