using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Encodings.Web;
using System.Text.Json;
using AIERP.AIService;
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

public sealed class StudioAccessEndpointsIntegrationTests
{
    internal static readonly Guid TenantId = Guid.Parse("c1a0b6f2-7d5e-4c1e-9f0a-1a2b3c4d5e6f");
    private static readonly Guid OtherTenantId = Guid.Parse("d2b1c7a3-8e6f-4d2f-a01b-2b3c4d5e6f70");
    internal static readonly Guid AdminId = Guid.Parse("11111111-1111-1111-1111-111111111111");
    internal static readonly Guid UserId = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid OutsiderId = Guid.Parse("33333333-3333-3333-3333-333333333333");

    [Fact]
    public async Task Me_returns_consultant_for_tenant_user_without_grants()
    {
        await using var factory = await CreateFactoryAsync();
        using var client = factory.CreateClient();

        var json = await GetJsonAsync(client, "/studio/me", UserId);

        Assert.Equal("Consultant", json.GetProperty("workRole").GetString());
        Assert.False(json.GetProperty("isAdmin").GetBoolean());
        Assert.Equal(["Consultant"], json.GetProperty("menuRoles").EnumerateArray().Select(x => x.GetString()!).ToArray());
    }

    [Fact]
    public async Task Me_returns_all_menus_for_tenant_admin()
    {
        await using var factory = await CreateFactoryAsync();
        using var client = factory.CreateClient();

        var json = await GetJsonAsync(client, "/studio/me", AdminId);

        Assert.True(json.GetProperty("isAdmin").GetBoolean());
        Assert.Equal(["Admin", "Developer", "Consultant"], json.GetProperty("menuRoles").EnumerateArray().Select(x => x.GetString()!).ToArray());
    }

