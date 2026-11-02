using System.Collections.Concurrent;
using System.Diagnostics.Metrics;
using System.Net;
using System.Text;
using AIERP.AIService.AI;
using AIERP.Observability;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace AIERP.Platform.UnitTests;

public sealed class ERPAssistantToolTelemetryTests
{
    [Theory]
    [InlineData("search_fixed_assets", "{\"term\":\"laptop\"}")]
    [InlineData("get_financial_account_balances", "{}")]
    [InlineData("get_sales_delivery_details", "{\"code\":\"DN-2026-001\"}")]
    public async Task ERP_assistant_recent_read_tools_keep_bounded_metric_names(string toolName, string arguments)
    {
        var observedTools = new ConcurrentBag<string>();
        using var listener = new MeterListener();
        listener.InstrumentPublished = (instrument, meterListener) =>
        {
            if (instrument.Meter.Name == "AIERP.AIService.ERPAssistant")
                meterListener.EnableMeasurementEvents(instrument);
        };
        listener.SetMeasurementEventCallback<long>((instrument, _, tags, _) =>
        {
            if (instrument.Name == "aierp.erp_assistant.tool.calls")
                observedTools.Add(ReadTag(tags, "tool"));
        });
        listener.Start();

        var httpCall = 0;
        var handler = new StubHandler(_ =>
        {
            httpCall++;
            var payload = httpCall == 1
                ? $$"""{"status":"completed","output":[{"type":"function_call","name":"{{toolName}}","arguments":{{System.Text.Json.JsonSerializer.Serialize(arguments)}},"call_id":"call-1"}]}"""
                : """{"status":"completed","output":[{"type":"message","content":[{"type":"output_text","text":"Tamam."}]}]}""";
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(payload, Encoding.UTF8, "application/json")
            });
        });
        var provider = CreateProvider(handler);

        var answer = await provider.ReplyToERPDataQuestionAsync("Verileri özetle.", [], CancellationToken.None,
            (_, _, _) => Task.FromResult("{}"));

        Assert.Equal("Tamam.", answer);
        Assert.Contains(toolName, observedTools);
        Assert.DoesNotContain("other", observedTools);
    }

    [Fact]
    public async Task ERP_assistant_tool_execution_emits_bounded_success_metrics_without_arguments_or_results()
    {
        var prometheus = new PrometheusHttpMetrics();
        using var prometheusBridge = new PrometheusBusinessMetricsBridge(prometheus);
        await prometheusBridge.StartAsync(CancellationToken.None);
        var measurements = new ConcurrentBag<(string Instrument, long Count, string Tool, string Outcome)>();
        var durationMeasurements = new ConcurrentBag<double>();
        using var listener = new MeterListener();
        listener.InstrumentPublished = (instrument, meterListener) =>
        {
            if (instrument.Meter.Name == "AIERP.AIService.ERPAssistant")
                meterListener.EnableMeasurementEvents(instrument);
        };
        listener.SetMeasurementEventCallback<long>((instrument, value, tags, _) =>
            measurements.Add((instrument.Name, value, ReadTag(tags, "tool"), ReadTag(tags, "outcome"))));
        listener.SetMeasurementEventCallback<double>((instrument, value, _, _) =>
        {
            if (instrument.Name == "aierp.erp_assistant.tool.duration") durationMeasurements.Add(value);
        });
        listener.Start();

        var httpCall = 0;
        var handler = new StubHandler(_ =>
        {
            httpCall++;
            var payload = httpCall == 1
                ? """{"status":"completed","output":[{"type":"function_call","name":"search_supplier_ledger","arguments":"{\"supplierId\":\"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2\",\"from\":\"2026-10-01\",\"to\":\"2026-10-25\"}","call_id":"call-1"}]}"""
                : """{"status":"completed","output":[{"type":"message","content":[{"type":"output_text","text":"Bir tedarikçi hareketi bulundu."}]}]}""";
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(payload, Encoding.UTF8, "application/json")
            });
        });
        var provider = CreateProvider(handler);
        var toolCallCount = 0;

        var answer = await provider.ReplyToERPDataQuestionAsync("Tedarikçi hareketlerini getir.", [], CancellationToken.None,
            (_, _, _) =>
            {
                toolCallCount++;
                return Task.FromResult("private-tool-result");
            });

        Assert.Equal("Bir tedarikçi hareketi bulundu.", answer);
        Assert.Equal(1, toolCallCount);
        var call = Assert.Single(measurements.Where(item => item.Instrument == "aierp.erp_assistant.tool.calls" &&
            item.Tool == "search_supplier_ledger" && item.Outcome == "success").Distinct());
        Assert.Equal(1, call.Count);
        Assert.Equal("search_supplier_ledger", call.Tool);
        Assert.Equal("success", call.Outcome);
        Assert.Contains(durationMeasurements, value => value >= 0);
        Assert.DoesNotContain(measurements, item => item.Tool.Contains("private", StringComparison.OrdinalIgnoreCase));
        var scrapedMetrics = prometheus.Render();
        Assert.Contains("tool=\"search_supplier_ledger\",outcome=\"success\"", scrapedMetrics, StringComparison.Ordinal);
        Assert.DoesNotContain("supplierId", scrapedMetrics, StringComparison.Ordinal);
        Assert.DoesNotContain("private-tool-result", scrapedMetrics, StringComparison.Ordinal);
    }

    [Fact]
    public async Task ERP_assistant_tool_execution_emits_error_outcome_when_read_fails()
    {
        var outcomes = new ConcurrentBag<string>();
        using var listener = new MeterListener();
        listener.InstrumentPublished = (instrument, meterListener) =>
        {
            if (instrument.Meter.Name == "AIERP.AIService.ERPAssistant")
                meterListener.EnableMeasurementEvents(instrument);
        };
        listener.SetMeasurementEventCallback<long>((instrument, _, tags, _) =>
        {
            if (instrument.Name == "aierp.erp_assistant.tool.calls") outcomes.Add(ReadTag(tags, "outcome"));
        });
        listener.Start();

        var handler = new StubHandler(_ => Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(
                """{"status":"completed","output":[{"type":"function_call","name":"list_warehouses","arguments":"{}","call_id":"call-1"}]}""",
                Encoding.UTF8, "application/json")
        }));
        var provider = CreateProvider(handler);

        var error = await Assert.ThrowsAsync<AIProviderResponseException>(() => provider.ReplyToERPDataQuestionAsync("Depoları listele.", [],
            CancellationToken.None, (_, _, _) => throw new InvalidOperationException("database unavailable")));

        Assert.Equal("ERP assistant data lookup failed.", error.Message);
        Assert.Contains("error", outcomes);
    }

    private static string ReadTag(ReadOnlySpan<KeyValuePair<string, object?>> tags, string name)
    {
        foreach (var tag in tags)
            if (tag.Key == name) return tag.Value?.ToString() ?? "";
        return "";
    }

    private static OpenAIResponsesProvider CreateProvider(HttpMessageHandler handler)
    {
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["AI:OpenAI:ApiKey"] = "test-key",
            ["AI:OpenAI:Model"] = "test-model"
        }).Build();
        var options = new DbContextOptionsBuilder<PlatformDbContext>()
            .UseSqlServer("Server=localhost;Database=AIERPPlatform;User Id=test;Password=test;TrustServerCertificate=True")
            .Options;
        return new OpenAIResponsesProvider(new HttpClient(handler), config, new PlatformDbContext(options), new HttpContextAccessor());
    }

    private sealed class StubHandler(Func<HttpRequestMessage, Task<HttpResponseMessage>> send) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) => send(request);
    }
}
