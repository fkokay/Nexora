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

public sealed class TenantCustomPageEndpointsIntegrationTests
{
    internal static readonly Guid TenantA = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid TenantB = Guid.Parse("22222222-2222-2222-2222-222222222222");
    internal static readonly Guid UserA = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");

    [Fact]
    public async Task Custom_page_draft_preview_publish_history_and_replacement_are_tenant_scoped()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, UserA, "TenantAdmin");

        // A new page needs a template (5b-2); later drafts of the code may stay templateless.
        var definition = Json(MinimalFreeDefinition);
        var createdResponse = await client.PostAsJsonAsync("/api/custom-pages/drafts", new
        {
            code = "asset-dashboard",
            name = "Varlık panosu",
            description = "Özel sayfa",
            definition
        });
        Assert.Equal(HttpStatusCode.Created, createdResponse.StatusCode);
        using var created = JsonDocument.Parse(await createdResponse.Content.ReadAsStringAsync());
        var firstId = created.RootElement.GetProperty("id").GetGuid();
        Assert.Equal(1, created.RootElement.GetProperty("revision").GetInt32());
        Assert.False(created.RootElement.GetProperty("isPublished").GetBoolean());

        var preview = await client.GetFromJsonAsync<JsonElement>($"/api/custom-pages/{firstId}/preview");
        Assert.Equal("asset-dashboard", preview.GetProperty("code").GetString());
        Assert.Empty(preview.GetProperty("forms").EnumerateArray());
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/api/custom-pages/asset-dashboard/published")).StatusCode);

        var invalid = await client.PostAsJsonAsync("/api/custom-pages/drafts", new
        {
            code = "unsafe-page",
            name = "Unsafe",
            definition = JsonDocument.Parse("""{"schemaVersion":1,"components":[{"id":"bad","type":"heading","props":{"title":"<script>"}}]}""").RootElement
        });
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);

        var update = await client.PutAsJsonAsync($"/api/custom-pages/{firstId}", new
        {
            expectedRevision = 1,
            name = "Varlık panosu v2",
            description = "Güncellendi",
            definition = PageDefinition("Güncel başlık")
        });
        Assert.Equal(HttpStatusCode.OK, update.StatusCode);
        using var updated = JsonDocument.Parse(await update.Content.ReadAsStringAsync());
        Assert.Equal(2, updated.RootElement.GetProperty("revision").GetInt32());
        Assert.Equal(HttpStatusCode.Conflict, (await client.PutAsJsonAsync($"/api/custom-pages/{firstId}", new
        {
            expectedRevision = 1,
            name = "Eski sürüm",
            definition
        })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/custom-pages/{firstId}/publish", new { expectedRevision = 2 })).StatusCode);

        SetIdentity(client, TenantA, UserA, "TenantUser");
        var published = await client.GetFromJsonAsync<JsonElement>("/api/custom-pages/asset-dashboard/published");
        Assert.Equal(firstId, published.GetProperty("id").GetGuid());
        Assert.Equal("Varlık panosu v2", published.GetProperty("name").GetString());

        SetIdentity(client, TenantA, UserA, "TenantAdmin");
        var secondDraftResponse = await client.PostAsJsonAsync("/api/custom-pages/drafts", new
        {
            code = "asset-dashboard",
            name = "Yeni pano",
            definition = PageDefinition("Yeni sürüm")
        });
        Assert.Equal(HttpStatusCode.Created, secondDraftResponse.StatusCode);
        using var secondDraft = JsonDocument.Parse(await secondDraftResponse.Content.ReadAsStringAsync());
        var secondId = secondDraft.RootElement.GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/custom-pages/{secondId}/publish", new { expectedRevision = 1 })).StatusCode);
        var history = await client.GetFromJsonAsync<JsonElement[]>($"/api/custom-pages/{firstId}/history");
        Assert.Contains(history!, row => row.GetProperty("changeKind").GetString() == "Superseded");
        var listed = await client.GetFromJsonAsync<JsonElement[]>("/api/custom-pages");
        Assert.Equal(1, Assert.Single(listed!, row => row.GetProperty("id").GetGuid() == secondId).GetProperty("isPublished").GetBoolean() ? 1 : 0);
        Assert.DoesNotContain(listed!, row => row.GetProperty("id").GetGuid() == firstId);

        SetIdentity(client, TenantB, UserA, "TenantAdmin");
        Assert.Empty(await client.GetFromJsonAsync<JsonElement[]>("/api/custom-pages") ?? []);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/custom-pages/{secondId}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/api/custom-pages/asset-dashboard/published")).StatusCode);

        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        Assert.Equal(5, await db.AuditEvents.CountAsync(x => x.TenantId == TenantA && x.Action.StartsWith("custom-page.")));
        Assert.Empty(await db.TenantCustomPages.Where(x => x.TenantId == TenantB).ToListAsync());
    }

    [Fact]
    public async Task Custom_page_list_returns_template_and_level_for_list_pages_and_null_for_legacy()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, UserA, "TenantAdmin");
        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            db.TenantCustomPages.AddRange(
                new TenantCustomPage { TenantId = TenantA, Code = "a-liste", Name = "Liste", CreatedByUserId = UserA, UpdatedByUserId = UserA,
                    DefinitionJson = """{"schemaVersion":2,"template":{"name":"list"},"queries":[],"components":[{"id":"liste","type":"dataTable","props":{"slot":"list"}}]}""" },
                new TenantCustomPage { TenantId = TenantA, Code = "b-eski", Name = "Eski", CreatedByUserId = UserA, UpdatedByUserId = UserA,
                    DefinitionJson = """{"schemaVersion":2,"queries":[],"components":[]}""" });
            await db.SaveChangesAsync();
        }

        var items = await client.GetFromJsonAsync<JsonElement[]>("/api/custom-pages") ?? [];
        var list = items.Single(x => x.GetProperty("code").GetString() == "a-liste");
        var legacy = items.Single(x => x.GetProperty("code").GetString() == "b-eski");
        Assert.Equal("list", list.GetProperty("template").GetString());
        Assert.Equal(1, list.GetProperty("templateLevel").GetInt32());
        Assert.Equal(JsonValueKind.Null, legacy.GetProperty("template").ValueKind);
        Assert.Equal(JsonValueKind.Null, legacy.GetProperty("templateLevel").ValueKind);
    }

    private const string YeniSayfaKalipli = "Yeni sayfa bir kalıpla (Liste, Kayıt kartı, Belge ya da Serbest) oluşturulmalıdır.";
    private const string TemplatelessV2 = """{"schemaVersion":2,"queries":[],"components":[{"id":"heading_1","type":"heading","props":{"title":"Eski"}}]}""";

    private static JsonElement Json(string json) => JsonDocument.Parse(json).RootElement;

    private static async Task AssertNewPageRejectedAsync(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(YeniSayfaKalipli, body.GetProperty("error").GetString());
    }

    private static async Task<int> PageCountAsync(WebApplication app)
    {
        await using var scope = app.Services.CreateAsyncScope();
        return await scope.ServiceProvider.GetRequiredService<TenantDbContext>().TenantCustomPages.CountAsync();
    }

    [Fact]
    public async Task New_templateless_draft_is_rejected()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, UserA, "TenantAdmin");

        await AssertNewPageRejectedAsync(await client.PostAsJsonAsync("/api/custom-pages/drafts", new { code = "eski-pano", name = "Eski pano", definition = Json(TemplatelessV2) }));
        Assert.Equal(0, await PageCountAsync(app));
    }

    [Fact]
    public async Task New_schema_v1_draft_is_rejected()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, UserA, "TenantAdmin");

        await AssertNewPageRejectedAsync(await client.PostAsJsonAsync("/api/custom-pages/drafts", new { code = "eski-pano", name = "Eski pano", definition = PageDefinition("Eski") }));
        Assert.Equal(0, await PageCountAsync(app));
    }

    [Theory]
    [InlineData("list")]
    [InlineData("record")]
    [InlineData("free")]
    [InlineData("belge")]
    public async Task New_templated_draft_is_created(string template)
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, UserA, "TenantAdmin");
        var definition = template switch
        {
            "list" => """{"schemaVersion":2,"template":{"name":"list"},"queries":[{"id":"q1","name":"veri","kind":"read","sql":"SELECT 1 AS x","parameters":[],"runOn":"load"}],"components":[{"id":"t1","type":"dataTable","name":"t1","props":{"query":"q1","slot":"list"}}]}""",
            "record" => """{"schemaVersion":2,"template":{"name":"record"},"queries":[],"components":[{"id":"ozet","type":"recordHeader","name":"ozet","props":{"slot":"summary","title":"Kart"}},{"id":"sekmeler","type":"tabs","name":"sekmeler","props":{"slot":"tabs","tabs":["Genel=b1"]}},{"id":"b1","type":"formCard","name":"b1","props":{"slot":"section","inputs":["a1"]}},{"id":"a1","type":"input","name":"a1","props":{"slot":"field","label":"Ad"}}]}""",
            "free" => MinimalFreeDefinition,
            _ => TenantCustomPageSchemaBelgeTemplateTests.Page(new { name = "belge", document = "satis.siparis" }, TenantCustomPageSchemaBelgeTemplateTests.Minimal())
        };

        var response = await client.PostAsJsonAsync("/api/custom-pages/drafts", new { code = $"yeni-{template}", name = "Yeni", definition = Json(definition) });
        Assert.True(response.StatusCode == HttpStatusCode.Created, await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task New_draft_of_existing_templateless_page_is_allowed()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, UserA, "TenantAdmin");
        await TemplatelessPageSeed.SeedDraftAsync(app.Services, TenantA, UserA, "eski-pano", "Eski pano", TemplatelessV2, published: true);

        var response = await client.PostAsJsonAsync("/api/custom-pages/drafts", new { code = "eski-pano", name = "Eski pano v2", definition = Json(TemplatelessV2) });
        Assert.True(response.StatusCode == HttpStatusCode.Created, await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Archived_code_reuse_counts_as_new_page()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, UserA, "TenantAdmin");
        var id = await TemplatelessPageSeed.SeedDraftAsync(app.Services, TenantA, UserA, "eski-pano", "Eski pano", TemplatelessV2, published: true);
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/custom-pages/{id}")).StatusCode);

        await AssertNewPageRejectedAsync(await client.PostAsJsonAsync("/api/custom-pages/drafts", new { code = "eski-pano", name = "Eski pano", definition = Json(TemplatelessV2) }));
        Assert.Equal(1, await PageCountAsync(app));
    }

    [Fact]
    public async Task Existing_templateless_page_put_and_publish_still_work()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, UserA, "TenantAdmin");
        var id = await TemplatelessPageSeed.SeedDraftAsync(app.Services, TenantA, UserA, "eski-pano", "Eski pano", TemplatelessV2);

        var updated = await client.PutAsJsonAsync($"/api/custom-pages/{id}", new { expectedRevision = 1, name = "Eski pano", definition = PageDefinition("Güncel") });
        Assert.True(updated.StatusCode == HttpStatusCode.OK, await updated.Content.ReadAsStringAsync());
        var published = await client.PostAsJsonAsync($"/api/custom-pages/{id}/publish", new { expectedRevision = 2 });
        Assert.True(published.StatusCode == HttpStatusCode.OK, await published.Content.ReadAsStringAsync());
    }

    /// <summary>The smallest valid templated page: Serbest with one empty block.</summary>
    internal const string MinimalFreeDefinition =
        """{"schemaVersion":2,"template":{"name":"free"},"queries":[],"components":[{"id":"b1","type":"section","name":"b1","props":{"slot":"block","title":"Bölüm","columns":2,"members":[]}}]}""";

    private static object PageDefinition(string title) => new
    {
        schemaVersion = 1,
        components = new[] { new { id = "heading_1", type = "heading", props = new { title } } }
    };

    internal static async Task<WebApplication> StartApplicationAsync()
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        var databaseName = $"custom-page-{Guid.NewGuid():N}";
        builder.Services.AddDbContext<TenantDbContext>(options => options
            .UseInMemoryDatabase(databaseName)
            .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning)));
        // Published/preview pages check custom page access against Platform memberships.
        builder.Services.AddDbContext<PlatformDbContext>(options => options.UseInMemoryDatabase($"{databaseName}-platform"));
        builder.Services.AddAuthentication("report-test").AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("report-test", _ => { });
        builder.Services.AddSingleton<AIERP.Platform.Application.IPlatformPermissionAuthorizer, CustomizationTestPermissionAuthorizer>();
        builder.Services.AddAuthorization();

        var app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapTenantCustomPageEndpoints();
        await app.StartAsync();
        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        await db.Database.EnsureCreatedAsync();
        db.Tenants.AddRange(
            new Tenant { Id = TenantA, Name = "Tenant A", Slug = "tenant-a" },
            new Tenant { Id = TenantB, Name = "Tenant B", Slug = "tenant-b" });
        await db.SaveChangesAsync();
        var platform = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        await platform.Database.EnsureCreatedAsync();
        platform.Tenants.AddRange(
            new Tenant { Id = TenantA, Name = "Tenant A", Slug = "tenant-a" },
            new Tenant { Id = TenantB, Name = "Tenant B", Slug = "tenant-b" });
        platform.Users.Add(new AppUser { Id = UserA, Email = "user-a@example.test", DisplayName = "User A" });
        platform.TenantMemberships.AddRange(
            new TenantMembership { TenantId = TenantA, UserId = UserA, Role = "TenantAdmin" },
            new TenantMembership { TenantId = TenantB, UserId = UserA, Role = "TenantAdmin" });
        await platform.SaveChangesAsync();
        return app;
    }

    internal static void SetIdentity(HttpClient client, Guid tenant, Guid user, string role)
    {
        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Remove("X-Test-User");
        client.DefaultRequestHeaders.Remove("X-Test-Role");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", tenant.ToString());
        client.DefaultRequestHeaders.Add("X-Test-User", user.ToString());
        client.DefaultRequestHeaders.Add("X-Test-Role", role);
    }
}
