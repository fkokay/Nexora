using System.Globalization;
using System.Text.Json;
using AIERP.Platform.Application;

namespace AIERP.AIService.AI;

/// <summary>Bounds and minimizes supplier-delivery-note facts shared with the read-only assistant.</summary>
internal static class ERPAssistantPurchaseDeliveryNoteTools
{
    private const string SearchPath = "/api/purchasing/delivery-notes/search";
    private const int MaxResults = 10;
    private const int MaxLines = 50;

    public static bool TryValidateSearchTerm(string? value, out string term)
    {
        term = value?.Trim() ?? string.Empty;
        return term.Length is >= 2 and <= 100;
    }

    public static bool TryValidateDocumentNumber(string? value, out string documentNumber)
    {
        documentNumber = value?.Trim() ?? string.Empty;
        return documentNumber.Length is >= 2 and <= 80 && !documentNumber.Any(char.IsControl);
    }

    public static async Task<bool> IsReadAllowedAsync(Guid tenantId, Guid userId, string role,
        IPlatformPermissionAuthorizer authorizer, CancellationToken cancellationToken)
    {
        if (!PlatformPermissionCatalog.TryResolve(SearchPath, "GET", SearchPath,
                new Dictionary<string, string?>(), tenantId, userId, role, out var permission) ||
            permission is null || permission.Permission.Code != "erp.purchase-delivery-notes.read")
            return false;

        return await authorizer.IsAllowedAsync(tenantId, userId, role, permission, cancellationToken);
    }

    public static string SummarizeNotes(JsonElement response)
    {
        if (response.ValueKind != JsonValueKind.Object ||
            !TryGetInt32(response, "totalCount", out var totalCount) || totalCount < 0 ||
            !response.TryGetProperty("items", out var items) || items.ValueKind != JsonValueKind.Array ||
            items.GetArrayLength() > MaxResults || items.GetArrayLength() > totalCount)
            throw new JsonException("Supplier delivery-note search returned an invalid bounded result shape.");

        var projected = items.EnumerateArray().Select(item => new
        {
            documentNumber = RequiredString(item, "documentNumber", 80),
            purchaseOrderCode = RequiredString(item, "purchaseOrderCode", 80),
            documentDate = RequiredDate(item, "documentDate").ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            lineCount = RequiredInt32(item, "lineCount"),
            linkedToReceipt = RequiredBoolean(item, "linkedToReceipt")
        }).ToArray();

        return JsonSerializer.Serialize(new
        {
            totalCount,
            returned = projected.Length,
            hasMore = totalCount > projected.Length,
            items = projected
        });
    }

    public static string SummarizeNoteDetails(JsonElement response)
    {
        if (response.ValueKind != JsonValueKind.Object ||
            !TryGetInt32(response, "lineCount", out var lineCount) || lineCount < 0 ||
            !TryGetInt32(response, "returnedLines", out var returnedLines) || returnedLines < 0 || returnedLines > MaxLines || returnedLines > lineCount ||
            !response.TryGetProperty("hasMoreLines", out var moreLines) || moreLines.ValueKind is not (JsonValueKind.True or JsonValueKind.False) ||
            moreLines.GetBoolean() != (lineCount > returnedLines) ||
            !response.TryGetProperty("lines", out var lines) || lines.ValueKind != JsonValueKind.Array || lines.GetArrayLength() != returnedLines)
            throw new JsonException("Supplier delivery-note detail returned an invalid bounded result shape.");

        var projectedLines = lines.EnumerateArray().Select(line => new
        {
            lineNumber = RequiredPositiveInt32(line, "lineNumber"),
            unitCode = RequiredString(line, "unitCode", 20),
            quantity = RequiredNonNegativeDecimal(line, "quantity")
        }).ToArray();

        return JsonSerializer.Serialize(new
        {
            documentNumber = RequiredString(response, "documentNumber", 80),
            purchaseOrderCode = RequiredString(response, "purchaseOrderCode", 80),
            documentDate = RequiredDate(response, "documentDate").ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            linkedToReceipt = RequiredBoolean(response, "linkedToReceipt"),
            lineCount,
            returnedLines,
            hasMoreLines = moreLines.GetBoolean(),
            lines = projectedLines
        });
    }

    private static bool TryGetInt32(JsonElement value, string property, out int result)
    {
        result = 0;
        return value.ValueKind == JsonValueKind.Object && value.TryGetProperty(property, out var element) &&
            element.ValueKind == JsonValueKind.Number && element.TryGetInt32(out result);
    }

    private static string RequiredString(JsonElement item, string property, int maxLength) =>
        item.ValueKind == JsonValueKind.Object && item.TryGetProperty(property, out var value) &&
        value.ValueKind == JsonValueKind.String && value.GetString() is { Length: > 0 } text && text.Length <= maxLength
            ? text
            : throw new JsonException($"Supplier delivery-note search omitted or invalidated {property}.");

    private static DateOnly RequiredDate(JsonElement item, string property) =>
        item.ValueKind == JsonValueKind.Object && item.TryGetProperty(property, out var value) &&
        value.ValueKind == JsonValueKind.String && DateOnly.TryParseExact(value.GetString(), "yyyy-MM-dd",
            CultureInfo.InvariantCulture, DateTimeStyles.None, out var date)
            ? date
            : throw new JsonException($"Supplier delivery-note search omitted or invalidated {property}.");

    private static int RequiredInt32(JsonElement item, string property) =>
        item.ValueKind == JsonValueKind.Object && item.TryGetProperty(property, out var value) &&
        value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out var number) && number >= 0
            ? number
            : throw new JsonException($"Supplier delivery-note search omitted or invalidated {property}.");

    private static bool RequiredBoolean(JsonElement item, string property) =>
        item.ValueKind == JsonValueKind.Object && item.TryGetProperty(property, out var value) &&
        value.ValueKind is JsonValueKind.True or JsonValueKind.False
            ? value.GetBoolean()
            : throw new JsonException($"Supplier delivery-note search omitted or invalidated {property}.");

    private static int RequiredPositiveInt32(JsonElement item, string property) =>
        TryGetInt32(item, property, out var number) && number > 0
            ? number : throw new JsonException($"Supplier delivery-note detail omitted or invalidated {property}.");

    private static decimal RequiredNonNegativeDecimal(JsonElement item, string property) =>
        item.ValueKind == JsonValueKind.Object && item.TryGetProperty(property, out var value) &&
        value.ValueKind == JsonValueKind.Number && value.TryGetDecimal(out var number) && number >= 0
            ? number : throw new JsonException($"Supplier delivery-note detail omitted or invalidated {property}.");

}
