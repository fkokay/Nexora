using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Encodings.Web;
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

public sealed class TenantCompanyProfileIntegrationTests
{
    private static readonly Guid TenantId = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid UserId = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");

    [Fact]
    public async Task Tenant_admin_can_save_legal_identity_for_the_selected_tenant()
    {
        await using var app = await StartApplicationAsync("TenantAdmin");
        using var client = app.GetTestClient();

        using var response = await client.PutAsJsonAsync("/api/tenant-company-profile/", new
        {
            legalName = "Nexora Teknoloji A.Ş.", taxOffice = "Kadıköy", taxNumber = "1234567890"
        });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var saved = await response.Content.ReadFromJsonAsync<TenantCompanyProfileView>();
        Assert.NotNull(saved);
        Assert.Equal(TenantId, saved.TenantId);
        Assert.Equal("Nexora Teknoloji A.Ş.", saved.LegalName);
        Assert.Equal("Kadıköy", saved.TaxOffice);
        Assert.Equal("1234567890", saved.TaxNumber);

        using var getResponse = await client.GetAsync("/api/tenant-company-profile/");
        var loaded = await getResponse.Content.ReadFromJsonAsync<TenantCompanyProfileView>();
        Assert.Equal(saved, loaded);

        using var outOfScopeClient = app.GetTestClient();
        outOfScopeClient.DefaultRequestHeaders.Add("X-Test-Tenant", Guid.NewGuid().ToString());
        using var outOfScope = await outOfScopeClient.GetAsync("/api/tenant-company-profile/");
        Assert.Equal(HttpStatusCode.Forbidden, outOfScope.StatusCode);

        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        Assert.Contains(await db.AuditEvents.ToListAsync(), x => x.TenantId == TenantId && x.Action == "tenant.company-profile.updated" && x.Resource == "legal-identity");
    }

    [Fact]
    public async Task Invalid_tax_number_and_non_admin_write_are_rejected()
    {
        await using var adminApp = await StartApplicationAsync("TenantAdmin");
        using (var client = adminApp.GetTestClient())
        using (var invalid = await client.PutAsJsonAsync("/api/tenant-company-profile/", new
        {
            legalName = "Nexora Teknoloji A.Ş.", taxOffice = "", taxNumber = "12345678901"
        }))
            Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);

        await using var memberApp = await StartApplicationAsync("TenantUser");
        using var memberClient = memberApp.GetTestClient();
        using var forbidden = await memberClient.PutAsJsonAsync("/api/tenant-company-profile/", new
        {
            legalName = "Yetkisiz değişiklik", taxOffice = "", taxNumber = ""
        });
        Assert.Equal(HttpStatusCode.Forbidden, forbidden.StatusCode);

        await using var scope = memberApp.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        Assert.Empty(await db.TenantCompanyProfiles.ToListAsync());
    }

    [Fact]
    public async Task Tenant_user_can_read_profile_with_tax_number_masked()
    {
        await using var app = await StartApplicationAsync("TenantUser");
        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            db.TenantCompanyProfiles.Add(new TenantCompanyProfile
            {
                TenantId = TenantId,
                LegalName = "Nexora Teknoloji A.Ş.",
                TaxOffice = "Kadıköy",
                TaxNumber = "1234567890",
                UpdatedByUserId = UserId
            });
            await db.SaveChangesAsync();
        }

        using var client = app.GetTestClient();
        using var response = await client.GetAsync("/api/tenant-company-profile/");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var profile = await response.Content.ReadFromJsonAsync<TenantCompanyProfileView>();
        Assert.NotNull(profile);
        Assert.Equal("Nexora Teknoloji A.Ş.", profile.LegalName);
        Assert.Equal("Kadıköy", profile.TaxOffice);
        Assert.Equal("******7890", profile.TaxNumber);
        Assert.True(profile.TaxNumberMasked);
        Assert.Equal("no-store", response.Headers.CacheControl?.ToString());
    }

    [Theory]
    [InlineData("user")]
    [InlineData("tenant")]
    [InlineData("membership")]
    public async Task Profile_read_is_rejected_when_user_or_tenant_is_inactive_or_membership_is_missing(string subject)
    {
        await using var app = await StartApplicationAsync("TenantUser");
        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            switch (subject)
            {
                case "user":
                    (await db.Users.SingleAsync(x => x.Id == UserId)).IsActive = false;
                    break;
                case "tenant":
                    (await db.Tenants.SingleAsync(x => x.Id == TenantId)).IsActive = false;
                    break;
                case "membership":
                    db.TenantMemberships.Remove(await db.TenantMemberships.SingleAsync(x => x.UserId == UserId && x.TenantId == TenantId));
                    break;
            }
            await db.SaveChangesAsync();
        }

        using var client = app.GetTestClient();
        using var response = await client.GetAsync("/api/tenant-company-profile/");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    private static async Task<WebApplication> StartApplicationAsync(string role)
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        var databaseName = $"company-profile-{Guid.NewGuid():N}";
        builder.Services.AddDbContext<PlatformDbContext>(options => options.UseInMemoryDatabase(databaseName));
        builder.Services.AddAuthentication("company-profile-test").AddScheme<CompanyProfileAuthenticationOptions, CompanyProfileAuthenticationHandler>(
            "company-profile-test", options => options.Role = role);
        builder.Services.AddAuthorization();
        var app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapTenantCompanyProfileEndpoints();
        await app.StartAsync();

        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        var tenant = new Tenant { Id = TenantId, Name = "Workspace", Slug = $"workspace-{Guid.NewGuid():N}" };
        var user = new AppUser { Id = UserId, Email = "admin@example.invalid", DisplayName = "Test User" };
        db.Tenants.Add(tenant);
        db.Users.Add(user);
        db.TenantMemberships.Add(new TenantMembership { TenantId = TenantId, UserId = UserId, Tenant = tenant, User = user, Role = role });
        await db.SaveChangesAsync();
        return app;
    }

    private sealed class CompanyProfileAuthenticationOptions : AuthenticationSchemeOptions
    {
        public string Role { get; set; } = "TenantAdmin";
    }

    private sealed class CompanyProfileAuthenticationHandler(
        IOptionsMonitor<CompanyProfileAuthenticationOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder)
        : AuthenticationHandler<CompanyProfileAuthenticationOptions>(options, logger, encoder)
    {
        protected override Task<AuthenticateResult> HandleAuthenticateAsync()
        {
            var tenantId = Request.Headers.TryGetValue("X-Test-Tenant", out var tenantHeader)
                && Guid.TryParse(tenantHeader.ToString(), out var overrideTenantId)
                ? overrideTenantId
                : TenantId;
            var claims = new[]
            {
                new Claim("sub", UserId.ToString()),
                new Claim("tenant_id", tenantId.ToString()),
                new Claim("role", Options.Role)
            };
            var principal = new ClaimsPrincipal(new ClaimsIdentity(claims, Scheme.Name));
            return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(principal, Scheme.Name)));
        }
    }
}
