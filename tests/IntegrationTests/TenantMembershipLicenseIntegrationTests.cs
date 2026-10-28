using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Encodings.Web;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Xunit;

namespace AIERP.Api.IntegrationTests;

public sealed class TenantMembershipLicenseIntegrationTests
{
    private static readonly Guid TenantId = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid ActorId = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");

    [Fact]
    public async Task Tenant_admin_adds_and_updates_existing_active_user_with_audit()
    {
        await using var app = await StartAsync(licensed: true);
        using var client = app.GetTestClient();

        using var created = await client.PostAsJsonAsync("/api/access-control/members", new { userId = TestUserId, role = "TenantUser" });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        using var changed = await client.PutAsJsonAsync($"/api/access-control/members/{TestUserId:D}", new { role = "TenantAdmin" });
        Assert.Equal(HttpStatusCode.OK, changed.StatusCode);
        var member = await changed.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();
        Assert.Equal("TenantAdmin", member.GetProperty("role").GetString());

        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        Assert.Equal("TenantAdmin", (await db.TenantMemberships.SingleAsync(x => x.TenantId == TenantId && x.UserId == TestUserId)).Role);
        Assert.Contains(await db.AuditEvents.Where(x => x.TenantId == TenantId).ToListAsync(), x => x.Action == "access-control.member.added");
        Assert.Contains(await db.AuditEvents.Where(x => x.TenantId == TenantId).ToListAsync(), x => x.Action == "access-control.member.role-updated");
    }

    [Fact]
    public async Task Candidate_lookup_requires_one_exact_email_and_hides_members()
    {
        await using var app = await StartAsync(licensed: true);
        using var client = app.GetTestClient();

        using var invalid = await client.GetAsync("/api/access-control/members/candidate?email=member");
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);
        using var candidate = await client.GetAsync("/api/access-control/members/candidate?email=MEMBER%40EXAMPLE.INVALID");
        Assert.Equal(HttpStatusCode.OK, candidate.StatusCode);
        var body = await candidate.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();
        Assert.Equal(TestUserId, body.GetProperty("id").GetGuid());
        Assert.Equal("member@example.invalid", body.GetProperty("email").GetString());
        Assert.Equal(3, body.EnumerateObject().Count());

