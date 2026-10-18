using System.Text.Json;

namespace AIERP.AIService.AI;

internal static class ERPReportToolResult
{
    private const int MaxRows = 10;
    private const int MaxColumns = 10;
    private const int MaxCellTextLength = 256;
    private const int MaxOutputLength = 16_000;

    public static string Serialize(JsonElement report)
    {
        var source = report.GetProperty("source").GetString() ?? "";
        var columns = report.GetProperty("columns").EnumerateArray().Take(MaxColumns)
            .Select(column => new
            {
                code = column.GetProperty("code").GetString() ?? "",
                label = LimitText(column.GetProperty("label").GetString()),
                dataType = column.GetProperty("dataType").GetString() ?? ""
            }).ToArray();
        var allowedFields = columns.Select(column => column.code).ToHashSet(StringComparer.Ordinal);
        var rows = new List<Dictionary<string, object?>>();
        var totalCount = report.GetProperty("totalCount").GetInt32();
        var page = report.GetProperty("page").GetInt32();

        foreach (var sourceRow in report.GetProperty("rows").EnumerateArray().Take(MaxRows))
        {
            if (sourceRow.ValueKind != JsonValueKind.Object) continue;
            var row = new Dictionary<string, object?>(StringComparer.Ordinal);
            foreach (var cell in sourceRow.EnumerateObject())
            {
                if (!allowedFields.Contains(cell.Name)) continue;
                row[cell.Name] = cell.Value.ValueKind == JsonValueKind.String
                    ? LimitText(cell.Value.GetString())
                    : cell.Value.Clone();
            }

            rows.Add(row);
            if (SerializePayload(source, columns, rows, totalCount, page).Length <= MaxOutputLength) continue;
            rows.RemoveAt(rows.Count - 1);
            break;
        }

        return SerializePayload(source, columns, rows, totalCount, page);
    }

    private static string SerializePayload(string source, object columns, IReadOnlyList<Dictionary<string, object?>> rows,
        int totalCount, int page) => JsonSerializer.Serialize(new { source, columns, rows, totalCount, page });

    private static string? LimitText(string? value) => value is { Length: > MaxCellTextLength }
        ? value[..MaxCellTextLength]
        : value;
}
