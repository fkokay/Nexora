using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Encodings.Web;
using AIERP.Api;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Xunit;

namespace AIERP.Api.IntegrationTests;

public sealed class AIProviderSettingsEndpointsIntegrationTests
{
    [Fact]
    public async Task OpenAI_model_lookup_returns_gateway_error_on_provider_transport_failure_without_exposing_key()
    {
        var tenantId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        await using var factory = new AIProviderSettingsApiFactory(() => new ProviderFailureHandler());
        await SeedTenantCatalogAsync(factory, tenantId);
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", tenantId.ToString("D"));
        client.DefaultRequestHeaders.Add("X-Test-User", userId.ToString("D"));

        const string syntheticKey = "synthetic-provider-key-must-not-appear-in-errors";
        using var response = await client.PostAsJsonAsync("/api/ai-settings/openai-models", new { apiKey = syntheticKey });
        Assert.Equal(HttpStatusCode.BadGateway, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.DoesNotContain(syntheticKey, body, StringComparison.Ordinal);
        Assert.Contains("OpenAI model listesi", body, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("/api/ai-settings/openai-models", "OpenAI")]
    [InlineData("/api/ai-settings/nvidia-models", "NVIDIA")]
    public async Task Model_lookup_returns_safe_service_unavailable_for_malformed_saved_key_without_calling_provider(
        string route, string provider)
    {
        var tenantId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        var handler = new ProviderFailureHandler();
        await using var factory = new AIProviderSettingsApiFactory(() => handler);
        await SeedTenantCatalogAsync(factory, tenantId);
        const string malformedCipherText = "v3.synthetic-malformed-ciphertext-secret";
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            db.TenantAIProviderSettings.Add(new TenantAIProviderSettings
            {
                TenantId = tenantId,
                Provider = provider,
                OpenAIKeyCipherText = provider == "OpenAI" ? malformedCipherText : null,
                NvidiaKeyCipherText = provider == "NVIDIA" ? malformedCipherText : null,
                NvidiaModel = provider == "NVIDIA" ? "synthetic-model" : string.Empty
            });
            await db.SaveChangesAsync();
        }

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", tenantId.ToString("D"));
        client.DefaultRequestHeaders.Add("X-Test-User", userId.ToString("D"));

        using var response = await client.PostAsJsonAsync(route, new { apiKey = (string?)null });
        var body = await response.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.Contains("Anahtarı yeniden kaydedin", body, StringComparison.Ordinal);
        Assert.DoesNotContain(malformedCipherText, body, StringComparison.Ordinal);
        Assert.DoesNotContain("synthetic", body, StringComparison.OrdinalIgnoreCase);
        Assert.Equal(0, handler.CallCount);

        const string suppliedKey = "synthetic-request-key";
        using var suppliedKeyResponse = await client.PostAsJsonAsync(route, new { apiKey = suppliedKey });
        var suppliedKeyBody = await suppliedKeyResponse.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.BadGateway, suppliedKeyResponse.StatusCode);
        Assert.DoesNotContain(suppliedKey, suppliedKeyBody, StringComparison.Ordinal);
        Assert.Equal(1, handler.CallCount);
    }

