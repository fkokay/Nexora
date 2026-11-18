using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>
/// System page rows (<c>@&lt;screenKey&gt;</c> codes) stored as ordinary custom pages. Rows are seeded directly through
/// <see cref="TenantDbContext"/> because the system-page routes that create them are not part of this surface.
/// </summary>
public sealed class SystemPageStorageIntegrationTests
{
    private static readonly Guid TenantA = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid Admin = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private static readonly Guid Ayse = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    private static readonly Guid Mehmet = Guid.Parse("cccccccc-cccc-cccc-cccc-cccccccccccc");
    private const string ScreenKey = "inventory-warehouses";
    private const string SystemCode = "@inventory-warehouses";
    private const string InvalidStandardVersion = "Standart sürüm değeri geçersiz.";
    private const int CurrentStandardVersion = 3;

    [Fact]
    public void System_codes_follow_the_screen_key_namespace()
    {
        Assert.True(SystemPageCodes.IsSystemCode(SystemCode));
        Assert.False(SystemPageCodes.IsSystemCode("inventory-warehouses"));
        Assert.False(SystemPageCodes.IsSystemCode("@Inventory"));
        Assert.False(SystemPageCodes.IsSystemCode("@"));
        Assert.False(SystemPageCodes.IsSystemCode("@a_b"));
        Assert.False(SystemPageCodes.IsSystemCode("@abc\n"));
        Assert.False(SystemPageCodes.IsSystemCode("@" + new string('a', 40)));
        Assert.True(SystemPageCodes.IsSystemCode("@" + new string('a', 39)));
        Assert.False(SystemPageCodes.IsSystemCode(null));
        Assert.Equal(SystemCode, SystemPageCodes.CodeFor(ScreenKey));
        Assert.Equal(ScreenKey, SystemPageCodes.ScreenKeyOf(SystemCode));
        Assert.Null(SystemPageCodes.ScreenKeyOf("musteri-panosu"));
        // The custom-page code namespace stays closed to system codes.
        Assert.False(TenantCustomPageEndpoints.ValidCode(SystemCode));
    }

    [Fact]
    public async Task Custom_page_list_reports_screen_key()
    {
        await using var app = await StartApplicationAsync();
        var id = await SeedSystemRowAsync(app, StaticDefinition(), published: false, standardVersion: 2);
        using var client = app.GetTestClient();
        SetIdentity(client, Admin, "TenantAdmin");
        await CreateCustomDraftAsync(client, "musteri-panosu");

        var list = await client.GetFromJsonAsync<JsonElement[]>("/api/custom-pages") ?? [];
        var system = Assert.Single(list, x => x.GetProperty("code").GetString() == SystemCode);
        Assert.Equal(ScreenKey, system.GetProperty("screenKey").GetString());
        var custom = Assert.Single(list, x => x.GetProperty("code").GetString() == "musteri-panosu");
        Assert.Equal(JsonValueKind.Null, custom.GetProperty("screenKey").ValueKind);

        var detail = await client.GetFromJsonAsync<JsonElement>($"/api/custom-pages/{id}");
        Assert.Equal(ScreenKey, detail.GetProperty("screenKey").GetString());
        Assert.Equal(2, detail.GetProperty("standardVersion").GetInt32());
    }

