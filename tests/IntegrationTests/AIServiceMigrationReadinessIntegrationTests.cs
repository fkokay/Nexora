using System.Net;
using System.Text.Encodings.Web;
using AIERP.AIService;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Authentication;
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

public sealed class AIServiceMigrationReadinessIntegrationTests
{
    private const string PendingMigration = "20261023150000_AddStudioModuleSourceMappings";

    [Fact]
    public async Task Studio_data_endpoint_returns_migration_pending_503_contract()
    {
        await using var factory = new MigrationReadinessFactory(throwUnexpectedException: false, ready: false);
        await SeedStudioStateAsync(factory);
        using var client = factory.CreateClient();

        using var response = await client.GetAsync("/studio/requests/");
        var body = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.Contains("\"error\":\"studio_migrations_pending\"", body);
        Assert.Contains($"\"requiredMigration\":\"{PendingMigration}\"", body);
    }

    [Fact]
    public async Task Studio_data_endpoint_returns_safe_503_for_unexpected_check_failure()
    {
        await using var factory = new MigrationReadinessFactory(throwUnexpectedException: true, ready: false);
        await SeedStudioStateAsync(factory);
        using var client = factory.CreateClient();

        using var response = await client.GetAsync("/studio/requests/");
        var body = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.Contains("\"error\":\"studio_migration_check_failed\"", body);
        Assert.DoesNotContain("synthetic provider detail", body);
    }

    [Fact]
    public async Task Platform_only_studio_endpoint_keeps_behavior_when_migrations_are_pending()
    {
        await using var factory = new MigrationReadinessFactory(throwUnexpectedException: false, ready: false);
        await SeedStudioStateAsync(factory);
        using var client = factory.CreateClient();

        using var response = await client.GetAsync("/studio/capabilities");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(0, factory.ReadinessChecks);
    }

