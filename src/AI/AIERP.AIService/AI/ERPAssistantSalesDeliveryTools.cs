using System.Globalization;
using System.Text.Json;
using AIERP.Platform.Application;

namespace AIERP.AIService.AI;

/// <summary>Bounds and minimizes sales-delivery facts shared with the read-only assistant.</summary>
internal static class ERPAssistantSalesDeliveryTools
{
    private const string SearchPath = "/api/sales/deliveries/search";
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
            permission is null || permission.Permission.Code != "erp.sales-deliveries.read")
            return false;

        return await authorizer.IsAllowedAsync(tenantId, userId, role, permission, cancellationToken);
    }

    public static string SummarizeDeliveries(JsonElement response)
    {
        if (response.ValueKind != JsonValueKind.Object ||
            !TryGetInt32(response, "totalCount", out var totalCount) || totalCount < 0 ||
            !response.TryGetProperty("items", out var items) || items.ValueKind != JsonValueKind.Array ||
            items.GetArrayLength() > MaxResults || items.GetArrayLength() > totalCount)
            throw new JsonException("Sales delivery search returned an invalid bounded result shape.");

        var projected = items.EnumerateArray().Select(item => new
        {
            code = RequiredString(item, "code", 100),
            orderCode = RequiredString(item, "orderCode", 100),
            deliveryDate = RequiredDate(item, "deliveryDate").ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            status = RequiredString(item, "status", 40),
            lineCount = RequiredInt32(item, "lineCount"),
            invoiced = RequiredBoolean(item, "invoiced")
        }).ToArray();

        return JsonSerializer.Serialize(new
        {
            totalCount,
            returned = projected.Length,
            hasMore = totalCount > projected.Length,
            items = projected
        });
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
            : throw new JsonException($"Sales delivery search omitted or invalidated {property}.");

    private static DateOnly RequiredDate(JsonElement item, string property) =>
        item.ValueKind == JsonValueKind.Object && item.TryGetProperty(property, out var value) &&
        value.ValueKind == JsonValueKind.String && DateOnly.TryParseExact(value.GetString(), "yyyy-MM-dd",
            CultureInfo.InvariantCulture, DateTimeStyles.None, out var date)
            ? date
            : throw new JsonException($"Sales delivery search omitted or invalidated {property}.");

    private static int RequiredInt32(JsonElement item, string property) =>
        item.ValueKind == JsonValueKind.Object && item.TryGetProperty(property, out var value) &&
        value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out var number) && number >= 0
            ? number
            : throw new JsonException($"Sales delivery search omitted or invalidated {property}.");

    private static bool RequiredBoolean(JsonElement item, string property) =>
        item.ValueKind == JsonValueKind.Object && item.TryGetProperty(property, out var value) &&
        value.ValueKind is JsonValueKind.True or JsonValueKind.False
            ? value.GetBoolean()
            : throw new JsonException($"Sales delivery search omitted or invalidated {property}.");
}
