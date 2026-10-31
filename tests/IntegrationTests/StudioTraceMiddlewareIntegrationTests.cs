using System.Net;
using System.Text.Json;
using AIERP.AIService;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using System.Collections.Concurrent;
using Xunit;

namespace AIERP.Api.IntegrationTests;

public sealed class StudioTraceMiddlewareIntegrationTests
{
    [Fact]
    public async Task Unexpected_studio_error_returns_matching_trace_id_without_exception_details()
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        var loggerProvider = new RecordingLoggerProvider();
        builder.Logging.AddProvider(loggerProvider);
        await using var app = builder.Build();
        app.UseMiddleware<StudioTraceMiddleware>();
        app.MapGet("/studio/test-error", (HttpContext _) => throw new InvalidOperationException("synthetic secret detail"));
        await app.StartAsync();

        using var response = await app.GetTestClient().GetAsync("/studio/test-error");
        var body = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        Assert.True(response.Headers.TryGetValues("X-Trace-Id", out var traceHeaders));
        var traceHeader = Assert.Single(traceHeaders!);
        using var json = JsonDocument.Parse(body);
        Assert.Equal(traceHeader, json.RootElement.GetProperty("traceId").GetString());
        Assert.Equal((int)HttpStatusCode.InternalServerError, json.RootElement.GetProperty("status").GetInt32());
        Assert.DoesNotContain("synthetic secret detail", body);
        Assert.Contains(traceHeader, loggerProvider.TraceIds);
    }

    [Fact]
    public async Task Non_studio_response_is_not_rewritten_or_given_a_studio_trace_id()
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        await using var app = builder.Build();
        app.UseMiddleware<StudioTraceMiddleware>();
        app.MapGet("/api/test", () => Results.Text("api response", "text/plain", statusCode: 500));
        await app.StartAsync();

        using var response = await app.GetTestClient().GetAsync("/api/test");

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        Assert.Equal("api response", await response.Content.ReadAsStringAsync());
        Assert.False(response.Headers.Contains("X-Trace-Id"));
    }

    private sealed class RecordingLoggerProvider : ILoggerProvider
    {
        private readonly ConcurrentBag<string> traceIds = [];
        public IReadOnlyCollection<string> TraceIds => traceIds.ToArray();

        public ILogger CreateLogger(string categoryName) => new RecordingLogger(traceIds);
        public void Dispose() { }

        private sealed class RecordingLogger(ConcurrentBag<string> traceIds) : ILogger
        {
            public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
            public bool IsEnabled(LogLevel logLevel) => logLevel >= LogLevel.Error;

            public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception,
                Func<TState, Exception?, string> formatter)
            {
                if (state is IEnumerable<KeyValuePair<string, object?>> fields &&
                    fields.FirstOrDefault(field => field.Key == "TraceId").Value is string traceId)
                    traceIds.Add(traceId);
            }
        }
    }
}
