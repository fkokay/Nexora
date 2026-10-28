using System.Globalization;
using System.Text.Json;
using AIERP.Platform.Application;

namespace AIERP.AIService.AI;

/// <summary>Bounded foreign-trade status lookup; contains no internal IDs or customs/carrier references.</summary>
internal static class ERPAssistantForeignTradeTools
{
    private const string PermissionPath = "/api/foreign-trade/cases";
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
            permission is null || permission.Permission.Code != "erp.foreign-trade.read")
            return false;

        return await authorizer.IsAllowedAsync(tenantId, userId, role, permission, cancellationToken);
    }

    public static string SummarizeCases(JsonElement response)
    {
        if (response.ValueKind != JsonValueKind.Object ||
            !response.TryGetProperty("total", out var totalElement) || !totalElement.TryGetInt32(out var total) || total < 0 ||
            !response.TryGetProperty("items", out var items) || items.ValueKind != JsonValueKind.Array ||
            items.GetArrayLength() > MaxResults || items.GetArrayLength() > total)
            throw new JsonException("Foreign-trade search returned an invalid bounded result shape.");

        var projected = items.EnumerateArray().Select(item => new
        {
            direction = RequiredString(item, "direction", 20),
            status = RequiredString(item, "status", 40),
            referenceCode = RequiredString(item, "referenceCode", 100),
            originCountryCode = RequiredString(item, "originCountryCode", 2),
            destinationCountryCode = RequiredString(item, "destinationCountryCode", 2),
            incotermsCode = OptionalString(item, "incotermsCode", 3),
            transportMode = RequiredString(item, "transportMode", 30),
            plannedShipDate = OptionalDate(item, "plannedShipDate"),
            actualShipDate = OptionalDate(item, "actualShipDate"),
            plannedArrivalDate = OptionalDate(item, "plannedArrivalDate"),
            actualArrivalDate = OptionalDate(item, "actualArrivalDate")
        }).ToArray();

        return JsonSerializer.Serialize(new { totalCount = total, returned = projected.Length, hasMore = total > projected.Length, items = projected });
    }

    private static string RequiredString(JsonElement item, string property, int maxLength) =>
        item.ValueKind == JsonValueKind.Object && item.TryGetProperty(property, out var value) &&
        value.ValueKind == JsonValueKind.String && value.GetString() is { Length: > 0 } text && text.Length <= maxLength
            ? text : throw new JsonException($"Foreign-trade search omitted or invalidated {property}.");

    private static string? OptionalString(JsonElement item, string property, int maxLength)
    {
        if (item.ValueKind != JsonValueKind.Object || !item.TryGetProperty(property, out var value))
            throw new JsonException($"Foreign-trade search omitted {property}.");
        if (value.ValueKind == JsonValueKind.Null) return null;
        return value.ValueKind == JsonValueKind.String && value.GetString() is { } text && text.Length <= maxLength
            ? text : throw new JsonException($"Foreign-trade search invalidated {property}.");
    }

    private static string? OptionalDate(JsonElement item, string property)
    {
        if (item.ValueKind != JsonValueKind.Object || !item.TryGetProperty(property, out var value))
            throw new JsonException($"Foreign-trade search omitted {property}.");
        if (value.ValueKind == JsonValueKind.Null) return null;
        return value.ValueKind == JsonValueKind.String && DateOnly.TryParseExact(value.GetString(), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date)
            ? date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)
            : throw new JsonException($"Foreign-trade search invalidated {property}.");
    }
}
