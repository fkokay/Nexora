using System.Globalization;
using System.Text.Json;
using AIERP.Platform.Application;

namespace AIERP.AIService.AI;

/// <summary>Bounded payment-instrument search that omits counterparty, bank, account, note, and internal identity details.</summary>
internal static class ERPAssistantPaymentInstrumentTools
{
    private const string PermissionPath = "/api/finance/payment-instruments";
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
                new Dictionary<string, string?>(), tenantId, userId, role, out var permission)
            || permission is null || permission.Permission.Code != "erp.finance-payment-instruments.read")
            return false;

        return await authorizer.IsAllowedAsync(tenantId, userId, role, permission, cancellationToken);
    }

    public static string SummarizeSearchResult(JsonElement response)
    {
        if (response.ValueKind != JsonValueKind.Object
            || !response.TryGetProperty("totalCount", out var totalElement)
            || !totalElement.TryGetInt32(out var total) || total < 0
            || !response.TryGetProperty("items", out var items)
            || items.ValueKind != JsonValueKind.Array
            || items.GetArrayLength() > MaxResults || items.GetArrayLength() > total)
            throw new JsonException("Payment instrument search returned an invalid bounded result shape.");

        var projected = items.EnumerateArray().Select(item => new
        {
            code = RequiredString(item, "code", 40),
            type = RequiredString(item, "type", 20),
            direction = RequiredString(item, "direction", 20),
            status = RequiredString(item, "status", 20),
            currencyCode = RequiredCurrency(item),
            amount = RequiredNonNegativeDecimal(item, "amount"),
            issueDate = RequiredDate(item, "issueDate"),
            dueDate = RequiredDate(item, "dueDate")
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
        item.ValueKind == JsonValueKind.Object && item.TryGetProperty(property, out var value)
        && value.ValueKind == JsonValueKind.String && value.GetString() is { Length: > 0 } text && text.Length <= maxLength
            ? text : throw new JsonException($"Payment instrument search omitted or invalidated {property}.");

    private static string RequiredCurrency(JsonElement item)
    {
        var currency = RequiredString(item, "currencyCode", 3);
        return currency.Length == 3 && currency.All(char.IsAsciiLetter)
            ? currency.ToUpperInvariant()
            : throw new JsonException("Payment instrument search returned an invalid currency code.");
    }

    private static decimal RequiredNonNegativeDecimal(JsonElement item, string property) =>
        item.ValueKind == JsonValueKind.Object && item.TryGetProperty(property, out var value)
        && value.ValueKind == JsonValueKind.Number && value.TryGetDecimal(out var number) && number >= 0
            ? number : throw new JsonException($"Payment instrument search omitted or invalidated {property}.");

    private static string RequiredDate(JsonElement item, string property) =>
        item.ValueKind == JsonValueKind.Object && item.TryGetProperty(property, out var value)
        && value.ValueKind == JsonValueKind.String
        && DateOnly.TryParseExact(value.GetString(), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date)
            ? date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)
            : throw new JsonException($"Payment instrument search omitted or invalidated {property}.");
}
