using System.Text.Json;
using System.Collections.Concurrent;
using AIERP.Api;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace AIERP.Api.IntegrationTests;

public sealed class ApiExceptionHandlerTests
{
    [Fact]
    public async Task Unhandled_exception_returns_searchable_trace_id_without_exposing_exception_details()
    {
        const string traceId = "trace-id-for-support-123";
        const string privateDetail = "Sensitive SQL server and credential detail";
        var context = new DefaultHttpContext
        {
            TraceIdentifier = traceId
        };
        await using var responseBody = new MemoryStream();
        context.Response.Body = responseBody;
        var handler = new ApiExceptionHandler(NullLogger<ApiExceptionHandler>.Instance);

        var handled = await handler.TryHandleAsync(context, new InvalidOperationException(privateDetail), CancellationToken.None);

        Assert.True(handled);
        Assert.Equal(StatusCodes.Status500InternalServerError, context.Response.StatusCode);
        Assert.StartsWith("application/json", context.Response.ContentType, StringComparison.Ordinal);
        responseBody.Position = 0;
        using var response = await JsonDocument.ParseAsync(responseBody);
        var body = response.RootElement.GetRawText();
        Assert.Equal(traceId, response.RootElement.GetProperty("traceId").GetString());
        Assert.Equal("İstek sunucuda tamamlanamadı.", response.RootElement.GetProperty("error").GetString());
        Assert.DoesNotContain(privateDetail, body, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Registered_exception_middleware_returns_the_trace_id_written_to_server_logs()
    {
        const string privateDetail = "Sensitive SQL server and credential detail";
        using var loggerProvider = new CapturingLoggerProvider();
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Logging.ClearProviders();
        builder.Logging.AddProvider(loggerProvider);
        builder.Services.AddProblemDetails();
        builder.Services.AddExceptionHandler<ApiExceptionHandler>();

        await using var app = builder.Build();
        app.UseExceptionHandler();
        app.MapGet("/failure", (HttpContext _) => throw new InvalidOperationException(privateDetail));
        await app.StartAsync();

        using var client = app.GetTestClient();
        using var response = await client.GetAsync("/failure");
        var body = await response.Content.ReadAsStringAsync();
        using var document = JsonDocument.Parse(body);
        var traceId = document.RootElement.GetProperty("traceId").GetString();
        var log = Assert.Single(loggerProvider.Messages, message => message.Contains("Unhandled API exception", StringComparison.Ordinal));

        Assert.Equal(StatusCodes.Status500InternalServerError, (int)response.StatusCode);
        Assert.False(string.IsNullOrWhiteSpace(traceId));
        Assert.Contains(traceId!, log, StringComparison.Ordinal);
        Assert.DoesNotContain(privateDetail, body, StringComparison.Ordinal);
    }

    private sealed class CapturingLoggerProvider : ILoggerProvider
    {
        private readonly ConcurrentQueue<string> messages = new();
        public IEnumerable<string> Messages => messages.ToArray();
        public ILogger CreateLogger(string categoryName) => new CapturingLogger(messages);
        public void Dispose() { }

        private sealed class CapturingLogger(ConcurrentQueue<string> messages) : ILogger
        {
            public IDisposable? BeginScope<TState>(TState state) where TState : notnull => NullScope.Instance;
            public bool IsEnabled(LogLevel logLevel) => true;
            public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception,
                Func<TState, Exception?, string> formatter)
            {
                messages.Enqueue(formatter(state, exception));
            }
        }

        private sealed class NullScope : IDisposable
        {
            public static readonly NullScope Instance = new();
            public void Dispose() { }
        }
    }
}