    [Fact]
    public async Task Menu_targets_exclude_system_rows()
    {
        await using var app = await StartApplicationAsync();
        await SeedSystemRowAsync(app, StaticDefinition(), published: true, standardVersion: 1);
        using var client = app.GetTestClient();
        SetIdentity(client, Admin, "TenantAdmin");
        var draftId = await CreateCustomDraftAsync(client, "musteri-panosu");
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/custom-pages/{draftId}/publish", new { expectedRevision = 1 })).StatusCode);

        var targets = await client.GetFromJsonAsync<JsonElement[]>("/api/custom-menus/targets") ?? [];
        var keys = targets.Select(x => x.GetProperty("page").GetString()).ToArray();
        Assert.Contains("custom-page:musteri-panosu", keys);
        Assert.DoesNotContain($"custom-page:{SystemCode}", keys);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/custom-menus/",
            new { code = "depo-kisayol", label = "Depolar", targetPage = $"custom-page:{SystemCode}" })).StatusCode);
    }

    [Fact]
    public async Task Published_by_code_returns_404_for_system_row()
    {
        await using var app = await StartApplicationAsync();
        await SeedSystemRowAsync(app, StaticDefinition(), published: true, standardVersion: 1);
        using var client = app.GetTestClient();
        SetIdentity(client, Admin, "TenantAdmin");

        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/custom-pages/{SystemCode}/published")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/custom-pages/{Uri.EscapeDataString(SystemCode)}/published")).StatusCode);
    }

    [Fact]
    public async Task Drafts_endpoint_rejects_at_code()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, Admin, "TenantAdmin");

        var response = await client.PostAsJsonAsync("/api/custom-pages/drafts", new { code = SystemCode, name = "Depo", definition = StaticDefinition() });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await using var scope = app.Services.CreateAsyncScope();
        Assert.False(await scope.ServiceProvider.GetRequiredService<TenantDbContext>().TenantCustomPages.AnyAsync());
    }

    [Fact]
    public async Task System_row_without_access_row_is_visible_to_members_when_it_has_only_operations()
    {
        await using var app = await StartApplicationAsync();
        await SeedSystemRowAsync(app, CustomPageQueryRulesIntegrationTests.OperationDefinition(), published: true, standardVersion: 1);
        // The same definition on an ordinary custom page without an access row stays admin-only.
        await SeedCustomPublishedAsync(app, "kart-panosu", CustomPageQueryRulesIntegrationTests.OperationDefinition());
        await SeedMenuEntriesAsync(app, SystemCode, "kart-panosu");
        using var client = app.GetTestClient();
        SetIdentity(client, Mehmet, "TenantUser");

        // Query-run rights: the operation itself never runs here, so reaching that check proves View.
        var run = await client.PostAsJsonAsync($"/api/custom-pages/{SystemCode}/queries/q1/run", new { parameters = new { } });
        Assert.Equal(HttpStatusCode.BadRequest, run.StatusCode);
        Assert.Equal(CustomPageQueryEndpoints.OperationQueryRunError, (await run.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("error").GetString());
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync("/api/custom-pages/kart-panosu/queries/q1/run", new { parameters = new { } })).StatusCode);

        // Batch rights (menu filtering).
        var menu = await client.GetFromJsonAsync<JsonElement[]>("/api/custom-menus/") ?? [];
        Assert.Equal([$"custom-page:{SystemCode}"], menu.Select(x => x.GetProperty("targetPage").GetString()));

        await using var scope = app.Services.CreateAsyncScope();
        var rights = await CustomPageAccess.GetRightsAsync(scope.ServiceProvider.GetRequiredService<PlatformDbContext>(),
            scope.ServiceProvider.GetRequiredService<TenantDbContext>(), TenantA, [SystemCode, "kart-panosu"], Mehmet, "TenantUser", CancellationToken.None);
        Assert.True(rights[SystemCode].View);
        Assert.False(rights["kart-panosu"].View);
    }

    [Fact]
    public async Task System_row_with_sql_and_no_access_row_is_admin_only()
    {
        await using var app = await StartApplicationAsync();
        await SeedSystemRowAsync(app, CustomPageQueryRulesIntegrationTests.QueryDefinition(), published: true, standardVersion: 1);
        await SeedMenuEntriesAsync(app, SystemCode);
        using var client = app.GetTestClient();

        SetIdentity(client, Mehmet, "TenantUser");
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync($"/api/custom-pages/{SystemCode}/queries/q1/run", new { parameters = new { code = "X" } })).StatusCode);
        Assert.Empty(await client.GetFromJsonAsync<JsonElement[]>("/api/custom-menus/") ?? []);

        SetIdentity(client, Admin, "TenantAdmin");
        Assert.Single(await client.GetFromJsonAsync<JsonElement[]>("/api/custom-menus/") ?? []);
    }

    [Fact]
    public async Task Publish_system_row_needs_access_row_only_for_sql()
    {
        await using var app = await StartApplicationAsync();
        var operationDraft = await SeedSystemRowAsync(app, CustomPageQueryRulesIntegrationTests.OperationDefinition(), published: false, standardVersion: 1);
        using var client = app.GetTestClient();
        SetIdentity(client, Admin, "TenantAdmin");
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/custom-pages/{operationDraft}/publish", new { expectedRevision = 1 })).StatusCode);

        var sqlDraft = await SeedSystemRowAsync(app, CustomPageQueryRulesIntegrationTests.QueryDefinition(), published: false, standardVersion: 1);
        var blocked = await client.PostAsJsonAsync($"/api/custom-pages/{sqlDraft}/publish", new { expectedRevision = 1 });
        Assert.Equal(HttpStatusCode.Conflict, blocked.StatusCode);
        Assert.Equal("Bu sayfa SQL sorgusu içeriyor; yayımlamadan önce erişimi açıkça seçin.",
            (await blocked.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("error").GetString());

        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/custom-pages/{SystemCode}/access", new { mode = "AdminsOnly", expectedRevision = 0 })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/custom-pages/{sqlDraft}/publish", new { expectedRevision = 1 })).StatusCode);
        await using var scope = app.Services.CreateAsyncScope();
        var rows = await scope.ServiceProvider.GetRequiredService<TenantDbContext>().TenantCustomPages.AsNoTracking().ToListAsync();
        // The previous published row of the same code was superseded.
        Assert.True(rows.Single(x => x.Id == operationDraft).IsArchived);
        Assert.True(rows.Single(x => x.Id == sqlDraft).IsPublished);
    }

    [Fact]
    public async Task Put_standard_version_rules()
    {
        await using var app = await StartApplicationAsync();
        var id = await SeedSystemRowAsync(app, StaticDefinition(), published: false, standardVersion: 2);
        using var client = app.GetTestClient();
        SetIdentity(client, Admin, "TenantAdmin");

        await AssertInvalidStandardVersionAsync(client.PutAsJsonAsync($"/api/custom-pages/{id}", Update(1, "Depo Yönetimi", 1)));
        await AssertInvalidStandardVersionAsync(client.PutAsJsonAsync($"/api/custom-pages/{id}", Update(1, "Depo Yönetimi", CurrentStandardVersion + 1)));

        var customId = await CreateCustomDraftAsync(client, "musteri-panosu");
        await AssertInvalidStandardVersionAsync(client.PutAsJsonAsync($"/api/custom-pages/{customId}", Update(1, "Müşteri", 1)));
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/custom-pages/{customId}", Update(1, "Müşteri", null))).StatusCode);

        // Omitting the value keeps the stored version; the name rule (1–120 characters) still applies.
        var unchanged = await client.PutAsJsonAsync($"/api/custom-pages/{id}", Update(1, "Depo listesi", null));
        Assert.Equal(HttpStatusCode.OK, unchanged.StatusCode);
        Assert.Equal(2, (await unchanged.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("standardVersion").GetInt32());
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync($"/api/custom-pages/{id}", Update(2, new string('a', 121), null))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync($"/api/custom-pages/{id}", Update(2, " ", null))).StatusCode);

        var stored = await client.PutAsJsonAsync($"/api/custom-pages/{id}", Update(2, "Depo listesi", CurrentStandardVersion));
        Assert.Equal(HttpStatusCode.OK, stored.StatusCode);
        var body = await stored.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(CurrentStandardVersion, body.GetProperty("standardVersion").GetInt32());
        Assert.Equal(SystemCode, body.GetProperty("code").GetString());
        Assert.Equal(ScreenKey, body.GetProperty("screenKey").GetString());

        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        var row = await db.TenantCustomPages.AsNoTracking().SingleAsync(x => x.Id == id);
        Assert.Equal((SystemCode, ScreenKey, CurrentStandardVersion), (row.Code, row.ScreenKey!, row.StandardVersion!.Value));
        var revision = await db.TenantCustomPageRevisions.AsNoTracking().SingleAsync(x => x.CustomPageId == id && x.Revision == 3);
        Assert.Equal(CurrentStandardVersion, revision.StandardVersion);
    }

    [Fact]
    public async Task Put_standard_version_is_rejected_without_a_version_source()
    {
        await using var app = await StartApplicationAsync(registerVersionSource: false);
        var id = await SeedSystemRowAsync(app, StaticDefinition(), published: false, standardVersion: 2);
        using var client = app.GetTestClient();
        SetIdentity(client, Admin, "TenantAdmin");

        await AssertInvalidStandardVersionAsync(client.PutAsJsonAsync($"/api/custom-pages/{id}", Update(1, "Depo Yönetimi", 2)));
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/custom-pages/{id}", Update(1, "Depo Yönetimi", null))).StatusCode);
    }

    [Fact]
    public async Task Restore_keeps_screen_key_and_standard_version()
    {
        await using var app = await StartApplicationAsync();
        var id = await SeedSystemRowAsync(app, StaticDefinition(), published: true, standardVersion: 2);
        Guid legacyRevision, versionedRevision;
        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            var legacy = Revision(id, 2, standardVersion: null);
            var versioned = Revision(id, 3, standardVersion: 1);
            db.TenantCustomPageRevisions.AddRange(legacy, versioned);
            await db.SaveChangesAsync();
            (legacyRevision, versionedRevision) = (legacy.Id, versioned.Id);
        }
        using var client = app.GetTestClient();
        SetIdentity(client, Admin, "TenantAdmin");

        // A revision without a stored version falls back to the row's value.
        var first = await client.PostAsync($"/api/custom-pages/{id}/restore/{legacyRevision}", null);
        Assert.Equal(HttpStatusCode.Created, first.StatusCode);
        var firstBody = await first.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(ScreenKey, firstBody.GetProperty("screenKey").GetString());
        Assert.Equal(2, firstBody.GetProperty("standardVersion").GetInt32());
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/custom-pages/{firstBody.GetProperty("id").GetGuid()}")).StatusCode);

        var second = await client.PostAsync($"/api/custom-pages/{id}/restore/{versionedRevision}", null);
        Assert.Equal(HttpStatusCode.Created, second.StatusCode);
        var secondId = (await second.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        await using var verify = app.Services.CreateAsyncScope();
        var tenantDb = verify.ServiceProvider.GetRequiredService<TenantDbContext>();
        var restored = await tenantDb.TenantCustomPages.AsNoTracking().SingleAsync(x => x.Id == secondId);
        Assert.Equal((SystemCode, ScreenKey, 1), (restored.Code, restored.ScreenKey!, restored.StandardVersion!.Value));
        var restoredRevision = await tenantDb.TenantCustomPageRevisions.AsNoTracking().SingleAsync(x => x.CustomPageId == secondId);
        Assert.Equal(("Restored", 1), (restoredRevision.ChangeKind, restoredRevision.StandardVersion!.Value));
    }

    [Fact]
    public async Task TenantUser_cannot_update_publish_delete_or_restore_system_row()
    {
        // The authorizer grants every customization action, so only the system-row admin gate can refuse.
        await using var app = await StartApplicationAsync(allowAllActions: true);
        var draftId = await SeedSystemRowAsync(app, StaticDefinition(), published: false, standardVersion: 1);
        Guid revisionId;
        await using (var scope = app.Services.CreateAsyncScope())
            revisionId = await scope.ServiceProvider.GetRequiredService<TenantDbContext>().TenantCustomPageRevisions
                .Where(x => x.CustomPageId == draftId).Select(x => x.Id).SingleAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, Ayse, "TenantUser");

        // Ordinary static pages stay writable for this designer.
        var customId = await CreateCustomDraftAsync(client, "musteri-panosu");
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/custom-pages/{customId}", Update(1, "Müşteri", null))).StatusCode);

        await AssertAdminOnlyAsync(client.PutAsJsonAsync($"/api/custom-pages/{draftId}", Update(1, "Depo", null)));
        await AssertAdminOnlyAsync(client.PutAsJsonAsync($"/api/custom-pages/{draftId}", Update(99, "Depo", null)));
        await AssertAdminOnlyAsync(client.PostAsJsonAsync($"/api/custom-pages/{draftId}/publish", new { expectedRevision = 1 }));
        await AssertAdminOnlyAsync(client.DeleteAsync($"/api/custom-pages/{draftId}"));
        await AssertAdminOnlyAsync(client.PostAsync($"/api/custom-pages/{draftId}/restore/{revisionId}", null));
        // A stale TenantAdmin claim without the membership is not enough.
        SetIdentity(client, Ayse, "TenantAdmin");
        await AssertAdminOnlyAsync(client.DeleteAsync($"/api/custom-pages/{draftId}"));

        await using var verify = app.Services.CreateAsyncScope();
        var row = await verify.ServiceProvider.GetRequiredService<TenantDbContext>().TenantCustomPages.AsNoTracking().SingleAsync(x => x.Id == draftId);
        Assert.Equal((1, false, false), (row.Revision, row.IsPublished, row.IsArchived));
    }

    [Fact]
    public async Task Access_endpoints_accept_system_code()
    {
        await using var app = await StartApplicationAsync();
        await SeedSystemRowAsync(app, CustomPageQueryRulesIntegrationTests.OperationDefinition(), published: true, standardVersion: 1);
        using var client = app.GetTestClient();
        SetIdentity(client, Admin, "TenantAdmin");

        var initial = await client.GetFromJsonAsync<JsonElement>($"/api/custom-pages/{SystemCode}/access");
        Assert.Equal((SystemCode, 0), (initial.GetProperty("pageCode").GetString(), initial.GetProperty("revision").GetInt32()));
        var saved = await client.PutAsJsonAsync($"/api/custom-pages/{SystemCode}/access", new { mode = "AdminsOnly", expectedRevision = 0 });
        Assert.Equal(HttpStatusCode.OK, saved.StatusCode);
        Assert.Equal("AdminsOnly", (await saved.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("mode").GetString());
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/api/custom-pages/@customer-accounts/access")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/custom-pages/@Bad_Code/access")).StatusCode);

        // The saved row now governs the system page: a member loses View.
        SetIdentity(client, Mehmet, "TenantUser");
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync($"/api/custom-pages/{SystemCode}/queries/q1/run", new { parameters = new { } })).StatusCode);
    }

    private static object StaticDefinition() => CustomPageQueryRulesIntegrationTests.StaticDefinition();

    private static object Update(int expectedRevision, string name, int? standardVersion) =>
        new { expectedRevision, name, description = (string?)null, definition = StaticDefinition(), standardVersion };

    private static async Task AssertInvalidStandardVersionAsync(Task<HttpResponseMessage> request)
    {
        var response = await request;
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(InvalidStandardVersion, (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("error").GetString());
    }

    private static async Task AssertAdminOnlyAsync(Task<HttpResponseMessage> request) =>
        Assert.Equal(HttpStatusCode.Forbidden, (await request).StatusCode);

    private static TenantCustomPageRevision Revision(Guid pageId, int revision, int? standardVersion) => new()
    {
        TenantId = TenantA, CustomPageId = pageId, Revision = revision, Code = SystemCode, Name = $"Depo r{revision}",
        DefinitionJson = JsonSerializer.Serialize(StaticDefinition()), ChangeKind = "Updated", ChangedByUserId = Admin,
        StandardVersion = standardVersion
    };

    private static async Task<Guid> CreateCustomDraftAsync(HttpClient client, string code)
    {
        var response = await client.PostAsJsonAsync("/api/custom-pages/drafts", new { code, name = "Özel sayfa", definition = StaticDefinition() });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
    }

    private static async Task<Guid> SeedSystemRowAsync(WebApplication app, object definition, bool published, int standardVersion)
    {
        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        var now = DateTimeOffset.UtcNow;
        var page = new TenantCustomPage
        {
            TenantId = TenantA, Code = SystemCode, ScreenKey = ScreenKey, StandardVersion = standardVersion, Name = "Depo Yönetimi",
            Description = "Depo tanımlarının listesi.", DefinitionJson = JsonSerializer.Serialize(definition), Revision = 1,
            IsPublished = published, CreatedByUserId = Admin, UpdatedByUserId = Admin, CreatedAt = now, UpdatedAt = now
        };
        db.TenantCustomPages.Add(page);
        db.TenantCustomPageRevisions.Add(new TenantCustomPageRevision
        {
            TenantId = TenantA, CustomPageId = page.Id, Revision = 1, Code = page.Code, Name = page.Name, Description = page.Description,
            DefinitionJson = page.DefinitionJson, ChangeKind = "CreatedFromStandard", ChangedByUserId = Admin, StandardVersion = standardVersion
        });
        await db.SaveChangesAsync();
        return page.Id;
    }

    private static async Task SeedCustomPublishedAsync(WebApplication app, string code, object definition)
    {
        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        var now = DateTimeOffset.UtcNow;
        db.TenantCustomPages.Add(new TenantCustomPage
        {
            TenantId = TenantA, Code = code, Name = "Kartlar", DefinitionJson = JsonSerializer.Serialize(definition), Revision = 1,
            IsPublished = true, CreatedByUserId = Admin, UpdatedByUserId = Admin, CreatedAt = now, UpdatedAt = now
        });
        await db.SaveChangesAsync();
    }

    /// <summary>Menu entries are seeded directly: menu validation does not offer system rows as targets.</summary>
    private static async Task SeedMenuEntriesAsync(WebApplication app, params string[] pageCodes)
    {
        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        var now = DateTimeOffset.UtcNow;
        for (var i = 0; i < pageCodes.Length; i++)
            db.TenantCustomMenuEntries.Add(new TenantCustomMenuEntry
            {
                TenantId = TenantA, Code = $"menu-{i}", Label = pageCodes[i], TargetPage = $"custom-page:{pageCodes[i]}", Position = i,
                CreatedByUserId = Admin, UpdatedByUserId = Admin, CreatedAt = now.AddSeconds(i), UpdatedAt = now
            });
        await db.SaveChangesAsync();
    }

    private static async Task<WebApplication> StartApplicationAsync(bool registerVersionSource = true, bool allowAllActions = false)
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        var suffix = Guid.NewGuid().ToString("N");
        builder.Services.AddDbContext<TenantDbContext>(options => options
            .UseInMemoryDatabase($"system-page-storage-tenant-{suffix}")
            .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning)));
        builder.Services.AddDbContext<PlatformDbContext>(options => options
            .UseInMemoryDatabase($"system-page-storage-platform-{suffix}")
            .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning)));
        builder.Services.AddAuthentication("report-test").AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("report-test", _ => { });
        if (allowAllActions) builder.Services.AddSingleton<IPlatformPermissionAuthorizer, AllowAllAuthorizer>();
        else builder.Services.AddSingleton<IPlatformPermissionAuthorizer, CustomizationTestPermissionAuthorizer>();
        if (registerVersionSource) builder.Services.AddSingleton<ISystemPageVersionSource>(new FixedVersionSource());
        builder.Services.AddSingleton<ITenantQueryConnectionFactory, UnusedQueryConnectionFactory>();
        builder.Services.AddAuthorization();
        builder.Services.AddRateLimiter(CustomPageQueryEndpoints.ConfigureRateLimiting);
        builder.Services.AddSingleton<CustomPageWriteRateLimiter>();

        var app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();
        app.UseRateLimiter();
        app.MapTenantCustomPageEndpoints();
        app.MapCustomPageAccessEndpoints();
        app.MapCustomPageQueryEndpoints();
        app.MapCustomMenuEndpoints();
        await app.StartAsync();
        await using var scope = app.Services.CreateAsyncScope();
        var tenantDb = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        await tenantDb.Database.EnsureCreatedAsync();
        tenantDb.Tenants.Add(new Tenant { Id = TenantA, Name = "Tenant A", Slug = "tenant-a" });
        await tenantDb.SaveChangesAsync();
        await CustomPageAccessEndpointsIntegrationTests.SeedPlatformAsync(scope.ServiceProvider.GetRequiredService<PlatformDbContext>());
        return app;
    }

    private static void SetIdentity(HttpClient client, Guid user, string role)
    {
        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Remove("X-Test-User");
        client.DefaultRequestHeaders.Remove("X-Test-Role");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        client.DefaultRequestHeaders.Add("X-Test-User", user.ToString());
        client.DefaultRequestHeaders.Add("X-Test-Role", role);
    }

    private sealed class FixedVersionSource : ISystemPageVersionSource
    {
        public int? CurrentVersion(string screenKey) => screenKey == ScreenKey ? CurrentStandardVersion : null;
    }

    private sealed class AllowAllAuthorizer : IPlatformPermissionAuthorizer
    {
        public Task<bool> IsAllowedAsync(Guid tenantId, Guid userId, string role, ResolvedPlatformPermission permission,
            CancellationToken cancellationToken = default) => Task.FromResult(true);
    }

    private sealed class UnusedQueryConnectionFactory : ITenantQueryConnectionFactory
    {
        public Task<SqlConnection> OpenAsync(Guid tenantId, TenantQueryAccess access, CancellationToken cancellationToken) =>
            throw new InvalidOperationException("SQL is not reached in these tests.");
    }
}
