using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Json;
using System.Net.Http.Headers;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using AIERP.IntegrationHost;
using AIERP.IntegrationSDK;
using AIERP.Observability;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;
using Xunit;

namespace AIERP.Api.IntegrationTests;

public sealed class IntegrationHostMetricsIntegrationTests
{
    [Fact]
    public async Task Authenticated_integration_execution_is_visible_in_prometheus_without_tenant_or_request_identifiers()
    {
        const string signingSecret = "integration-host-metrics-test-signing-key-2026";
        const string issuer = "AIERP";
        const string audience = "AIERP.IntegrationHost";
        const string integrationCode = "sample.orders";
        var tenantId = Guid.NewGuid();
        var providerCalls = 0;
        using var providerHandler = new StubProviderHandler(() => Interlocked.Increment(ref providerCalls));

        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["IntegrationHost:SigningKey"] = signingSecret,
            ["IntegrationHost:Issuer"] = issuer,
            ["IntegrationHost:Audience"] = audience,
            [$"Integrations:{integrationCode}:Enabled"] = "true",
            [$"Integrations:{integrationCode}:BaseUrl"] = "https://provider.example/v1/",
            [$"Integrations:{integrationCode}:Path"] = "orders",
            [$"Integrations:{integrationCode}:AllowedHosts:0"] = "provider.example"
        });
        builder.Services.AddAierpHttpMetrics();
        builder.Services.AddHostedService<PrometheusBusinessMetricsBridge>();
        builder.Services.AddSingleton<IIntegrationSecretResolver, EmptyIntegrationSecretResolver>();
        builder.Services.AddHttpClient("integration-outbound")
            .ConfigurePrimaryHttpMessageHandler(() => providerHandler);
        builder.Services.AddSingleton<IntegrationDispatcher>();
        builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(options =>
        {
            options.MapInboundClaims = false;
            options.TokenValidationParameters = new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidIssuer = issuer,
                ValidateAudience = true,
                ValidAudience = audience,
                ValidateIssuerSigningKey = true,
                IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(signingSecret)),
                ValidateLifetime = true,
                ClockSkew = TimeSpan.FromSeconds(5)
            };
        });
        builder.Services.AddAuthorization(options => options.AddPolicy("IntegrationExecution", policy => policy
            .RequireAuthenticatedUser()
            .RequireClaim("service", "AIERP.Api")
            .RequireClaim("operation", "integration.execute")
            .RequireClaim("tenant_id")
            .RequireClaim("integration_code")));
        builder.Services.AddRateLimiter(options => options.AddFixedWindowLimiter("integration-execute", limiter =>
        {
            limiter.PermitLimit = 6;
            limiter.Window = TimeSpan.FromSeconds(10);
            limiter.QueueLimit = 0;
        }));

        await using var app = builder.Build();
        app.UseAierpHttpMetrics();
        app.UseRouting();
        app.UseAuthentication();
        app.UseAuthorization();
        app.UseRateLimiter();
        app.MapIntegrationExecution();
        app.MapAierpMetrics();
        await app.StartAsync();

        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", CreateToken(signingSecret,
            issuer, audience, tenantId, integrationCode));
        using var payloadDocument = JsonDocument.Parse("""{"order":{"reference":"SO-42"}}""");
        var request = new IntegrationHostExecuteRequest(integrationCode, "private-idempotency-key", "private-correlation-id",
            DateTimeOffset.UtcNow.AddSeconds(30), payloadDocument.RootElement.Clone());

        using var response = await client.PostAsJsonAsync("/internal/integrations/execute", request);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(1, Volatile.Read(ref providerCalls));
        var responseBody = await response.Content.ReadFromJsonAsync<IntegrationHostExecuteResponse>();
        Assert.True(responseBody!.Succeeded);

        var scrape = await client.GetStringAsync("/metrics");
        Assert.Contains("aierp_integration_executions_total{outcome=\"succeeded\"} 1", scrape, StringComparison.Ordinal);
        Assert.Contains("aierp_integration_execution_duration_seconds_count{outcome=\"succeeded\"} 1", scrape, StringComparison.Ordinal);
        Assert.DoesNotContain(tenantId.ToString("D"), scrape, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("private-idempotency-key", scrape, StringComparison.Ordinal);
        Assert.DoesNotContain("private-correlation-id", scrape, StringComparison.Ordinal);
        Assert.DoesNotContain("provider.example", scrape, StringComparison.Ordinal);
        Assert.DoesNotContain("SO-42", scrape, StringComparison.Ordinal);
    }

    private static string CreateToken(string signingSecret, string issuer, string audience, Guid tenantId, string integrationCode)
    {
        var now = DateTime.UtcNow;
        var token = new JwtSecurityToken(issuer, audience,
        [
            new Claim("service", "AIERP.Api"),
            new Claim("operation", "integration.execute"),
            new Claim("tenant_id", tenantId.ToString("D")),
            new Claim("integration_code", integrationCode)
        ], now.AddSeconds(-5), now.AddMinutes(1), new SigningCredentials(
            new SymmetricSecurityKey(Encoding.UTF8.GetBytes(signingSecret)), SecurityAlgorithms.HmacSha256));
        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private sealed class StubProviderHandler(Action onRequest) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            onRequest();
            var response = new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent("""{"accepted":true,"reference":"SO-42"}""", Encoding.UTF8, "application/json")
            };
            response.Headers.Add("X-External-Reference", "provider-reference-private");
            return Task.FromResult(response);
        }
    }

    private sealed class EmptyIntegrationSecretResolver : IIntegrationSecretResolver
    {
        public ValueTask<ReadOnlyMemory<char>> ResolveAsync(Guid tenantId, IntegrationCredentialReference reference,
            CancellationToken cancellationToken) => ValueTask.FromResult(ReadOnlyMemory<char>.Empty);
    }
}