    [Fact]
    public async Task Me_is_forbidden_without_membership()
    {
        await using var factory = await CreateFactoryAsync();
        using var client = factory.CreateClient();

        using var response = await SendAsync(client, HttpMethod.Get, "/studio/me", OutsiderId);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task People_is_forbidden_for_non_admin()
    {
        await using var factory = await CreateFactoryAsync();
        using var client = factory.CreateClient();

        using var response = await SendAsync(client, HttpMethod.Get, "/studio/people", UserId);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task People_lists_members_with_effective_role_for_admin()
    {
        await using var factory = await CreateFactoryAsync();
        using var client = factory.CreateClient();

        var json = await GetJsonAsync(client, "/studio/people", AdminId);

        var rows = json.EnumerateArray().ToDictionary(x => x.GetProperty("userId").GetGuid());
        Assert.Equal(2, rows.Count);
        Assert.Equal("Admin", rows[AdminId].GetProperty("effectiveRole").GetString());
        Assert.Equal("Consultant", rows[UserId].GetProperty("effectiveRole").GetString());
        Assert.Equal(JsonValueKind.Null, rows[UserId].GetProperty("studioRole").ValueKind);
    }

    [Fact]
    public async Task Put_studio_role_updates_and_audits()
    {
        await using var factory = await CreateFactoryAsync();
        using var client = factory.CreateClient();

        using var response = await SendAsync(client, HttpMethod.Put, $"/studio/people/{UserId}/studio-role", AdminId,
            new { studioRole = "Developer" });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var row = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Developer", row.GetProperty("studioRole").GetString());
        Assert.Equal("Developer", row.GetProperty("effectiveRole").GetString());
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        var audit = await db.AuditEvents.SingleAsync(x => x.Action == "studio.member.role-updated");
        Assert.Equal(TenantId, audit.TenantId);
        Assert.Equal(AdminId, audit.UserId);
        Assert.Equal($"{UserId:D}:Developer", audit.Resource);
        Assert.Equal("Developer", (await db.TenantMemberships.SingleAsync(x => x.UserId == UserId)).StudioRole);
    }

    [Fact]
    public async Task Put_studio_role_rejects_unknown_value()
    {
        await using var factory = await CreateFactoryAsync();
        using var client = factory.CreateClient();

        using var response = await SendAsync(client, HttpMethod.Put, $"/studio/people/{UserId}/studio-role", AdminId,
            new { studioRole = "Admin" });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Put_studio_role_is_forbidden_for_non_admin()
    {
        await using var factory = await CreateFactoryAsync();
        using var client = factory.CreateClient();

        using var response = await SendAsync(client, HttpMethod.Put, $"/studio/people/{UserId}/studio-role", UserId,
            new { studioRole = "Developer" });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Put_studio_role_on_admin_keeps_admin()
    {
        await using var factory = await CreateFactoryAsync();
        using var client = factory.CreateClient();

        using var response = await SendAsync(client, HttpMethod.Put, $"/studio/people/{AdminId}/studio-role", AdminId,
            new { studioRole = "None" });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var row = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Admin", row.GetProperty("effectiveRole").GetString());
        using var scope = factory.Services.CreateScope();
        var membership = await scope.ServiceProvider.GetRequiredService<PlatformDbContext>()
            .TenantMemberships.SingleAsync(x => x.UserId == AdminId && x.TenantId == TenantId);
        Assert.Equal("TenantAdmin", membership.Role);
    }

    [Fact]
    public async Task Put_studio_role_cannot_touch_other_tenant()
    {
        await using var factory = await CreateFactoryAsync();
        using var client = factory.CreateClient();

        using var response = await SendAsync(client, HttpMethod.Put, $"/studio/people/{OutsiderId}/studio-role", AdminId,
            new { studioRole = "Developer" });

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        using var scope = factory.Services.CreateScope();
        Assert.Null((await scope.ServiceProvider.GetRequiredService<PlatformDbContext>()
            .TenantMemberships.SingleAsync(x => x.UserId == OutsiderId)).StudioRole);
    }

    [Fact]
    public async Task Real_authorization_policy_allows_marked_endpoints_and_still_denies_catalog_less_paths()
    {
        await using var factory = await CreateFactoryAsync(useRealPolicy: true);
        using var client = factory.CreateClient();

        using var me = await SendAsync(client, HttpMethod.Get, "/studio/me", UserId);
        using var people = await SendAsync(client, HttpMethod.Get, "/studio/people", UserId);
        using var adminPeople = await SendAsync(client, HttpMethod.Get, "/studio/people", AdminId);
        using var neighbour = await SendAsync(client, HttpMethod.Get, "/studio/modules/active", UserId);

        Assert.Equal(HttpStatusCode.OK, me.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, people.StatusCode);
        Assert.Equal(HttpStatusCode.OK, adminPeople.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, neighbour.StatusCode);
    }

    private static async Task<JsonElement> GetJsonAsync(HttpClient client, string url, Guid userId)
    {
        using var response = await SendAsync(client, HttpMethod.Get, url, userId);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return await response.Content.ReadFromJsonAsync<JsonElement>();
    }

    internal static Task<HttpResponseMessage> SendAsync(HttpClient client, HttpMethod method, string url, Guid userId, object? body = null, bool withoutRoleClaim = false)
    {
        var request = new HttpRequestMessage(method, url);
        request.Headers.Add(TestAuthHandler.UserHeader, userId.ToString("D"));
        if (withoutRoleClaim) request.Headers.Add(TestAuthHandler.NoRoleHeader, "1");
        if (body is not null) request.Content = JsonContent.Create(body);
        return client.SendAsync(request);
    }

    internal static async Task<StudioFactory> CreateFactoryAsync(bool useRealPolicy = false)
    {
        var factory = new StudioFactory(useRealPolicy);
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        db.Tenants.AddRange(
            new Tenant { Id = TenantId, Name = "Studio roles tenant", Slug = "studio-roles" },
            new Tenant { Id = OtherTenantId, Name = "Other tenant", Slug = "studio-roles-other" });
        db.Users.AddRange(
            new AppUser { Id = AdminId, Email = "admin@test.local", DisplayName = "Admin" },
            new AppUser { Id = UserId, Email = "user@test.local", DisplayName = "User" },
            new AppUser { Id = OutsiderId, Email = "outsider@test.local", DisplayName = "Outsider" });
        db.TenantMemberships.AddRange(
            new TenantMembership { TenantId = TenantId, UserId = AdminId, Role = "TenantAdmin" },
            new TenantMembership { TenantId = TenantId, UserId = UserId, Role = "TenantUser" },
            new TenantMembership { TenantId = OtherTenantId, UserId = OutsiderId, Role = "TenantUser" });
        db.DatabaseSeparationComponentStates.Add(new DatabaseSeparationComponentState
        {
            Component = TenantDatabaseRouting.StudioComponentKey(TenantId),
            DatabaseName = TenantSqlCredentialPath.DatabaseName(TenantId, TenantSqlDatabaseComponent.AiStudio),
            State = TenantDatabaseProvisioningState.Ready
        });
        await db.SaveChangesAsync();
        return factory;
    }

    internal sealed class StudioFactory(bool useRealPolicy) : WebApplicationFactory<AIServiceEntryPointMarker>
    {
        private readonly string _platformName = $"studio-access-platform-{Guid.NewGuid():N}";
        private readonly string _studioName = $"studio-access-studio-{Guid.NewGuid():N}";

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Production");
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<PlatformDbContext>();
                services.RemoveAll<DbContextOptions<PlatformDbContext>>();
                services.RemoveAll<IDbContextOptionsConfiguration<PlatformDbContext>>();
                services.AddDbContext<PlatformDbContext>(options => options.UseInMemoryDatabase(_platformName));
                services.RemoveAll<AIStudioDbContext>();
                services.RemoveAll<DbContextOptions<AIStudioDbContext>>();
                services.RemoveAll<IDbContextOptionsConfiguration<AIStudioDbContext>>();
                services.AddDbContext<AIStudioDbContext>(options => options.UseInMemoryDatabase(_studioName));

                services.RemoveAll<ITenantSqlCredentialReader>();
                services.AddSingleton<ITenantSqlCredentialReader>(new FakeCredentialReader());
                services.RemoveAll<IAIStudioMigrationReadinessChecker>();
                services.AddSingleton<IAIStudioMigrationReadinessChecker>(new ReadyChecker());
                services.RemoveAll<IHostedService>();

                services.AddAuthentication(options =>
                {
                    options.DefaultAuthenticateScheme = TestAuthHandler.SchemeName;
                    options.DefaultChallengeScheme = TestAuthHandler.SchemeName;
                    options.DefaultForbidScheme = TestAuthHandler.SchemeName;
                }).AddScheme<AuthenticationSchemeOptions, TestAuthHandler>(TestAuthHandler.SchemeName, _ => { });
                // useRealPolicy keeps the production default policy (PermissionRequirement + PermissionAuthorizationHandler).
                if (!useRealPolicy)
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
                ["Database:ApplyMigrationsOnStartup"] = "false",
                ["Vault:Address"] = "https://vault.test",
                ["Vault:TenantSqlCredentialReader:RoleId"] = "studio-access-test-role",
                ["Vault:TenantSqlCredentialReader:SecretId"] = "studio-access-test-secret"
            }));
            return base.CreateHost(builder);
        }
    }

