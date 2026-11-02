using System.Text.Json;
using AIERP.IntegrationHost;
using AIERP.IntegrationSDK;
using Microsoft.Extensions.Configuration;

namespace AIERP.Platform.UnitTests;

public sealed class EDocumentIntegrationContractTests
{
    [Fact]
    public async Task EDocumentGateway_FailsClosedWithoutTenantProfileEvenWhenHostWideAdapterIsConfigured()
    {
        var calls = new List<(string Body, string IdempotencyKey, string CorrelationId)>();
        var handler = new StubHttpMessageHandler(async (request, cancellationToken) =>
        {
            calls.Add((
                await request.Content!.ReadAsStringAsync(cancellationToken),
                request.Headers.GetValues("Idempotency-Key").Single(),
                request.Headers.GetValues("X-Correlation-ID").Single()));

            if (calls.Count == 1)
                return new HttpResponseMessage(System.Net.HttpStatusCode.ServiceUnavailable);

            var response = new HttpResponseMessage(System.Net.HttpStatusCode.OK)
            {
                Content = new StringContent("""{"status":"accepted","providerReference":"offline-42"}""")
            };
            response.Headers.Add("X-External-Reference", "offline-42");
            return response;
        });
        var configuration = CreateConfiguration(includeMappings: true);
        var secrets = new StubSecretResolver();
        var dispatcher = new IntegrationDispatcher(configuration, new StubHttpClientFactory(handler), secrets);
        using var payload = JsonDocument.Parse("""{"DocumentType":"e-dispatch","DocumentId":"2a1e6c4c-5c63-43be-b39d-0fca7a6343f5","DocumentNumber":"DN-OFFLINE-1","IssueDate":"2026-10-23","CurrencyCode":"TRY","Document":{"number":"DN-OFFLINE-1","total":125.50}}""");
        var tenantId = Guid.NewGuid();
        var context = new IntegrationContext(tenantId, "tr.e-document.submit", "correlation-offline-1", "tenant-key-offline-1", DateTimeOffset.UtcNow.AddSeconds(20));

        var (configured, result) = await dispatcher.ExecuteAsync("tr.e-document.submit", context, payload.RootElement, CancellationToken.None);

        Assert.Equal(new IntegrationHostHealthSummary(1, 0, 1), dispatcher.GetHealthSummary());
        Assert.True(configured);
        Assert.NotNull(result);
        Assert.False(result.Succeeded);
        Assert.Equal("invalid_integration", result.ErrorCode);
        Assert.Equal(0, result.Attempts);
        Assert.Empty(calls);
        Assert.Equal(0, secrets.ResolveCount);
    }

    [Fact]
    public async Task EDocumentGateway_FailsClosedWhenMappingsAreMissingAndNoTenantProfileExists()
    {
        var calls = 0;
        var handler = new StubHttpMessageHandler((_, _) =>
        {
            calls++;
            return Task.FromResult(new HttpResponseMessage(System.Net.HttpStatusCode.OK)
            {
                Content = new StringContent("{}")
            });
        });
        var configuration = CreateConfiguration(includeMappings: false);
        using var payload = JsonDocument.Parse("""{"DocumentType":"e-dispatch"}""");
        var secrets = new StubSecretResolver();
        var dispatcher = new IntegrationDispatcher(configuration, new StubHttpClientFactory(handler), secrets);
        var context = new IntegrationContext(Guid.NewGuid(), "tr.e-document.submit", "correlation-offline-1", "tenant-key-offline-1", DateTimeOffset.UtcNow.AddSeconds(20));

        var (configured, result) = await dispatcher.ExecuteAsync("tr.e-document.submit", context, payload.RootElement, CancellationToken.None);

        Assert.Equal(new IntegrationHostHealthSummary(1, 0, 1), dispatcher.GetHealthSummary());
        Assert.True(configured);
        Assert.NotNull(result);
        Assert.Equal("invalid_integration", result.ErrorCode);
        Assert.Equal(0, result.Attempts);
        Assert.Equal(0, calls);
        Assert.Equal(0, secrets.ResolveCount);
    }

    private static IConfiguration CreateConfiguration(bool includeMappings)
    {
        var values = new Dictionary<string, string?>
        {
            ["Integrations:tr.e-document.submit:Enabled"] = "true",
            ["Integrations:tr.e-document.submit:BaseUrl"] = "https://sandbox.example.invalid/v1/",
            ["Integrations:tr.e-document.submit:Path"] = "submissions",
            ["Integrations:tr.e-document.submit:AllowedHosts:0"] = "sandbox.example.invalid",
            ["Integrations:tr.e-document.submit:Retry:MaximumAttempts"] = "2",
            ["Integrations:tr.e-document.submit:Retry:InitialDelayMilliseconds"] = "0",
            ["Integrations:tr.e-document.submit:Retry:MaximumDelayMilliseconds"] = "0"
        };

        if (includeMappings)
        {
            values["Integrations:tr.e-document.submit:RequestMappings:0:SourcePath"] = "DocumentType";
            values["Integrations:tr.e-document.submit:RequestMappings:0:TargetPath"] = "document.type";
            values["Integrations:tr.e-document.submit:RequestMappings:0:Required"] = "true";
            values["Integrations:tr.e-document.submit:RequestMappings:1:SourcePath"] = "Document.number";
            values["Integrations:tr.e-document.submit:RequestMappings:1:TargetPath"] = "document.number";
            values["Integrations:tr.e-document.submit:RequestMappings:1:Required"] = "true";
            values["Integrations:tr.e-document.submit:RequestMappings:2:SourcePath"] = "Document.total";
            values["Integrations:tr.e-document.submit:RequestMappings:2:TargetPath"] = "document.total";
            values["Integrations:tr.e-document.submit:ResponseMappings:0:SourcePath"] = "status";
            values["Integrations:tr.e-document.submit:ResponseMappings:0:TargetPath"] = "submission.status";
            values["Integrations:tr.e-document.submit:ResponseMappings:0:Required"] = "true";
            values["Integrations:tr.e-document.submit:ResponseMappings:1:SourcePath"] = "providerReference";
            values["Integrations:tr.e-document.submit:ResponseMappings:1:TargetPath"] = "submission.reference";
            values["Integrations:tr.e-document.submit:ResponseMappings:1:Required"] = "true";
        }

        return new ConfigurationBuilder().AddInMemoryCollection(values).Build();
    }

    private sealed class StubHttpClientFactory(HttpMessageHandler handler) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(handler, disposeHandler: false);
    }

    private sealed class StubSecretResolver : IIntegrationSecretResolver
    {
        public int ResolveCount { get; private set; }

        public ValueTask<ReadOnlyMemory<char>> ResolveAsync(Guid tenantId, IntegrationCredentialReference reference, CancellationToken cancellationToken) =>
            ResolveAndCount();

        private ValueTask<ReadOnlyMemory<char>> ResolveAndCount()
        {
            ResolveCount++;
            return ValueTask.FromResult(ReadOnlyMemory<char>.Empty);
        }
    }

    private sealed class StubHttpMessageHandler(Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> send) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) =>
            send(request, cancellationToken);
    }
}
