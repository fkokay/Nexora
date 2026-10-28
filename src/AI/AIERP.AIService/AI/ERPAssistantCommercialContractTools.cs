using System.Globalization;
using System.Text.Json;
using AIERP.Platform.Application;

namespace AIERP.AIService.AI;

/// <summary>Bounded tenant-authorized commercial contract search with no internal linkage IDs.</summary>
internal static class ERPAssistantCommercialContractTools
{
    private const string PermissionPath = "/api/commercial-contracts";
    private const int MaxResults = 10;

    public static bool TryValidateSearchTerm(string? value, out string term)
    {
        term = value?.Trim() ?? string.Empty;
        return term.Length is >= 2 and <= 100;
    }

    public static async Task<bool> IsReadAllowedAsync(Guid tenantId, Guid userId, string role,
        IPlatformPermissionAuthorizer authorizer, CancellationToken cancellationToken)
    {
        if (!PlatformPermissionCatalog.TryResolve(PermissionPath, "GET", PermissionPath,
                new Dictionary<string, string?>(), tenantId, userId, role, out var permission) ||
            permission is null || permission.Permission.Code != "erp.commercial-contracts.read")
            return false;

        return await authorizer.IsAllowedAsync(tenantId, userId, role, permission, cancellationToken);
    }

    public static string SummarizeContracts(JsonElement response)
    {
        if (response.ValueKind != JsonValueKind.Object ||
            !response.TryGetProperty("total", out var totalElement) || !totalElement.TryGetInt32(out var total) || total < 0 ||
            !response.TryGetProperty("items", out var items) || items.ValueKind != JsonValueKind.Array ||
            items.GetArrayLength() > MaxResults || items.GetArrayLength() > total)
            throw new JsonException("Commercial contract search returned an invalid bounded result shape.");

        var projected = items.EnumerateArray().Select(item => new
        {
            code = RequiredString(item, "code", 40),
            type = RequiredEnumString(item, "type", 20, "Sales", "Purchase"),
            counterpartyName = RequiredString(item, "counterpartyName", 200),
            effectiveFrom = RequiredDate(item, "effectiveFrom"),
            effectiveThrough = RequiredDate(item, "effectiveThrough"),
            currencyCode = RequiredCurrency(item, "currencyCode"),
            status = RequiredEnumString(item, "status", 30, "Draft", "Active", "Suspended", "Completed", "Terminated", "Cancelled")
        }).ToArray();

        return JsonSerializer.Serialize(new
        {
            totalCount = total,
            returned = projected.Length,
            hasMore = total > projected.Length,
            items = projected
        });
    }

    private static string RequiredString(JsonElement item, string property, int maxLength) =>
        item.ValueKind == JsonValueKind.Object && item.TryGetProperty(property, out var value) &&
        value.ValueKind == JsonValueKind.String && value.GetString() is { Length: > 0 } text && text.Length <= maxLength
            ? text : throw new JsonException($"Commercial contract search omitted or invalidated {property}.");

    private static string RequiredEnumString(JsonElement item, string property, int maxLength, params string[] allowedValues)
    {
        var value = RequiredString(item, property, maxLength);
        return allowedValues.Contains(value, StringComparer.Ordinal)
            ? value : throw new JsonException($"Commercial contract search returned an unsupported {property}.");
    }

    private static string RequiredDate(JsonElement item, string property)
    {
        var value = RequiredString(item, property, 10);
        return DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date)
            ? date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)
            : throw new JsonException($"Commercial contract search invalidated {property}.");
    }

    private static string RequiredCurrency(JsonElement item, string property)
    {
        var value = RequiredString(item, property, 3);
        return value.Length == 3 && value.All(char.IsAsciiLetter)
            ? value.ToUpperInvariant()
            : throw new JsonException($"Commercial contract search invalidated {property}.");
    }
}
