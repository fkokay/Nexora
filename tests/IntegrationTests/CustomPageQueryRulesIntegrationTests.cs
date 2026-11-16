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
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace AIERP.Api.IntegrationTests;

public sealed class CustomPageQueryRulesIntegrationTests
{
    private static readonly Guid TenantA = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid Admin = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private static readonly Guid Ayse = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    private const string PublishWithoutAccess = "Bu sayfa SQL sorgusu içeriyor; yayımlamadan önce erişimi açıkça seçin.";

    internal static object StaticDefinition() =>
        new { schemaVersion = 1, components = new[] { new { id = "heading_1", type = "heading", props = new { title = "Sabit" } } } };

    internal static object QueryDefinition() => new
    {
        schemaVersion = 2,
        queries = new object[]
        {
            new
            {
                id = "q1", name = "musteriler", kind = "read", runOn = "load",
                sql = "SELECT Code, Name FROM CustomerAccounts WHERE Code = @code",
                parameters = new object[] { new { name = "code", binding = "{{arama.value}}", type = "text" } }
            }
        },
        components = new object[]
        {
            new { id = "c1", type = "input", name = "arama", props = new { inputType = "text" } },
            new { id = "c2", type = "dataTable", name = "izgara", props = new { query = "q1" } }
        }
    };

    [Fact]
    public async Task Tenant_user_cannot_create_update_publish_or_restore_page_with_queries()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();

