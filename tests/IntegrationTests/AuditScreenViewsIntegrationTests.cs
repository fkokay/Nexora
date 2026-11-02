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
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace AIERP.Api.IntegrationTests;

public sealed class AuditScreenViewsIntegrationTests
{
    private static readonly Guid TenantA = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid TenantB = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid UserA = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private static readonly Guid UserB = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");

    [Fact]
    public async Task Audit_event_layout_is_allowlisted_published_and_tenant_scoped()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, UserA, "TenantAdmin");

        var catalogs = await client.GetFromJsonAsync<JsonElement[]>("/api/screen-views/catalog");
        var catalog = Assert.Single(catalogs!, x => x.GetProperty("key").GetString() == "audit-events");
        var keys = catalog.GetProperty("fields").EnumerateArray().Select(x => x.GetProperty("key").GetString()).ToArray();
        Assert.Equal(new[] { "occurredAt", "user", "userId", "action", "resource", "eventId" }, keys);

        var create = await client.PostAsJsonAsync("/api/screen-views/audit-events/draft", new { name = "Denetim görünümüm" });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        using var created = JsonDocument.Parse(await create.Content.ReadAsStringAsync());
        var draftId = created.RootElement.GetProperty("id").GetGuid();
        var fields = created.RootElement.GetProperty("fields").EnumerateArray()
            .Select(x => new { key = x.GetProperty("key").GetString()!, label = x.GetProperty("label").GetString()!, visible = x.GetProperty("visible").GetBoolean(), position = x.GetProperty("position").GetInt32() })
            .ToArray();
        var customized = fields.Select(x => x.key switch
        {
            "action" => new { x.key, label = "Olay türü", visible = true, position = 0 },
            "occurredAt" => new { x.key, x.label, visible = x.visible, position = 1 },
            "user" => new { x.key, x.label, visible = x.visible, position = 2 },
            "userId" => new { x.key, label = x.label, visible = false, position = 3 },
            "resource" => new { x.key, x.label, visible = x.visible, position = 4 },
            _ => new { x.key, x.label, visible = x.visible, position = 5 }
        }).ToArray();

        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new { expectedRevision = 1, name = "Denetim görünümüm", fields = customized })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/screen-views/{draftId}/publish", new { expectedRevision = 2 })).StatusCode);

        SetIdentity(client, TenantA, UserA, "TenantUser");
        var active = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/audit-events/active");
        Assert.True(active.GetProperty("isPublished").GetBoolean());
        Assert.Equal("action", active.GetProperty("fields")[0].GetProperty("key").GetString());
        Assert.Equal("Olay türü", active.GetProperty("fields")[0].GetProperty("label").GetString());
        Assert.False(active.GetProperty("fields").EnumerateArray().Single(x => x.GetProperty("key").GetString() == "userId").GetProperty("visible").GetBoolean());

        SetIdentity(client, TenantB, UserB, "TenantUser");
        var otherTenant = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/audit-events/active");
        Assert.False(otherTenant.GetProperty("isPublished").GetBoolean());
        Assert.Equal("Tarih / saat", otherTenant.GetProperty("fields")[0].GetProperty("label").GetString());
    }

    private static async Task<WebApplication> StartApplicationAsync()
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        var databaseName = $"audit-screen-views-{Guid.NewGuid():N}";
        var databaseRoot = new InMemoryDatabaseRoot();
        builder.Services.AddDbContext<TenantDbContext>(options => options.UseInMemoryDatabase(databaseName, databaseRoot));
        builder.Services.AddAuthentication("audit-screen-view-test").AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("audit-screen-view-test", _ => { });
        builder.Services.AddAuthorization();
        var app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapTenantScreenViewEndpoints();
        await app.StartAsync();
        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        await db.Database.EnsureCreatedAsync();
        db.Tenants.AddRange(new Tenant { Id = TenantA, Name = "Tenant A", Slug = "tenant-a" }, new Tenant { Id = TenantB, Name = "Tenant B", Slug = "tenant-b" });
        await db.SaveChangesAsync();
        return app;
    }

    private static void SetIdentity(HttpClient client, Guid tenantId, Guid userId, string role)
    {
        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Remove("X-Test-User");
        client.DefaultRequestHeaders.Remove("X-Test-Role");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", tenantId.ToString());
        client.DefaultRequestHeaders.Add("X-Test-User", userId.ToString());
        client.DefaultRequestHeaders.Add("X-Test-Role", role);
    }
}