        using var create = await client.PostAsJsonAsync("/api/access-control/members", new { userId = TestUserId, role = "TenantUser" });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        using var hidden = await client.GetAsync("/api/access-control/members/candidate?email=member%40example.invalid");
        Assert.Equal(HttpStatusCode.NotFound, hidden.StatusCode);
    }

    [Fact]
    public async Task Member_list_returns_sorted_members_for_the_selected_tenant_only()
    {
        await using var app = await StartAsync(licensed: false, memberCount: 3);
        using var client = app.GetTestClient();

        using var response = await client.GetAsync("/api/access-control/members");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var members = await response.Content.ReadFromJsonAsync<TenantPermissionMemberView[]>();
        Assert.NotNull(members);
        Assert.Collection(members,
            member =>
            {
                Assert.Equal("Admin", member.DisplayName);
                Assert.Equal("TenantAdmin", member.Role);
            },
            member =>
            {
                Assert.Equal("Extra 1", member.DisplayName);
                Assert.Equal("TenantUser", member.Role);
            },
            member =>
            {
                Assert.Equal("Extra 2", member.DisplayName);
                Assert.Equal("TenantUser", member.Role);
            });
        Assert.DoesNotContain(members, member => member.UserId == OtherTenantUserId);
    }

    [Fact]
    public async Task Add_fails_closed_for_missing_expired_or_invalid_or_tampered_profile()
    {
        foreach (var state in new[] { "missing", "expired", "invalid", "tampered" })
        {
            await using var app = await StartAsync(licensed: state != "missing", licenseState: state);
            using var client = app.GetTestClient();
            using var response = await client.PostAsJsonAsync("/api/access-control/members", new { userId = TestUserId, role = "TenantUser" });
            Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
            var body = await response.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();
            var expectedCode = state switch { "missing" => "license.required", "expired" => "license.expired", _ => "license.invalid" };
            Assert.Equal(expectedCode, body.GetProperty("code").GetString());
            await using var scope = app.Services.CreateAsyncScope();
            Assert.False(await scope.ServiceProvider.GetRequiredService<PlatformDbContext>().TenantMemberships.AnyAsync(x => x.UserId == TestUserId));
        }
    }

    [Fact]
    public async Task Add_rejects_cap_and_inactive_platform_user_while_other_tenant_membership_stays_isolated()
    {
        await using (var app = await StartAsync(licensed: true, tier: "Small", memberCount: 10))
        {
            using var client = app.GetTestClient();
            using var response = await client.PostAsJsonAsync("/api/access-control/members", new { userId = TestUserId, role = "TenantUser" });
            Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
            var body = await response.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();
            Assert.Equal("license.user_limit", body.GetProperty("code").GetString());
        }

        await using (var app = await StartAsync(licensed: true))
        {
            using var client = app.GetTestClient();
            using var inactive = await client.PostAsJsonAsync("/api/access-control/members", new { userId = InactiveUserId, role = "TenantUser" });
            Assert.Equal(HttpStatusCode.NotFound, inactive.StatusCode);
            using var crossTenantDelete = await client.DeleteAsync($"/api/access-control/members/{OtherTenantUserId:D}");
            Assert.Equal(HttpStatusCode.NotFound, crossTenantDelete.StatusCode);
            await using var scope = app.Services.CreateAsyncScope();
            Assert.True(await scope.ServiceProvider.GetRequiredService<PlatformDbContext>().TenantMemberships
                .AnyAsync(x => x.TenantId == OtherTenantId && x.UserId == OtherTenantUserId));
        }
    }

    [Fact]
    public async Task Cannot_remove_or_demote_last_admin_but_deactivation_is_audited()
    {
        await using var app = await StartAsync(licensed: true);
        using var client = app.GetTestClient();
        using var demote = await client.PutAsJsonAsync($"/api/access-control/members/{ActorId:D}", new { role = "TenantUser" });
        Assert.Equal(HttpStatusCode.Conflict, demote.StatusCode);
        using var remove = await client.DeleteAsync($"/api/access-control/members/{ActorId:D}");
        Assert.Equal(HttpStatusCode.Conflict, remove.StatusCode);
        using var add = await client.PostAsJsonAsync("/api/access-control/members", new { userId = TestUserId, role = "TenantUser" });
        Assert.Equal(HttpStatusCode.Created, add.StatusCode);
        using var deactivate = await client.DeleteAsync($"/api/access-control/members/{TestUserId:D}");
        Assert.Equal(HttpStatusCode.NoContent, deactivate.StatusCode);

        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        Assert.False(await db.TenantMemberships.AnyAsync(x => x.TenantId == TenantId && x.UserId == TestUserId));
        Assert.Contains(await db.AuditEvents.Where(x => x.TenantId == TenantId).ToListAsync(), x => x.Action == "access-control.member.deactivated");
    }

    [Fact]
    public async Task Non_admin_cannot_change_memberships()
    {
        await using var app = await StartAsync(licensed: true);
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Role", "TenantUser");
        using var response = await client.PostAsJsonAsync("/api/access-control/members", new { userId = TestUserId, role = "TenantUser" });
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Theory]
    [InlineData("demoted")]
    [InlineData("removed")]
    public async Task Stale_admin_token_cannot_read_or_change_access_policies(string membershipState)
    {
        await using var app = await StartAsync(licensed: true);
        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            var membership = await db.TenantMemberships.SingleAsync(x => x.TenantId == TenantId && x.UserId == ActorId);
            if (membershipState == "demoted") membership.Role = "TenantUser";
            else db.TenantMemberships.Remove(membership);
            await db.SaveChangesAsync();
        }

        // The simulated token still claims TenantAdmin after the database membership changed.
        using var client = app.GetTestClient();
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/access-control/permissions")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/access-control/members")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/access-control/members/candidate?email=member%40example.invalid")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/access-control/rules")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync("/api/access-control/rules", new
        {
            subjectType = 1, subjectRole = "TenantUser", permissionCode = "erp.foreign-trade.create", effect = 1,
            resourceType = "erp.foreign-trade"
        })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.DeleteAsync($"/api/access-control/rules/{Guid.NewGuid():D}")).StatusCode);
    }

    [Fact]
    public async Task Tenant_admin_can_grant_new_catalog_permission_when_definition_row_is_missing()
    {
        await using var app = await StartAsync(licensed: true);
        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            db.PermissionDefinitions.RemoveRange(await db.PermissionDefinitions
                .Where(x => x.Code == "erp.foreign-trade.create").ToListAsync());
            db.TenantMemberships.Add(new TenantMembership { TenantId = TenantId, UserId = TestUserId, Role = "TenantUser" });
            await db.SaveChangesAsync();
            Assert.False(await db.PermissionDefinitions.AnyAsync(x => x.Code == "erp.foreign-trade.create"));
        }

        using var client = app.GetTestClient();
        using var response = await client.PostAsJsonAsync("/api/access-control/rules", new
        {
            subjectType = 1, subjectRole = "TenantUser", permissionCode = "erp.foreign-trade.create", effect = 1,
            resourceType = "erp.foreign-trade"
        });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        await using var verifyScope = app.Services.CreateAsyncScope();
        var verifyDb = verifyScope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        var permission = await verifyDb.PermissionDefinitions.SingleAsync(x => x.Code == "erp.foreign-trade.create");
        Assert.Equal("erp.foreign-trade", permission.ResourceType);
        Assert.True(await verifyDb.TenantPermissionRules.AnyAsync(x => x.TenantId == TenantId
            && x.SubjectRole == "TenantUser" && x.PermissionCode == permission.Code));
    }

    private static readonly Guid TestUserId = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    private static readonly Guid InactiveUserId = Guid.Parse("cccccccc-cccc-cccc-cccc-cccccccccccc");
    private static readonly Guid OtherTenantUserId = Guid.Parse("dddddddd-dddd-dddd-dddd-dddddddddddd");
    private static readonly Guid OtherTenantId = Guid.Parse("22222222-2222-2222-2222-222222222222");

    private static async Task<WebApplication> StartAsync(bool licensed, string tier = "Small", int memberCount = 1, string licenseState = "active")
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        var databaseName = $"membership-license-{Guid.NewGuid():N}";
        builder.Services.AddDbContext<PlatformDbContext>(options => options.UseInMemoryDatabase(databaseName)
            .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning)));
        builder.Services.AddRateLimiter(options => options.AddFixedWindowLimiter("login", limiter =>
        {
            limiter.PermitLimit = 10;
            limiter.Window = TimeSpan.FromMinutes(1);
            limiter.QueueLimit = 0;
        }));
        builder.Services.AddAuthentication("membership-test").AddScheme<AuthenticationSchemeOptions, MembershipAuthenticationHandler>("membership-test", _ => { });
        builder.Services.AddAuthorization();
        var app = builder.Build();
        app.UseRateLimiter();
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapAccessControlEndpoints();
        await app.StartAsync();

        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        var tenant = new Tenant { Id = TenantId, Name = "Tenant", Slug = $"tenant-{Guid.NewGuid():N}" };
        var actor = new AppUser { Id = ActorId, Email = "admin@example.invalid", DisplayName = "Admin" };
        db.Tenants.Add(tenant);
        db.Users.Add(actor);
        db.TenantMemberships.Add(new TenantMembership { TenantId = TenantId, UserId = ActorId, Tenant = tenant, User = actor, Role = "TenantAdmin" });
        for (var i = 1; i < memberCount; i++)
        {
            var extra = new AppUser { Email = $"extra{i}@example.invalid", DisplayName = $"Extra {i}" };
            db.Users.Add(extra);
            db.TenantMemberships.Add(new TenantMembership { TenantId = TenantId, UserId = extra.Id, Tenant = tenant, User = extra, Role = "TenantUser" });
        }
        var testUser = new AppUser { Id = TestUserId, Email = "member@example.invalid", DisplayName = "Member" };
        var inactive = new AppUser { Id = InactiveUserId, Email = "inactive@example.invalid", DisplayName = "Inactive", IsActive = false };
        var otherTenantUser = new AppUser { Id = OtherTenantUserId, Email = "other@example.invalid", DisplayName = "Other" };
        var otherTenant = new Tenant { Id = OtherTenantId, Name = "Other", Slug = $"other-{Guid.NewGuid():N}" };
        db.Users.AddRange(testUser, inactive, otherTenantUser);
        db.Tenants.Add(otherTenant);
        db.TenantMemberships.Add(new TenantMembership { TenantId = OtherTenantId, UserId = OtherTenantUserId, Tenant = otherTenant, User = otherTenantUser, Role = "TenantUser" });
        if (licensed)
        {
            var policy = LicenseTierCatalog.All[tier];
            db.TenantLicenses.Add(new TenantLicense
            {
                TenantId = TenantId, LicenseId = Guid.NewGuid(), Tier = licenseState == "invalid" ? "NoSuchTier" : tier,
                MaxUsers = policy.MaxUsers + (licenseState == "tampered" ? 1 : 0), MaxCustomModules = policy.MaxCustomModules, MaxStorageGb = policy.MaxStorageGb,
                IssuedAt = DateTimeOffset.UtcNow.AddDays(-1), ExpiresAt = licenseState == "expired" ? DateTimeOffset.UtcNow.AddDays(-1) : DateTimeOffset.UtcNow.AddDays(30),
                GrantSha256 = new string('A', 64)
            });
        }
        await db.SaveChangesAsync();
        return app;
    }

    private sealed class MembershipAuthenticationHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder)
        : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
    {
        protected override Task<AuthenticateResult> HandleAuthenticateAsync()
        {
            var role = Request.Headers["X-Test-Role"].FirstOrDefault() ?? "TenantAdmin";
            var claims = new[] { new Claim("sub", ActorId.ToString()), new Claim("tenant_id", TenantId.ToString()), new Claim("role", role) };
            return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(new ClaimsIdentity(claims, Scheme.Name)), Scheme.Name)));
        }
    }
}
