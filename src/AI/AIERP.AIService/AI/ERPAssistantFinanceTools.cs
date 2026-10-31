using System.Globalization;
using System.Text.Json;
using AIERP.Platform.Application;

namespace AIERP.AIService.AI;

/// <summary>
/// Exposes only bounded, tenant-authorized cash-flow aggregates to the ERP assistant.
/// No financial account, counterparty, invoice, or transaction identity is returned.
/// </summary>
internal static class ERPAssistantFinanceTools
{
    private const string ForecastPath = "/api/finance/cash-flow/forecast";
    private const int MaxMonths = 12;
    private const int MaxCurrencies = 20;

    public static async Task<bool> IsReadAllowedAsync(string toolName, Guid tenantId, Guid userId, string role,
        IPlatformPermissionAuthorizer authorizer, CancellationToken cancellationToken)
    {
        if (toolName != "get_cash_flow_forecast" ||
            !PlatformPermissionCatalog.TryResolve(ForecastPath, "GET", ForecastPath,
                new Dictionary<string, string?>(), tenantId, userId, role, out var permission) ||
            permission is null || permission.Permission.Code != "erp.finance-cash-flow.read")
            return false;

        return await authorizer.IsAllowedAsync(tenantId, userId, role, permission, cancellationToken);
    }

    public static bool TryValidatePeriod(string? fromText, int? months, out DateOnly from, out int horizon)
    {
        from = default;
        horizon = 0;
        if (!DateOnly.TryParseExact(fromText, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out from) ||
            from.Day != 1 || from < new DateOnly(2000, 1, 1) || months is < 1 or > MaxMonths)
            return false;

        try { _ = from.AddMonths(months!.Value); }
        catch (ArgumentOutOfRangeException) { return false; }
        horizon = months.Value;
        return true;
    }

    public static string SummarizeCashForecast(JsonElement root)
    {
        if (root.ValueKind != JsonValueKind.Object ||
            !TryGetDate(root, "from", out var from) || from.Day != 1 ||
            !TryGetInt32(root, "months", out var horizon) || horizon is < 1 or > MaxMonths ||
            !TryGetString(root, "baseCurrencyCode", out var baseCurrency) ||
            !root.TryGetProperty("currencies", out var currencies) || currencies.ValueKind != JsonValueKind.Array ||
            currencies.GetArrayLength() > MaxCurrencies)
            throw new JsonException("Cash forecast exceeded the allowed summary shape.");

        var rows = new List<object>();
        foreach (var currency in currencies.EnumerateArray())
        {
            if (!TryGetString(currency, "currencyCode", out var currencyCode) ||
                !currency.TryGetProperty("months", out var months) || months.ValueKind != JsonValueKind.Array ||
                months.GetArrayLength() != horizon)
                throw new JsonException("Cash forecast currency rows were invalid.");

            var monthRows = new List<object>(horizon);
            foreach (var month in months.EnumerateArray())
            {
                if (!TryGetDate(month, "periodStart", out var periodStart) || periodStart.Day != 1 ||
                    !TryGetDecimal(month, "directCashBudgetInflows", out var plannedInflow) || plannedInflow < 0 ||
                    !TryGetDecimal(month, "directCashBudgetOutflows", out var plannedOutflow) || plannedOutflow < 0 ||
                    !TryGetDecimal(month, "netChange", out var netChange) ||
                    !TryGetDecimal(month, "closingBalance", out var closingBalance))
                    throw new JsonException("Cash forecast month rows were invalid.");

                monthRows.Add(new
                {
                    periodStart = periodStart.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                    plannedCashInflows = plannedInflow,
                    plannedCashOutflows = plannedOutflow,
                    netChange,
                    closingBalance
                });
            }
            rows.Add(new { currencyCode, months = monthRows });
        }

        var assumptions = TryGetString(root, "assumptions", out var value) ? value : "";
        return JsonSerializer.Serialize(new
        {
            from = from.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            months = horizon,
            baseCurrencyCode = baseCurrency,
            assumptions,
            currencyCount = rows.Count,
            currencies = rows
        });
    }

    private static bool TryGetString(JsonElement value, string property, out string result)
    {
        result = "";
        if (value.ValueKind != JsonValueKind.Object || !value.TryGetProperty(property, out var element) ||
            element.ValueKind != JsonValueKind.String || string.IsNullOrWhiteSpace(element.GetString())) return false;
        result = element.GetString()!;
        return result.Length <= 1000;
    }

    private static bool TryGetDate(JsonElement value, string property, out DateOnly result)
    {
        result = default;
        return value.ValueKind == JsonValueKind.Object && value.TryGetProperty(property, out var element) &&
            element.ValueKind == JsonValueKind.String && DateOnly.TryParseExact(element.GetString(), "yyyy-MM-dd",
                CultureInfo.InvariantCulture, DateTimeStyles.None, out result);
    }

    private static bool TryGetInt32(JsonElement value, string property, out int result)
    {
        result = 0;
        return value.ValueKind == JsonValueKind.Object && value.TryGetProperty(property, out var element) &&
            element.ValueKind == JsonValueKind.Number && element.TryGetInt32(out result);
    }

    private static bool TryGetDecimal(JsonElement value, string property, out decimal result)
    {
        result = 0;
        return value.ValueKind == JsonValueKind.Object && value.TryGetProperty(property, out var element) &&
            element.ValueKind == JsonValueKind.Number && element.TryGetDecimal(out result);
    }
}
