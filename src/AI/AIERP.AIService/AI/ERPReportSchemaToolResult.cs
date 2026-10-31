using System.Text.Json;

namespace AIERP.AIService.AI;

internal static class ERPReportSchemaToolResult
{
    private const int MaxColumns = 80;
    private const int MaxAggregates = 20;
    private const int MaxTextLength = 160;

    public static string Serialize(JsonElement catalog, string source)
    {
        if (catalog.ValueKind != JsonValueKind.Array)
            return JsonSerializer.Serialize(new { error = "The report catalog is unavailable." });

        foreach (var entry in catalog.EnumerateArray())
        {
            if (entry.ValueKind != JsonValueKind.Object ||
                !entry.TryGetProperty("code", out var code) || code.GetString() != source)
                continue;

            var columns = entry.TryGetProperty("columns", out var availableColumns) && availableColumns.ValueKind == JsonValueKind.Array
                ? availableColumns.EnumerateArray().Take(MaxColumns).Select(column => new
                {
                    code = ReadText(column, "code"),
                    label = ReadText(column, "label"),
                    dataType = ReadText(column, "dataType"),
                    options = column.TryGetProperty("options", out var options) && options.ValueKind == JsonValueKind.Array
                        ? options.EnumerateArray().Where(option => option.ValueKind == JsonValueKind.String)
                            .Select(option => Limit(option.GetString())).Take(100).ToArray()
                        : []
                }).ToArray()
                : [];
            var aggregates = entry.TryGetProperty("aggregates", out var availableAggregates) && availableAggregates.ValueKind == JsonValueKind.Array
                ? availableAggregates.EnumerateArray().Take(MaxAggregates).Select(aggregate => new
                {
                    code = ReadText(aggregate, "code"),
                    label = ReadText(aggregate, "label")
                }).ToArray()
                : [];

            return JsonSerializer.Serialize(new
            {
                source,
                label = ReadText(entry, "label"),
                columns,
                aggregates,
                note = "Only fields and aggregate options listed here are valid for this tenant and account."
            });
        }

        return JsonSerializer.Serialize(new { error = "The requested report source is not available for this account." });
    }

    private static string ReadText(JsonElement element, string property) =>
        element.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.String
            ? Limit(value.GetString()) ?? string.Empty
            : string.Empty;

    private static string? Limit(string? value) => value is { Length: > MaxTextLength } ? value[..MaxTextLength] : value;
}
