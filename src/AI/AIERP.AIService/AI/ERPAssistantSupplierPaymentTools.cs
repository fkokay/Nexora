using System.Globalization;
using System.Text.Json;
using AIERP.Platform.Application;

namespace AIERP.AIService.AI;

/// <summary>Validates and minimizes a bounded supplier-payment report for the read-only assistant.</summary>
internal static class ERPAssistantSupplierPaymentTools
{
    private const int MaxPayments = 10;

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
        await ERPAssistantReportAccess.IsSourceAllowedAsync("supplierPayments", tenantId, userId, role, authorizer, cancellationToken);

    public static string SummarizeReport(JsonElement report, DateOnly from, DateOnly to)
    {
        if (report.ValueKind != JsonValueKind.Object ||
            !TryString(report, "source", out var source) || source != "supplierPayments" ||
            !TryInt32(report, "page", out var page) || page != 1 ||
            !TryInt32(report, "totalCount", out var totalCount) || totalCount < 0 ||
            !report.TryGetProperty("rows", out var rows) || rows.ValueKind != JsonValueKind.Array ||
            rows.GetArrayLength() > MaxPayments || rows.GetArrayLength() > totalCount)
            throw new JsonException("Supplier-payment report exceeded the bounded result shape.");

        var payments = new List<SupplierPayment>(rows.GetArrayLength());
        foreach (var row in rows.EnumerateArray())
        {
            if (!TryString(row, "paymentDate", out var dateText) ||
                !DateOnly.TryParseExact(dateText, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date) ||
                date < from || date > to ||
                !TryDecimal(row, "amount", out var amount) || amount < 0 ||
                !TryString(row, "currencyCode", out var currencyCode) || currencyCode.Length > 10 ||
                !TryString(row, "paymentMethod", out var paymentMethod) || paymentMethod.Length > 50 ||
                !TryString(row, "status", out var status) || status is not ("Posted" or "Voided"))
                throw new JsonException("Supplier-payment report contains invalid summary fields.");

            payments.Add(new SupplierPayment(dateText, amount, currencyCode.ToUpperInvariant(), paymentMethod, status));
        }

        return JsonSerializer.Serialize(new
        {
            from = from.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            to = to.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            totalCount,
            returned = payments.Count,
            hasMore = totalCount > payments.Count,
            payments = payments.Select(item => new
            {
                item.paymentDate,
                item.amount,
                item.currencyCode,
                item.paymentMethod,
                item.status
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

    private sealed record SupplierPayment(string paymentDate, decimal amount, string currencyCode, string paymentMethod, string status);
}
