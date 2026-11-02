using System.Text.Json;
using System.Globalization;
using AIERP.Platform.Application;

namespace AIERP.AIService.AI;

/// <summary>Bounded account-name/code lookup that never exposes IDs or balances.</summary>
internal static class ERPAssistantLedgerAccountTools
{
    private const string PermissionPath = "/api/finance/general-ledger";
    private const int MaxResults = 10;

    public static bool TryValidateSearchTerm(string? value, out string term)
    {
        term = value?.Trim() ?? string.Empty;
        return term.Length is >= 2 and <= 100;
    }

    public static bool TryValidateBalanceQuery(string? value, string? fromValue, string? toValue,
        out string term, out DateOnly from, out DateOnly to)
    {
        term = value?.Trim() ?? string.Empty;
        from = default;
        to = default;
        return term.Length is >= 2 and <= 100 &&
            DateOnly.TryParseExact(fromValue, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out from) &&
            DateOnly.TryParseExact(toValue, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out to) &&
            from <= to && to.DayNumber - from.DayNumber <= 364;
    }

    public static async Task<bool> IsReadAllowedAsync(Guid tenantId, Guid userId, string role,
        IPlatformPermissionAuthorizer authorizer, CancellationToken cancellationToken)
    {
        if (!PlatformPermissionCatalog.TryResolve(PermissionPath, "GET", PermissionPath,
                new Dictionary<string, string?>(), tenantId, userId, role, out var permission) ||
            permission is null || permission.Permission.Code != "erp.general-ledger.read")
            return false;

        return await authorizer.IsAllowedAsync(tenantId, userId, role, permission, cancellationToken);
    }

    public static string SummarizeAccounts(JsonElement response)
    {
        if (response.ValueKind != JsonValueKind.Object ||
            !response.TryGetProperty("totalCount", out var totalElement) || !totalElement.TryGetInt32(out var total) || total < 0 ||
            !response.TryGetProperty("accounts", out var accounts) || accounts.ValueKind != JsonValueKind.Array ||
            accounts.GetArrayLength() > MaxResults || accounts.GetArrayLength() > total)
            throw new JsonException("Ledger-account search returned an invalid bounded result shape.");

        var projected = accounts.EnumerateArray().Select(account => new
        {
            code = RequiredString(account, "code", 32),
            name = RequiredString(account, "name", 160),
            active = RequiredBoolean(account, "isActive"),
            statementSection = RequiredString(account, "statementSection", 32)
        }).ToArray();
        return JsonSerializer.Serialize(new { totalCount = total, returned = projected.Length, accounts = projected });
    }

    public static string SummarizeBalances(JsonElement response)
    {
        if (response.ValueKind != JsonValueKind.Object ||
            !response.TryGetProperty("matchCountAtLeast", out var totalElement) || !totalElement.TryGetInt32(out var total) || total is < 0 or > 11 ||
            !response.TryGetProperty("truncated", out var truncatedElement) || truncatedElement.ValueKind is not (JsonValueKind.True or JsonValueKind.False) ||
            !response.TryGetProperty("from", out var fromElement) || fromElement.ValueKind != JsonValueKind.String ||
            !response.TryGetProperty("to", out var toElement) || toElement.ValueKind != JsonValueKind.String ||
            !response.TryGetProperty("accounts", out var accounts) || accounts.ValueKind != JsonValueKind.Array ||
            accounts.GetArrayLength() > 10 || accounts.GetArrayLength() > total)
            throw new JsonException("Ledger-balance search returned an invalid bounded result shape.");

        var fromValue = fromElement.GetString();
        var toValue = toElement.GetString();
        if (!DateOnly.TryParseExact(fromValue, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var from) ||
            !DateOnly.TryParseExact(toValue, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var to) ||
            from > to || to.DayNumber - from.DayNumber > 364)
            throw new JsonException("Ledger-balance search returned an invalid date range.");

        var projected = accounts.EnumerateArray().Select(account => new
        {
            code = RequiredString(account, "code", 32),
            name = RequiredString(account, "name", 160),
            openingDebit = RequiredDecimal(account, "openingDebit"),
            openingCredit = RequiredDecimal(account, "openingCredit"),
            periodDebit = RequiredDecimal(account, "periodDebit"),
            periodCredit = RequiredDecimal(account, "periodCredit"),
            balanceDebit = RequiredDecimal(account, "balanceDebit"),
            balanceCredit = RequiredDecimal(account, "balanceCredit")
        }).ToArray();
        return JsonSerializer.Serialize(new { from = fromValue, to = toValue, matchCountAtLeast = total, returned = projected.Length,
            truncated = truncatedElement.GetBoolean(), accounts = projected });
    }

    private static string RequiredString(JsonElement element, string name, int maxLength)
    {
        if (!element.TryGetProperty(name, out var value) || value.ValueKind != JsonValueKind.String ||
            string.IsNullOrWhiteSpace(value.GetString()) || value.GetString()!.Length > maxLength)
            throw new JsonException($"Ledger-account result has invalid {name}.");
        return value.GetString()!;
    }

    private static bool RequiredBoolean(JsonElement element, string name)
    {
        if (!element.TryGetProperty(name, out var value) || value.ValueKind is not (JsonValueKind.True or JsonValueKind.False))
            throw new JsonException($"Ledger-account result has invalid {name}.");
        return value.GetBoolean();
    }

    private static decimal RequiredDecimal(JsonElement element, string name)
    {
        if (!element.TryGetProperty(name, out var value) || !value.TryGetDecimal(out var amount) || amount < 0m)
            throw new JsonException($"Ledger-balance result has invalid {name}.");
        return amount;
    }
}
