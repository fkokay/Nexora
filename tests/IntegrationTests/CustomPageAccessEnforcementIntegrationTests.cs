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

public sealed class CustomPageAccessEnforcementIntegrationTests
{
    private static readonly Guid TenantA = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid Admin = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private static readonly Guid Ayse = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    private static readonly Guid Mehmet = Guid.Parse("cccccccc-cccc-cccc-cccc-cccccccccccc");
    private const string Code = "asset-dashboard";
    private const string Forbidden = "Bu sayfayı görüntüleme yetkiniz yok.";

    [Fact]
    public async Task Published_page_is_forbidden_without_view_right()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, Admin, "TenantAdmin");
        var draftId = await PublishPageAsync(client, keepDraft: true);
        await PutAccessAsync(client, new { mode = "AdminsOnly", expectedRevision = 0 });

        SetIdentity(client, Ayse, "TenantUser");
        var published = await client.GetAsync($"/api/custom-pages/{Code}/published");
        Assert.Equal(HttpStatusCode.Forbidden, published.StatusCode);
        var body = await published.Content.ReadAsStringAsync();
        Assert.Equal(Forbidden, JsonDocument.Parse(body).RootElement.GetProperty("error").GetString());
        Assert.DoesNotContain("definitionJson", body, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("Varlıklar", body, StringComparison.Ordinal);

        var preview = await client.GetAsync($"/api/custom-pages/{draftId}/preview");
        Assert.Equal(HttpStatusCode.Forbidden, preview.StatusCode);
        Assert.Equal(Forbidden, (await preview.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("error").GetString());
    }

    [Fact]
    public async Task Published_page_is_visible_to_selected_user_with_view()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, Admin, "TenantAdmin");
        await PublishPageAsync(client);
        await PutAccessAsync(client, new { mode = "SelectedUsers", users = new object[] { new { userId = Ayse, canView = true } }, expectedRevision = 0 });

        SetIdentity(client, Ayse, "TenantUser");
        var published = await client.GetFromJsonAsync<JsonElement>($"/api/custom-pages/{Code}/published");
        Assert.Equal(Code, published.GetProperty("code").GetString());
        SetIdentity(client, Mehmet, "TenantUser");
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"/api/custom-pages/{Code}/published")).StatusCode);
    }

    [Fact]
    public async Task Published_page_without_access_row_is_visible_to_members()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, Admin, "TenantAdmin");
        await PublishPageAsync(client);

        SetIdentity(client, Mehmet, "TenantUser");
        var published = await client.GetFromJsonAsync<JsonElement>($"/api/custom-pages/{Code}/published");
        Assert.Equal(Code, published.GetProperty("code").GetString());
        Assert.Single(await client.GetFromJsonAsync<JsonElement[]>("/api/custom-menus/") ?? []);
    }

    [Fact]
    public async Task Menu_hides_entries_for_pages_user_cannot_view()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, Admin, "TenantAdmin");
        await PublishPageAsync(client);
        await PutAccessAsync(client, new { mode = "SelectedUsers", users = new object[] { new { userId = Ayse, canView = true } }, expectedRevision = 0 });
        Assert.Equal(HttpStatusCode.Created, (await client.PostAsJsonAsync("/api/custom-menus/", new { code = "reports-shortcut", label = "Raporlar", targetPage = "reports" })).StatusCode);

        SetIdentity(client, Mehmet, "TenantUser");
        var mehmetMenu = await client.GetFromJsonAsync<JsonElement[]>("/api/custom-menus/") ?? [];
        Assert.Equal(["reports"], mehmetMenu.Select(x => x.GetProperty("targetPage").GetString()));

        SetIdentity(client, Ayse, "TenantUser");
        var ayseMenu = await client.GetFromJsonAsync<JsonElement[]>("/api/custom-menus/") ?? [];
        Assert.Equal([$"custom-page:{Code}", "reports"], ayseMenu.Select(x => x.GetProperty("targetPage").GetString()));
    }

    [Fact]
    public async Task Tenant_admin_always_sees_page_and_menu_entry()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, Admin, "TenantAdmin");
        await PublishPageAsync(client);
        await PutAccessAsync(client, new { mode = "AdminsOnly", expectedRevision = 0 });

        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"/api/custom-pages/{Code}/published")).StatusCode);
        var menu = await client.GetFromJsonAsync<JsonElement[]>("/api/custom-menus/") ?? [];
        Assert.Equal($"custom-page:{Code}", Assert.Single(menu).GetProperty("targetPage").GetString());
    }

    [Fact]
    public async Task Published_page_with_queries_and_no_row_is_hidden_from_tenant_user()
    {
        await using var app = await StartApplicationAsync();
        // Publishing a query page via the API requires an access row, so seed a legacy published row directly.
        await using (var scope = app.Services.CreateAsyncScope())
        {
            var tenantDb = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            var now = DateTimeOffset.UtcNow;
            tenantDb.TenantCustomPages.Add(new TenantCustomPage
            {
                TenantId = TenantA, Code = Code, Name = "Sorgulu", Revision = 1, IsPublished = true,
                DefinitionJson = JsonSerializer.Serialize(CustomPageQueryRulesIntegrationTests.QueryDefinition()),
                CreatedByUserId = Admin, UpdatedByUserId = Admin, CreatedAt = now, UpdatedAt = now
            });
            await tenantDb.SaveChangesAsync();
        }
        using var client = app.GetTestClient();
        SetIdentity(client, Admin, "TenantAdmin");
        Assert.Equal(HttpStatusCode.Created, (await client.PostAsJsonAsync("/api/custom-menus/", new { code = "query-menu", label = "Sorgulu", targetPage = $"custom-page:{Code}" })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"/api/custom-pages/{Code}/published")).StatusCode);
        // An open draft with queries is also admin-only in preview.
        var draft = await client.PostAsJsonAsync("/api/custom-pages/drafts", new { code = Code, name = "Sorgulu v2", definition = CustomPageQueryRulesIntegrationTests.QueryDefinition() });
        Assert.Equal(HttpStatusCode.Created, draft.StatusCode);
        var draftId = (await draft.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();

        SetIdentity(client, Ayse, "TenantUser");
        var published = await client.GetAsync($"/api/custom-pages/{Code}/published");
        Assert.Equal(HttpStatusCode.Forbidden, published.StatusCode);
        Assert.DoesNotContain("CustomerAccounts", await published.Content.ReadAsStringAsync(), StringComparison.Ordinal);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"/api/custom-pages/{draftId}/preview")).StatusCode);
        Assert.Empty(await client.GetFromJsonAsync<JsonElement[]>("/api/custom-menus/") ?? []);
    }

    /// <summary>Publishes the page and adds a menu entry for it; optionally leaves an open draft for preview.</summary>
    private static async Task<Guid?> PublishPageAsync(HttpClient client, bool keepDraft = false)
    {
        var definition = new { schemaVersion = 1, components = new[] { new { id = "heading_1", type = "heading", props = new { title = "Varlıklar" } } } };
        var created = await client.PostAsJsonAsync("/api/custom-pages/drafts", new { code = Code, name = "Varlık panosu", definition });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var id = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/custom-pages/{id}/publish", new { expectedRevision = 1 })).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await client.PostAsJsonAsync("/api/custom-menus/", new { code = "asset-menu", label = "Varlıklar", targetPage = $"custom-page:{Code}" })).StatusCode);
        if (!keepDraft) return null;
        var draft = await client.PostAsJsonAsync("/api/custom-pages/drafts", new { code = Code, name = "Varlık panosu v2", definition });
        Assert.Equal(HttpStatusCode.Created, draft.StatusCode);
        return (await draft.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
    }

    private static async Task PutAccessAsync(HttpClient client, object request) =>
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/custom-pages/{Code}/access", request)).StatusCode);

    private static async Task<WebApplication> StartApplicationAsync()
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        var suffix = Guid.NewGuid().ToString("N");
        builder.Services.AddDbContext<TenantDbContext>(options => options
            .UseInMemoryDatabase($"custom-page-enforcement-tenant-{suffix}")
            .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning)));
        builder.Services.AddDbContext<PlatformDbContext>(options => options
            .UseInMemoryDatabase($"custom-page-enforcement-platform-{suffix}")
            .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning)));
        builder.Services.AddAuthentication("report-test").AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("report-test", _ => { });
        builder.Services.AddSingleton<AIERP.Platform.Application.IPlatformPermissionAuthorizer, CustomizationTestPermissionAuthorizer>();
        builder.Services.AddAuthorization();

        var app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapTenantCustomPageEndpoints();
        app.MapCustomPageAccessEndpoints();
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
}
