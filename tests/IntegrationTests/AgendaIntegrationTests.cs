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
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace AIERP.Api.IntegrationTests;

public sealed class AgendaIntegrationTests
{
    private static readonly Guid TenantA = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid TenantB = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid OtherUser = Guid.Parse("dddddddd-dddd-dddd-dddd-dddddddddddd");
    private const string Range = "?from=2026-11-12T00:00:00%2B03:00&to=2026-11-19T00:00:00%2B03:00";

    [Fact]
    public async Task Agenda_items_are_validated_and_scoped_to_tenant_and_user()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/agenda/")).StatusCode);

        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        Assert.Equal(HttpStatusCode.BadRequest,
            (await client.PostAsJsonAsync("/api/agenda/", new { title = "  ", startsAt = "2026-11-12T10:00:00+03:00" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await client.PostAsJsonAsync("/api/agenda/", new { title = "Tedarikçiyi ara" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await client.GetAsync("/api/agenda/?from=2026-11-12T00:00:00Z&to=2026-11-11T00:00:00Z")).StatusCode);

        var later = await client.PostAsJsonAsync("/api/agenda/", new { title = "Haftalık toplantı", startsAt = "2026-11-14T09:30:00+03:00" });
        Assert.Equal(HttpStatusCode.Created, later.StatusCode);
        var create = await client.PostAsJsonAsync("/api/agenda/",
            new { title = "  Tedarikçiyi ara  ", startsAt = "2026-11-12T14:00:00+03:00", notes = "Fiyat teklifi" });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        using var created = JsonDocument.Parse(await create.Content.ReadAsStringAsync());
        var id = created.RootElement.GetProperty("id").GetGuid();
        Assert.Equal("Tedarikçiyi ara", created.RootElement.GetProperty("title").GetString());
        Assert.False(created.RootElement.GetProperty("isCompleted").GetBoolean());

        var list = await client.GetFromJsonAsync<JsonElement>($"/api/agenda/{Range}");
        Assert.Equal(new[] { "Tedarikçiyi ara", "Haftalık toplantı" },
            list.EnumerateArray().Select(x => x.GetProperty("title").GetString() ?? "").ToArray());

        var complete = await client.PatchAsJsonAsync($"/api/agenda/{id}/completion", new { isCompleted = true });
        complete.EnsureSuccessStatusCode();
        using (var completed = JsonDocument.Parse(await complete.Content.ReadAsStringAsync()))
        {
            Assert.True(completed.RootElement.GetProperty("isCompleted").GetBoolean());
            Assert.NotEqual(JsonValueKind.Null, completed.RootElement.GetProperty("completedAt").ValueKind);
        }

        client.DefaultRequestHeaders.Add("X-Test-User", OtherUser.ToString());
        Assert.Empty(await client.GetFromJsonAsync<JsonElement[]>($"/api/agenda/{Range}") ?? []);
        Assert.Equal(HttpStatusCode.NotFound, (await client.DeleteAsync($"/api/agenda/{id}")).StatusCode);
        client.DefaultRequestHeaders.Remove("X-Test-User");

        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantB.ToString());
        Assert.Empty(await client.GetFromJsonAsync<JsonElement[]>($"/api/agenda/{Range}") ?? []);
        Assert.Equal(HttpStatusCode.NotFound,
            (await client.PatchAsJsonAsync($"/api/agenda/{id}/completion", new { isCompleted = false })).StatusCode);

        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/agenda/{id}")).StatusCode);
        var remaining = await client.GetFromJsonAsync<JsonElement>($"/api/agenda/{Range}");
        Assert.Equal(1, remaining.GetArrayLength());

        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        Assert.Equal(2, await db.AuditEvents.CountAsync(x => x.TenantId == TenantA && x.Action == "erp.agenda-item.created"));
        Assert.Equal(1, await db.AuditEvents.CountAsync(x => x.TenantId == TenantA && x.Action == "erp.agenda-item.deleted"));
    }

    [Theory]
    [InlineData("GET", "/api/agenda", "/api/agenda/", "erp.agenda.read")]
    [InlineData("POST", "/api/agenda", "/api/agenda/", "erp.agenda.create")]
    [InlineData("PATCH", "/api/agenda/7d7b5b0e-7c1f-4c38-9d55-2a8f1f7b3a10/completion", "/api/agenda/{id:guid}/completion", "erp.agenda.update")]
    [InlineData("DELETE", "/api/agenda/7d7b5b0e-7c1f-4c38-9d55-2a8f1f7b3a10", "/api/agenda/{id:guid}", "erp.agenda.delete")]
    public void Agenda_routes_resolve_to_the_agenda_permission_catalog_entry(string method, string path, string routePattern, string expectedCode)
    {
        Assert.True(PlatformPermissionCatalog.TryResolve(path, method, routePattern, new Dictionary<string, string?>(),
            TenantA, Guid.NewGuid(), "TenantUser", out var resolved));
        Assert.Equal(expectedCode, resolved!.Permission.Code);
    }

    private static async Task<WebApplication> StartApplicationAsync()
    {
        var databaseName = $"agenda-{Guid.NewGuid():N}";
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Services.AddDbContext<TenantDbContext>(options => options.UseInMemoryDatabase(databaseName));
        builder.Services.AddAuthentication("report-test").AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("report-test", _ => { });
        builder.Services.AddAuthorization();
        var app = builder.Build();
        app.UseAuthentication(); app.UseAuthorization(); app.MapAgendaEndpoints();
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
}
