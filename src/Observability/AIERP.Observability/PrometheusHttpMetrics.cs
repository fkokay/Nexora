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
    private readonly ConcurrentDictionary<RequestSeries, Histogram> series = new();

    public void Record(string method, string route, int statusCode, double durationSeconds)
    {
        var normalizedMethod = KnownMethods.Contains(method) ? method : "OTHER";
        var normalizedStatus = statusCode is >= 100 and <= 599 ? statusCode : 500;
        series.GetOrAdd(new(normalizedMethod, route, normalizedStatus), _ => new Histogram()).Record(durationSeconds);
    }

    public string Render()
    {
        var output = new StringBuilder();
        output.AppendLine("# HELP aierp_http_server_request_duration_seconds HTTP request duration in seconds.");
        output.AppendLine("# TYPE aierp_http_server_request_duration_seconds histogram");
        foreach (var (key, histogram) in series.OrderBy(x => x.Key.Route, StringComparer.Ordinal).ThenBy(x => x.Key.Method, StringComparer.Ordinal).ThenBy(x => x.Key.StatusCode))
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
        return output.ToString();
    }

    private static string Escape(string value) => value.Replace("\\", "\\\\", StringComparison.Ordinal)
        .Replace("\"", "\\\"", StringComparison.Ordinal)
        .Replace("\n", "\\n", StringComparison.Ordinal);

    private readonly record struct RequestSeries(string Method, string Route, int StatusCode);

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
