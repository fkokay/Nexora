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
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace AIERP.Api.IntegrationTests;

public sealed class CustomMenuEndpointsIntegrationTests
{
    private static readonly Guid TenantA = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid TenantB = Guid.Parse("22222222-2222-2222-2222-222222222222");

    [Fact]
    public async Task Custom_menu_builder_is_tenant_scoped_admin_managed_and_rejects_arbitrary_routes()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/custom-menus/")).StatusCode);

        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        var targets = await client.GetFromJsonAsync<JsonElement[]>("/api/custom-menus/targets");
        Assert.Contains(targets!, target => target.GetProperty("page").GetString() == "reports");

        var invalid = await client.PostAsJsonAsync("/api/custom-menus/", new { code = "evil", label = "External", targetPage = "javascript:alert(1)" });
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);
        var create = await client.PostAsJsonAsync("/api/custom-menus/", new { code = "warehouse-shortcut", label = "Depolarım", targetPage = "inventory-warehouses" });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        using var created = JsonDocument.Parse(await create.Content.ReadAsStringAsync());
        var firstId = created.RootElement.GetProperty("id").GetGuid();
        Assert.Equal("warehouse-shortcut", created.RootElement.GetProperty("code").GetString());
        Assert.Equal("Depo Yönetimi", created.RootElement.GetProperty("targetLabel").GetString());
        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            Assert.Equal(1, await db.TenantCustomMenuEntries.CountAsync(x => x.TenantId == TenantA && x.Code == "warehouse-shortcut"));
        }
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync("/api/custom-menus/", new { code = "warehouse-shortcut", label = "Yinelenen", targetPage = "reports" })).StatusCode);
        var second = await client.PostAsJsonAsync("/api/custom-menus/", new { code = "report-shortcut", label = "Yönetim raporları", targetPage = "reports" });
        second.EnsureSuccessStatusCode();
        using var secondCreated = JsonDocument.Parse(await second.Content.ReadAsStringAsync());
        var secondId = secondCreated.RootElement.GetProperty("id").GetGuid();

        client.DefaultRequestHeaders.Add("X-Test-Role", "TenantUser");
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PutAsJsonAsync($"/api/custom-menus/{firstId}", new { code = "renamed", label = "Rapor", targetPage = "reports" })).StatusCode);
        var userVisible = await client.GetFromJsonAsync<JsonElement[]>("/api/custom-menus/");
        Assert.Equal(2, userVisible!.Length);

        client.DefaultRequestHeaders.Remove("X-Test-Role");
        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantB.ToString());
        Assert.Empty((await client.GetFromJsonAsync<JsonElement[]>("/api/custom-menus/"))!);
        Assert.Equal(HttpStatusCode.NotFound, (await client.DeleteAsync($"/api/custom-menus/{firstId}")).StatusCode);

        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync("/api/custom-menus/order", new { entryIds = new[] { secondId, firstId } })).StatusCode);
        var ordered = await client.GetFromJsonAsync<JsonElement[]>("/api/custom-menus/");
        Assert.Equal(secondId, ordered![0].GetProperty("id").GetGuid());
        var update = await client.PutAsJsonAsync($"/api/custom-menus/{firstId}", new { code = "warehouse-shortcut", label = "Depo alanım", targetPage = "inventory-stock" });
        update.EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/custom-menus/{firstId}")).StatusCode);
        await using var auditScope = app.Services.CreateAsyncScope();
        var auditDb = auditScope.ServiceProvider.GetRequiredService<TenantDbContext>();
        Assert.Equal(5, await auditDb.AuditEvents.CountAsync(x => x.TenantId == TenantA
            && x.Action.StartsWith("erp.custom-menu.")));
    }

    [Fact]
    public async Task Standard_menu_layout_is_tenant_scoped_versioned_and_admin_managed()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        var initial = await client.GetFromJsonAsync<JsonElement>("/api/custom-menus/standard/");
        Assert.Equal(0, initial.GetProperty("revision").GetInt32());
        var items = initial.GetProperty("items").EnumerateArray().Select(x => new {
            page = x.GetProperty("page").GetString(),
            label = x.GetProperty("page").GetString() == "customers" ? "Müşterilerim" : (string?)null
        }).ToArray();
        Assert.Contains(items, x => x.page == "customers");
        var changed = items.ToArray();
        var customerIndex = Array.FindIndex(changed, x => x.page == "customers");
        var nextIndex = customerIndex + 1;
        (changed[customerIndex], changed[nextIndex]) = (changed[nextIndex], changed[customerIndex]);
        client.DefaultRequestHeaders.Add("X-Test-Role", "TenantUser");
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PutAsJsonAsync("/api/custom-menus/standard/", new { expectedRevision = 0, items = changed })).StatusCode);
        client.DefaultRequestHeaders.Remove("X-Test-Role");
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync("/api/custom-menus/standard/", new { expectedRevision = 0, items = changed })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PutAsJsonAsync("/api/custom-menus/standard/", new { expectedRevision = 0, items = changed })).StatusCode);
        var active = await client.GetFromJsonAsync<JsonElement>("/api/custom-menus/standard/");
        Assert.Equal(1, active.GetProperty("revision").GetInt32());
        var rows = active.GetProperty("items").EnumerateArray().ToArray();
        Assert.Equal("Müşterilerim", rows.Single(x => x.GetProperty("page").GetString() == "customers").GetProperty("label").GetString());
        Assert.True(Array.FindIndex(rows, x => x.GetProperty("page").GetString() == "customer-create") < Array.FindIndex(rows, x => x.GetProperty("page").GetString() == "customers"));
        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantB.ToString());
        var other = await client.GetFromJsonAsync<JsonElement>("/api/custom-menus/standard/");
        Assert.Equal(0, other.GetProperty("revision").GetInt32());
        Assert.Equal(JsonValueKind.Null, other.GetProperty("items").EnumerateArray().Single(x => x.GetProperty("page").GetString() == "customers").GetProperty("label").ValueKind);
    }

    private static async Task<WebApplication> StartApplicationAsync()
    {
        var databaseName = $"custom-menu-{Guid.NewGuid():N}";
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Services.AddDbContext<TenantDbContext>(options => options.UseInMemoryDatabase(databaseName));
        builder.Services.AddAuthentication("report-test").AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("report-test", _ => { });
        builder.Services.AddSingleton<AIERP.Platform.Application.IPlatformPermissionAuthorizer, CustomizationTestPermissionAuthorizer>();
        builder.Services.AddAuthorization();
        var app = builder.Build();
        app.UseAuthentication(); app.UseAuthorization(); app.MapCustomMenuEndpoints();
        await app.StartAsync();
        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        await db.Database.EnsureCreatedAsync();
        db.Tenants.AddRange(new Tenant { Id = TenantA, Name = "Tenant A", Slug = "tenant-a" }, new Tenant { Id = TenantB, Name = "Tenant B", Slug = "tenant-b" });
        await db.SaveChangesAsync();
        return app;
    }
}
