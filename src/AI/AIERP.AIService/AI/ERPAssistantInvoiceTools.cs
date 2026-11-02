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

    public static string SummarizeSalesInvoiceDetails(JsonElement response)
    {
        if (response.ValueKind != JsonValueKind.Object ||
            !response.TryGetProperty("totalCount", out var totalCount) || totalCount.ValueKind != JsonValueKind.Number ||
            !totalCount.TryGetInt32(out var total) || total < 0 ||
            !response.TryGetProperty("unique", out var uniqueElement) || uniqueElement.ValueKind is not (JsonValueKind.True or JsonValueKind.False))
            throw new JsonException("Sales invoice detail returned an invalid result shape.");

        if (!uniqueElement.GetBoolean())
        {
            if (total == 1 || !response.TryGetProperty("matches", out var matches) || matches.ValueKind != JsonValueKind.Array ||
                matches.GetArrayLength() > 10 || matches.GetArrayLength() > total)
                throw new JsonException("Ambiguous sales invoice detail returned an invalid bounded result shape.");
            var projectedMatches = matches.EnumerateArray().Select(item => new
            {
                code = RequiredString(item, "code"), invoiceDate = RequiredString(item, "invoiceDate"),
                currencyCode = RequiredString(item, "currencyCode"), status = RequiredString(item, "status"),
                total = RequiredDecimal(item, "total")
            }).ToArray();
            return JsonSerializer.Serialize(new { totalCount = total, unique = false, matches = projectedMatches });
        }

        if (total != 1 || !response.TryGetProperty("invoice", out var invoice) || invoice.ValueKind != JsonValueKind.Object ||
            !invoice.TryGetProperty("lines", out var lines) || lines.ValueKind != JsonValueKind.Array || lines.GetArrayLength() > 50 ||
            !invoice.TryGetProperty("linesTruncated", out var truncated) || truncated.ValueKind is not (JsonValueKind.True or JsonValueKind.False))
            throw new JsonException("Unique sales invoice detail returned an invalid bounded result shape.");
        var projectedLines = lines.EnumerateArray().Select(line => new
        {
            stockCode = RequiredString(line, "stockCode"), item = RequiredString(line, "item"), unit = RequiredString(line, "unit"),
            quantity = RequiredDecimal(line, "quantity"), unitPrice = RequiredDecimal(line, "unitPrice"),
            vatPercent = RequiredDecimal(line, "vatPercent"), total = RequiredDecimal(line, "total")
        }).ToArray();
        return JsonSerializer.Serialize(new
        {
            totalCount = total,
            unique = true,
            invoice = new
            {
                code = RequiredString(invoice, "code"), invoiceDate = RequiredString(invoice, "invoiceDate"),
                currencyCode = RequiredString(invoice, "currencyCode"), status = RequiredString(invoice, "status"),
                total = RequiredDecimal(invoice, "total"), paid = RequiredDecimal(invoice, "paid"),
                returned = RequiredDecimal(invoice, "returned"), outstanding = RequiredDecimal(invoice, "outstanding"),
                lineCount = RequiredInt32(invoice, "lineCount"), linesTruncated = truncated.GetBoolean(), lines = projectedLines
            }
        });
    }

    public static string SummarizePurchaseInvoiceDetails(JsonElement response)
    {
        if (response.ValueKind != JsonValueKind.Object ||
            !response.TryGetProperty("totalCount", out var totalCount) || totalCount.ValueKind != JsonValueKind.Number ||
            !totalCount.TryGetInt32(out var total) || total < 0 ||
            !response.TryGetProperty("unique", out var uniqueElement) || uniqueElement.ValueKind is not (JsonValueKind.True or JsonValueKind.False))
            throw new JsonException("Purchase invoice detail returned an invalid result shape.");

        if (!uniqueElement.GetBoolean())
        {
            if (total == 1 || !response.TryGetProperty("matches", out var matches) || matches.ValueKind != JsonValueKind.Array ||
                matches.GetArrayLength() > 10 || matches.GetArrayLength() > total)
                throw new JsonException("Ambiguous purchase invoice detail returned an invalid bounded result shape.");
            var projectedMatches = matches.EnumerateArray().Select(item => new
            {
                code = RequiredString(item, "code"), invoiceDate = RequiredString(item, "invoiceDate"),
                dueDate = RequiredString(item, "dueDate"), currencyCode = RequiredString(item, "currencyCode"),
                status = RequiredString(item, "status"), total = RequiredDecimal(item, "total")
            }).ToArray();
            return JsonSerializer.Serialize(new { totalCount = total, unique = false, matches = projectedMatches });
        }

        if (total != 1 || !response.TryGetProperty("invoice", out var invoice) || invoice.ValueKind != JsonValueKind.Object ||
            !invoice.TryGetProperty("lines", out var lines) || lines.ValueKind != JsonValueKind.Array || lines.GetArrayLength() > 50 ||
            !invoice.TryGetProperty("linesTruncated", out var truncated) || truncated.ValueKind is not (JsonValueKind.True or JsonValueKind.False))
            throw new JsonException("Unique purchase invoice detail returned an invalid bounded result shape.");
        var projectedLines = lines.EnumerateArray().Select(line => new
        {
            stockCode = RequiredString(line, "stockCode"), item = RequiredString(line, "item"), unit = RequiredString(line, "unit"),
            quantity = RequiredDecimal(line, "quantity"), unitPrice = RequiredDecimal(line, "unitPrice"),
            vatPercent = RequiredDecimal(line, "vatPercent"), total = RequiredDecimal(line, "total")
        }).ToArray();
        return JsonSerializer.Serialize(new
        {
            totalCount = total,
            unique = true,
            invoice = new
            {
                code = RequiredString(invoice, "code"), invoiceDate = RequiredString(invoice, "invoiceDate"),
                dueDate = RequiredString(invoice, "dueDate"), currencyCode = RequiredString(invoice, "currencyCode"),
                status = RequiredString(invoice, "status"), total = RequiredDecimal(invoice, "total"),
                paid = RequiredDecimal(invoice, "paid"), returned = RequiredDecimal(invoice, "returned"),
                outstanding = RequiredDecimal(invoice, "outstanding"), lineCount = RequiredInt32(invoice, "lineCount"),
                linesTruncated = truncated.GetBoolean(), lines = projectedLines
            }
        });
    }

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
