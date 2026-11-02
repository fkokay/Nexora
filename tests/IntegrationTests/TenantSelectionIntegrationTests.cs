extern alias Api;
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
    public async Task Active_user_cannot_select_inactive_tenant()
    {
        await using var app = await StartApplicationAsync(userIsActive: true, tenantIsActive: false);
        using var client = app.GetTestClient();

        using var response = await client.PostAsJsonAsync("/api/auth/select-tenant", new { tenantId = TenantId });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.DoesNotContain("accessToken", body, StringComparison.OrdinalIgnoreCase);
        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        var failure = await db.AuditEvents.SingleAsync(x => x.UserId == UserId && x.Action == "auth.tenant-selection.failed");
        Assert.Equal("membership-rejected", failure.Resource);
        Assert.Null(failure.TenantId);
        Assert.Empty(await db.AuditEvents.Where(x => x.UserId == UserId && x.TenantId == TenantId && x.Action == "tenant.selected").ToListAsync());
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
        var refreshToken = result.GetProperty("refreshToken").GetString();
        Assert.False(string.IsNullOrWhiteSpace(refreshToken));
        var token = new JwtSecurityTokenHandler().ReadJwtToken(tokenText);
        Assert.Contains(token.Claims, claim => claim.Type == "tenant_id" && claim.Value == TenantId.ToString());
        Assert.Contains(token.Claims, claim => claim.Type == "role" && claim.Value == "TenantAdmin");

        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        Assert.Single(await db.AuditEvents.Where(x => x.UserId == UserId && x.TenantId == TenantId && x.Action == "tenant.selected").ToListAsync());
        var storedSession = await db.PlatformRefreshSessions.SingleAsync();
        Assert.Equal(UserId, storedSession.UserId);
        Assert.Equal(TenantId, storedSession.TenantId);
        Assert.NotEqual(refreshToken, storedSession.TokenHash);

        using var refreshResponse = await client.PostAsJsonAsync("/api/auth/refresh", new { refreshToken });
        Assert.Equal(HttpStatusCode.OK, refreshResponse.StatusCode);
        var refreshed = await refreshResponse.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();
        Assert.False(string.IsNullOrWhiteSpace(refreshed.GetProperty("accessToken").GetString()));
        var rotatedRefreshToken = refreshed.GetProperty("refreshToken").GetString();
        Assert.NotEqual(refreshToken, rotatedRefreshToken);
        using var logoutResponse = await client.PostAsJsonAsync("/api/auth/logout", new { refreshToken = rotatedRefreshToken });
        Assert.Equal(HttpStatusCode.NoContent, logoutResponse.StatusCode);
        using var replayResponse = await client.PostAsJsonAsync("/api/auth/refresh", new { refreshToken });
        Assert.Equal(HttpStatusCode.Unauthorized, replayResponse.StatusCode);
        using var loggedOutRefreshResponse = await client.PostAsJsonAsync("/api/auth/refresh", new { refreshToken = rotatedRefreshToken });
        Assert.Equal(HttpStatusCode.Unauthorized, loggedOutRefreshResponse.StatusCode);
    }

    [Fact]
    public async Task Studio_cookie_transport_hides_refresh_token_and_preserves_rotation_logout_and_replay_rules()
    {
        await using var app = await StartApplicationAsync(userIsActive: true);
        using var client = app.GetTestClient();

        using var selectRequest = StudioCookieRequest("/api/auth/select-tenant", new { tenantId = TenantId });
        using var selectResponse = await client.SendAsync(selectRequest);

        Assert.Equal(HttpStatusCode.OK, selectResponse.StatusCode);
        var selected = await selectResponse.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();
        Assert.True(selected.TryGetProperty("accessToken", out _));
        Assert.False(selected.TryGetProperty("refreshToken", out _));
        var initialCookie = CookiePair(selectResponse);
        var initialSetCookie = Assert.Single(selectResponse.Headers.GetValues("Set-Cookie"));
        Assert.Contains("HttpOnly", initialSetCookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("Secure", initialSetCookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("SameSite=Lax", initialSetCookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("Path=/api/auth", initialSetCookie, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("Domain=", initialSetCookie, StringComparison.OrdinalIgnoreCase);

        using var refreshRequest = StudioCookieRequest("/api/auth/refresh", new Dictionary<string, object?>(), initialCookie);
        using var refreshResponse = await client.SendAsync(refreshRequest);
        Assert.Equal(HttpStatusCode.OK, refreshResponse.StatusCode);
        var refreshed = await refreshResponse.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();
        Assert.True(refreshed.TryGetProperty("accessToken", out _));
        Assert.False(refreshed.TryGetProperty("refreshToken", out _));
        var rotatedCookie = CookiePair(refreshResponse);
        Assert.NotEqual(initialCookie, rotatedCookie);

        using var replayRequest = StudioCookieRequest("/api/auth/refresh", new Dictionary<string, object?>(), initialCookie);
        using var replayResponse = await client.SendAsync(replayRequest);
        Assert.Equal(HttpStatusCode.Unauthorized, replayResponse.StatusCode);

        using var logoutRequest = StudioCookieRequest("/api/auth/logout", new Dictionary<string, object?>(), rotatedCookie);
        using var logoutResponse = await client.SendAsync(logoutRequest);
        Assert.Equal(HttpStatusCode.NoContent, logoutResponse.StatusCode);
        var clearedCookie = Assert.Single(logoutResponse.Headers.GetValues("Set-Cookie"));
        Assert.Contains("Path=/api/auth", clearedCookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("SameSite=Lax", clearedCookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("HttpOnly", clearedCookie, StringComparison.OrdinalIgnoreCase);

        using var loggedOutRefreshRequest = StudioCookieRequest("/api/auth/refresh", new Dictionary<string, object?>(), rotatedCookie);
        using var loggedOutRefreshResponse = await client.SendAsync(loggedOutRefreshRequest);
        Assert.Equal(HttpStatusCode.Unauthorized, loggedOutRefreshResponse.StatusCode);
    }

    [Fact]
    public async Task Studio_cookie_transport_rejects_untrusted_origin_before_creating_a_session()
    {
        await using var app = await StartApplicationAsync(userIsActive: true);
        using var client = app.GetTestClient();
        using var request = StudioCookieRequest("/api/auth/select-tenant", new { tenantId = TenantId }, origin: "https://attacker.example.invalid");

        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        Assert.Empty(await db.PlatformRefreshSessions.ToListAsync());
        Assert.Empty(await db.AuditEvents.Where(x => x.UserId == UserId && x.TenantId == TenantId && x.Action == "tenant.selected").ToListAsync());
    }

    private static HttpRequestMessage StudioCookieRequest(string path, object body, string? cookie = null,
        string origin = "https://studio.example.invalid")
    {
        var request = new HttpRequestMessage(HttpMethod.Post, path) { Content = JsonContent.Create(body) };
        request.Headers.TryAddWithoutValidation("X-Studio-Session", "cookie");
        request.Headers.TryAddWithoutValidation("Origin", origin);
        if (cookie is not null) request.Headers.TryAddWithoutValidation("Cookie", cookie);
        return request;
    }

    private static string CookiePair(HttpResponseMessage response)
    {
        var setCookie = Assert.Single(response.Headers.GetValues("Set-Cookie"));
        return setCookie.Split(';', 2)[0];
    }

    private static async Task<WebApplication> StartApplicationAsync(bool userIsActive, bool tenantIsActive = true)
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        var databaseName = $"tenant-selection-{Guid.NewGuid():N}";
        builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Authentication:SigningKey"] = SigningKey,
            ["Authentication:Issuer"] = "AIERP-test",
            ["Authentication:Audience"] = "AIERP-test",
            ["Authentication:StudioRefreshCookieSecure"] = "true",
            ["Studio:Origins:0"] = "https://studio.example.invalid"
        });
        builder.Services.AddDbContext<PlatformDbContext>(options => options.UseInMemoryDatabase(databaseName));
        builder.Services.AddScoped<TenantDbContext>(_ => throw new InvalidOperationException("Tenant data must not be resolved before tenant selection."));
        builder.Services.AddAuthentication("tenant-test").AddScheme<AuthenticationSchemeOptions, TenantSelectionAuthenticationHandler>("tenant-test", _ => { });
        builder.Services.AddScoped<IPlatformPermissionAuthorizer, AllowPermissionAuthorizer>();
        builder.Services.AddScoped<IAuthorizationHandler, Api::PermissionAuthorizationHandler>();
        builder.Services.AddAuthorization(options => options.DefaultPolicy = new AuthorizationPolicyBuilder()
            .RequireAuthenticatedUser().AddRequirements(new Api::PermissionRequirement()).Build());

        var app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapGroup("/api/auth").MapSelectTenantEndpoint();
        app.MapGroup("/api/auth").MapRefreshEndpoint();
        app.MapGroup("/api/auth").MapLogoutEndpoint();
        await app.StartAsync();

        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        var user = new AppUser { Id = UserId, Email = "tenant-test@example.invalid", DisplayName = "Tenant test", IsActive = userIsActive };
        var tenant = new Tenant { Id = TenantId, Name = "Test tenant", Slug = "test-tenant", IsActive = tenantIsActive };
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
