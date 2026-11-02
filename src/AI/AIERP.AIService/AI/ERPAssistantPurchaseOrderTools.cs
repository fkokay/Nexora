using System.Globalization;
using System.Text.Json;
using AIERP.Platform.Application;

namespace AIERP.AIService.AI;

/// <summary>Validates and minimizes one exact purchase-order detail summary for the read-only assistant.</summary>
internal static class ERPAssistantPurchaseOrderTools
{
    private const string SearchPath = "/api/purchasing/orders";
    private const int MaxLines = 50;

    public static bool TryValidateOrderCode(string? value, out string code)
    {
        code = value?.Trim() ?? string.Empty;
        return code.Length is >= 2 and <= 100;
    }

    public static async Task<bool> IsReadAllowedAsync(Guid tenantId, Guid userId, string role,
        IPlatformPermissionAuthorizer authorizer, CancellationToken cancellationToken)
    {
        if (!PlatformPermissionCatalog.TryResolve(SearchPath, "GET", SearchPath,
                new Dictionary<string, string?>(), tenantId, userId, role, out var permission) ||
            permission is null || permission.Permission.Code != "erp.purchase-orders.read")
            return false;

        return await authorizer.IsAllowedAsync(tenantId, userId, role, permission, cancellationToken);
    }

    public static string SummarizeOrder(JsonElement response)
    {
        if (response.ValueKind != JsonValueKind.Object ||
            !TryReadDate(response, "orderDate", out var orderDate) ||
            !TryReadNonNegativeDecimal(response, "subtotal", out var subtotal) ||
            !TryReadNonNegativeDecimal(response, "discountTotal", out var discountTotal) ||
            !TryReadNonNegativeDecimal(response, "taxTotal", out var taxTotal) ||
            !TryReadNonNegativeDecimal(response, "grandTotal", out var grandTotal) ||
            !TryReadNonNegativeInt(response, "lineCount", out var lineCount) ||
            !TryReadNonNegativeInt(response, "returnedLines", out var returnedLines) ||
            returnedLines > MaxLines || returnedLines > lineCount ||
            !response.TryGetProperty("hasMoreLines", out var moreLines) || moreLines.ValueKind is not (JsonValueKind.True or JsonValueKind.False) ||
            moreLines.GetBoolean() != (lineCount > returnedLines) ||
            !response.TryGetProperty("lines", out var lines) || lines.ValueKind != JsonValueKind.Array || lines.GetArrayLength() != returnedLines)
            throw new JsonException("Purchase order summary returned an invalid bounded result shape.");

        var projectedLines = lines.EnumerateArray().Select(line => new
        {
            lineNumber = RequiredPositiveInt(line, "lineNumber"),
            stockCode = RequiredString(line, "stockCode", 100),
            stockName = RequiredString(line, "stockName", 200),
            unitCode = RequiredString(line, "unitCode", 20),
            quantity = RequiredNonNegativeDecimal(line, "quantity"),
            unitPrice = RequiredNonNegativeDecimal(line, "unitPrice"),
            discountPercent = RequiredPercent(line, "discountPercent"),
            vatPercent = RequiredPercent(line, "vatPercent"),
            lineSubtotal = RequiredNonNegativeDecimal(line, "lineSubtotal"),
            taxAmount = RequiredNonNegativeDecimal(line, "taxAmount"),
            lineTotal = RequiredNonNegativeDecimal(line, "lineTotal")
        }).ToArray();

        return JsonSerializer.Serialize(new
        {
            orderCode = RequiredString(response, "orderCode", 100),
            orderDate = orderDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            status = RequiredString(response, "status", 40),
            currencyCode = RequiredCurrency(response),
            subtotal, discountTotal, taxTotal, grandTotal,
            lineCount, returnedLines, hasMoreLines = moreLines.GetBoolean(), lines = projectedLines
        });
    }

    private static string RequiredCurrency(JsonElement item)
    {
        var code = RequiredString(item, "currencyCode", 3);
        return code.Length == 3 && code.All(char.IsAsciiLetter)
            ? code.ToUpperInvariant()
            : throw new JsonException("Purchase order summary invalidated currencyCode.");
    }

    private static string RequiredString(JsonElement item, string property, int maxLength) =>
        item.ValueKind == JsonValueKind.Object && item.TryGetProperty(property, out var value) &&
        value.ValueKind == JsonValueKind.String && value.GetString() is { Length: > 0 } text && text.Length <= maxLength
            ? text : throw new JsonException($"Purchase order summary omitted or invalidated {property}.");

    private static int RequiredPositiveInt(JsonElement item, string property) =>
        TryReadNonNegativeInt(item, property, out var value) && value > 0
            ? value : throw new JsonException($"Purchase order summary omitted or invalidated {property}.");

    private static decimal RequiredNonNegativeDecimal(JsonElement item, string property) =>
        TryReadNonNegativeDecimal(item, property, out var value)
            ? value : throw new JsonException($"Purchase order summary omitted or invalidated {property}.");

    private static decimal RequiredPercent(JsonElement item, string property)
    {
        var value = RequiredNonNegativeDecimal(item, property);
        return value <= 100m ? value : throw new JsonException($"Purchase order summary invalidated {property}.");
    }

    private static bool TryReadNonNegativeInt(JsonElement item, string property, out int value)
    {
        value = 0;
        return item.ValueKind == JsonValueKind.Object && item.TryGetProperty(property, out var element) &&
            element.ValueKind == JsonValueKind.Number && element.TryGetInt32(out value) && value >= 0;
    }

    private static bool TryReadNonNegativeDecimal(JsonElement item, string property, out decimal value)
    {
        value = 0;
        return item.ValueKind == JsonValueKind.Object && item.TryGetProperty(property, out var element) &&
            element.ValueKind == JsonValueKind.Number && element.TryGetDecimal(out value) && value >= 0;
    }

    private static bool TryReadDate(JsonElement item, string property, out DateOnly value)
    {
        value = default;
        return item.ValueKind == JsonValueKind.Object && item.TryGetProperty(property, out var element) &&
            element.ValueKind == JsonValueKind.String && DateOnly.TryParseExact(element.GetString(), "yyyy-MM-dd",
                CultureInfo.InvariantCulture, DateTimeStyles.None, out value);
    }
}
