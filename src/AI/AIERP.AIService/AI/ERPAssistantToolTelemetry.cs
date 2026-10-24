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
            var result = await execute();
            if (toolName is "get_supplier_balance" or "get_exchange_rate")
                outcome = ClassifyResult(result);
            return result;
        }
        catch (ERPAssistantAccessDeniedException)
        {
            outcome = "denied";
            throw;
        }
        catch
        {
            outcome = "error";
            throw;
        }
        finally
        {
            var safeToolName = toolName is "search_stock_items" or "list_warehouses" or "get_warehouse_balances" or
                "search_customer_accounts" or "get_customer_balance" or "get_supplier_balance" or "get_exchange_rate" or
                "search_sales_orders" or "generate_report" or "get_hr_leave_summary" or "get_hr_attendance_summary" ? toolName : "other";
            var tags = new TagList { { "tool", safeToolName }, { "outcome", outcome } };
            Calls.Add(1, tags);
            Duration.Record(Stopwatch.GetElapsedTime(startedAt).TotalMilliseconds, tags);
        }
    }

    private static string ClassifyResult(string result)
    {
        try
        {
            using var document = System.Text.Json.JsonDocument.Parse(result);
            if (document.RootElement.ValueKind != System.Text.Json.JsonValueKind.Object ||
                !document.RootElement.TryGetProperty("error", out _))
                return "success";

            return document.RootElement.TryGetProperty("errorCode", out var errorCode) &&
                errorCode.ValueKind == System.Text.Json.JsonValueKind.String &&
                string.Equals(errorCode.GetString(), "not_found", StringComparison.Ordinal)
                    ? "not_found"
                    : "error";
        }
        catch (System.Text.Json.JsonException)
        {
            // Malformed tool output is still an error; never record its contents.
            return "error";
        }
    }
}
