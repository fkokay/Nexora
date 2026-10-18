using System.Diagnostics.Metrics;
using Microsoft.Extensions.Hosting;

namespace AIERP.Observability;

/// <summary>Exports a narrow allowlist of AI assistant and integration metrics without tenant, request, or provider identifiers.</summary>
public sealed class PrometheusBusinessMetricsBridge : IHostedService, IDisposable
{
    private const string AssistantMeter = "AIERP.AIService.ERPAssistant";
    private const string IntegrationMeter = "AIERP.IntegrationSDK";
    private readonly PrometheusHttpMetrics metrics;
    private readonly MeterListener listener;
    private int disposed;

    public PrometheusBusinessMetricsBridge(PrometheusHttpMetrics metrics)
    {
        this.metrics = metrics;
        listener = new MeterListener
        {
            InstrumentPublished = (instrument, meterListener) =>
            {
                if (IsSupported(instrument)) meterListener.EnableMeasurementEvents(instrument);
            }
        };
        listener.SetMeasurementEventCallback<long>((instrument, value, tags, _) =>
        {
            var (metric, _) = Map(instrument);
            var tool = GetTool(instrument, tags);
            var outcome = GetTag(tags, "outcome");
            metrics.RecordBusinessCounter(metric, tool, outcome, value);
        });
        listener.SetMeasurementEventCallback<double>((instrument, value, tags, _) =>
        {
            var (metric, _) = Map(instrument);
            var tool = GetTool(instrument, tags);
            var outcome = GetTag(tags, "outcome");
            // Both source histograms use milliseconds; Prometheus exports seconds.
            metrics.RecordBusinessHistogram(metric, tool, outcome, value / 1000d);
        });
    }

    public Task StartAsync(CancellationToken cancellationToken)
    {
        listener.Start();
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken)
    {
        Dispose();
        return Task.CompletedTask;
    }

    public void Dispose()
    {
        if (Interlocked.Exchange(ref disposed, 1) == 0) listener.Dispose();
    }

    private static bool IsSupported(Instrument instrument) => instrument.Meter.Name switch
    {
        AssistantMeter => instrument.Name is "aierp.erp_assistant.tool.calls" or "aierp.erp_assistant.tool.duration",
        IntegrationMeter => instrument.Name is "aierp.integration.executions" or "aierp.integration.execution.duration",
        _ => false
    };

    private static (string Metric, string? Tool) Map(Instrument instrument) =>
        (instrument.Meter.Name, instrument.Name) switch
        {
            (AssistantMeter, "aierp.erp_assistant.tool.calls") => ("aierp_erp_assistant_tool_calls_total", null),
            (AssistantMeter, "aierp.erp_assistant.tool.duration") => ("aierp_erp_assistant_tool_duration_seconds", null),
            (IntegrationMeter, "aierp.integration.executions") => ("aierp_integration_executions_total", null),
            (IntegrationMeter, "aierp.integration.execution.duration") => ("aierp_integration_execution_duration_seconds", null),
            _ => (string.Empty, null)
        };

    private static string? GetTool(Instrument instrument, ReadOnlySpan<KeyValuePair<string, object?>> tags) =>
        string.Equals(instrument.Meter.Name, AssistantMeter, StringComparison.Ordinal) ? GetTag(tags, "tool") : null;

    private static string GetTag(ReadOnlySpan<KeyValuePair<string, object?>> tags, string key)
    {
        foreach (var tag in tags)
            if (string.Equals(tag.Key, key, StringComparison.Ordinal) && tag.Value is string value) return value;
        return string.Empty;
    }
}
