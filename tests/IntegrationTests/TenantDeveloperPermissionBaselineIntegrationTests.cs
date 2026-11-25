extern alias Api;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>
/// A TenantDeveloper gets the same default Allow role-rules as a TenantUser when selecting a tenant (and on refresh),
/// so TenantDeveloper-gated routes pass the real permission pipeline. Existing rules, including admin Deny rules, are kept.
/// </summary>
public sealed class TenantDeveloperPermissionBaselineIntegrationTests
{
    private static readonly Guid TenantId = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid Developer = Guid.Parse("dddddddd-dddd-dddd-dddd-dddddddddddd");
    private static readonly Guid User = Guid.Parse("cccccccc-cccc-cccc-cccc-cccccccccccc");
    private static readonly Guid Admin = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private const string SigningKey = "developer-baseline-test-signing-key-32-bytes-minimum";

    [Fact]
    public async Task Select_tenant_seeds_developer_baseline_that_allows_customizations_and_denies_admin_only_areas()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();

        await SelectTenantAsync(client, Developer, "TenantDeveloper");

        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        Assert.True(await db.TenantPermissionRules.CountAsync(x => x.TenantId == TenantId && x.SubjectRole == "TenantDeveloper") > 0);
        var authorizer = new PlatformPermissionAuthorizer(db);
        Assert.True(await IsAllowedAsync(authorizer, Developer, "TenantDeveloper", "erp.tenant-customizations.create"));
        Assert.True(await IsAllowedAsync(authorizer, Developer, "TenantDeveloper", "erp.tenant-customizations.execute"));
        Assert.True(await IsAllowedAsync(authorizer, Developer, "TenantDeveloper", "erp.tenant-customizations.read"));
        Assert.False(await IsAllowedAsync(authorizer, Developer, "TenantDeveloper", "erp.access-control.read"));
        Assert.False(await IsAllowedAsync(authorizer, Developer, "TenantDeveloper", "erp.audit-events.read"));
        Assert.False(await IsAllowedAsync(authorizer, Developer, "TenantDeveloper", "erp.audit-retention.read"));
        Assert.Empty(await db.TenantPermissionRules.Where(x => x.SubjectRole == "TenantDeveloper"
            && x.PermissionCode.StartsWith("erp.payroll-compensation.")).ToListAsync());
    }

    [Fact]
    public async Task Developer_baseline_has_exactly_the_tenant_user_permission_set()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();

        await SelectTenantAsync(client, User, "TenantUser");
        await SelectTenantAsync(client, Developer, "TenantDeveloper");
        await SelectTenantAsync(client, Admin, "TenantAdmin");

        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        var userCodes = await CodesAsync(db, "TenantUser");
        var developerCodes = await CodesAsync(db, "TenantDeveloper");
        Assert.NotEmpty(userCodes);
        Assert.Equal(userCodes, developerCodes);
        Assert.All(await db.TenantPermissionRules.Where(x => x.SubjectRole == "TenantDeveloper").ToListAsync(), rule =>
        {
            Assert.Equal(TenantPermissionSubjectType.Role, rule.SubjectType);
            Assert.Equal(TenantPermissionEffect.Allow, rule.Effect);
            Assert.Null(rule.SubjectUserId);
        });
        // TenantAdmin bypasses rules and gets no seeded baseline.
        Assert.Empty(await db.TenantPermissionRules.Where(x => x.SubjectRole == "TenantAdmin").ToListAsync());
    }

    [Fact]
    public async Task Admin_deny_rule_survives_relogin_backfill_and_backfill_adds_no_duplicates()
    {
        await using var app = await StartApplicationAsync();
        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            db.TenantPermissionRules.Add(new TenantPermissionRule
            {
                TenantId = TenantId,
                SubjectType = TenantPermissionSubjectType.Role,
                SubjectRole = "TenantDeveloper",
                PermissionCode = "erp.tenant-customizations.delete",
                Effect = TenantPermissionEffect.Deny,
                CreatedByUserId = Admin
            });
            await db.SaveChangesAsync();
        }
        using var client = app.GetTestClient();

        await SelectTenantAsync(client, Developer, "TenantDeveloper");
        int firstCount;
        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            firstCount = await db.TenantPermissionRules.CountAsync(x => x.TenantId == TenantId && x.SubjectRole == "TenantDeveloper");
        }
        var refreshToken = await SelectTenantAsync(client, Developer, "TenantDeveloper");
        using (var refresh = await client.PostAsJsonAsync("/api/auth/refresh", new { refreshToken }))
            Assert.Equal(HttpStatusCode.OK, refresh.StatusCode);

        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            Assert.True(firstCount > 1);
            Assert.Equal(firstCount, await db.TenantPermissionRules.CountAsync(x => x.TenantId == TenantId && x.SubjectRole == "TenantDeveloper"));
            var deleteRule = Assert.Single(await db.TenantPermissionRules
                .Where(x => x.SubjectRole == "TenantDeveloper" && x.PermissionCode == "erp.tenant-customizations.delete").ToListAsync());
            Assert.Equal(TenantPermissionEffect.Deny, deleteRule.Effect);
            var authorizer = new PlatformPermissionAuthorizer(db);
            Assert.False(await IsAllowedAsync(authorizer, Developer, "TenantDeveloper", "erp.tenant-customizations.delete"));
            Assert.True(await IsAllowedAsync(authorizer, Developer, "TenantDeveloper", "erp.tenant-customizations.create"));
        }
    }

    [Fact]
    public async Task Refresh_backfills_a_missing_developer_baseline_rule()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        var refreshToken = await SelectTenantAsync(client, Developer, "TenantDeveloper");
        await using (var scope = app.Services.CreateAsyncScope())
        {
            // Simulates a permission introduced after the developer's last tenant selection.
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            db.TenantPermissionRules.Remove(await db.TenantPermissionRules
                .SingleAsync(x => x.SubjectRole == "TenantDeveloper" && x.PermissionCode == "erp.tenant-customizations.execute"));
            await db.SaveChangesAsync();
        }

        using (var refresh = await client.PostAsJsonAsync("/api/auth/refresh", new { refreshToken }))
            Assert.Equal(HttpStatusCode.OK, refresh.StatusCode);

        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            Assert.True(await IsAllowedAsync(new PlatformPermissionAuthorizer(db), Developer, "TenantDeveloper", "erp.tenant-customizations.execute"));
        }
    }

    [Theory]
    [InlineData("TenantDeveloper")]
    [InlineData("TenantUser")]
    public async Task Baseline_seed_writes_one_audit_event_with_count_and_no_author_and_none_on_second_login(string role)
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        var userId = role == "TenantUser" ? User : Developer;

        await SelectTenantAsync(client, userId, role);
        await SelectTenantAsync(client, userId, role);

        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        var rules = await db.TenantPermissionRules.Where(x => x.TenantId == TenantId && x.SubjectRole == role).ToListAsync();
        Assert.NotEmpty(rules);
        // Same convention as the migration seed: seeded baseline rules have no author.
        Assert.All(rules, rule => Assert.Null(rule.CreatedByUserId));
        var seeded = Assert.Single(await db.AuditEvents.Where(x => x.Action == "permission.baseline.seeded"
            && x.Resource.StartsWith(role + ":")).ToListAsync());
        Assert.Equal($"{role}:added={rules.Count}", seeded.Resource);
        Assert.Equal(TenantId, seeded.TenantId);
        Assert.Equal(userId, seeded.UserId);
    }

    [Fact]
    public async Task Refresh_backfill_audits_only_the_rules_it_added()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        var refreshToken = await SelectTenantAsync(client, Developer, "TenantDeveloper");
        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            db.TenantPermissionRules.Remove(await db.TenantPermissionRules
                .SingleAsync(x => x.SubjectRole == "TenantDeveloper" && x.PermissionCode == "erp.tenant-customizations.execute"));
            await db.SaveChangesAsync();
        }

        using (var refresh = await client.PostAsJsonAsync("/api/auth/refresh", new { refreshToken }))
            Assert.Equal(HttpStatusCode.OK, refresh.StatusCode);

        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            var events = await db.AuditEvents.Where(x => x.Action == "permission.baseline.seeded").ToListAsync();
            Assert.Equal(2, events.Count);
            Assert.Contains(events, x => x.Resource == "TenantDeveloper:added=1" && x.UserId == Developer);
        }
    }

    [Fact]
    public async Task Expired_refresh_returns_401_and_adds_no_rules_or_audit()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        var refreshToken = await SelectTenantAsync(client, Developer, "TenantDeveloper");
        int before;
        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            db.TenantPermissionRules.Remove(await db.TenantPermissionRules
                .SingleAsync(x => x.SubjectRole == "TenantDeveloper" && x.PermissionCode == "erp.tenant-customizations.execute"));
            var session = await db.PlatformRefreshSessions.SingleAsync(x => x.UserId == Developer);
            session.CreatedAt = DateTimeOffset.UtcNow.AddDays(-31); // past the 30-day absolute expiry, ExpiresAt still in the future
            await db.SaveChangesAsync();
            before = await db.TenantPermissionRules.CountAsync(x => x.SubjectRole == "TenantDeveloper");
        }

        using (var refresh = await client.PostAsJsonAsync("/api/auth/refresh", new { refreshToken }))
            Assert.Equal(HttpStatusCode.Unauthorized, refresh.StatusCode);

        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            Assert.Equal(before, await db.TenantPermissionRules.CountAsync(x => x.SubjectRole == "TenantDeveloper"));
            Assert.Single(await db.AuditEvents.Where(x => x.Action == "permission.baseline.seeded").ToListAsync());
        }
    }

    [Fact]
    public async Task Developer_without_studio_role_reads_catalog_through_real_permission_pipeline_after_tenant_selection()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, Developer, "TenantDeveloper");
        // No rules yet: the real authorizer denies.
        using (var before = await client.GetAsync("/api/custom-pages/catalog"))
            Assert.Equal(HttpStatusCode.Forbidden, before.StatusCode);

        await SelectTenantAsync(client, Developer, "TenantDeveloper");

        using var after = await client.GetAsync("/api/custom-pages/catalog");
        Assert.Equal(HttpStatusCode.OK, after.StatusCode);
    }

    private static async Task<IReadOnlyList<string>> CodesAsync(PlatformDbContext db, string role) =>
        (await db.TenantPermissionRules.Where(x => x.TenantId == TenantId && x.SubjectRole == role)
            .Select(x => x.PermissionCode).ToListAsync()).Order(StringComparer.Ordinal).ToArray();

    private static Task<bool> IsAllowedAsync(PlatformPermissionAuthorizer authorizer, Guid userId, string role, string code)
    {
        var definition = PlatformPermissionCatalog.Definitions.Single(x => x.Code == code);
        return authorizer.IsAllowedAsync(TenantId, userId, role, new ResolvedPlatformPermission(definition,
            new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase) { ["resource.type"] = definition.ResourceType }));
    }

    private static void SetIdentity(HttpClient client, Guid userId, string role)
    {
        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Remove("X-Test-User");
        client.DefaultRequestHeaders.Remove("X-Test-Role");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantId.ToString());
        client.DefaultRequestHeaders.Add("X-Test-User", userId.ToString());
        client.DefaultRequestHeaders.Add("X-Test-Role", role);
    }

    private static async Task<string> SelectTenantAsync(HttpClient client, Guid userId, string role)
    {
        SetIdentity(client, userId, role);
        using var response = await client.PostAsJsonAsync("/api/auth/select-tenant", new { tenantId = TenantId });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        return body.GetProperty("refreshToken").GetString()!;
    }

    private static async Task<WebApplication> StartApplicationAsync()
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        var suffix = Guid.NewGuid().ToString("N");
        builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Authentication:SigningKey"] = SigningKey,
            ["Authentication:Issuer"] = "AIERP-test",
            ["Authentication:Audience"] = "AIERP-test"
        });
        builder.Services.AddDbContext<PlatformDbContext>(options => options
            .UseInMemoryDatabase($"developer-baseline-platform-{suffix}")
            .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning)));
        builder.Services.AddDbContext<TenantDbContext>(options => options
            .UseInMemoryDatabase($"developer-baseline-tenant-{suffix}")
            .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning)));
        builder.Services.AddAuthentication("report-test").AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("report-test", _ => { });
        // The production permission pipeline: route-to-permission mapping plus tenant Allow/Deny rules.
        builder.Services.AddScoped<IPlatformPermissionAuthorizer, PlatformPermissionAuthorizer>();
        builder.Services.AddScoped<IAuthorizationHandler, Api::PermissionAuthorizationHandler>();
        builder.Services.AddAuthorization(options => options.DefaultPolicy = new AuthorizationPolicyBuilder()
            .RequireAuthenticatedUser().AddRequirements(new Api::PermissionRequirement()).Build());

        var app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapGroup("/api/auth").MapSelectTenantEndpoint();
        app.MapGroup("/api/auth").MapRefreshEndpoint();
        app.MapTenantCatalogEndpoints();
        await app.StartAsync();

        await using var scope = app.Services.CreateAsyncScope();
        var platform = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        await platform.Database.EnsureCreatedAsync();
        var tenant = new Tenant { Id = TenantId, Name = "Test tenant", Slug = "test-tenant" };
        platform.Tenants.Add(tenant);
        platform.Users.AddRange(
            new AppUser { Id = Developer, Email = "developer@example.test", DisplayName = "Yazılımcı" },
            new AppUser { Id = User, Email = "user@example.test", DisplayName = "Kullanıcı" },
            new AppUser { Id = Admin, Email = "admin@example.test", DisplayName = "Yönetici" });
        platform.TenantMemberships.AddRange(
            new TenantMembership { TenantId = TenantId, UserId = Developer, Role = "TenantDeveloper", StudioRole = null },
            new TenantMembership { TenantId = TenantId, UserId = User, Role = "TenantUser" },
            new TenantMembership { TenantId = TenantId, UserId = Admin, Role = "TenantAdmin" });
        await platform.SaveChangesAsync();
        var tenantDb = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        await tenantDb.Database.EnsureCreatedAsync();
        tenantDb.Tenants.Add(new Tenant { Id = TenantId, Name = "Test tenant", Slug = "test-tenant" });
        await tenantDb.SaveChangesAsync();
        return app;
    }
}
