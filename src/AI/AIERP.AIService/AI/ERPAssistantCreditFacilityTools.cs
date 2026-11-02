using System.Globalization;
using System.Text.Json;
using AIERP.Platform.Application;

namespace AIERP.AIService.AI;

/// <summary>Bounded credit-facility summaries without lender, account, note, identity, or credit-limit details.</summary>
internal static class ERPAssistantCreditFacilityTools
{
    private const string PermissionPath = "/api/finance/credit-facilities";
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
            permission is null || permission.Permission.Code != "erp.finance.credit-facilities.read")
            return false;

        return await authorizer.IsAllowedAsync(tenantId, userId, role, permission, cancellationToken);
    }

    public static string SummarizeFacilities(JsonElement response)
    {
        if (response.ValueKind != JsonValueKind.Object ||
            !response.TryGetProperty("totalCount", out var totalElement) || !totalElement.TryGetInt32(out var total) || total < 0 ||
            !response.TryGetProperty("items", out var items) || items.ValueKind != JsonValueKind.Array ||
            items.GetArrayLength() > MaxResults || items.GetArrayLength() > total)
            throw new JsonException("Credit facility search returned an invalid bounded result shape.");

        var projected = items.EnumerateArray().Select(item => new
        {
            code = RequiredString(item, "code", 40),
            facilityType = RequiredString(item, "facilityType", 40),
            currencyCode = RequiredString(item, "currencyCode", 3),
            status = RequiredString(item, "status", 20),
            maturityDate = OptionalDate(item, "maturityDate"),
            drawnPrincipal = RequiredNonNegativeDecimal(item, "drawnPrincipal"),
            repaidPrincipal = RequiredNonNegativeDecimal(item, "repaidPrincipal"),
            outstandingPrincipal = RequiredNonNegativeDecimal(item, "outstandingPrincipal"),
            plannedInstallmentCount = RequiredNonNegativeInt(item, "plannedInstallmentCount"),
            plannedInstallmentTotal = RequiredNonNegativeDecimal(item, "plannedInstallmentTotal")
        }).ToArray();

        return JsonSerializer.Serialize(new { totalCount = total, returned = projected.Length, hasMore = total > projected.Length, items = projected });
    }

    private static string RequiredString(JsonElement item, string property, int maxLength) =>
        item.ValueKind == JsonValueKind.Object && item.TryGetProperty(property, out var value) &&
        value.ValueKind == JsonValueKind.String && value.GetString() is { Length: > 0 } text && text.Length <= maxLength
            ? text : throw new JsonException($"Credit facility search omitted or invalidated {property}.");

    private static decimal RequiredNonNegativeDecimal(JsonElement item, string property) =>
        item.ValueKind == JsonValueKind.Object && item.TryGetProperty(property, out var value) &&
        value.ValueKind == JsonValueKind.Number && value.TryGetDecimal(out var number) && number >= 0
            ? number : throw new JsonException($"Credit facility search omitted or invalidated {property}.");

    private static int RequiredNonNegativeInt(JsonElement item, string property) =>
        item.ValueKind == JsonValueKind.Object && item.TryGetProperty(property, out var value) &&
        value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out var number) && number >= 0
            ? number : throw new JsonException($"Credit facility search omitted or invalidated {property}.");

    private static string? OptionalDate(JsonElement item, string property)
    {
        if (item.ValueKind != JsonValueKind.Object || !item.TryGetProperty(property, out var value))
            throw new JsonException($"Credit facility search omitted {property}.");
        if (value.ValueKind == JsonValueKind.Null) return null;
        return value.ValueKind == JsonValueKind.String && DateOnly.TryParseExact(value.GetString(), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date)
            ? date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)
            : throw new JsonException($"Credit facility search invalidated {property}.");
    }
}
