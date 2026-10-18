using System.Diagnostics;
using System.Diagnostics.Metrics;

namespace AIERP.AIService.AI;

internal static class ERPAssistantToolTelemetry
{
    private const string MeterName = "AIERP.AIService.ERPAssistant";
    private static readonly Meter Meter = new(MeterName, "1.0.0");
    private static readonly Counter<long> Calls = Meter.CreateCounter<long>(
        "aierp.erp_assistant.tool.calls", description: "Read-only ERP assistant tool executions.");
    private static readonly Histogram<double> Duration = Meter.CreateHistogram<double>(
        "aierp.erp_assistant.tool.duration", unit: "ms", description: "Duration of read-only ERP assistant tool executions.");

    public static async Task<string> ExecuteAsync(string toolName, Func<Task<string>> execute)
    {
        var startedAt = Stopwatch.GetTimestamp();
        var outcome = "success";
        try
        {
            return await execute();
        }
        catch
        {
            outcome = "error";
            throw;
        }
        finally
        {
            var safeToolName = toolName is "search_stock_items" or "list_warehouses" or "get_warehouse_balances" or
                "search_customer_accounts" or "get_customer_balance" or "generate_report" ? toolName : "other";
            var tags = new TagList { { "tool", safeToolName }, { "outcome", outcome } };
            Calls.Add(1, tags);
            Duration.Record(Stopwatch.GetElapsedTime(startedAt).TotalMilliseconds, tags);
        }
    }
}
