using System.Text.Json;

namespace AIERP.AIService.AI;

/// <summary>
/// Bounds invoice searches and projects list responses to the minimum fields needed
/// for read-only business questions. Customer/supplier identities and internal IDs
/// stay out of the model context.
/// </summary>
internal static class ERPAssistantInvoiceTools
{
    public static bool TryValidateSearchTerm(string? value, out string term)
    {
        term = value?.Trim() ?? string.Empty;
        return term.Length is >= 2 and <= 100;
    }

    public static string SummarizeSalesInvoices(JsonElement response) => SummarizeInvoices(response, item => new
    {
        code = RequiredString(item, "code"),
        invoiceDate = RequiredString(item, "invoiceDate"),
        currencyCode = RequiredString(item, "currencyCode"),
        status = RequiredString(item, "status"),
        total = RequiredDecimal(item, "grandTotal"),
        lineCount = RequiredInt32(item, "lineCount")
    });

    public static string SummarizePurchaseInvoices(JsonElement response) => SummarizeInvoices(response, item => new
    {
        code = RequiredString(item, "code"),
        invoiceDate = RequiredString(item, "invoiceDate"),
        dueDate = RequiredString(item, "dueDate"),
        currencyCode = RequiredString(item, "currencyCode"),
        status = RequiredString(item, "status"),
        total = RequiredDecimal(item, "grandTotal"),
        outstanding = RequiredDecimal(item, "outstandingAmount"),
        lineCount = RequiredInt32(item, "lineCount")
    });

    private static string SummarizeInvoices<T>(JsonElement response, Func<JsonElement, T> project)
    {
        if (response.ValueKind != JsonValueKind.Object ||
            !response.TryGetProperty("items", out var items) || items.ValueKind != JsonValueKind.Array ||
            !response.TryGetProperty("totalCount", out var totalCount) ||
            totalCount.ValueKind != JsonValueKind.Number || !totalCount.TryGetInt32(out var total) || total < 0 ||
            items.GetArrayLength() > 10 || items.GetArrayLength() > total)
            throw new JsonException("Invoice search returned an invalid bounded result shape.");

        var projected = items.EnumerateArray().Select(project).ToArray();
        return JsonSerializer.Serialize(new { totalCount = total, returned = projected.Length, items = projected,
            hasMore = total > projected.Length });
    }

    private static string RequiredString(JsonElement item, string property) =>
        item.ValueKind == JsonValueKind.Object && item.TryGetProperty(property, out var value) &&
        value.ValueKind == JsonValueKind.String
            ? value.GetString() ?? string.Empty
            : throw new JsonException($"Invoice search omitted {property}.");

    private static decimal RequiredDecimal(JsonElement item, string property) =>
        item.ValueKind == JsonValueKind.Object && item.TryGetProperty(property, out var value) &&
        value.ValueKind == JsonValueKind.Number && value.TryGetDecimal(out var number)
            ? number
            : throw new JsonException($"Invoice search omitted {property}.");

    private static int RequiredInt32(JsonElement item, string property) =>
        item.ValueKind == JsonValueKind.Object && item.TryGetProperty(property, out var value) &&
        value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out var number) && number >= 0
            ? number
            : throw new JsonException($"Invoice search omitted {property}.");
}
