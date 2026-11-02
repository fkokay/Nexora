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

public sealed class WarehouseLocationScreenViewsIntegrationTests
{
    private static readonly Guid TenantA = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid TenantB = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid UserA = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private static readonly Guid UserB = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");

    [Fact]
    public async Task Warehouse_location_and_reconciliation_layouts_publish_per_tenant()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, UserA, "TenantAdmin");

        var expectedKeys = new Dictionary<string, string[]>(StringComparer.Ordinal)
        {
            ["inventory-warehouse-locations"] = ["code", "name", "parentLocation", "status", "actions"],
            ["inventory-warehouse-reconciliation"] = ["stockItemCode", "stockItemName", "warehouseQuantity", "locatedQuantity", "unlocatedQuantity", "unitCode"]
        };

        foreach (var (key, keys) in expectedKeys)
        {
            SetIdentity(client, TenantA, UserA, "TenantAdmin");
            var catalogs = await client.GetFromJsonAsync<JsonElement[]>("/api/screen-views/catalog");
            Assert.Contains(key, catalogs!.Select(item => item.GetProperty("key").GetString()));
            var catalog = Assert.Single(catalogs!, item => item.GetProperty("key").GetString() == key);
            var catalogFields = catalog.GetProperty("fields").EnumerateArray().ToArray();
            Assert.Equal(keys, catalogFields.Select(field => field.GetProperty("key").GetString()).ToArray());
            if (key == "inventory-warehouse-locations")
                Assert.True(catalogFields[^1].GetProperty("fixed").GetBoolean());

            var create = await client.PostAsJsonAsync($"/api/screen-views/{key}/draft", new { name = "Firma depo görünümü" });
            Assert.Equal(HttpStatusCode.Created, create.StatusCode);
            using var created = JsonDocument.Parse(await create.Content.ReadAsStringAsync());
            var draftId = created.RootElement.GetProperty("id").GetGuid();
            var fields = created.RootElement.GetProperty("fields").EnumerateArray()
                .Select(field => new
                {
                    key = field.GetProperty("key").GetString()!,
                    label = field.GetProperty("label").GetString()!,
                    visible = field.GetProperty("visible").GetBoolean(),
                    position = field.GetProperty("position").GetInt32()
                }).ToArray();
            var firstKey = key == "inventory-warehouse-locations" ? "name" : "stockItemName";
            var firstLabel = key == "inventory-warehouse-locations" ? "Raf / bölme adı" : "Malzeme";
            var hiddenKey = key == "inventory-warehouse-locations" ? "parentLocation" : "locatedQuantity";
            var customFields = fields.Select(field => new
            {
                field.key,
                label = field.key == firstKey ? firstLabel : field.label,
                visible = field.key == hiddenKey ? false : field.visible,
                position = field.key == firstKey ? 0 : field.position + 1
            }).ToArray();

            var update = await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new { expectedRevision = 1, name = "Firma depo görünümü", fields = customFields });
            Assert.Equal(HttpStatusCode.OK, update.StatusCode);
            Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/screen-views/{draftId}/publish", new { expectedRevision = 2 })).StatusCode);

            client.DefaultRequestHeaders.Remove("X-Test-Role");
            client.DefaultRequestHeaders.Add("X-Test-Role", "TenantUser");
            var active = await client.GetFromJsonAsync<JsonElement>($"/api/screen-views/{key}/active");
            Assert.True(active.GetProperty("isPublished").GetBoolean());
            Assert.Equal(firstKey, active.GetProperty("fields")[0].GetProperty("key").GetString());
            Assert.Equal(firstLabel, active.GetProperty("fields")[0].GetProperty("label").GetString());
            Assert.False(active.GetProperty("fields").EnumerateArray().Single(field => field.GetProperty("key").GetString() == hiddenKey).GetProperty("visible").GetBoolean());
            if (key == "inventory-warehouse-locations")
                Assert.True(active.GetProperty("fields")[active.GetProperty("fields").GetArrayLength() - 1].GetProperty("fixed").GetBoolean());

            SetIdentity(client, TenantB, UserB, "TenantAdmin");
            var otherTenant = await client.GetFromJsonAsync<JsonElement>($"/api/screen-views/{key}/active");
            Assert.False(otherTenant.GetProperty("isPublished").GetBoolean());
        }
    }

    private static async Task<WebApplication> StartApplicationAsync()
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        var databaseName = $"warehouse-screen-views-{Guid.NewGuid():N}";
        var databaseRoot = new InMemoryDatabaseRoot();
        builder.Services.AddDbContext<TenantDbContext>(options => options.UseInMemoryDatabase(databaseName, databaseRoot));
        builder.Services.AddAuthentication("warehouse-screen-view-test").AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("warehouse-screen-view-test", _ => { });
        builder.Services.AddAuthorization();
        var app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapTenantScreenViewEndpoints();
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