    [Fact]
    public async Task Anonymous_github_callback_keeps_behavior_when_migrations_are_pending()
    {
        await using var factory = new MigrationReadinessFactory(throwUnexpectedException: false, ready: false);
        await SeedStudioStateAsync(factory);
        using var client = factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });

        using var response = await client.GetAsync("/studio/github/setup-callback");

        Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);
        Assert.Equal(0, factory.ReadinessChecks);
    }

    [Fact]
    public async Task Health_endpoint_returns_503_when_studio_migrations_are_pending()
    {
        await using var factory = new MigrationReadinessFactory(throwUnexpectedException: false, ready: false);
        await SeedStudioStateAsync(factory);
        using var client = factory.CreateClient();

        using var response = await client.GetAsync("/health");
        var body = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.Contains("\"status\":\"not_ready\"", body);
        Assert.Contains("\"dependency\":\"studio-migrations\"", body);
        Assert.Contains($"\"requiredMigration\":\"{PendingMigration}\"", body);
    }

    [Fact]
    public async Task Health_endpoint_propagates_request_cancellation_during_migration_check()
    {
        await using var factory = new MigrationReadinessFactory(throwUnexpectedException: false, ready: true,
            waitForRequestCancellation: true);
        await SeedStudioStateAsync(factory);
        using var client = factory.CreateClient();
        using var cancellation = new CancellationTokenSource();

        var request = client.GetAsync("/health", cancellation.Token);
        await factory.ReadinessCheckStarted.WaitAsync(TimeSpan.FromSeconds(5));
        cancellation.Cancel();

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => request);
        Assert.Equal(1, factory.ReadinessChecks);
    }

    private static async Task SeedStudioStateAsync(MigrationReadinessFactory factory)
    {
        using var scope = factory.Services.CreateScope();
        var database = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        database.DatabaseSeparationComponentStates.Add(new DatabaseSeparationComponentState
        {
            Component = "AIStudio",
            DatabaseName = "AIERPStudio",
            State = TenantDatabaseProvisioningState.Ready
        });
        await database.SaveChangesAsync();
    }

    private sealed class MigrationReadinessFactory(bool throwUnexpectedException, bool ready,
        bool waitForRequestCancellation = false)
        : WebApplicationFactory<AIERP.AIService.AIServiceEntryPointMarker>
    {
        private readonly string _databaseName = $"ai-service-migration-readiness-{Guid.NewGuid():N}";
        private SyntheticMigrationReadinessChecker? _checker;
        public int ReadinessChecks => _checker?.Calls ?? 0;
        public Task ReadinessCheckStarted => _checker?.Started.Task ?? Task.CompletedTask;

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Production");
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<PlatformDbContext>();
                services.RemoveAll<DbContextOptions<PlatformDbContext>>();
                services.RemoveAll<IDbContextOptionsConfiguration<PlatformDbContext>>();
                services.AddDbContext<PlatformDbContext>(options => options.UseInMemoryDatabase(_databaseName));

                services.RemoveAll<IAIStudioMigrationReadinessChecker>();
                _checker = new SyntheticMigrationReadinessChecker(throwUnexpectedException, ready, waitForRequestCancellation);
                services.AddSingleton<IAIStudioMigrationReadinessChecker>(_checker);
                services.RemoveAll<IHostedService>();

                services.AddAuthentication(options =>
                {
                    options.DefaultAuthenticateScheme = MigrationTestAuthenticationHandler.SchemeName;
                    options.DefaultChallengeScheme = MigrationTestAuthenticationHandler.SchemeName;
                    options.DefaultForbidScheme = MigrationTestAuthenticationHandler.SchemeName;
                }).AddScheme<AuthenticationSchemeOptions, MigrationTestAuthenticationHandler>(MigrationTestAuthenticationHandler.SchemeName, _ => { });
                services.AddAuthorization(options =>
                    options.DefaultPolicy = new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build());
            });
        }

        protected override IHost CreateHost(IHostBuilder builder)
        {
            builder.ConfigureHostConfiguration(configuration => configuration.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Authentication:SigningKey"] = "synthetic-ai-service-auth-signing-key-32-bytes",
                ["Authentication:Issuer"] = "AIERP",
                ["Authentication:Audience"] = "AIERP",
                ["ConnectionStrings:Platform"] = "Server=localhost;Database=unused;User Id=test;Password=test;TrustServerCertificate=True",
                ["ConnectionStrings:AIStudio"] = "Server=localhost;Database=unused;User Id=test;Password=test;TrustServerCertificate=True",
                ["Database:SeparationEnabled"] = "true",
                ["Database:ApplyMigrationsOnStartup"] = "false"
            }));
            return base.CreateHost(builder);
        }
    }

    private sealed class SyntheticMigrationReadinessChecker(bool throwUnexpectedException, bool ready,
        bool waitForRequestCancellation) : IAIStudioMigrationReadinessChecker
    {
        public int Calls { get; private set; }
        public TaskCompletionSource Started { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);

        public async Task<AIStudioMigrationReadinessResult> CheckAsync(AIStudioDbContext database, CancellationToken cancellationToken = default)
        {
            Calls++;
            Started.TrySetResult();
            if (waitForRequestCancellation)
                await Task.Delay(Timeout.InfiniteTimeSpan, cancellationToken);
            if (throwUnexpectedException) throw new InvalidOperationException("synthetic provider detail");
            return ready
                ? new AIStudioMigrationReadinessResult(true, null)
                : new AIStudioMigrationReadinessResult(false, PendingMigration);
        }
    }

    private sealed class MigrationTestAuthenticationHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder)
        : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
    {
        public const string SchemeName = "migration-readiness-test";

        protected override Task<AuthenticateResult> HandleAuthenticateAsync()
        {
            var claims = new[]
            {
                new System.Security.Claims.Claim("tenant_id", "11111111-1111-1111-1111-111111111111"),
                new System.Security.Claims.Claim("sub", "22222222-2222-2222-2222-222222222222")
            };
            var identity = new System.Security.Claims.ClaimsIdentity(claims, SchemeName);
            var principal = new System.Security.Claims.ClaimsPrincipal(identity);
            return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(principal, SchemeName)));
        }
    }
}
