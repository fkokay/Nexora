using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Encodings.Web;
using AIERP.Api;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Microsoft.AspNetCore.RateLimiting;
using Xunit;

namespace AIERP.Api.IntegrationTests;

public sealed class LiveAiEvaluationRateLimitIntegrationTests
{
    [Fact]
    public async Task Endpoint_rejects_admin_membership_in_inactive_tenant()
    {
        var tenantId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        var dbName = $"live-ai-evaluation-inactive-tenant-{Guid.NewGuid():N}";
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Services.AddDbContext<PlatformDbContext>(options => options.UseInMemoryDatabase(dbName));
        builder.Services.AddHttpClient();
        builder.Services.AddAuthentication("live-evaluation-test")
            .AddScheme<AuthenticationSchemeOptions, LiveEvaluationTestAuthenticationHandler>("live-evaluation-test", _ => { });
        builder.Services.AddAuthorization();
        builder.Services.AddRateLimiter(LiveAiEvaluationEndpoints.ConfigureRateLimiting);

        await using var app = builder.Build();
        app.UseRouting();
        app.UseAuthentication();
        app.UseRateLimiter();
        app.UseAuthorization();
        LiveAiEvaluationEndpoints.Map(app);
        await app.StartAsync();

        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            var tenant = new Tenant { Id = tenantId, Name = "Inactive tenant", Slug = $"tenant-{tenantId:N}", IsActive = false };
            var user = new AppUser { Id = userId, Email = "admin@example.invalid", DisplayName = "Admin" };
            db.Tenants.Add(tenant);
            db.Users.Add(user);
            db.TenantMemberships.Add(new TenantMembership
            {
                TenantId = tenantId,
                UserId = userId,
                Tenant = tenant,
                User = user,
                Role = "TenantAdmin"
            });
            await db.SaveChangesAsync();
        }

        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", tenantId.ToString("D"));
        client.DefaultRequestHeaders.Add("X-Test-User", userId.ToString("D"));

        var response = await client.PostAsJsonAsync("/api/ai-settings/live-evaluation", new { caseId = "inventory-arithmetic" });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Endpoint_limits_thirty_requests_per_socket_peer_even_when_forwarded_ip_changes()
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Services.AddDbContext<PlatformDbContext>(options => options.UseInMemoryDatabase($"live-ai-evaluation-peer-{Guid.NewGuid():N}"));
        builder.Services.AddHttpClient();
        builder.Services.AddAuthentication("live-evaluation-test")
            .AddScheme<AuthenticationSchemeOptions, LiveEvaluationTestAuthenticationHandler>("live-evaluation-test", _ => { });
        builder.Services.AddAuthorization();
        builder.Services.AddRateLimiter(LiveAiEvaluationEndpoints.ConfigureRateLimiting);

        await using var app = builder.Build();
        app.UseRouting();
        app.UseAuthentication();
        app.UseRateLimiter();
        app.UseAuthorization();
        LiveAiEvaluationEndpoints.Map(app);
        await app.StartAsync();

        using var client = app.GetTestClient();
        for (var requestIndex = 0; requestIndex < 30; requestIndex++)
        {
            using var request = CreateSyntheticRequest(requestIndex);
            var response = await client.SendAsync(request);
            Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        }

        using var limitedRequest = CreateSyntheticRequest(30);
        var limitedResponse = await client.SendAsync(limitedRequest);

        Assert.Equal((HttpStatusCode)429, limitedResponse.StatusCode);