    [Fact]
    public async Task Tenant_admin_can_read_defaults_and_securely_roundtrip_provider_settings()
    {
        var tenantId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        await using var factory = new AIProviderSettingsApiFactory();
        await SeedTenantCatalogAsync(factory, tenantId);
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", tenantId.ToString("D"));
        client.DefaultRequestHeaders.Add("X-Test-User", userId.ToString("D"));

        using var defaultsResponse = await client.GetAsync("/api/ai-settings");
        Assert.Equal(HttpStatusCode.OK, defaultsResponse.StatusCode);
        var defaults = await defaultsResponse.Content.ReadFromJsonAsync<SettingsView>();
        Assert.NotNull(defaults);
        Assert.Equal("OpenAI", defaults.Provider);
        Assert.False(defaults.OpenAIKeyConfigured);
        Assert.Equal("gpt-6-astra", defaults.OpenAIModel);
        Assert.False(defaults.NvidiaKeyConfigured);
        Assert.Equal(string.Empty, defaults.NvidiaModel);
        Assert.False(defaults.LiveEvaluationEnabled);

        const string syntheticKey = "synthetic-test-key-never-send-to-provider";
        using var putResponse = await client.PutAsJsonAsync("/api/ai-settings", new
        {
            provider = "OpenAI",
            openAIKey = syntheticKey,
            openAIModel = "gpt-6-luna",
            nvidiaKey = (string?)null,
            nvidiaModel = (string?)null
        });
        Assert.Equal(HttpStatusCode.OK, putResponse.StatusCode);
        var putBody = await putResponse.Content.ReadAsStringAsync();
        Assert.DoesNotContain(syntheticKey, putBody, StringComparison.Ordinal);
        var saved = await putResponse.Content.ReadFromJsonAsync<SettingsView>();
        Assert.NotNull(saved);
        Assert.Equal("OpenAI", saved.Provider);
        Assert.True(saved.OpenAIKeyConfigured);
        Assert.Equal("gpt-6-luna", saved.OpenAIModel);

        using var getResponse = await client.GetAsync("/api/ai-settings");
        Assert.Equal(HttpStatusCode.OK, getResponse.StatusCode);
        var roundtrip = await getResponse.Content.ReadFromJsonAsync<SettingsView>();
        Assert.NotNull(roundtrip);
        Assert.True(roundtrip.OpenAIKeyConfigured);
        Assert.Equal("gpt-6-luna", roundtrip.OpenAIModel);
        var getBody = await getResponse.Content.ReadAsStringAsync();
        Assert.DoesNotContain(syntheticKey, getBody, StringComparison.Ordinal);

        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        var stored = await db.TenantAIProviderSettings.SingleAsync(x => x.TenantId == tenantId);
        Assert.NotNull(stored.OpenAIKeyCipherText);
        Assert.StartsWith("v3.", stored.OpenAIKeyCipherText, StringComparison.Ordinal);
        var configuration = scope.ServiceProvider.GetRequiredService<IConfiguration>();
        Assert.Equal(syntheticKey, ApiKeyCipher.Decrypt(stored.OpenAIKeyCipherText, tenantId,
            ApiKeyPurpose.OpenAiApiKey, configuration));
        Assert.DoesNotContain(syntheticKey, stored.OpenAIKeyCipherText, StringComparison.Ordinal);
    }

