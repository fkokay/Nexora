using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
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
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>
/// "Lot / Seri İzleme" standard through the <c>/api/system-pages</c> routes, with the real embedded standard set and InMemory
/// stores: the published definition and the first draft's import of the legacy <c>inventory-trace-balances</c> view.
/// </summary>
public sealed class InventoryTrackingStandardEndpointTests
{
    private static readonly Guid TenantA = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid Admin = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private static readonly Guid Mehmet = Guid.Parse("cccccccc-cccc-cccc-cccc-cccccccccccc");
    private const string ScreenKey = "inventory-tracking";
    private const string ViewKey = "inventory-trace-balances";

    [Fact]
    public async Task Runtime_map_lists_inventory_tracking_only_when_enabled()
    {
        await using (var app = await StartApplicationAsync(enabled: ["inventory-stock"]))
        {
            using var client = app.GetTestClient();
            SetIdentity(client, Mehmet, "TenantUser");
            var screens = (await client.GetFromJsonAsync<JsonElement>("/api/system-pages/runtime")).GetProperty("screens");
            Assert.False(screens.TryGetProperty(ScreenKey, out _));
        }
        await using (var app = await StartApplicationAsync(enabled: [ScreenKey]))
        {
            using var client = app.GetTestClient();
            SetIdentity(client, Mehmet, "TenantUser");
            var screen = Assert.Single((await client.GetFromJsonAsync<JsonElement>("/api/system-pages/runtime")).GetProperty("screens").EnumerateObject());
            Assert.Equal((ScreenKey, "standard"), (screen.Name, screen.Value.GetProperty("mode").GetString()));
        }
    }

    [Fact]
    public async Task Published_standard_serves_the_read_only_definition()
    {
        await using var app = await StartApplicationAsync(enabled: [ScreenKey]);
        using var client = app.GetTestClient();
        foreach (var (user, role) in new[] { (Mehmet, "TenantUser"), (Admin, "TenantAdmin") })
        {
            SetIdentity(client, user, role);
            var page = await client.GetFromJsonAsync<JsonElement>($"/api/system-pages/{ScreenKey}/published");
            Assert.Equal("@" + ScreenKey, page.GetProperty("code").GetString());
            Assert.Equal("Lot / Seri İzleme", page.GetProperty("name").GetString());
            Assert.Equal(2, page.GetProperty("standardVersion").GetInt32());
            var definitionJson = page.GetProperty("definitionJson").GetString()!;
            Assert.True(JsonNode.DeepEquals(JsonNode.Parse(SystemPageStandards.All[ScreenKey].DefinitionJson), JsonNode.Parse(definitionJson)));
            Assert.DoesNotContain("\"sql\"", definitionJson);
        }
    }

    [Fact]
    public async Task Draft_from_standard_imports_trace_balances_screen_view()
    {
        await using var app = await StartApplicationAsync();
        Assert.True(TenantScreenViewEndpoints.TryGetCatalogFields(ViewKey, out var fields));
        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            // The firm hid "Stok" and "Son hareket" in Görünümü düzenle.
            var layout = fields.Select((x, i) => new { key = x.Key, label = x.Label, visible = x.Key is not ("stockItem" or "lastMovementDate"), position = i }).ToArray();
            db.TenantScreenViews.Add(new TenantScreenView
            {
                TenantId = TenantA, ScreenKey = ViewKey, Name = "Firma görünümü", LayoutJson = JsonSerializer.Serialize(layout),
                IsPublished = true, CreatedByUserId = Admin, UpdatedByUserId = Admin
            });
            await db.SaveChangesAsync();
        }
        using var client = app.GetTestClient();
        SetIdentity(client, Admin, "TenantAdmin");

        var response = await client.PostAsync($"/api/system-pages/{ScreenKey}/draft", null);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var draft = await response.Content.ReadFromJsonAsync<JsonElement>();
        var definitionJson = draft.GetProperty("definitionJson").GetString()!;
        var props = JsonNode.Parse(definitionJson)!["components"]!.AsArray().Single(x => (string)x!["id"]! == "liste")!["props"]!;
        // Hidden fields drop their mapped columns; the unmapped code columns stay.
        Assert.Equal(new[] { "trackingCode", "trackingMode", "stockItemCode", "warehouseCode", "warehouseName", "quantityOnHand", "expiryDate" },
            props["columns"]!.AsArray().Select(x => (string)x!));
        Assert.Contains("\"detayKarti\"", definitionJson);
        Assert.True(TenantCustomPageSchema.Validate(definitionJson, out var error), error);
    }

    private static async Task<WebApplication> StartApplicationAsync(string[]? enabled = null)
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Configuration.AddInMemoryCollection((enabled ?? []).Select((key, i) =>
            new KeyValuePair<string, string?>($"SystemPages:StandardEnabled:{i}", key)));
        var suffix = Guid.NewGuid().ToString("N");
        builder.Services.AddDbContext<TenantDbContext>(options => options
            .UseInMemoryDatabase($"inventory-tracking-standard-tenant-{suffix}")
            .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning)));
        builder.Services.AddDbContext<PlatformDbContext>(options => options
            .UseInMemoryDatabase($"inventory-tracking-standard-platform-{suffix}")
            .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning)));
        builder.Services.AddAuthentication("report-test").AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("report-test", _ => { });
        builder.Services.AddSingleton<IPlatformPermissionAuthorizer, CustomizationTestPermissionAuthorizer>();
        builder.Services.AddSystemPages();
        builder.Services.AddSingleton<ITenantQueryConnectionFactory, UnusedQueryConnectionFactory>();
        builder.Services.AddAuthorization();
        builder.Services.AddRateLimiter(CustomPageQueryEndpoints.ConfigureRateLimiting);
        builder.Services.AddSingleton<CustomPageWriteRateLimiter>();

        var app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();
        app.UseRateLimiter();
        app.MapTenantCustomPageEndpoints();
        app.MapSystemPageEndpoints();
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

    private sealed class UnusedQueryConnectionFactory : ITenantQueryConnectionFactory
    {
        public Task<SqlConnection> OpenAsync(Guid tenantId, TenantQueryAccess access, CancellationToken cancellationToken) =>
            throw new InvalidOperationException("SQL is not reached in these tests.");
    }
}
