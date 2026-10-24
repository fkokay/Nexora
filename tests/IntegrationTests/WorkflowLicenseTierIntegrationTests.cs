using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Encodings.Web;
using System.Text.Json;
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
using Xunit;

namespace AIERP.Api.IntegrationTests;

public sealed class WorkflowLicenseTierIntegrationTests
{
    private static readonly Guid TenantId = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid AdminId = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");

    [Fact]
    public async Task Small_or_unlicensed_tenant_cannot_create_advanced_workflow()
    {
        foreach (var tier in new string?[] { null, "Small" })
        {
            await using var app = await StartAsync(tier);
            using var client = app.GetTestClient();
            using var response = await client.PostAsJsonAsync("/api/workflows/definitions", ValidRequest());

            Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
            var body = await response.Content.ReadFromJsonAsync<JsonElement>();
            Assert.Equal("license.feature_unavailable", body.GetProperty("code").GetString());
            Assert.Equal("advancedWorkflow", body.GetProperty("feature").GetString());
            Assert.Equal("Medium", body.GetProperty("requiredTier").GetString());
            await using var scope = app.Services.CreateAsyncScope();
            Assert.Empty(await scope.ServiceProvider.GetRequiredService<TenantDbContext>().TenantWorkflowDefinitions.ToListAsync());
        }
    }

    [Theory]
    [InlineData("Medium")]
    [InlineData("Large")]
    public async Task Medium_and_large_tenants_can_create_advanced_workflow(string tier)
    {
        await using var app = await StartAsync(tier);
        using var client = app.GetTestClient();
        using var response = await client.PostAsJsonAsync("/api/workflows/definitions", ValidRequest());

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("approval_flow", body.GetProperty("code").GetString());
        Assert.Equal("Draft", body.GetProperty("status").GetString());
    }

    private static object ValidRequest() => new
    {
        code = "approval_flow", name = "Approval flow", description = "Tier-gated workflow",
        steps = new[] { new { name = "Review", approverRole = "TenantAdmin" } }
    };

    private static async Task<WebApplication> StartAsync(string? tier)
    {
        var database = $"workflow-license-{Guid.NewGuid():N}";
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Services.AddDbContext<TenantDbContext>(options => options.UseInMemoryDatabase(database));
        builder.Services.AddDbContext<PlatformDbContext>(options => options.UseInMemoryDatabase(database + "-platform"));
        builder.Services.AddAuthentication("workflow-license-test").AddScheme<AuthenticationSchemeOptions, TestAuthenticationHandler>("workflow-license-test", _ => { });
        builder.Services.AddAuthorization();
        var app = builder.Build();
        app.UseAuthentication(); app.UseAuthorization(); app.MapWorkflowEndpoints();
        await app.StartAsync();

        await using (var scope = app.Services.CreateAsyncScope())
        {
            var tenantDb = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            var platformDb = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            await tenantDb.Database.EnsureCreatedAsync();
            await platformDb.Database.EnsureCreatedAsync();
            tenantDb.Tenants.Add(new Tenant { Id = TenantId, Name = "Tenant", Slug = $"tenant-{Guid.NewGuid():N}" });
            var platformTenant = new Tenant { Id = TenantId, Name = "Tenant", Slug = $"tenant-platform-{Guid.NewGuid():N}" };
            var admin = new AppUser { Id = AdminId, Email = "admin@example.invalid", DisplayName = "Admin" };
            platformDb.Tenants.Add(platformTenant); platformDb.Users.Add(admin);
            platformDb.TenantMemberships.Add(new TenantMembership { TenantId = TenantId, Tenant = platformTenant, UserId = AdminId, User = admin, Role = "TenantAdmin" });
            if (tier is not null)
            {
                var policy = LicenseTierCatalog.All[tier];
                platformDb.TenantLicenses.Add(new TenantLicense
                {
                    TenantId = TenantId, LicenseId = Guid.NewGuid(), Tier = tier,
                    MaxUsers = policy.MaxUsers, MaxCustomModules = policy.MaxCustomModules, MaxStorageGb = policy.MaxStorageGb,
                    IssuedAt = DateTimeOffset.UtcNow.AddDays(-1), ExpiresAt = DateTimeOffset.UtcNow.AddDays(30),
                    GrantSha256 = new string('A', 64)
                });
            }
            await tenantDb.SaveChangesAsync();
            await platformDb.SaveChangesAsync();
        }
        return app;
    }

    private sealed class TestAuthenticationHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder)
        : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
    {
        protected override Task<AuthenticateResult> HandleAuthenticateAsync()
        {
            var claims = new[] { new Claim("sub", AdminId.ToString()), new Claim("tenant_id", TenantId.ToString()), new Claim("role", "TenantAdmin") };
            return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(new ClaimsIdentity(claims, Scheme.Name)), Scheme.Name)));
        }
    }
}
