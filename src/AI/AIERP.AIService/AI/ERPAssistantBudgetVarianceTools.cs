using System.Globalization;
using System.Text.Json;
using AIERP.Platform.Application;

namespace AIERP.AIService.AI;

/// <summary>Projects bounded budget-versus-ledger summaries without account identities or notes.</summary>
internal static class ERPAssistantBudgetVarianceTools
{
    private const string PermissionPath = "/api/finance/budgets";
    private const int MaxResults = 10;
    private const int MaxPeriods = 12;

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
            permission is null || permission.Permission.Code != "erp.finance-budgets.read")
            return false;

        return await authorizer.IsAllowedAsync(tenantId, userId, role, permission, cancellationToken);
    }

    public static string SummarizeBudgets(JsonElement response)
    {
        if (response.ValueKind != JsonValueKind.Object ||
            !response.TryGetProperty("totalCount", out var totalElement) || !totalElement.TryGetInt32(out var total) || total < 0 ||
            !response.TryGetProperty("items", out var items) || items.ValueKind != JsonValueKind.Array ||
            items.GetArrayLength() > MaxResults || items.GetArrayLength() > total)
            throw new JsonException("Budget search returned an invalid bounded result shape.");

        var projected = items.EnumerateArray().Select(ProjectBudget).ToArray();
        return JsonSerializer.Serialize(new { totalCount = total, returned = projected.Length, hasMore = total > projected.Length, items = projected });
    }

    private static object ProjectBudget(JsonElement item)
    {
        var name = RequiredString(item, "name", 120);
        var year = RequiredInt(item, "fiscalYear", 2000, 2100);
        var currency = RequiredCurrency(item, "currencyCode");
        var baseCurrency = RequiredCurrency(item, "baseCurrencyCode");
        var status = RequiredString(item, "status", 20);
        var lineCount = RequiredInt(item, "lineCount", 0, 1200);
        var comparable = RequiredBoolean(item, "isComparableToLedger");
        var plannedTotal = RequiredDecimal(item, "plannedTotal");
        var actualTotal = OptionalDecimal(item, "actualTotal");
        var varianceTotal = OptionalDecimal(item, "varianceTotal");
        if (comparable != string.Equals(currency, baseCurrency, StringComparison.OrdinalIgnoreCase) ||
            comparable != (actualTotal is not null && varianceTotal is not null) ||
            comparable && varianceTotal != actualTotal - plannedTotal ||
            !item.TryGetProperty("periods", out var periods) || periods.ValueKind != JsonValueKind.Array || periods.GetArrayLength() > MaxPeriods)
            throw new JsonException("Budget search returned inconsistent currency, variance, or period values.");

        var projectedPeriods = new List<object>(periods.GetArrayLength());
        var seenPeriods = new HashSet<DateOnly>();
        foreach (var period in periods.EnumerateArray())
        {
            if (!TryGetDate(period, "periodStart", out var start) || start.Year != year || start.Day != 1 || !seenPeriods.Add(start))
                throw new JsonException("Budget search returned an invalid period.");
            var planned = RequiredDecimal(period, "plannedAmount");
            var actual = OptionalDecimal(period, "actualAmount");
            var variance = OptionalDecimal(period, "variance");
            if (comparable != (actual is not null && variance is not null) || comparable && variance != actual - planned)
                throw new JsonException("Budget period returned inconsistent variance values.");
            projectedPeriods.Add(new
            {
                periodStart = start.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                plannedAmount = planned,
                actualAmount = actual,
                variance
            });
        }

        return new
        {
            name,
            fiscalYear = year,
            currencyCode = currency,
            baseCurrencyCode = baseCurrency,
            status,
            lineCount,
            isComparableToLedger = comparable,
            plannedTotal,
            actualTotal,
            varianceTotal,
            periods = projectedPeriods
        };
    }

    private static string RequiredString(JsonElement item, string property, int maxLength) =>
        item.ValueKind == JsonValueKind.Object && item.TryGetProperty(property, out var value) &&
        value.ValueKind == JsonValueKind.String && value.GetString() is { Length: > 0 } text && text.Length <= maxLength
            ? text : throw new JsonException($"Budget search omitted or invalidated {property}.");

    private static string RequiredCurrency(JsonElement item, string property)
    {
        var code = RequiredString(item, property, 3);
        return code.Length == 3 && code.All(c => c is >= 'A' and <= 'Z')
            ? code : throw new JsonException($"Budget search returned an invalid {property}.");
    }

    private static int RequiredInt(JsonElement item, string property, int min, int max) =>
        item.ValueKind == JsonValueKind.Object && item.TryGetProperty(property, out var value) &&
        value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out var number) && number >= min && number <= max
            ? number : throw new JsonException($"Budget search omitted or invalidated {property}.");

    private static bool RequiredBoolean(JsonElement item, string property) =>
        item.ValueKind == JsonValueKind.Object && item.TryGetProperty(property, out var value) &&
        value.ValueKind is JsonValueKind.True or JsonValueKind.False
            ? value.GetBoolean() : throw new JsonException($"Budget search omitted or invalidated {property}.");

    private static decimal RequiredDecimal(JsonElement item, string property) =>
        item.ValueKind == JsonValueKind.Object && item.TryGetProperty(property, out var value) &&
        value.ValueKind == JsonValueKind.Number && value.TryGetDecimal(out var number)
            ? number : throw new JsonException($"Budget search omitted or invalidated {property}.");

    private static decimal? OptionalDecimal(JsonElement item, string property)
    {
        if (item.ValueKind != JsonValueKind.Object || !item.TryGetProperty(property, out var value))
            throw new JsonException($"Budget search omitted {property}.");
        if (value.ValueKind == JsonValueKind.Null) return null;
        return value.ValueKind == JsonValueKind.Number && value.TryGetDecimal(out var number)
            ? number : throw new JsonException($"Budget search invalidated {property}.");
    }

    private static bool TryGetDate(JsonElement item, string property, out DateOnly date)
    {
        date = default;
        return item.ValueKind == JsonValueKind.Object && item.TryGetProperty(property, out var value) &&
            value.ValueKind == JsonValueKind.String && DateOnly.TryParseExact(value.GetString(), "yyyy-MM-dd",
                CultureInfo.InvariantCulture, DateTimeStyles.None, out date);
    }
}
