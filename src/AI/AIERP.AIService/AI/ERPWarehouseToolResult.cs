using System.Text.Json;

namespace AIERP.AIService.AI;

internal static class ERPWarehouseToolResult
{
    private const int MaxRows = 100;
    private const int MaxTextLength = 128;
    private const int MaxOutputLength = 16_000;

    public static string Serialize(JsonElement warehouses)
    {
        var rows = warehouses.EnumerateArray().Take(MaxRows).Select(item => new
        {
            id = item.GetProperty("id").GetGuid(),
            code = LimitText(item.GetProperty("code").GetString()),
            name = LimitText(item.GetProperty("name").GetString()),
            active = item.GetProperty("isActive").GetBoolean()
        }).ToList();

        while (rows.Count > 0 && JsonSerializer.Serialize(rows).Length > MaxOutputLength)
            rows.RemoveAt(rows.Count - 1);

        return JsonSerializer.Serialize(rows);
    }

    private static string? LimitText(string? value) => value is { Length: > MaxTextLength }
        ? value[..MaxTextLength]
        : value;
}
