using System.Globalization;
using System.Text.Json;
using AIERP.Platform.Application;

namespace AIERP.AIService.AI;

/// <summary>Validates and minimizes a tenant-authorized lot/serial genealogy result.</summary>
internal static class ERPAssistantInventoryGenealogyTools
{
    public const int MaxEvents = 50;

    public static bool TryValidateRequest(string? stockItemCodeValue, string? trackingCodeValue,
        out string stockItemCode, out string trackingCode)
    {
        if (stockItemCodeValue?.Any(char.IsControl) == true || trackingCodeValue?.Any(char.IsControl) == true)
        {
            stockItemCode = string.Empty;
            trackingCode = string.Empty;
            return false;
        }
        stockItemCode = stockItemCodeValue?.Trim() ?? string.Empty;
        trackingCode = trackingCodeValue?.Trim() ?? string.Empty;
        return stockItemCode.Length is >= 2 and <= 100 && !stockItemCode.Any(char.IsControl)
            && trackingCode.Length is >= 1 and <= 120 && !trackingCode.Any(char.IsControl);
    }

    public static Task<bool> IsReadAllowedAsync(Guid tenantId, Guid userId, string role,
        IPlatformPermissionAuthorizer authorizer, CancellationToken cancellationToken) =>
        ERPAssistantReportAccess.IsSourceAllowedAsync("inventoryTracking", tenantId, userId, role, authorizer, cancellationToken);

    public static string SummarizeGenealogy(JsonElement result, string expectedStockCode, string expectedTrackingCode)
    {
        if (result.ValueKind != JsonValueKind.Object ||
            !TryString(result, "stockItemCode", out var stockCode) || !string.Equals(stockCode, expectedStockCode, StringComparison.OrdinalIgnoreCase) ||
            !TryString(result, "trackingCode", out var trackingCode) || !string.Equals(trackingCode, expectedTrackingCode, StringComparison.Ordinal) ||
            !TryString(result, "trackingMode", out var trackingMode) || trackingMode is not ("Lot" or "Serial") ||
            !TryString(result, "unitCode", out var unitCode) ||
            !TryInt32(result, "totalEvents", out var totalEvents) || totalEvents < 0 ||
            !TryInt32(result, "limit", out var limit) || limit != MaxEvents ||
            !result.TryGetProperty("isComplete", out var completeElement) || completeElement.ValueKind is not (JsonValueKind.True or JsonValueKind.False) ||
            !result.TryGetProperty("coverage", out var coverageElement) || coverageElement.ValueKind != JsonValueKind.String ||
            !result.TryGetProperty("events", out var eventArray) || eventArray.ValueKind != JsonValueKind.Array || eventArray.GetArrayLength() > MaxEvents)
            throw new JsonException("Inventory genealogy exceeded the bounded result shape.");

        var coverage = coverageElement.GetString();
        var isComplete = completeElement.GetBoolean();
        if (coverage is not ("complete" or "incomplete") || isComplete != (coverage == "complete") || totalEvents < eventArray.GetArrayLength())
            throw new JsonException("Inventory genealogy coverage metadata is inconsistent.");

        var events = new List<object>(eventArray.GetArrayLength());
        foreach (var item in eventArray.EnumerateArray())
        {
            if (!TryString(item, "date", out var dateText) ||
                !DateOnly.TryParseExact(dateText, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _) ||
                !TryString(item, "direction", out var direction) || direction is not ("Receipt" or "Issue") ||
                !TryDecimal(item, "quantity", out var quantity) || quantity < 0 ||
                !TryString(item, "warehouseCode", out var warehouseCode) ||
                !TryOptionalString(item, "sourceType", out var sourceType) ||
                !TryOptionalString(item, "sourceCode", out var sourceCode) ||
                !TryBool(item, "isReversal", out var isReversal) ||
                !TryBool(item, "sourceResolved", out var sourceResolved))
                throw new JsonException("Inventory genealogy contains invalid event fields.");

            if (sourceType is not null && sourceType is not ("purchaseReceipt" or "salesDelivery" or "salesReturn" or "supplierReturn" or "manufacturingOrder" or "inventoryTransfer" or "reversal"))
                throw new JsonException("Inventory genealogy contains an unsupported source type.");
            if (sourceResolved && sourceType is null || sourceResolved && sourceCode is null && sourceType != "reversal")
                throw new JsonException("Inventory genealogy source resolution metadata is inconsistent.");

            events.Add(new
            {
                date = dateText,
                direction,
                quantity,
                unitCode,
                warehouseCode,
                sourceType,
                sourceCode = sourceResolved ? sourceCode : null,
                isReversal,
                sourceResolved
            });
        }

        return JsonSerializer.Serialize(new
        {
            stockItemCode = stockCode,
            trackingMode,
            trackingCode,
            unitCode,
            totalEvents,
            returned = events.Count,
            hasMore = totalEvents > events.Count,
            coverage,
            events
        });
    }

    private static bool TryString(JsonElement value, string property, out string text)
    {
        text = string.Empty;
        if (value.ValueKind != JsonValueKind.Object || !value.TryGetProperty(property, out var element) || element.ValueKind != JsonValueKind.String) return false;
        text = element.GetString() ?? string.Empty;
        return !string.IsNullOrWhiteSpace(text) && text.Length <= 120 && !text.Any(char.IsControl);
    }

    private static bool TryOptionalString(JsonElement value, string property, out string? text)
    {
        text = null;
        if (value.ValueKind != JsonValueKind.Object || !value.TryGetProperty(property, out var element)) return false;
        if (element.ValueKind == JsonValueKind.Null) return true;
        if (element.ValueKind != JsonValueKind.String) return false;
        text = element.GetString();
        return text is null || (text.Length is > 0 and <= 120 && !text.Any(char.IsControl));
    }

    private static bool TryInt32(JsonElement value, string property, out int number)
    {
        number = 0;
        return value.ValueKind == JsonValueKind.Object && value.TryGetProperty(property, out var element)
            && element.ValueKind == JsonValueKind.Number && element.TryGetInt32(out number);
    }

    private static bool TryDecimal(JsonElement value, string property, out decimal number)
    {
        number = 0;
        return value.ValueKind == JsonValueKind.Object && value.TryGetProperty(property, out var element)
            && element.ValueKind == JsonValueKind.Number && element.TryGetDecimal(out number);
    }

    private static bool TryBool(JsonElement value, string property, out bool result)
    {
        result = false;
        if (value.ValueKind != JsonValueKind.Object || !value.TryGetProperty(property, out var element) || element.ValueKind is not (JsonValueKind.True or JsonValueKind.False))
            return false;
        result = element.GetBoolean();
        return true;
    }
}
