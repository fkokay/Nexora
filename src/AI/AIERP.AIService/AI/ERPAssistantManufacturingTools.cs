using System.Globalization;
using System.Text.Json;
using AIERP.Platform.Application;

namespace AIERP.AIService.AI;

/// <summary>
/// Adds a bounded, permission-checked work-order search to the read-only assistant.
/// Only operational facts are projected; internal IDs and component/employee data stay out of model context.
/// </summary>
internal static class ERPAssistantManufacturingTools
{
    private const string SearchPath = "/api/manufacturing/orders/search";
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
            permission is null || permission.Permission.Code != "erp.manufacturing.read")
            return false;

        return await authorizer.IsAllowedAsync(tenantId, userId, role, permission, cancellationToken);
    }

    public static string SummarizeOrders(JsonElement response)
    {
        if (response.ValueKind != JsonValueKind.Object ||
            !TryGetInt32(response, "totalCount", out var totalCount) || totalCount < 0 ||
            !response.TryGetProperty("items", out var items) || items.ValueKind != JsonValueKind.Array ||
            items.GetArrayLength() > MaxResults || items.GetArrayLength() > totalCount)
            throw new JsonException("Manufacturing order search returned an invalid bounded result shape.");

        var projected = items.EnumerateArray().Select(item => new
        {
            code = RequiredString(item, "code", 100),
            plannedDate = RequiredDate(item, "plannedDate").ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            status = RequiredString(item, "status", 40),
            plannedQuantity = RequiredDecimal(item, "plannedQuantity"),
            completedAt = OptionalDateTime(item, "completedAt")
        }).ToArray();

        return JsonSerializer.Serialize(new { totalCount, returned = projected.Length, hasMore = totalCount > projected.Length, items = projected });
    }

    private static bool TryGetInt32(JsonElement value, string property, out int result)
    {
        result = 0;
        return value.ValueKind == JsonValueKind.Object && value.TryGetProperty(property, out var element) &&
            element.ValueKind == JsonValueKind.Number && element.TryGetInt32(out result);
    }

    private static string RequiredString(JsonElement item, string property, int maxLength) =>
        item.ValueKind == JsonValueKind.Object && item.TryGetProperty(property, out var value) &&
        value.ValueKind == JsonValueKind.String && value.GetString() is { Length: > 0 } text && text.Length <= maxLength
            ? text
            : throw new JsonException($"Manufacturing order search omitted or invalidated {property}.");

    private static DateOnly RequiredDate(JsonElement item, string property) =>
        item.ValueKind == JsonValueKind.Object && item.TryGetProperty(property, out var value) &&
        value.ValueKind == JsonValueKind.String && DateOnly.TryParseExact(value.GetString(), "yyyy-MM-dd",
            CultureInfo.InvariantCulture, DateTimeStyles.None, out var date)
            ? date
            : throw new JsonException($"Manufacturing order search omitted or invalidated {property}.");

    private static string? OptionalDateTime(JsonElement item, string property)
    {
        if (item.ValueKind != JsonValueKind.Object || !item.TryGetProperty(property, out var value))
            throw new JsonException($"Manufacturing order search omitted {property}.");
        if (value.ValueKind == JsonValueKind.Null) return null;
        return value.ValueKind == JsonValueKind.String && DateTimeOffset.TryParse(value.GetString(), CultureInfo.InvariantCulture,
            DateTimeStyles.AssumeUniversal, out var dateTime)
                ? dateTime.ToUniversalTime().ToString("O", CultureInfo.InvariantCulture)
                : throw new JsonException($"Manufacturing order search invalidated {property}.");
    }

    private static decimal RequiredDecimal(JsonElement item, string property) =>
        item.ValueKind == JsonValueKind.Object && item.TryGetProperty(property, out var value) &&
        value.ValueKind == JsonValueKind.Number && value.TryGetDecimal(out var number) && number >= 0
            ? number
            : throw new JsonException($"Manufacturing order search omitted or invalidated {property}.");
}