    private static async Task SeedTenantCatalogAsync(AIProviderSettingsApiFactory factory, Guid tenantId)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        var tenant = new Tenant
        {
            Id = tenantId,
            Name = "Synthetic AI settings tenant",
            Slug = $"synthetic-{tenantId:N}"
        };
        db.Tenants.Add(tenant);
        db.TenantDatabaseCatalog.Add(new TenantDatabaseCatalogEntry
        {
            TenantId = tenantId,
            Tenant = tenant,
            DatabaseName = $"AIERPTenant_{tenantId:N}",
            State = TenantDatabaseProvisioningState.Ready
        });
        await db.SaveChangesAsync();
    }

    private sealed record SettingsView(
        string Provider,
        bool OpenAIKeyConfigured,
        string OpenAIModel,
        bool NvidiaKeyConfigured,
        string NvidiaModel,
        bool LiveEvaluationEnabled);

    private sealed class ProviderFailureHandler : HttpMessageHandler
    {
        public int CallCount { get; private set; }

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            CallCount++;
            return Task.FromException<HttpResponseMessage>(new HttpRequestException("Synthetic provider transport failure."));
        }
    }

    private sealed class AIProviderSettingsApiFactory : WebApplicationFactory<ApiEntryPointMarker>
    {
        private readonly string _databaseName = $"ai-provider-settings-{Guid.NewGuid():N}";
        private readonly Func<HttpMessageHandler>? _providerMessageHandlerFactory;

        public AIProviderSettingsApiFactory(Func<HttpMessageHandler>? providerMessageHandlerFactory = null) =>
            _providerMessageHandlerFactory = providerMessageHandlerFactory;

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Production);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<ITenantSqlCredentialReader>();
                services.AddSingleton<ITenantSqlCredentialReader, AISettingsTenantCredentialReader>();
                services.RemoveAll<PlatformDbContext>();
                services.RemoveAll<DbContextOptions<PlatformDbContext>>();
                services.RemoveAll<IDbContextOptionsConfiguration<PlatformDbContext>>();
                services.AddDbContext<PlatformDbContext>(options => options.UseInMemoryDatabase(_databaseName));
                if (_providerMessageHandlerFactory is not null)
                {
                    services.AddHttpClient("openai-models").ConfigurePrimaryHttpMessageHandler(_providerMessageHandlerFactory);
                    services.AddHttpClient("nvidia-models").ConfigurePrimaryHttpMessageHandler(_providerMessageHandlerFactory);
                }
                services.AddAuthentication(options =>
                {
                    options.DefaultAuthenticateScheme = AISettingsTestAuthenticationHandler.SchemeName;
                    options.DefaultChallengeScheme = AISettingsTestAuthenticationHandler.SchemeName;
                    options.DefaultForbidScheme = AISettingsTestAuthenticationHandler.SchemeName;
                }).AddScheme<AuthenticationSchemeOptions, AISettingsTestAuthenticationHandler>(
                    AISettingsTestAuthenticationHandler.SchemeName, _ => { });
                services.PostConfigure<AuthorizationOptions>(options =>
                    options.DefaultPolicy = new AuthorizationPolicyBuilder(AISettingsTestAuthenticationHandler.SchemeName)
                        .RequireAuthenticatedUser().Build());
                foreach (var worker in services.Where(x => x.ServiceType == typeof(IHostedService)
                             && x.ImplementationType?.Name is "IntegrationOperationWorker" or "AuditRetentionWorker" or "TcmbExchangeRateWorker").ToArray())
                    services.Remove(worker);
            });
        }

        protected override IHost CreateHost(IHostBuilder builder)
        {
            builder.ConfigureHostConfiguration(configuration => configuration.AddInMemoryCollection(
                new Dictionary<string, string?>
                {
                    ["Authentication:SigningKey"] = "synthetic-ai-settings-auth-signing-key-32-bytes",
                    ["Authentication:Issuer"] = "AIERP",
                    ["Authentication:Audience"] = "AIERP",
                    ["PluginHost:SigningKey"] = "synthetic-ai-settings-plugin-signing-key-32-bytes",
                    ["PluginHost:BaseUrl"] = "http://plugin-host.invalid",
                    ["ConnectionStrings:Platform"] = "Server=localhost;Database=unused;User Id=test;Password=test;TrustServerCertificate=True",
                    ["ConnectionStrings:Tenant"] = "Server=localhost;Database=unused;User Id=test;Password=test;TrustServerCertificate=True",
                    ["ConnectionStrings:AIStudio"] = "Server=localhost;Database=unused;User Id=test;Password=test;TrustServerCertificate=True",
                    ["Database:SeparationEnabled"] = "true",
                    ["Database:ApplyMigrationsOnStartup"] = "false",
                    ["Vault:Address"] = "https://vault.test",
                    ["Vault:TenantSqlCredentialReader:RoleId"] = "ai-settings-test-role",
                    ["Vault:TenantSqlCredentialReader:SecretId"] = "ai-settings-test-secret",
                    ["AI:SettingsEncryptionKey"] = Convert.ToBase64String(Enumerable.Range(1, 32).Select(x => (byte)x).ToArray()),
                    ["AI:LiveEvaluation:Enabled"] = "false"
                }));
            return base.CreateHost(builder);
        }

        private sealed class AISettingsTenantCredentialReader : ITenantSqlCredentialReader
        {
            public Task<TenantSqlCredential> ReadAsync(Guid tenantId, TenantSqlDatabaseComponent component,
                string secretReference, CancellationToken cancellationToken = default)
            {
                Assert.Equal(TenantSqlCredentialPath.ForTenant(tenantId, component), secretReference);
                var userName = component switch
                {
                    TenantSqlDatabaseComponent.Erp => $"aierp_t_{tenantId:N}",
                    TenantSqlDatabaseComponent.AiStudio => $"aierp_s_{tenantId:N}",
                    _ => throw new ArgumentOutOfRangeException(nameof(component))
                };
                return Task.FromResult(new TenantSqlCredential(
                    TenantSqlCredentialPath.DatabaseName(tenantId, component), userName, "synthetic-password", 1));
            }
        }

        private sealed class AISettingsTestAuthenticationHandler(
            IOptionsMonitor<AuthenticationSchemeOptions> options,
            ILoggerFactory logger,
            UrlEncoder encoder)
            : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
        {
            public const string SchemeName = "ai-provider-settings-test";

            protected override Task<AuthenticateResult> HandleAuthenticateAsync()
            {
                if (!Guid.TryParse(Request.Headers["X-Test-Tenant"], out var requestedTenant)
                    || !Guid.TryParse(Request.Headers["X-Test-User"], out var requestedUser))
                    return Task.FromResult(AuthenticateResult.NoResult());
                var claims = new[]
                {
                    new Claim("tenant_id", requestedTenant.ToString("D")),
                    new Claim("sub", requestedUser.ToString("D")),
                    new Claim("role", Request.Headers["X-Test-Role"].FirstOrDefault() ?? "TenantAdmin")
                };
                var identity = new ClaimsIdentity(claims, Scheme.Name);
                var principal = new ClaimsPrincipal(identity);
                return Task.FromResult(AuthenticateResult.Success(
                    new AuthenticationTicket(principal, Scheme.Name)));
            }
        }

    }
}
