using System.Globalization;
using System.Text.Json;
using AIERP.Platform.Application;

namespace AIERP.AIService.AI;

/// <summary>Bounds and minimizes a tenant-authorized inventory movement report.</summary>
internal static class ERPAssistantInventoryMovementTools
{
    private const int MaxMovements = 10;

    public static bool TryValidateRequest(string? stockCodeValue, string? fromValue, string? toValue, DateOnly today,
        out string stockCode, out DateOnly from, out DateOnly to)
    {
        stockCode = stockCodeValue?.Trim() ?? string.Empty;
        from = default;
        to = default;
        if (stockCode.Length is < 2 or > 100 || stockCode.Any(char.IsControl) ||
            !DateOnly.TryParseExact(fromValue, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out from) ||
            !DateOnly.TryParseExact(toValue, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out to))
            return false;
        return to >= from && to <= today && to.DayNumber - from.DayNumber <= 365;
    }

    public static async Task<bool> IsReadAllowedAsync(Guid tenantId, Guid userId, string role,
        IPlatformPermissionAuthorizer authorizer, CancellationToken cancellationToken)
    {
        // The report endpoint has its own permission gate in addition to the
        // source-module permission checked for the underlying inventory data.
        if (!await ERPAssistantReportAccess.IsSourceAllowedAsync("inventoryTransactions", tenantId, userId, role, authorizer, cancellationToken))
            return false;

        return await ERPAssistantReportAccess.IsReportRunAllowedAsync(tenantId, userId, role, authorizer, cancellationToken);
    }

    public static string SummarizeReport(JsonElement report, string expectedStockCode, DateOnly from, DateOnly to)
    {
        if (report.ValueKind != JsonValueKind.Object ||
            !TryString(report, "source", out var source) || source != "inventoryTransactions" ||
            !TryInt32(report, "page", out var page) || page != 1 ||
            !TryInt32(report, "totalCount", out var totalCount) || totalCount < 0 ||
            !report.TryGetProperty("rows", out var rows) || rows.ValueKind != JsonValueKind.Array ||
            rows.GetArrayLength() > MaxMovements || rows.GetArrayLength() > totalCount)
            throw new JsonException("Inventory movement report exceeded the bounded result shape.");

        var movements = new List<Movement>(rows.GetArrayLength());
        foreach (var row in rows.EnumerateArray())
        {
            if (!TryString(row, "entryDate", out var dateText) ||
                !DateOnly.TryParseExact(dateText, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date) || date < from || date > to ||
                !TryString(row, "direction", out var direction) || direction is not ("Receipt" or "Issue") ||
                !TryString(row, "stockCode", out var stockCode) || !string.Equals(stockCode, expectedStockCode, StringComparison.OrdinalIgnoreCase) ||
                !TryDecimal(row, "quantity", out var quantity) || quantity < 0 ||
                !TryOptionalString(row, "enteredUnitCode", out var unitCode))
                throw new JsonException("Inventory movement report contains invalid summary fields.");
            movements.Add(new Movement(dateText, direction, quantity, unitCode));
        }

        return JsonSerializer.Serialize(new
        {
            stockCode = expectedStockCode,
            from = from.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            to = to.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            totalCount,
            returned = movements.Count,
            hasMore = totalCount > movements.Count,
            movements = movements.Select(x => new { x.entryDate, x.direction, x.quantity, x.unitCode })
        });
    }

    private static bool TryString(JsonElement value, string property, out string text)
    {
        text = string.Empty;
        if (value.ValueKind != JsonValueKind.Object || !value.TryGetProperty(property, out var element) || element.ValueKind != JsonValueKind.String) return false;
        text = element.GetString() ?? string.Empty;
        return !string.IsNullOrWhiteSpace(text) && text.Length <= 100 && !text.Any(char.IsControl);
    }

    private static bool TryInt32(JsonElement value, string property, out int number)
    {
        number = 0;
        if (value.ValueKind != JsonValueKind.Object || !value.TryGetProperty(property, out var element) || element.ValueKind != JsonValueKind.Number)
            return false;
        return element.TryGetInt32(out number);
    }

    private static bool TryOptionalString(JsonElement value, string property, out string? text)
    {
        text = null;
        if (value.ValueKind != JsonValueKind.Object || !value.TryGetProperty(property, out var element)) return false;
        if (element.ValueKind == JsonValueKind.Null) return true;
        if (element.ValueKind != JsonValueKind.String) return false;
        text = element.GetString();
        return text is null || (text.Length <= 100 && !text.Any(char.IsControl));
    }

    private static bool TryDecimal(JsonElement value, string property, out decimal number)
    {
        number = 0;
        if (value.ValueKind != JsonValueKind.Object || !value.TryGetProperty(property, out var element) || element.ValueKind != JsonValueKind.Number)
            return false;
        return element.TryGetDecimal(out number);
    }

    private sealed record Movement(string entryDate, string direction, decimal quantity, string? unitCode);
}
