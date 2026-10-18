using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using System.Text.Encodings.Web;
using Xunit;

namespace AIERP.Api.IntegrationTests;

public sealed class TenantSelectionIntegrationTests
{
    private static readonly Guid UserId = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private static readonly Guid TenantId = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private const string SigningKey = "tenant-selection-test-signing-key-32-bytes-minimum";

    [Fact]
    public async Task Disabled_user_cannot_exchange_selection_token_for_tenant_token()
    {
        await using var app = await StartApplicationAsync(userIsActive: false);
        using var client = app.GetTestClient();

        using var response = await client.PostAsJsonAsync("/api/auth/select-tenant", new { tenantId = TenantId });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        var failure = await db.AuditEvents.SingleAsync(x => x.UserId == UserId && x.Action == "auth.tenant-selection.failed");
        Assert.Equal("membership-rejected", failure.Resource);
        Assert.Null(failure.TenantId);
    }

    [Fact]
    public async Task Active_member_can_select_active_tenant_and_get_audited_tenant_claims()
    {
        await using var app = await StartApplicationAsync(userIsActive: true);
        using var client = app.GetTestClient();

        using var response = await client.PostAsJsonAsync("/api/auth/select-tenant", new { tenantId = TenantId });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var result = await response.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();
        var tokenText = result.GetProperty("accessToken").GetString();
        Assert.False(string.IsNullOrWhiteSpace(tokenText));
        var token = new JwtSecurityTokenHandler().ReadJwtToken(tokenText);
        Assert.Contains(token.Claims, claim => claim.Type == "tenant_id" && claim.Value == TenantId.ToString());
        Assert.Contains(token.Claims, claim => claim.Type == "role" && claim.Value == "TenantAdmin");

        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        Assert.Single(await db.AuditEvents.Where(x => x.UserId == UserId && x.TenantId == TenantId && x.Action == "tenant.selected").ToListAsync());
    }

    private static async Task<WebApplication> StartApplicationAsync(bool userIsActive)
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        var databaseName = $"tenant-selection-{Guid.NewGuid():N}";
        builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Authentication:SigningKey"] = SigningKey,
            ["Authentication:Issuer"] = "AIERP-test",
            ["Authentication:Audience"] = "AIERP-test"
        });
        builder.Services.AddDbContext<PlatformDbContext>(options => options.UseInMemoryDatabase(databaseName));
        builder.Services.AddScoped<TenantDbContext>(_ => throw new InvalidOperationException("Tenant data must not be resolved before tenant selection."));
        builder.Services.AddAuthentication("tenant-test").AddScheme<AuthenticationSchemeOptions, TenantSelectionAuthenticationHandler>("tenant-test", _ => { });
        builder.Services.AddScoped<IPlatformPermissionAuthorizer, AllowPermissionAuthorizer>();
        builder.Services.AddScoped<IAuthorizationHandler, PermissionAuthorizationHandler>();
        builder.Services.AddAuthorization(options => options.DefaultPolicy = new AuthorizationPolicyBuilder()
            .RequireAuthenticatedUser().AddRequirements(new PermissionRequirement()).Build());

        var app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapGroup("/api/auth").MapSelectTenantEndpoint();
        await app.StartAsync();

        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        var user = new AppUser { Id = UserId, Email = "tenant-test@example.invalid", DisplayName = "Tenant test", IsActive = userIsActive };
        var tenant = new Tenant { Id = TenantId, Name = "Test tenant", Slug = "test-tenant", IsActive = true };
        db.Users.Add(user);
        db.Tenants.Add(tenant);
        db.TenantMemberships.Add(new TenantMembership { UserId = UserId, User = user, TenantId = TenantId, Tenant = tenant, Role = "TenantAdmin" });
        await db.SaveChangesAsync();
        return app;
    }

    private sealed class TenantSelectionAuthenticationHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder)
        : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
    {
        protected override Task<AuthenticateResult> HandleAuthenticateAsync()
        {
            var claims = new[]
            {
                new Claim(JwtRegisteredClaimNames.Sub, UserId.ToString()),
                new Claim("email", "tenant-test@example.invalid"),
                new Claim("name", "Tenant test")
            };
            var identity = new ClaimsIdentity(claims, Scheme.Name);
            return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), Scheme.Name)));
        }
    }

    private sealed class AllowPermissionAuthorizer : IPlatformPermissionAuthorizer
    {
        public Task<bool> IsAllowedAsync(Guid tenantId, Guid userId, string role, ResolvedPlatformPermission permission,
            CancellationToken cancellationToken = default) => Task.FromResult(true);
    }
}
