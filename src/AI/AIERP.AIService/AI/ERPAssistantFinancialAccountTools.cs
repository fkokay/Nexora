using System.Text.Json;
using AIERP.Platform.Application;

namespace AIERP.AIService.AI;

/// <summary>
/// Exposes only tenant-authorized cash/bank balances grouped by type and currency.
/// Account names, codes, identifiers, and bank details are not forwarded to the model.
/// </summary>
internal static class ERPAssistantFinancialAccountTools
{
    private const string AccountsPath = "/api/finance/accounts";
    private const int MaxAccounts = 1000;
    private const int MaxCurrencies = 20;

    public static bool HasNoArguments(JsonElement arguments) =>
        arguments.ValueKind == JsonValueKind.Object && !arguments.EnumerateObject().Any();

    public static async Task<bool> IsReadAllowedAsync(Guid tenantId, Guid userId, string role,
        IPlatformPermissionAuthorizer authorizer, CancellationToken cancellationToken)
    {
        if (!PlatformPermissionCatalog.TryResolve(AccountsPath, "GET", AccountsPath,
                new Dictionary<string, string?>(), tenantId, userId, role, out var permission) ||
            permission is null || permission.Permission.Code != "erp.finance-accounts.read")
            return false;

        return await authorizer.IsAllowedAsync(tenantId, userId, role, permission, cancellationToken);
    }

    public static string SummarizeBalances(JsonElement root)
    {
        if (root.ValueKind != JsonValueKind.Array || root.GetArrayLength() > MaxAccounts)
            throw new JsonException("Financial-account response exceeded the bounded result shape.");

        var rows = new List<(string Type, string Currency, bool Active, decimal Balance)>();
        foreach (var item in root.EnumerateArray())
        {
            if (!TryGetType(item, out var type) || !TryGetCurrency(item, out var currency) ||
                !item.TryGetProperty("isActive", out var activeElement) ||
                activeElement.ValueKind is not (JsonValueKind.True or JsonValueKind.False) ||
                !item.TryGetProperty("balance", out var balanceElement) ||
                balanceElement.ValueKind != JsonValueKind.Number || !balanceElement.TryGetDecimal(out var balance))
                throw new JsonException("Financial-account response contains invalid summary fields.");

            rows.Add((type, currency, activeElement.GetBoolean(), balance));
        }

        if (rows.Select(x => x.Currency).Distinct(StringComparer.OrdinalIgnoreCase).Count() > MaxCurrencies)
            throw new JsonException("Financial-account response contains too many currencies to summarize safely.");

        var balances = rows.GroupBy(x => new { x.Type, x.Currency })
            .OrderBy(x => x.Key.Type, StringComparer.Ordinal)
            .ThenBy(x => x.Key.Currency, StringComparer.Ordinal)
            .Select(group => new
            {
                accountType = group.Key.Type,
                currencyCode = group.Key.Currency,
                accountCount = group.Count(),
                activeAccountCount = group.Count(x => x.Active),
                recordedBalance = group.Sum(x => x.Balance)
            }).ToArray();

        return JsonSerializer.Serialize(new
        {
            asOfUtc = DateTimeOffset.UtcNow,
            basis = "Recorded tenant cash/bank transactions; this is not bank-statement reconciliation or a cleared-funds confirmation.",
            accountCount = rows.Count,
            balances
        });
    }

    private static bool TryGetType(JsonElement item, out string type)
    {
        type = "";
        if (item.ValueKind != JsonValueKind.Object || !item.TryGetProperty("type", out var value)) return false;
        if (value.ValueKind == JsonValueKind.String)
        {
            var text = value.GetString();
            if (text is "Cash" or "Bank") { type = text; return true; }
            return false;
        }
        if (value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out var numeric) && numeric is 1 or 2)
        {
            type = numeric == 1 ? "Cash" : "Bank";
            return true;
        }
        return false;
    }

    private static bool TryGetCurrency(JsonElement item, out string currency)
    {
        currency = "";
        if (item.ValueKind != JsonValueKind.Object || !item.TryGetProperty("currencyCode", out var value) ||
            value.ValueKind != JsonValueKind.String) return false;
        var text = value.GetString()?.Trim();
        if (string.IsNullOrWhiteSpace(text) || text.Length > 10 || text.Any(char.IsControl)) return false;
        currency = text.ToUpperInvariant();
        return true;
    }
}
