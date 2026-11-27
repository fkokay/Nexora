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

public sealed class TenantCustomPagePublicationsIntegrationTests
{
    private static readonly Guid TenantA = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid TenantB = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid UserA = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");

    [Fact]
    public async Task Publications_lists_pending_drafts_and_published_history()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, UserA, "TenantAdmin");
        var firstId = await CreateAndPublishAsync(app, client, "asset-dashboard", "Pano 1");
        var secondId = await CreateAndPublishAsync(app, client, "asset-dashboard", "Pano 2");
        var draftId = await CreateDraftAsync(app, client, "other-page", "Taslak");

        var result = await client.GetFromJsonAsync<JsonElement>("/api/custom-pages/publications?take=100");
        var pending = result.GetProperty("pending").EnumerateArray().ToList();
        var history = result.GetProperty("history").EnumerateArray().ToList();
        var draft = Assert.Single(pending);
        Assert.Equal(draftId, draft.GetProperty("pageId").GetGuid());
        Assert.Equal("User A", draft.GetProperty("updatedByName").GetString());
        Assert.Equal(JsonValueKind.Null, draft.GetProperty("screenKey").ValueKind);
        Assert.Equal(2, history.Count);
        Assert.Equal(secondId, history[0].GetProperty("pageId").GetGuid());
        Assert.True(history[0].GetProperty("isCurrent").GetBoolean());
        Assert.Equal(firstId, history[1].GetProperty("pageId").GetGuid());
        Assert.False(history[1].GetProperty("isCurrent").GetBoolean());
        Assert.Equal("User A", history[0].GetProperty("changedByName").GetString());
        Assert.DoesNotContain("definition", result.GetRawText(), StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Publications_is_tenant_scoped()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, UserA, "TenantAdmin");
        await CreateAndPublishAsync(app, client, "asset-dashboard", "Pano");
        await CreateDraftAsync(app, client, "other-page", "Taslak");

        SetIdentity(client, TenantB, UserA, "TenantAdmin");
        var result = await client.GetFromJsonAsync<JsonElement>("/api/custom-pages/publications");
        Assert.Empty(result.GetProperty("pending").EnumerateArray());
        Assert.Empty(result.GetProperty("history").EnumerateArray());
    }

    [Fact]
    public async Task Publications_requires_customization_read()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, UserA, "TenantUser");
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/custom-pages/publications")).StatusCode);
        SetIdentity(client, TenantA, UserA, "TenantAdmin");
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/custom-pages/publications")).StatusCode);
    }

    [Fact]
    public async Task Restore_with_open_draft_returns_conflict()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, UserA, "TenantAdmin");
        var pageId = await CreateAndPublishAsync(app, client, "asset-dashboard", "Pano");
        await CreateDraftAsync(app, client, "asset-dashboard", "Yeni taslak");
        var history = await client.GetFromJsonAsync<JsonElement[]>($"/api/custom-pages/{pageId}/history");
        var revisionId = history!.First(x => x.GetProperty("changeKind").GetString() == "Published").GetProperty("id").GetGuid();

        var response = await client.PostAsync($"/api/custom-pages/{pageId}/restore/{revisionId}", null);
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.False(string.IsNullOrWhiteSpace(body.RootElement.GetProperty("error").GetString()));
    }

    private static async Task<Guid> CreateDraftAsync(WebApplication app, HttpClient client, string code, string name)
    {
        var response = await TemplatelessPageSeed.PostDraftAsync(app.Services, client, code, name,
            new { schemaVersion = 1, components = new[] { new { id = "heading_1", type = "heading", props = new { title = name } } } });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return doc.RootElement.GetProperty("id").GetGuid();
    }

    private static async Task<Guid> CreateAndPublishAsync(WebApplication app, HttpClient client, string code, string name)
    {
        var id = await CreateDraftAsync(app, client, code, name);
        var publish = await client.PostAsJsonAsync($"/api/custom-pages/{id}/publish", new { expectedRevision = 1 });
        Assert.Equal(HttpStatusCode.OK, publish.StatusCode);
        await Task.Delay(5); // keep CreatedAt strictly ordered
        return id;
    }

    private static async Task<WebApplication> StartApplicationAsync()
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        var databaseName = $"custom-page-pub-{Guid.NewGuid():N}";
        builder.Services.AddDbContext<TenantDbContext>(options => options
            .UseInMemoryDatabase(databaseName)
            .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning)));
        builder.Services.AddDbContext<PlatformDbContext>(options => options.UseInMemoryDatabase($"{databaseName}-platform"));
        builder.Services.AddAuthentication("report-test").AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("report-test", _ => { });
        builder.Services.AddSingleton<IPlatformPermissionAuthorizer, DenyCustomizationForUsersAuthorizer>();
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
        platform.TenantMemberships.Add(new TenantMembership { TenantId = TenantA, UserId = UserA, Role = "TenantAdmin" });
        await platform.SaveChangesAsync();
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

    /// <summary>Stands in for a tenant Deny rule: TenantAdmin passes, TenantUser is denied customization permissions.</summary>
    private sealed class DenyCustomizationForUsersAuthorizer : IPlatformPermissionAuthorizer
    {
        public Task<bool> IsAllowedAsync(Guid tenantId, Guid userId, string role, ResolvedPlatformPermission permission, CancellationToken cancellationToken = default) =>
            Task.FromResult(role == "TenantAdmin");
    }
}
