using AIERP.Observability;

namespace AIERP.Platform.UnitTests;

public sealed class PrometheusHttpMetricsConcurrencyTests
{
    [Fact]
    public async Task Render_succeeds_while_new_metric_series_are_being_recorded()
    {
        var metrics = new PrometheusHttpMetrics();
        var writer = Task.Run(() =>
        {
            for (var index = 0; index < 10_000; index++)
            {
                metrics.Record("GET", $"/generated/{index}", 200, 0.001);
                metrics.RecordBusinessCounter("aierp_erp_assistant_tool_calls_total", "search_stock_items", "success", 1);
                metrics.RecordBusinessHistogram("aierp_erp_assistant_tool_duration_seconds", "search_stock_items", "success", 0.001);
            }
        });

        var renders = Enumerable.Range(0, 8).Select(_ => Task.Run(() =>
        {
            for (var index = 0; index < 20; index++)
                Assert.Contains("# TYPE aierp_http_server_request_duration_seconds histogram", metrics.Render(), StringComparison.Ordinal);
        }));

        await Task.WhenAll(renders.Append(writer));
    }
}