        static HttpRequestMessage CreateSyntheticRequest(int requestIndex)
        {
            var request = new HttpRequestMessage(HttpMethod.Post, "/api/ai-settings/live-evaluation")
            {
                Content = JsonContent.Create(new { caseId = "inventory-arithmetic" })
            };
            request.Headers.Add("X-Test-Tenant", Guid.NewGuid().ToString("D"));
            request.Headers.Add("X-Test-User", Guid.NewGuid().ToString("D"));
            request.Headers.Add("X-Forwarded-For", $"198.51.100.{requestIndex + 1}");
            return request;
        }
    }

    [Fact]
    public async Task Endpoint_requires_authenticated_active_tenant_admin_and_throttles_by_tenant_and_user()
    {
        var tenantId = Guid.NewGuid();
        var otherTenantId = Guid.NewGuid();
        var adminId = Guid.NewGuid();
        var otherAdminId = Guid.NewGuid();
        var inactiveAdminId = Guid.NewGuid();
        var regularUserId = Guid.NewGuid();
        var dbName = $"live-ai-evaluation-{Guid.NewGuid():N}";
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Services.AddDbContext<PlatformDbContext>(options => options.UseInMemoryDatabase(dbName));
        builder.Services.AddHttpClient();
        builder.Services.AddAuthentication("live-evaluation-test")
            .AddScheme<AuthenticationSchemeOptions, LiveEvaluationTestAuthenticationHandler>("live-evaluation-test", _ => { });
        builder.Services.AddAuthorization();
        builder.Services.AddRateLimiter(LiveAiEvaluationEndpoints.ConfigureRateLimiting);

        await using var app = builder.Build();
        app.UseRouting();
        app.UseAuthentication();
        app.UseRateLimiter();
        app.UseAuthorization();
        LiveAiEvaluationEndpoints.Map(app);
        await app.StartAsync();

        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            var tenant = new Tenant { Id = tenantId, Name = "Tenant", Slug = $"tenant-{tenantId:N}" };
            var otherTenant = new Tenant { Id = otherTenantId, Name = "Other", Slug = $"tenant-{otherTenantId:N}" };
            var admin = new AppUser { Id = adminId, Email = "admin@example.invalid", DisplayName = "Admin" };
            var otherAdmin = new AppUser { Id = otherAdminId, Email = "other@example.invalid", DisplayName = "Other Admin" };
            var inactiveAdmin = new AppUser { Id = inactiveAdminId, Email = "inactive@example.invalid", DisplayName = "Inactive", IsActive = false };
            var regularUser = new AppUser { Id = regularUserId, Email = "user@example.invalid", DisplayName = "User" };
            db.Tenants.AddRange(tenant, otherTenant);
            db.Users.AddRange(admin, otherAdmin, inactiveAdmin, regularUser);
            db.TenantMemberships.AddRange(
                new TenantMembership { TenantId = tenantId, UserId = adminId, Tenant = tenant, User = admin, Role = "TenantAdmin" },
                new TenantMembership { TenantId = tenantId, UserId = otherAdminId, Tenant = tenant, User = otherAdmin, Role = "TenantAdmin" },
                new TenantMembership { TenantId = tenantId, UserId = inactiveAdminId, Tenant = tenant, User = inactiveAdmin, Role = "TenantAdmin" },
                new TenantMembership { TenantId = tenantId, UserId = regularUserId, Tenant = tenant, User = regularUser, Role = "TenantUser" },
                new TenantMembership { TenantId = otherTenantId, UserId = otherAdminId, Tenant = otherTenant, User = otherAdmin, Role = "TenantAdmin" });
            await db.SaveChangesAsync();
        }

        using var client = app.GetTestClient();
        var noAuth = await client.PostAsJsonAsync("/api/ai-settings/live-evaluation", new { caseId = "inventory-arithmetic" });
        Assert.Equal(HttpStatusCode.Unauthorized, noAuth.StatusCode);

        client.DefaultRequestHeaders.Add("X-Test-Tenant", tenantId.ToString("D"));
        client.DefaultRequestHeaders.Add("X-Test-User", regularUserId.ToString("D"));
        client.DefaultRequestHeaders.Add("X-Test-Role", "TenantUser");
        Assert.Equal(HttpStatusCode.Forbidden,
            (await client.PostAsJsonAsync("/api/ai-settings/live-evaluation", new { caseId = "inventory-arithmetic" })).StatusCode);

        client.DefaultRequestHeaders.Remove("X-Test-Role");
        client.DefaultRequestHeaders.Remove("X-Test-User");
        client.DefaultRequestHeaders.Add("X-Test-User", inactiveAdminId.ToString("D"));
        Assert.Equal(HttpStatusCode.Forbidden,
            (await client.PostAsJsonAsync("/api/ai-settings/live-evaluation", new { caseId = "inventory-arithmetic" })).StatusCode);

        client.DefaultRequestHeaders.Remove("X-Test-User");
        client.DefaultRequestHeaders.Add("X-Test-User", adminId.ToString("D"));
        client.DefaultRequestHeaders.Add("X-Forwarded-For", "198.51.100.1");
        var accepted = await client.PostAsJsonAsync("/api/ai-settings/live-evaluation", new { caseId = "inventory-arithmetic" });
        Assert.Equal(HttpStatusCode.NotFound, accepted.StatusCode); // Feature flag is off; no provider call is made.
        client.DefaultRequestHeaders.Remove("X-Forwarded-For");
        client.DefaultRequestHeaders.Add("X-Forwarded-For", "203.0.113.9");
        var sameTenantUserAgainFromDifferentForwardedIp = await client.PostAsJsonAsync(
            "/api/ai-settings/live-evaluation", new { caseId = "inventory-arithmetic" });
        Assert.Equal((HttpStatusCode)429, sameTenantUserAgainFromDifferentForwardedIp.StatusCode);

        client.DefaultRequestHeaders.Remove("X-Test-User");
        client.DefaultRequestHeaders.Add("X-Test-User", otherAdminId.ToString("D"));
        var anotherAdminSameTenant = await client.PostAsJsonAsync(
            "/api/ai-settings/live-evaluation", new { caseId = "inventory-arithmetic" });
        Assert.Equal(HttpStatusCode.NotFound, anotherAdminSameTenant.StatusCode);

        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", otherTenantId.ToString("D"));
        var otherTenantResponse = await client.PostAsJsonAsync(
            "/api/ai-settings/live-evaluation", new { caseId = "inventory-arithmetic" });
        Assert.Equal(HttpStatusCode.NotFound, otherTenantResponse.StatusCode);
    }

    private sealed class LiveEvaluationTestAuthenticationHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder)
        : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
    {
        protected override Task<AuthenticateResult> HandleAuthenticateAsync()
        {
            if (!Guid.TryParse(Request.Headers["X-Test-Tenant"], out var tenantId)
                || !Guid.TryParse(Request.Headers["X-Test-User"], out var userId))
                return Task.FromResult(AuthenticateResult.NoResult());

            var role = Request.Headers["X-Test-Role"].FirstOrDefault() ?? "TenantAdmin";
            var claims = new[]
            {
                new Claim("tenant_id", tenantId.ToString("D")),
                new Claim("sub", userId.ToString("D")),
                new Claim("role", role)
            };
            var identity = new ClaimsIdentity(claims, Scheme.Name);
            return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), Scheme.Name)));
        }
    }
}