    private sealed class FakeCredentialReader : ITenantSqlCredentialReader
    {
        public Task<TenantSqlCredential> ReadAsync(Guid tenantId, TenantSqlDatabaseComponent component,
            string secretReference, CancellationToken cancellationToken = default) =>
            Task.FromResult(new TenantSqlCredential(TenantSqlCredentialPath.DatabaseName(tenantId, component),
                $"aierp_s_{tenantId:N}", "synthetic-password", 1));
    }

    private sealed class ReadyChecker : IAIStudioMigrationReadinessChecker
    {
        public Task<AIStudioMigrationReadinessResult> CheckAsync(AIStudioDbContext database, CancellationToken cancellationToken = default) =>
            Task.FromResult(new AIStudioMigrationReadinessResult(true, null));
    }

    internal sealed class TestAuthHandler(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder)
        : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
    {
        public const string SchemeName = "studio-access-test";
        public const string UserHeader = "X-Test-User";
        public const string NoRoleHeader = "X-Test-NoRole";

        protected override Task<AuthenticateResult> HandleAuthenticateAsync()
        {
            if (!Request.Headers.TryGetValue(UserHeader, out var user)) return Task.FromResult(AuthenticateResult.NoResult());
            // Token claims are deliberately minimal: the endpoints must read the role from the database.
            List<Claim> claims = [new Claim("tenant_id", TenantId.ToString("D")), new Claim("sub", user.ToString())];
            // Service tokens carry no role claim; NoRoleHeader simulates one.
            if (!Request.Headers.ContainsKey(NoRoleHeader)) claims.Add(new Claim("role", "TenantUser"));
            var identity = new ClaimsIdentity(claims, SchemeName);
            return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), SchemeName)));
        }
    }
}
