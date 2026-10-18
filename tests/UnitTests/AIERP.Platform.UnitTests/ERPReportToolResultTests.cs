using System.Text.Json;
using AIERP.AIService.AI;

namespace AIERP.Platform.UnitTests;

public sealed class ERPReportToolResultTests
{
    [Fact]
    public void Report_tool_result_trims_rows_cells_and_non_selected_fields_to_a_bounded_valid_json_payload()
    {
        var columns = Enumerable.Range(0, 10)
            .Select(index => new { code = $"field{index}", label = $"Field {index}", dataType = "text" }).ToArray();
        var rows = Enumerable.Range(0, 10).Select(_ => Enumerable.Range(0, 10)
            .ToDictionary(index => $"field{index}", _ => new string('S', 10_000))
            .Append(new KeyValuePair<string, string>("unselectedSensitiveField", new string('X', 10_000)))
            .ToDictionary(pair => pair.Key, pair => pair.Value));
        using var report = JsonDocument.Parse(JsonSerializer.Serialize(new
        {
            source = "purchaseInvoices", columns, rows, totalCount = 10, page = 1
        }));

        var serialized = ERPReportToolResult.Serialize(report.RootElement);

        Assert.True(serialized.Length <= 16_000);
        using var bounded = JsonDocument.Parse(serialized);
        Assert.Equal("purchaseInvoices", bounded.RootElement.GetProperty("source").GetString());
        Assert.Equal(10, bounded.RootElement.GetProperty("totalCount").GetInt32());
        Assert.InRange(bounded.RootElement.GetProperty("rows").GetArrayLength(), 1, 10);
        var firstRow = bounded.RootElement.GetProperty("rows")[0];
        Assert.Equal(256, firstRow.GetProperty("field0").GetString()!.Length);
        Assert.False(firstRow.TryGetProperty("unselectedSensitiveField", out _));
        Assert.True(bounded.RootElement.GetProperty("rows").GetArrayLength() < 10);
    }
}
