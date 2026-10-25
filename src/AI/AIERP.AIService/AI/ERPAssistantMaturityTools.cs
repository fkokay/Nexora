using System.Globalization;
using System.Text.Json;
using AIERP.Platform.Application;

namespace AIERP.AIService.AI;

/// <summary>Projects invoice maturities to bounded currency/direction aging aggregates only.</summary>
internal static class ERPAssistantMaturityTools
{
    private const string MaturitiesPath = "/api/finance/maturities";
    private const int MaxCurrencyRows = 40;

    public static bool TryValidateAsOfDate(string? value, DateTimeOffset utcNow, out DateOnly asOfDate)
    {
        asOfDate = default;
        return DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out asOfDate)
            && asOfDate <= IstanbulDateHelper.FromUtc(utcNow);
    }

    public static async Task<bool> IsReadAllowedAsync(Guid tenantId, Guid userId, string role,
        IPlatformPermissionAuthorizer authorizer, CancellationToken cancellationToken)
    {
        if (!PlatformPermissionCatalog.TryResolve(MaturitiesPath, "GET", MaturitiesPath,
                new Dictionary<string, string?>(), tenantId, userId, role, out var permission) ||
            permission is null || permission.Permission.Code != "erp.maturities.read")
            return false;

        return await authorizer.IsAllowedAsync(tenantId, userId, role, permission, cancellationToken);
    }

    public static string SummarizeMaturities(JsonElement root, DateOnly expectedAsOfDate)
    {
        if (root.ValueKind != JsonValueKind.Object || !TryDate(root, "asOfDate", out var asOfDate) || asOfDate != expectedAsOfDate ||
            !root.TryGetProperty("summaries", out var summaries) || summaries.ValueKind != JsonValueKind.Array ||
            summaries.GetArrayLength() > MaxCurrencyRows)
            throw new JsonException("Invoice-maturity response exceeded the allowed aggregate shape.");

        var rows = new List<MaturitySummary>(summaries.GetArrayLength());
        foreach (var summary in summaries.EnumerateArray())
        {
            if (!TryString(summary, "direction", out var direction) || direction is not ("Receivable" or "Payable") ||
                !TryString(summary, "currencyCode", out var currencyCode) || currencyCode.Length > 10 ||
                !TryNonNegativeInt32(summary, "invoiceCount", out var invoiceCount) ||
                !TryNonNegativeDecimal(summary, "outstandingAmount", out var outstanding) ||
                !TryNonNegativeDecimal(summary, "notDue", out var notDue) ||
                !TryNonNegativeDecimal(summary, "days1To30", out var days1To30) ||
                !TryNonNegativeDecimal(summary, "days31To60", out var days31To60) ||
                !TryNonNegativeDecimal(summary, "days61To90", out var days61To90) ||
                !TryNonNegativeDecimal(summary, "over90Days", out var over90))
                throw new JsonException("Invoice-maturity aggregate contains invalid fields.");

            if (outstanding != notDue + days1To30 + days31To60 + days61To90 + over90)
                throw new JsonException("Invoice-maturity aggregate buckets do not reconcile.");
            rows.Add(new MaturitySummary(direction, currencyCode.ToUpperInvariant(), invoiceCount, outstanding,
                notDue, days1To30, days31To60, days61To90, over90));
        }

        if (rows.Select(x => x.CurrencyCode).Distinct(StringComparer.OrdinalIgnoreCase).Count() > MaxCurrencyRows / 2 ||
            rows.GroupBy(x => (x.Direction, x.CurrencyCode)).Any(group => group.Count() != 1))
            throw new JsonException("Invoice-maturity aggregate contains too many or duplicate currency groups.");

        return JsonSerializer.Serialize(new
        {
            asOfDate = asOfDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            basis = "Outstanding posted sales and purchase invoices, net of posted allocations/returns, grouped by currency and receivable/payable aging. Not a cash balance or statutory report.",
            currencies = rows.OrderBy(x => x.Direction, StringComparer.Ordinal).ThenBy(x => x.CurrencyCode, StringComparer.Ordinal)
                .Select(x => new
                {
                    direction = x.Direction,
                    currencyCode = x.CurrencyCode,
                    invoiceCount = x.InvoiceCount,
                    outstandingAmount = x.OutstandingAmount,
                    notDue = x.NotDue,
                    days1To30 = x.Days1To30,
                    days31To60 = x.Days31To60,
                    days61To90 = x.Days61To90,
                    over90Days = x.Over90Days
                }).ToArray()
        });
    }

    private static bool TryDate(JsonElement value, string name, out DateOnly date)
    {
        date = default;
        return value.ValueKind == JsonValueKind.Object && value.TryGetProperty(name, out var item) &&
            item.ValueKind == JsonValueKind.String && DateOnly.TryParseExact(item.GetString(), "yyyy-MM-dd",
                CultureInfo.InvariantCulture, DateTimeStyles.None, out date);
    }

    private static bool TryString(JsonElement value, string name, out string text)
    {
        text = "";
        if (value.ValueKind != JsonValueKind.Object || !value.TryGetProperty(name, out var item) ||
            item.ValueKind != JsonValueKind.String || string.IsNullOrWhiteSpace(item.GetString())) return false;
        text = item.GetString()!;
        return text.Length <= 100 && !text.Any(char.IsControl);
    }

    private static bool TryNonNegativeInt32(JsonElement value, string name, out int number)
    {
        number = 0;
        return value.ValueKind == JsonValueKind.Object && value.TryGetProperty(name, out var item) &&
            item.ValueKind == JsonValueKind.Number && item.TryGetInt32(out number) && number >= 0;
    }

    private static bool TryNonNegativeDecimal(JsonElement value, string name, out decimal number)
    {
        number = 0;
        return value.ValueKind == JsonValueKind.Object && value.TryGetProperty(name, out var item) &&
            item.ValueKind == JsonValueKind.Number && item.TryGetDecimal(out number) && number >= 0;
    }

    private sealed record MaturitySummary(string Direction, string CurrencyCode, int InvoiceCount,
        decimal OutstandingAmount, decimal NotDue, decimal Days1To30, decimal Days31To60, decimal Days61To90, decimal Over90Days);
}
