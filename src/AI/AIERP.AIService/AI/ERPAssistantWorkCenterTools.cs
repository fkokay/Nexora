using System.Text.Json;
using AIERP.Platform.Application;

namespace AIERP.AIService.AI;

/// <summary>Bounded work-center lookup that omits internal IDs and hourly cost data from model context.</summary>
internal static class ERPAssistantWorkCenterTools
{
    private const string SearchPath = "/api/manufacturing/work-centers/search";
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

    public static string SummarizeSearchResult(JsonElement response)
    {
        if (response.ValueKind != JsonValueKind.Object ||
            !response.TryGetProperty("totalCount", out var totalElement) || !totalElement.TryGetInt32(out var totalCount) || totalCount < 0 ||
            !response.TryGetProperty("items", out var itemsElement) || itemsElement.ValueKind != JsonValueKind.Array ||
            itemsElement.GetArrayLength() > MaxResults || itemsElement.GetArrayLength() > totalCount)
            throw new JsonException("Work-center search returned an invalid bounded result shape.");

        var items = itemsElement.EnumerateArray().Select(item =>
        {
            var code = RequiredString(item, "code", 40);
            var name = RequiredString(item, "name", 160);
            var capacityMinutesPerDay = RequiredInt32(item, "capacityMinutesPerDay", 1, 1440);
            if (!item.TryGetProperty("isActive", out var activeElement) ||
                activeElement.ValueKind is not (JsonValueKind.True or JsonValueKind.False))
                throw new JsonException("Work-center search omitted or invalidated isActive.");

            var workingDaysMask = RequiredInt32(item, "workingDaysMask", 0, 127);
            var shiftStartMinuteOfDay = RequiredInt32(item, "shiftStartMinuteOfDay", 0, 1439);
            var shiftEndMinuteOfDay = RequiredInt32(item, "shiftEndMinuteOfDay", 1, 1440);
            if (shiftStartMinuteOfDay >= shiftEndMinuteOfDay)
                throw new JsonException("Work-center search returned an invalid shift window.");

            return new
            {
                code,
                name,
                capacityMinutesPerDay,
                isActive = activeElement.GetBoolean(),
                workingDaysMask,
                shiftStartMinuteOfDay,
                shiftEndMinuteOfDay
            };
        }).ToArray();

        return JsonSerializer.Serialize(new { totalCount, returned = items.Length, hasMore = totalCount > items.Length, items });
    }

    private static string RequiredString(JsonElement item, string property, int maxLength) =>
        item.ValueKind == JsonValueKind.Object && item.TryGetProperty(property, out var value) &&
        value.ValueKind == JsonValueKind.String && value.GetString() is { Length: > 0 } text && text.Length <= maxLength
            ? text
            : throw new JsonException($"Work-center search omitted or invalidated {property}.");

    private static int RequiredInt32(JsonElement item, string property, int minimum, int maximum) =>
        item.ValueKind == JsonValueKind.Object && item.TryGetProperty(property, out var value) &&
        value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out var number) && number >= minimum && number <= maximum
            ? number
            : throw new JsonException($"Work-center search omitted or invalidated {property}.");
}
