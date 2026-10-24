using System.Collections.Concurrent;
using System.Diagnostics;
using System.Globalization;
using System.Text;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;

namespace AIERP.Observability;

public sealed class PrometheusHttpMetrics
{
    private static readonly double[] Buckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
    private static readonly HashSet<string> KnownMethods = new(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"], StringComparer.Ordinal);
    private static readonly HashSet<string> BusinessMetrics = new(StringComparer.Ordinal)
    {
        "aierp_erp_assistant_tool_calls_total", "aierp_erp_assistant_tool_duration_seconds",
        "aierp_integration_executions_total", "aierp_integration_execution_duration_seconds"
    };
    private static readonly HashSet<string> BusinessOutcomes = new(StringComparer.Ordinal)
        { "success", "error", "succeeded", "failed", "cancelled" };
    private static readonly HashSet<string> BusinessTools = new(StringComparer.Ordinal)
    {
        "search_stock_items", "list_warehouses", "get_warehouse_balances", "search_customer_accounts",
        "get_customer_balance", "generate_report", "other"
    };
    private readonly ConcurrentDictionary<RequestSeries, Histogram> series = new();
    private readonly ConcurrentDictionary<BusinessSeries, long> businessCounters = new();
    private readonly ConcurrentDictionary<BusinessSeries, Histogram> businessHistograms = new();

    public void Record(string method, string route, int statusCode, double durationSeconds)
    {
        var normalizedMethod = KnownMethods.Contains(method) ? method : "OTHER";
        var normalizedStatus = statusCode is >= 100 and <= 599 ? statusCode : 500;
        series.GetOrAdd(new(normalizedMethod, route, normalizedStatus), _ => new Histogram()).Record(durationSeconds);
    }

    public void RecordBusinessCounter(string metric, string? tool, string outcome, long value)
    {
        if (!BusinessMetrics.Contains(metric) || !metric.EndsWith("_total", StringComparison.Ordinal) || value <= 0 ||
            !BusinessOutcomes.Contains(outcome) || (tool is not null && !BusinessTools.Contains(tool))) return;
        var labels = tool is null ? $"outcome=\"{Escape(outcome)}\"" : $"tool=\"{Escape(tool)}\",outcome=\"{Escape(outcome)}\"";
        businessCounters.AddOrUpdate(new(metric, labels), value, (_, current) => current + value);
    }

    public void RecordBusinessHistogram(string metric, string? tool, string outcome, double durationSeconds)
    {
        if (!BusinessMetrics.Contains(metric) || metric.EndsWith("_total", StringComparison.Ordinal) ||
            !BusinessOutcomes.Contains(outcome) || (tool is not null && !BusinessTools.Contains(tool)) ||
            !double.IsFinite(durationSeconds) || durationSeconds < 0) return;
        var labels = tool is null ? $"outcome=\"{Escape(outcome)}\"" : $"tool=\"{Escape(tool)}\",outcome=\"{Escape(outcome)}\"";
        businessHistograms.GetOrAdd(new(metric, labels), _ => new Histogram()).Record(durationSeconds);
    }

    public string Render()
    {
        var output = new StringBuilder();
        output.AppendLine("# HELP aierp_http_server_request_duration_seconds HTTP request duration in seconds.");
        output.AppendLine("# TYPE aierp_http_server_request_duration_seconds histogram");
        // LINQ's OrderBy may use ICollection<T>.ToArray when its source is a
        // ConcurrentDictionary. That path calls CopyTo, which can throw while
        // the dictionary is growing. Enumerate through its concurrency-safe
        // iterator into a local list, then sort the stable list.
        foreach (var (key, histogram) in Snapshot(series).OrderBy(x => x.Key.Route, StringComparer.Ordinal).ThenBy(x => x.Key.Method, StringComparer.Ordinal).ThenBy(x => x.Key.StatusCode))
        {
            var labels = $"method=\"{Escape(key.Method)}\",route=\"{Escape(key.Route)}\",status=\"{key.StatusCode.ToString(CultureInfo.InvariantCulture)}\"";
            var cumulative = 0L;
            for (var i = 0; i < Buckets.Length; i++)
            {
                cumulative += histogram.GetBucket(i);
                output.Append("aierp_http_server_request_duration_seconds_bucket{").Append(labels)
                    .Append(",le=\"").Append(Buckets[i].ToString("0.###", CultureInfo.InvariantCulture)).Append("\"} ")
                    .Append(cumulative.ToString(CultureInfo.InvariantCulture)).AppendLine();
            }
            var count = histogram.Count;
            output.Append("aierp_http_server_request_duration_seconds_bucket{").Append(labels).Append(",le=\"+Inf\"} ")
                .Append(count.ToString(CultureInfo.InvariantCulture)).AppendLine();
            output.Append("aierp_http_server_request_duration_seconds_sum{").Append(labels).Append("} ")
                .Append(histogram.SumSeconds.ToString("0.#########", CultureInfo.InvariantCulture)).AppendLine();
            output.Append("aierp_http_server_request_duration_seconds_count{").Append(labels).Append("} ")
                .Append(count.ToString(CultureInfo.InvariantCulture)).AppendLine();
        }

        foreach (var group in Snapshot(businessCounters).OrderBy(x => x.Key.Name, StringComparer.Ordinal).GroupBy(x => x.Key.Name, StringComparer.Ordinal))
        {
            output.Append("# HELP ").Append(group.Key).AppendLine(" Bounded AI ERP business operation count.");
            output.Append("# TYPE ").Append(group.Key).AppendLine(" counter");
            foreach (var (key, value) in group.OrderBy(x => x.Key.Labels, StringComparer.Ordinal))
                output.Append(group.Key).Append('{').Append(key.Labels).Append("} ").Append(value.ToString(CultureInfo.InvariantCulture)).AppendLine();
        }
        foreach (var group in Snapshot(businessHistograms).OrderBy(x => x.Key.Name, StringComparer.Ordinal).GroupBy(x => x.Key.Name, StringComparer.Ordinal))
        {
            output.Append("# HELP ").Append(group.Key).AppendLine(" Bounded AI ERP business operation duration in seconds.");
            output.Append("# TYPE ").Append(group.Key).AppendLine(" histogram");
            foreach (var (key, histogram) in group.OrderBy(x => x.Key.Labels, StringComparer.Ordinal))
            {
                var cumulative = 0L;
                for (var i = 0; i < Buckets.Length; i++)
                {
                    cumulative += histogram.GetBucket(i);
                    output.Append(group.Key).Append("_bucket{").Append(key.Labels)
                        .Append(",le=\"").Append(Buckets[i].ToString("0.###", CultureInfo.InvariantCulture)).Append("\"} ")
                        .Append(cumulative.ToString(CultureInfo.InvariantCulture)).AppendLine();
                }
                var count = histogram.Count;
                output.Append(group.Key).Append("_bucket{").Append(key.Labels).Append(",le=\"+Inf\"} ")
                    .Append(count.ToString(CultureInfo.InvariantCulture)).AppendLine();
                output.Append(group.Key).Append("_sum{").Append(key.Labels).Append("} ")
                    .Append(histogram.SumSeconds.ToString("0.#########", CultureInfo.InvariantCulture)).AppendLine();
                output.Append(group.Key).Append("_count{").Append(key.Labels).Append("} ")
                    .Append(count.ToString(CultureInfo.InvariantCulture)).AppendLine();
            }
        }
        return output.ToString();
    }

    private static List<KeyValuePair<TKey, TValue>> Snapshot<TKey, TValue>(ConcurrentDictionary<TKey, TValue> dictionary)
        where TKey : notnull
    {
        var snapshot = new List<KeyValuePair<TKey, TValue>>(dictionary.Count);
        foreach (var entry in dictionary) snapshot.Add(entry);
        return snapshot;
    }

    private static string Escape(string value) => value.Replace("\\", "\\\\", StringComparison.Ordinal)
        .Replace("\"", "\\\"", StringComparison.Ordinal)
        .Replace("\n", "\\n", StringComparison.Ordinal);

    private readonly record struct RequestSeries(string Method, string Route, int StatusCode);
    private readonly record struct BusinessSeries(string Name, string Labels);

    private sealed class Histogram
    {
        private readonly long[] buckets = new long[Buckets.Length];
        private long count;
        private long sumNanoseconds;
        public long Count => Interlocked.Read(ref count);
        public double SumSeconds => Interlocked.Read(ref sumNanoseconds) / 1_000_000_000d;
        public long GetBucket(int index) => Interlocked.Read(ref buckets[index]);

        public void Record(double durationSeconds)
        {
            var duration = Math.Max(0, durationSeconds);
            Interlocked.Increment(ref count);
            Interlocked.Add(ref sumNanoseconds, (long)(duration * 1_000_000_000d));
            for (var index = 0; index < Buckets.Length; index++)
            {
                if (duration > Buckets[index]) continue;
                Interlocked.Increment(ref buckets[index]);
                return;
            }
        }
    }
}

public static class PrometheusHttpMetricsExtensions
{
    public static IServiceCollection AddAierpHttpMetrics(this IServiceCollection services) => services.AddSingleton<PrometheusHttpMetrics>();

    public static IApplicationBuilder UseAierpHttpMetrics(this IApplicationBuilder app) => app.Use(async (context, next) =>
    {
        if (context.Request.Path.Equals("/metrics", StringComparison.OrdinalIgnoreCase))
        {
            await next();
            return;
        }

        var started = Stopwatch.GetTimestamp();
        try { await next(); }
        catch
        {
            context.Response.StatusCode = StatusCodes.Status500InternalServerError;
            throw;
        }
        finally
        {
            var route = (context.GetEndpoint() as RouteEndpoint)?.RoutePattern.RawText ?? "unmatched";
            context.RequestServices.GetRequiredService<PrometheusHttpMetrics>()
                .Record(context.Request.Method, route, context.Response.StatusCode, Stopwatch.GetElapsedTime(started).TotalSeconds);
        }
    });

    public static IEndpointRouteBuilder MapAierpMetrics(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/metrics", (PrometheusHttpMetrics metrics) => Results.Text(metrics.Render(), "text/plain; version=0.0.4; charset=utf-8"));
        return endpoints;
    }
}
