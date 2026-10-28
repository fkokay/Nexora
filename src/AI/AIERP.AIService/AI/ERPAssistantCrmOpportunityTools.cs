using System.Globalization;
using System.Text.Json;
using AIERP.Platform.Application;

namespace AIERP.AIService.AI;

/// <summary>Bounded CRM opportunity lookup; omits customer identity, notes, activities and internal IDs.</summary>
internal static class ERPAssistantCrmOpportunityTools
{
    private const string SearchPath = "/api/crm/opportunities";
    private const int MaxResults = 10;

    public static bool TryValidateSearchTerm(string? value, out string term)
    {
        term = value?.Trim() ?? string.Empty;
        return term.Length is >= 2 and <= 100;
    }

    public static async Task<bool> IsReadAllowedAsync(Guid tenantId, Guid userId, string role,
        IPlatformPermissionAuthorizer authorizer, CancellationToken cancellationToken)
    {
        if (!PlatformPermissionCatalog.TryResolve(SearchPath, "GET", SearchPath,
                new Dictionary<string, string?>(), tenantId, userId, role, out var permission) ||
            permission is null || permission.Permission.Code != "erp.crm-opportunities.read")
            return false;

        return await authorizer.IsAllowedAsync(tenantId, userId, role, permission, cancellationToken);
    }

    public static string SummarizeOpportunities(JsonElement response)
    {
        if (response.ValueKind != JsonValueKind.Object ||
            !response.TryGetProperty("total", out var totalElement) || !totalElement.TryGetInt32(out var total) || total < 0 ||
            !response.TryGetProperty("items", out var items) || items.ValueKind != JsonValueKind.Array ||
            items.GetArrayLength() > MaxResults || items.GetArrayLength() > total)
            throw new JsonException("CRM opportunity search returned an invalid bounded result shape.");

        var projected = items.EnumerateArray().Select(item => new
        {
            code = RequiredString(item, "code", 40),
            name = RequiredString(item, "name", 160),
            stage = RequiredString(item, "stage", 40),
            estimatedValue = OptionalDecimal(item, "estimatedValue"),
            currencyCode = RequiredString(item, "currencyCode", 3),
            probabilityPercent = RequiredNonNegativeInt(item, "probabilityPercent", 100),
            expectedCloseDate = OptionalDate(item, "expectedCloseDate")
        }).ToArray();

        return JsonSerializer.Serialize(new { totalCount = total, returned = projected.Length, hasMore = total > projected.Length, items = projected });
    }

    private static string RequiredString(JsonElement item, string property, int maxLength) =>
        item.ValueKind == JsonValueKind.Object && item.TryGetProperty(property, out var value) &&
        value.ValueKind == JsonValueKind.String && value.GetString() is { Length: > 0 } text && text.Length <= maxLength
            ? text : throw new JsonException($"CRM opportunity search omitted or invalidated {property}.");

    private static decimal? OptionalDecimal(JsonElement item, string property)
    {
        if (item.ValueKind != JsonValueKind.Object || !item.TryGetProperty(property, out var value))
            throw new JsonException($"CRM opportunity search omitted {property}.");
        if (value.ValueKind == JsonValueKind.Null) return null;
        return value.ValueKind == JsonValueKind.Number && value.TryGetDecimal(out var number) && number >= 0
            ? number : throw new JsonException($"CRM opportunity search invalidated {property}.");
    }

    private static int RequiredNonNegativeInt(JsonElement item, string property, int maximum) =>
        item.ValueKind == JsonValueKind.Object && item.TryGetProperty(property, out var value) &&
        value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out var number) && number is >= 0 && number <= maximum
            ? number : throw new JsonException($"CRM opportunity search omitted or invalidated {property}.");

    private static string? OptionalDate(JsonElement item, string property)
    {
        if (item.ValueKind != JsonValueKind.Object || !item.TryGetProperty(property, out var value))
            throw new JsonException($"CRM opportunity search omitted {property}.");
        if (value.ValueKind == JsonValueKind.Null) return null;
        return value.ValueKind == JsonValueKind.String && DateOnly.TryParseExact(value.GetString(), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date)
            ? date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)
            : throw new JsonException($"CRM opportunity search invalidated {property}.");
    }
}
