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
    private static readonly Guid TenantA = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid TenantB = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid UserA = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");

    [Fact]
    public async Task Custom_page_draft_preview_publish_history_and_replacement_are_tenant_scoped()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, UserA, "TenantAdmin");

        var definition = PageDefinition("Varlık panosu");
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

    private static object PageDefinition(string title) => new
    {
        schemaVersion = 1,
        components = new[] { new { id = "heading_1", type = "heading", props = new { title } } }
    };

    private static async Task<WebApplication> StartApplicationAsync()
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        var databaseName = $"custom-page-{Guid.NewGuid():N}";
        builder.Services.AddDbContext<TenantDbContext>(options => options
            .UseInMemoryDatabase(databaseName)
            .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning)));
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
