using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace AIERP.Api.IntegrationTests;

public sealed class CustomPageAccessEndpointsIntegrationTests
{
    private static readonly Guid TenantA = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid TenantB = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid Admin = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private static readonly Guid Ayse = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    private static readonly Guid Mehmet = Guid.Parse("cccccccc-cccc-cccc-cccc-cccccccccccc");
    private static readonly Guid Outsider = Guid.Parse("dddddddd-dddd-dddd-dddd-dddddddddddd");
    private const string Code = "asset-dashboard";

    [Fact]
    public async Task Get_access_defaults_to_all_users_view_only()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, Admin, "TenantAdmin");
        await CreatePageAsync(app, client);

        var access = await client.GetFromJsonAsync<JsonElement>($"/api/custom-pages/{Code}/access");
        Assert.Equal(Code, access.GetProperty("pageCode").GetString());
        Assert.Equal("AllUsers", access.GetProperty("mode").GetString());
        Assert.Equal(0, access.GetProperty("revision").GetInt32());
        Assert.False(access.GetProperty("allUsersCanInsert").GetBoolean());
        Assert.False(access.GetProperty("allUsersCanUpdate").GetBoolean());
        Assert.False(access.GetProperty("allUsersCanDelete").GetBoolean());
        Assert.Empty(access.GetProperty("users").EnumerateArray());

        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/api/custom-pages/missing-page/access")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/custom-pages/bad%20code/access")).StatusCode);
        SetIdentity(client, TenantB, Admin, "TenantAdmin");
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/custom-pages/{Code}/access")).StatusCode);
    }

    [Fact]
    public async Task Get_and_put_access_are_forbidden_for_tenant_user()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, Admin, "TenantAdmin");
        await CreatePageAsync(app, client);

        SetIdentity(client, TenantA, Ayse, "TenantUser");
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"/api/custom-pages/{Code}/access")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PutAsJsonAsync($"/api/custom-pages/{Code}/access",
            new { mode = "AllUsers", expectedRevision = 0 })).StatusCode);
    }

    [Fact]
    public async Task Put_access_saves_selected_users_and_increments_revision()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, Admin, "TenantAdmin");
        await CreatePageAsync(app, client);

        var response = await client.PutAsJsonAsync($"/api/custom-pages/{Code}/access", new
        {
            mode = "SelectedUsers",
            allUsersCanUpdate = true,
            users = new object[]
            {
                new { userId = Ayse, canView = true, canInsert = true },
                new { userId = Mehmet, canView = true }
            },
            expectedRevision = 0
        });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var saved = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("SelectedUsers", saved.GetProperty("mode").GetString());
        Assert.Equal(1, saved.GetProperty("revision").GetInt32());
        // Shared write flags only apply to AllUsers mode.
        Assert.False(saved.GetProperty("allUsersCanUpdate").GetBoolean());
        var users = saved.GetProperty("users").EnumerateArray().ToArray();
        Assert.Equal(2, users.Length);
        var ayse = Assert.Single(users, x => x.GetProperty("userId").GetGuid() == Ayse);
        Assert.Equal("Ayşe Yılmaz", ayse.GetProperty("displayName").GetString());
        Assert.Equal("ayse@example.test", ayse.GetProperty("email").GetString());
        Assert.True(ayse.GetProperty("canInsert").GetBoolean());
        Assert.False(ayse.GetProperty("canDelete").GetBoolean());

        var reread = await client.GetFromJsonAsync<JsonElement>($"/api/custom-pages/{Code}/access");
        Assert.Equal(1, reread.GetProperty("revision").GetInt32());
        Assert.Equal(2, reread.GetProperty("users").GetArrayLength());

        var second = await client.PutAsJsonAsync($"/api/custom-pages/{Code}/access", new
        {
            mode = "AllUsers", allUsersCanDelete = true,
            users = new object[] { new { userId = Ayse, canView = true } },
            expectedRevision = 1
        });
        Assert.Equal(HttpStatusCode.OK, second.StatusCode);
        var allUsers = await second.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(2, allUsers.GetProperty("revision").GetInt32());
        Assert.True(allUsers.GetProperty("allUsersCanDelete").GetBoolean());
        Assert.Empty(allUsers.GetProperty("users").EnumerateArray());

        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        Assert.Equal(2, await db.AuditEvents.CountAsync(x => x.TenantId == TenantA && x.Action == "custom-page.access-updated" && x.Resource == $"custom-page:{Code}"));
        var revisions = await db.TenantCustomPageAccessRevisions.Where(x => x.TenantId == TenantA && x.PageCode == Code).OrderBy(x => x.Revision).ToListAsync();
        Assert.Equal([1, 2], revisions.Select(x => x.Revision));
        using var snapshot = JsonDocument.Parse(revisions[0].SnapshotJson);
        Assert.Equal("SelectedUsers", snapshot.RootElement.GetProperty("mode").GetString());
        Assert.Equal(2, snapshot.RootElement.GetProperty("users").GetArrayLength());
        Assert.Empty(await db.TenantCustomPageAccessUsers.ToListAsync());
    }

    [Fact]
    public async Task Put_access_rejects_write_right_without_view()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, Admin, "TenantAdmin");
        await CreatePageAsync(app, client);

        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync($"/api/custom-pages/{Code}/access", new
        {
            mode = "SelectedUsers", users = new object[] { new { userId = Ayse, canView = false, canUpdate = true } }, expectedRevision = 0
        })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync($"/api/custom-pages/{Code}/access", new
        {
            mode = "Everyone", expectedRevision = 0
        })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync($"/api/custom-pages/{Code}/access", new
        {
            mode = "SelectedUsers", users = new object[] { new { userId = Ayse, canView = true }, new { userId = Ayse, canView = true } }, expectedRevision = 0
        })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync($"/api/custom-pages/{Code}/access", new
        {
            mode = "SelectedUsers", users = Enumerable.Range(0, 201).Select(_ => new { userId = Guid.NewGuid(), canView = true }).ToArray(), expectedRevision = 0
        })).StatusCode);
        var access = await client.GetFromJsonAsync<JsonElement>($"/api/custom-pages/{Code}/access");
        Assert.Equal(0, access.GetProperty("revision").GetInt32());
    }

    [Fact]
    public async Task Put_access_rejects_non_member_user()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, Admin, "TenantAdmin");
        await CreatePageAsync(app, client);

        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync($"/api/custom-pages/{Code}/access", new
        {
            mode = "SelectedUsers", users = new object[] { new { userId = Outsider, canView = true } }, expectedRevision = 0
        })).StatusCode);
    }

    [Fact]
    public async Task Put_access_with_stale_revision_returns_conflict()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, Admin, "TenantAdmin");
        await CreatePageAsync(app, client);

        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/custom-pages/{Code}/access", new { mode = "AdminsOnly", expectedRevision = 0 })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PutAsJsonAsync($"/api/custom-pages/{Code}/access", new { mode = "AllUsers", expectedRevision = 0 })).StatusCode);
        var access = await client.GetFromJsonAsync<JsonElement>($"/api/custom-pages/{Code}/access");
        Assert.Equal("AdminsOnly", access.GetProperty("mode").GetString());
        Assert.Equal(1, access.GetProperty("revision").GetInt32());
    }

    [Fact]
    public async Task Access_endpoints_rechecks_membership_role_instead_of_trusting_the_claim()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, Admin, "TenantAdmin");
        await CreatePageAsync(app, client);

        // Ayse's token claims TenantAdmin, but her membership row says TenantUser.
        SetIdentity(client, TenantA, Ayse, "TenantAdmin");
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"/api/custom-pages/{Code}/access")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PutAsJsonAsync($"/api/custom-pages/{Code}/access",
            new { mode = "AllUsers", expectedRevision = 0 })).StatusCode);
    }

    [Fact]
    public async Task Stale_revision_conflict_reports_current_revision()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, Admin, "TenantAdmin");
        await CreatePageAsync(app, client);
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/custom-pages/{Code}/access", new { mode = "AdminsOnly", expectedRevision = 0 })).StatusCode);

        var conflict = await client.PutAsJsonAsync($"/api/custom-pages/{Code}/access", new { mode = "AllUsers", expectedRevision = 0 });
        Assert.Equal(HttpStatusCode.Conflict, conflict.StatusCode);
        Assert.Equal(1, (await conflict.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("currentRevision").GetInt32());
    }

    [Fact]
    public void IsConflict_maps_only_concurrency_and_unique_violations()
    {
        Assert.True(CustomPageAccessEndpoints.IsConflict(new DbUpdateConcurrencyException("stale")));
        Assert.False(CustomPageAccessEndpoints.IsConflict(new DbUpdateException("other", new InvalidOperationException("boom"))));
        Assert.False(CustomPageAccessEndpoints.IsConflict(new DbUpdateException("no inner")));
    }

    [Fact]
    public async Task Get_access_omits_removed_members()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, Admin, "TenantAdmin");
        await CreatePageAsync(app, client);
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/custom-pages/{Code}/access", new
        {
            mode = "SelectedUsers",
            users = new object[] { new { userId = Ayse, canView = true }, new { userId = Mehmet, canView = true } },
            expectedRevision = 0
        })).StatusCode);

        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            db.TenantMemberships.Remove(await db.TenantMemberships.SingleAsync(x => x.TenantId == TenantA && x.UserId == Mehmet));
            await db.SaveChangesAsync();
        }

        var access = await client.GetFromJsonAsync<JsonElement>($"/api/custom-pages/{Code}/access");
        var user = Assert.Single(access.GetProperty("users").EnumerateArray());
        Assert.Equal(Ayse, user.GetProperty("userId").GetGuid());
    }

    [Fact]
    public async Task Access_survives_republish_with_same_code()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, Admin, "TenantAdmin");
        var firstId = await CreatePageAsync(app, client);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/custom-pages/{firstId}/publish", new { expectedRevision = 1 })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/custom-pages/{Code}/access", new
        {
            mode = "SelectedUsers", users = new object[] { new { userId = Ayse, canView = true, canDelete = true } }, expectedRevision = 0
        })).StatusCode);

        var secondId = await CreatePageAsync(app, client);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/custom-pages/{secondId}/publish", new { expectedRevision = 1 })).StatusCode);

        var access = await client.GetFromJsonAsync<JsonElement>($"/api/custom-pages/{Code}/access");
        Assert.Equal("SelectedUsers", access.GetProperty("mode").GetString());
        Assert.Equal(1, access.GetProperty("revision").GetInt32());
        var user = Assert.Single(access.GetProperty("users").EnumerateArray());
        Assert.Equal(Ayse, user.GetProperty("userId").GetGuid());
        Assert.True(user.GetProperty("canDelete").GetBoolean());
    }

    private static async Task<Guid> CreatePageAsync(WebApplication app, HttpClient client)
    {
        var response = await TemplatelessPageSeed.PostDraftAsync(app.Services, client, Code, "Varlık panosu",
            new { schemaVersion = 1, components = new[] { new { id = "heading_1", type = "heading", props = new { title = "Varlıklar" } } } });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
    }

    internal static async Task SeedPlatformAsync(PlatformDbContext platform)
    {
        await platform.Database.EnsureCreatedAsync();
        platform.Tenants.AddRange(
            new Tenant { Id = TenantA, Name = "Tenant A", Slug = "tenant-a" },
            new Tenant { Id = TenantB, Name = "Tenant B", Slug = "tenant-b" });
        platform.Users.AddRange(
            new AppUser { Id = Admin, Email = "admin@example.test", DisplayName = "Yönetici" },
            new AppUser { Id = Ayse, Email = "ayse@example.test", DisplayName = "Ayşe Yılmaz" },
            new AppUser { Id = Mehmet, Email = "mehmet@example.test", DisplayName = "Mehmet Kaya" },
            new AppUser { Id = Outsider, Email = "outsider@example.test", DisplayName = "Dış Kullanıcı" });
        platform.TenantMemberships.AddRange(
            new TenantMembership { TenantId = TenantA, UserId = Admin, Role = "TenantAdmin" },
            new TenantMembership { TenantId = TenantB, UserId = Admin, Role = "TenantAdmin" },
            new TenantMembership { TenantId = TenantA, UserId = Ayse, Role = "TenantUser" },
            new TenantMembership { TenantId = TenantA, UserId = Mehmet, Role = "TenantUser" },
            new TenantMembership { TenantId = TenantB, UserId = Outsider, Role = "TenantUser" });
        await platform.SaveChangesAsync();
    }

    private static async Task<WebApplication> StartApplicationAsync()
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        var suffix = Guid.NewGuid().ToString("N");
        builder.Services.AddDbContext<TenantDbContext>(options => options
            .UseInMemoryDatabase($"custom-page-access-tenant-{suffix}")
            .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning)));
        builder.Services.AddDbContext<PlatformDbContext>(options => options
            .UseInMemoryDatabase($"custom-page-access-platform-{suffix}")
            .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning)));
        builder.Services.AddAuthentication("report-test").AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("report-test", _ => { });
        builder.Services.AddSingleton<AIERP.Platform.Application.IPlatformPermissionAuthorizer, CustomizationTestPermissionAuthorizer>();
        builder.Services.AddAuthorization();

        var app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapTenantCustomPageEndpoints();
        app.MapCustomPageAccessEndpoints();
        await app.StartAsync();
        await using var scope = app.Services.CreateAsyncScope();
        var tenantDb = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        await tenantDb.Database.EnsureCreatedAsync();
        tenantDb.Tenants.AddRange(
            new Tenant { Id = TenantA, Name = "Tenant A", Slug = "tenant-a" },
            new Tenant { Id = TenantB, Name = "Tenant B", Slug = "tenant-b" });
        await tenantDb.SaveChangesAsync();
        await SeedPlatformAsync(scope.ServiceProvider.GetRequiredService<PlatformDbContext>());
        return app;
    }

    private static void SetIdentity(HttpClient client, Guid tenant, Guid user, string role)
    {
        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Remove("X-Test-User");
        client.DefaultRequestHeaders.Remove("X-Test-Role");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", tenant.ToString());
        client.DefaultRequestHeaders.Add("X-Test-User", user.ToString());
        client.DefaultRequestHeaders.Add("X-Test-Role", role);
    }
}