        // Control: the permissive authorizer lets a tenant user manage pages without queries.
        SetIdentity(client, Ayse, "TenantUser");
        var staticDraft = await CreateDraftAsync(client, "static-page", StaticDefinition());
        Assert.Equal(HttpStatusCode.Created, staticDraft.StatusCode);
        var staticId = await IdOf(staticDraft);
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/custom-pages/{staticId}",
            new { expectedRevision = 1, name = "Sabit sayfa", definition = StaticDefinition() })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/custom-pages/{staticId}/publish", new { expectedRevision = 2 })).StatusCode);

        // 1) create
        Assert.Equal(HttpStatusCode.Forbidden, (await CreateDraftAsync(client, "user-query-page", QueryDefinition())).StatusCode);

        SetIdentity(client, Admin, "TenantAdmin");
        var adminDraft = await CreateDraftAsync(client, "query-page", QueryDefinition());
        Assert.Equal(HttpStatusCode.Created, adminDraft.StatusCode);
        var draftId = await IdOf(adminDraft);

        // 2) update: a draft that has queries stays admin-only, even if the request removes them.
        SetIdentity(client, Ayse, "TenantUser");
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PutAsJsonAsync($"/api/custom-pages/{draftId}",
            new { expectedRevision = 1, name = "Sorgulu", definition = QueryDefinition() })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PutAsJsonAsync($"/api/custom-pages/{draftId}",
            new { expectedRevision = 1, name = "Sorgulu", definition = StaticDefinition() })).StatusCode);
        // ... and a tenant user cannot add queries to a static draft.
        SetIdentity(client, Ayse, "TenantUser");
        var secondStatic = await IdOf(await CreateDraftAsync(client, "static-two", StaticDefinition()));
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PutAsJsonAsync($"/api/custom-pages/{secondStatic}",
            new { expectedRevision = 1, name = "Sabit", definition = QueryDefinition() })).StatusCode);

        // 3) publish
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync($"/api/custom-pages/{draftId}/publish", new { expectedRevision = 1 })).StatusCode);

        // 4) restore: the check looks at the revision being restored.
        SetIdentity(client, Admin, "TenantAdmin");
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync("/api/custom-pages/query-page/access", new { mode = "AllUsers", expectedRevision = 0 })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/custom-pages/{draftId}/publish", new { expectedRevision = 1 })).StatusCode);
        var history = await client.GetFromJsonAsync<JsonElement[]>($"/api/custom-pages/{draftId}/history") ?? [];
        var revisionId = history.First().GetProperty("id").GetGuid();
        SetIdentity(client, Ayse, "TenantUser");
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsync($"/api/custom-pages/{draftId}/restore/{revisionId}", null)).StatusCode);
        SetIdentity(client, Admin, "TenantAdmin");
        Assert.Equal(HttpStatusCode.Created, (await client.PostAsync($"/api/custom-pages/{draftId}/restore/{revisionId}", null)).StatusCode);
    }

    [Fact]
    public async Task Tenant_user_cannot_replace_delete_or_restore_over_stored_query_definition()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();

        // Admin: a page whose revision 1 is static and revision 2 adds queries, then published.
        SetIdentity(client, Admin, "TenantAdmin");
        var pageId = await IdOf(await CreateDraftAsync(client, "query-page", StaticDefinition()));
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/custom-pages/{pageId}",
            new { expectedRevision = 1, name = "Sorgulu", definition = QueryDefinition() })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync("/api/custom-pages/query-page/access", new { mode = "AllUsers", expectedRevision = 0 })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/custom-pages/{pageId}/publish", new { expectedRevision = 2 })).StatusCode);
        var staticRevisionId = (await client.GetFromJsonAsync<JsonElement[]>($"/api/custom-pages/{pageId}/history") ?? [])
            .Single(x => x.GetProperty("revision").GetInt32() == 1).GetProperty("id").GetGuid();

        // 1) drafts: a static draft for the code of a published query page.
        SetIdentity(client, Ayse, "TenantUser");
        Assert.Equal(HttpStatusCode.Forbidden, (await CreateDraftAsync(client, "query-page", StaticDefinition())).StatusCode);

        // 2) restore: the restored revision is static, but the stored row has queries.
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsync($"/api/custom-pages/{pageId}/restore/{staticRevisionId}", null)).StatusCode);

        // 3) publish: the draft is static (created by the admin), but it would replace a published query page.
        SetIdentity(client, Admin, "TenantAdmin");
        var staticDraft = await CreateDraftAsync(client, "query-page", StaticDefinition());
        Assert.Equal(HttpStatusCode.Created, staticDraft.StatusCode);
        var staticDraftId = await IdOf(staticDraft);
        SetIdentity(client, Ayse, "TenantUser");
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync($"/api/custom-pages/{staticDraftId}/publish", new { expectedRevision = 1 })).StatusCode);

        // 4) delete: the published page has queries.
        Assert.Equal(HttpStatusCode.Forbidden, (await client.DeleteAsync($"/api/custom-pages/{pageId}")).StatusCode);
        // Control: the static draft itself may still be deleted by a tenant user.
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/custom-pages/{staticDraftId}")).StatusCode);

        // The admin can do all of these.
        SetIdentity(client, Admin, "TenantAdmin");
        var adminDraft = await CreateDraftAsync(client, "query-page", StaticDefinition());
        Assert.Equal(HttpStatusCode.Created, adminDraft.StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/custom-pages/{await IdOf(adminDraft)}/publish", new { expectedRevision = 1 })).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await client.PostAsync($"/api/custom-pages/{pageId}/restore/{staticRevisionId}", null)).StatusCode);
    }

    [Fact]
    public async Task Tenant_user_cannot_delete_published_query_page_but_admin_can()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, Admin, "TenantAdmin");
        var pageId = await IdOf(await CreateDraftAsync(client, "query-page", QueryDefinition()));
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync("/api/custom-pages/query-page/access", new { mode = "AllUsers", expectedRevision = 0 })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/custom-pages/{pageId}/publish", new { expectedRevision = 1 })).StatusCode);

        SetIdentity(client, Ayse, "TenantUser");
        Assert.Equal(HttpStatusCode.Forbidden, (await client.DeleteAsync($"/api/custom-pages/{pageId}")).StatusCode);
        SetIdentity(client, Admin, "TenantAdmin");
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/custom-pages/{pageId}")).StatusCode);
    }

    [Fact]
    public async Task Tenant_admin_claim_without_admin_membership_cannot_create_page_with_queries()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        // Ayse's membership is TenantUser; a stale TenantAdmin role claim is not enough.
        SetIdentity(client, Ayse, "TenantAdmin");
        Assert.Equal(HttpStatusCode.Forbidden, (await CreateDraftAsync(client, "stale-admin", QueryDefinition())).StatusCode);
    }

    [Fact]
    public async Task Publish_with_queries_requires_saved_access_row()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, Admin, "TenantAdmin");
        var draftId = await IdOf(await CreateDraftAsync(client, "query-page", QueryDefinition()));

        var blocked = await client.PostAsJsonAsync($"/api/custom-pages/{draftId}/publish", new { expectedRevision = 1 });
        Assert.Equal(HttpStatusCode.Conflict, blocked.StatusCode);
        Assert.Equal(PublishWithoutAccess, (await blocked.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("error").GetString());

        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync("/api/custom-pages/query-page/access", new { mode = "AdminsOnly", expectedRevision = 0 })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/custom-pages/{draftId}/publish", new { expectedRevision = 1 })).StatusCode);
    }

    private static Task<HttpResponseMessage> CreateDraftAsync(HttpClient client, string code, object definition) =>
        client.PostAsJsonAsync("/api/custom-pages/drafts", new { code, name = code, definition });

    private static async Task<Guid> IdOf(HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();

    private static async Task<WebApplication> StartApplicationAsync()
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        var suffix = Guid.NewGuid().ToString("N");
        builder.Services.AddDbContext<TenantDbContext>(options => options
            .UseInMemoryDatabase($"custom-page-query-rules-tenant-{suffix}")
            .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning)));
        builder.Services.AddDbContext<PlatformDbContext>(options => options
            .UseInMemoryDatabase($"custom-page-query-rules-platform-{suffix}")
            .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning)));
        builder.Services.AddAuthentication("report-test").AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("report-test", _ => { });
        builder.Services.AddSingleton<IPlatformPermissionAuthorizer, AllowAllPermissionAuthorizer>();
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

    /// <summary>Grants every catalog permission, so the query-page rules are the only thing that can deny.</summary>
    internal sealed class AllowAllPermissionAuthorizer : IPlatformPermissionAuthorizer
    {
        public Task<bool> IsAllowedAsync(Guid tenantId, Guid userId, string role, ResolvedPlatformPermission permission,
            CancellationToken cancellationToken = default) => Task.FromResult(true);
    }
}
