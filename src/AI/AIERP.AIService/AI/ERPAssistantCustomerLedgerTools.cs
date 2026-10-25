using System.Globalization;
using System.Text.Json;
using AIERP.Platform.Application;

namespace AIERP.AIService.AI;

/// <summary>Validates and minimizes a bounded customer-ledger report for the read-only assistant.</summary>
internal static class ERPAssistantCustomerLedgerTools
{
    private const int MaxEntries = 10;

    public static bool TryValidatePeriod(string? fromValue, string? toValue, DateOnly today,
        out DateOnly from, out DateOnly to)
    {
        from = default;
        to = default;
        if (!DateOnly.TryParseExact(fromValue, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out from) ||
            !DateOnly.TryParseExact(toValue, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out to))
            return false;

        return to >= from && to <= today && to.DayNumber - from.DayNumber <= 365;
    }

    public static async Task<bool> IsReadAllowedAsync(Guid tenantId, Guid userId, string role,
        IPlatformPermissionAuthorizer authorizer, CancellationToken cancellationToken) =>
        await ERPAssistantReportAccess.IsSourceAllowedAsync("customerLedgerEntries", tenantId, userId, role, authorizer, cancellationToken);

    public static string SummarizeLedgerReport(JsonElement report, DateOnly from, DateOnly to)
    {
        if (report.ValueKind != JsonValueKind.Object ||
            !TryString(report, "source", out var source) || source != "customerLedgerEntries" ||
            !TryInt32(report, "page", out var page) || page != 1 ||
            !TryInt32(report, "totalCount", out var totalCount) || totalCount < 0 ||
            !report.TryGetProperty("rows", out var rows) || rows.ValueKind != JsonValueKind.Array ||
            rows.GetArrayLength() > MaxEntries || rows.GetArrayLength() > totalCount)
            throw new JsonException("Customer-ledger report exceeded the bounded result shape.");

        var entries = new List<LedgerEntry>(rows.GetArrayLength());
        foreach (var row in rows.EnumerateArray())
        {
            if (!TryString(row, "entryDate", out var dateText) ||
                !DateOnly.TryParseExact(dateText, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date) ||
                date < from || date > to ||
                !TryString(row, "direction", out var direction) || direction is not ("Debit" or "Credit") ||
                !TryDecimal(row, "amount", out var amount) || amount < 0 ||
                !TryString(row, "currencyCode", out var currencyCode) || currencyCode.Length > 10)
                throw new JsonException("Customer-ledger report contains invalid summary fields.");

            entries.Add(new LedgerEntry(dateText, direction, amount, currencyCode.ToUpperInvariant()));
        }

        return JsonSerializer.Serialize(new
        {
            from = from.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            to = to.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            totalCount,
            returned = entries.Count,
            hasMore = totalCount > entries.Count,
            entries = entries.Select(entry => new
            {
                entry.entryDate,
                entry.direction,
                entry.amount,
                entry.currencyCode
            })
        });
    }

    private static bool TryString(JsonElement value, string property, out string text)
    {
        text = string.Empty;
        if (value.ValueKind != JsonValueKind.Object || !value.TryGetProperty(property, out var element) ||
            element.ValueKind != JsonValueKind.String) return false;
        text = element.GetString() ?? string.Empty;
        return !string.IsNullOrWhiteSpace(text) && text.Length <= 100 && !text.Any(char.IsControl);
    }

    private static bool TryInt32(JsonElement value, string property, out int number)
    {
        number = 0;
        return value.ValueKind == JsonValueKind.Object && value.TryGetProperty(property, out var element) &&
            element.ValueKind == JsonValueKind.Number && element.TryGetInt32(out number);
    }

    private static bool TryDecimal(JsonElement value, string property, out decimal number)
    {
        number = 0;
        return value.ValueKind == JsonValueKind.Object && value.TryGetProperty(property, out var element) &&
            element.ValueKind == JsonValueKind.Number && element.TryGetDecimal(out number);
    }

    private sealed record LedgerEntry(string entryDate, string direction, decimal amount, string currencyCode);
}
