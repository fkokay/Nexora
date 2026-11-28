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
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>
/// Proje 4 "Stok Kartları" standard through the <c>/api/system-pages</c> routes, with the real embedded standard set, InMemory
/// stores and the <c>SystemPages:StandardEnabled</c> switch.
/// </summary>
public sealed class InventoryStockStandardEndpointTests
{
    private static readonly Guid TenantA = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid Admin = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private static readonly Guid Mehmet = Guid.Parse("cccccccc-cccc-cccc-cccc-cccccccccccc");
    private static readonly Guid Outsider = Guid.Parse("dddddddd-dddd-dddd-dddd-dddddddddddd");
    private const string ScreenKey = "inventory-stock";

    [Fact]
    public async Task Runtime_map_lists_inventory_stock_only_when_enabled()
    {
        await using (var app = await StartApplicationAsync())
        {
            using var client = app.GetTestClient();
            SetIdentity(client, Mehmet, "TenantUser");
            Assert.Empty((await client.GetFromJsonAsync<JsonElement>("/api/system-pages/runtime")).GetProperty("screens").EnumerateObject());
        }

        await using (var app = await StartApplicationAsync(enabled: ["inventory-warehouses"]))
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
            Assert.Equal(ScreenKey, screen.Name);
            Assert.Equal("standard", screen.Value.GetProperty("mode").GetString());
        }
    }

    [Fact]
    public async Task Published_standard_serves_definition_with_member_write_rights()
    {
        await using var app = await StartApplicationAsync(enabled: [ScreenKey]);
        using var client = app.GetTestClient();

        foreach (var (user, role) in new[] { (Mehmet, "TenantUser"), (Admin, "TenantAdmin") })
        {
            SetIdentity(client, user, role);
            var page = await client.GetFromJsonAsync<JsonElement>($"/api/system-pages/{ScreenKey}/published");
            Assert.Equal(SystemPageStandards.SyntheticId(ScreenKey), page.GetProperty("id").GetGuid());
            Assert.Equal("@" + ScreenKey, page.GetProperty("code").GetString());
            Assert.Equal("Stok Kartları", page.GetProperty("name").GetString());
            Assert.Equal("standard", page.GetProperty("source").GetString());
            Assert.Equal(3, page.GetProperty("standardVersion").GetInt32());
            var definitionJson = page.GetProperty("definitionJson").GetString()!;
            Assert.True(JsonNode.DeepEquals(JsonNode.Parse(SystemPageStandards.All[ScreenKey].DefinitionJson), JsonNode.Parse(definitionJson)));
            Assert.DoesNotContain("\"sql\"", definitionJson);
            // Operation-only: page write rights equal view rights; the ERP endpoints authorize every movement and card write.
            var rights = page.GetProperty("rights");
            Assert.Equal((true, true, true, true), (rights.GetProperty("view").GetBoolean(), rights.GetProperty("insert").GetBoolean(),
                rights.GetProperty("update").GetBoolean(), rights.GetProperty("delete").GetBoolean()));
        }

        SetIdentity(client, Outsider, "TenantUser");
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"/api/system-pages/{ScreenKey}/published")).StatusCode);
    }

    [Fact]
    public async Task Draft_from_standard_imports_inventory_stock_screen_view()
    {
        await using var app = await StartApplicationAsync();
        Assert.True(TenantScreenViewEndpoints.TryGetCatalogFields(ScreenKey, out var fields));
        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            var layout = fields.Select((x, i) => new { key = x.Key, label = x.Label, visible = x.Key != "category", position = i }).ToArray();
            Assert.Contains(layout, x => x.key == "category" && x.label == "Kategori");
            db.TenantScreenViews.Add(new TenantScreenView
            {
                TenantId = TenantA, ScreenKey = ScreenKey, Name = "Firma görünümü", LayoutJson = JsonSerializer.Serialize(layout),
                IsPublished = true, CreatedByUserId = Admin, UpdatedByUserId = Admin
            });
            await db.SaveChangesAsync();
        }
        using var client = app.GetTestClient();
        SetIdentity(client, Admin, "TenantAdmin");

        var response = await client.PostAsync($"/api/system-pages/{ScreenKey}/draft", null);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var draft = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(ScreenKey, draft.GetProperty("screenKey").GetString());
        var definitionJson = draft.GetProperty("definitionJson").GetString()!;
        var props = JsonNode.Parse(definitionJson)!["components"]!.AsArray().Single(x => (string)x!["id"]! == "liste")!["props"]!;
        var columns = props["columns"]!.AsArray().Select(x => (string)x!).ToArray();
        Assert.Equal(new[]
        {
            "balance.code", "balance.name", "balance.quantityOnHand", "balance.reservedQuantity", "balance.availableQuantity",
            "balance.minimumStock", "balance.valuationAmountBase", "balance.unvaluedQuantity", "status"
        }, columns);
        // The rest of the standard is untouched: the movement dialog and its queries come along.
        Assert.Contains("\"hareketPenceresi\"", definitionJson);
        Assert.Contains("\"hareketEkle\"", definitionJson);
        Assert.True(TenantCustomPageSchema.Validate(definitionJson, out var error), error);
    }

    /// <summary>
    /// The movement body the standard sends for an untracked card: the hidden tracking grid still binds <c>[]</c>. The 2xx
    /// round trip needs SQL Server (the handler locks rows with <c>FromSqlInterpolated</c>), see
    /// <see cref="InventoryStockStandardMovementSqlAcceptanceTests"/>; this part runs everywhere.
    /// </summary>
    [Fact]
    public void Untracked_movement_body_with_empty_tracking_list_validates()
    {
        var body = """{"entryDate":"2026-11-18","direction":"Receipt","quantity":2,"description":"Standart sayfa girişi","tracking":[]}""";
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        options.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter());
        var request = JsonSerializer.Deserialize<InventoryTransactionWriteRequest>(body, options)!;
        Assert.NotNull(request.Tracking);
        Assert.Empty(request.Tracking!);
        Assert.Null(InventoryValidation.Validate(request));
    }

    private static async Task<WebApplication> StartApplicationAsync(string[]? enabled = null)
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Configuration.AddInMemoryCollection((enabled ?? []).Select((key, i) =>
            new KeyValuePair<string, string?>($"SystemPages:StandardEnabled:{i}", key)));
        var suffix = Guid.NewGuid().ToString("N");
        builder.Services.AddDbContext<TenantDbContext>(options => options
            .UseInMemoryDatabase($"inventory-stock-standard-tenant-{suffix}")
            .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning)));
        builder.Services.AddDbContext<PlatformDbContext>(options => options
            .UseInMemoryDatabase($"inventory-stock-standard-platform-{suffix}")
            .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning)));
        builder.Services.AddAuthentication("report-test").AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("report-test", _ => { });
        builder.Services.AddSingleton<IPlatformPermissionAuthorizer, CustomizationTestPermissionAuthorizer>();
        // The Program.cs registration with the real embedded standard set.
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

/// <summary>
/// <c>Untracked_movement_accepts_empty_tracking_list</c>: the body the standard's <c>hareketEkle</c> sends for a <c>None</c> card,
/// with the hidden list grid's <c>tracking: []</c>, is accepted by the real route. The movement handler locks the card and the
/// warehouse with SQL Server row hints, so this needs a disposable SQL Server (skipped otherwise).
/// </summary>
[Collection("SQL Server acceptance")]
public sealed class InventoryStockStandardMovementSqlAcceptanceTests
{
    private static readonly Guid TenantId = Guid.NewGuid();
    private static readonly Guid UserId = Guid.NewGuid();

    [SqlServerAcceptanceFact]
    public async Task Untracked_movement_accepts_empty_tracking_list()
    {
        var configuredConnection = Environment.GetEnvironmentVariable("AIERP_REPORT_TEST_SQL_CONNECTION_STRING");
        Assert.False(string.IsNullOrWhiteSpace(configuredConnection));
        var suffix = Guid.NewGuid().ToString("N");
        var platformConnection = BuildDatabaseConnection(configuredConnection!, $"AIERP_StockStandardPlatform_{suffix}");
        var tenantConnection = BuildDatabaseConnection(configuredConnection!, $"AIERPTenant_{TenantId:N}");
        var studioConnection = BuildDatabaseConnection(configuredConnection!, $"AIERP_StockStandardStudio_{suffix}");
        var platformCreated = false;
        var tenantCreated = false;
        SqlAcceptanceTenantCredential? tenantCredential = null;
        try
        {
            var platformOptions = new DbContextOptionsBuilder<PlatformDbContext>().UseSqlServer(platformConnection).Options;
            var tenantOptions = new DbContextOptionsBuilder<TenantDbContext>().UseSqlServer(tenantConnection).Options;
            await using var platformDb = new PlatformDbContext(platformOptions);
            await using var tenantDb = new TenantDbContext(tenantOptions);
            platformCreated = await platformDb.Database.EnsureCreatedAsync();
            tenantCreated = await tenantDb.Database.EnsureCreatedAsync();
            Assert.True(platformCreated);
            Assert.True(tenantCreated);
            tenantCredential = await SqlAcceptanceTenantCredential.CreateAsync(configuredConnection!, TenantId);

            var tenant = new Tenant { Id = TenantId, Name = "Stock standard acceptance", Slug = $"stock-standard-{suffix}" };
            var warehouse = new Warehouse { TenantId = TenantId, Tenant = tenant, Code = "WH-STD", Name = "Standard warehouse" };
            var stockItem = new StockItem { TenantId = TenantId, Tenant = tenant, Code = "SKU-STD", Name = "Untracked item", UnitCode = "EA",
                TrackingMode = InventoryTrackingMode.None };
            platformDb.Tenants.Add(tenant);
            platformDb.Users.Add(new AppUser { Id = UserId, Email = $"stock-standard-{suffix}@example.invalid", DisplayName = "Synthetic Tenant User", PasswordHash = "test" });
            platformDb.TenantMemberships.Add(new TenantMembership { TenantId = TenantId, UserId = UserId, Role = "TenantUser" });
            platformDb.TenantDatabaseCatalog.Add(new TenantDatabaseCatalogEntry
            {
                TenantId = TenantId, Tenant = tenant, DatabaseName = new SqlConnectionStringBuilder(tenantConnection).InitialCatalog,
                State = TenantDatabaseProvisioningState.Ready, ReadyAt = DateTimeOffset.UtcNow
            });
            await platformDb.SaveChangesAsync();
            tenantDb.Tenants.Add(tenant);
            tenantDb.Warehouses.Add(warehouse);
            tenantDb.StockItems.Add(stockItem);
            await tenantDb.SaveChangesAsync();

            using var startupConfiguration = ProcessEnvironmentOverride.Push(new Dictionary<string, string?>
            {
                ["Authentication__SigningKey"] = "synthetic-stock-standard-acceptance-key-at-least-32-bytes",
                ["PluginHost__SigningKey"] = "different-synthetic-plugin-key-at-least-32-bytes-long",
                ["Authentication__Issuer"] = "AIERP",
                ["Authentication__Audience"] = "AIERP",
                ["ConnectionStrings__Platform"] = platformConnection,
                ["ConnectionStrings__Tenant"] = tenantConnection,
                ["ConnectionStrings__AIStudio"] = studioConnection,
                ["Database__SeparationEnabled"] = "true",
                ["Database__ApplyMigrationsOnStartup"] = "false"
            });
            using var factory = new StockStandardApiFactory(platformConnection, tenantConnection, studioConnection, tenantCredential.CredentialReader);
            using var client = factory.CreateClient();
            client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantId.ToString("D"));
            client.DefaultRequestHeaders.Add("X-Test-User", UserId.ToString("D"));
            client.DefaultRequestHeaders.Add("X-Test-Role", "TenantUser");

            // The exact body shape of hareketEkle with the tracking grid hidden: empty optional values are omitted, tracking is [].
            var response = await client.PostAsJsonAsync($"/api/warehouses/{warehouse.Id:D}/stock/{stockItem.Id:D}/transactions", new
            {
                entryDate = "2026-11-18", direction = "Receipt", quantity = 2m, description = "Standart sayfa girişi",
                tracking = Array.Empty<object>()
            });
            Assert.True(response.IsSuccessStatusCode, $"{(int)response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
            var movement = await tenantDb.InventoryTransactions.AsNoTracking().SingleAsync(x => x.TenantId == TenantId && x.StockItemId == stockItem.Id);
            Assert.Equal(2m, movement.Quantity);
            Assert.Empty(await tenantDb.InventoryTransactionTraces.AsNoTracking().Where(x => x.InventoryTransactionId == movement.Id).ToListAsync());
        }
        finally
        {
            if (tenantCreated)
            {
                await using var cleanup = new TenantDbContext(new DbContextOptionsBuilder<TenantDbContext>().UseSqlServer(tenantConnection).Options);
                await cleanup.Database.EnsureDeletedAsync();
            }
            if (platformCreated)
            {
                await using var cleanup = new PlatformDbContext(new DbContextOptionsBuilder<PlatformDbContext>().UseSqlServer(platformConnection).Options);
                await cleanup.Database.EnsureDeletedAsync();
            }
            if (tenantCredential is not null) await tenantCredential.DisposeAsync();
        }
    }

    internal static string BuildDatabaseConnection(string source, string databaseName) =>
        new SqlConnectionStringBuilder(source) { InitialCatalog = databaseName, ConnectTimeout = 15, TrustServerCertificate = true }.ConnectionString;

    internal sealed class ProcessEnvironmentOverride(IReadOnlyDictionary<string, string?> previousValues) : IDisposable
    {
        public static ProcessEnvironmentOverride Push(IReadOnlyDictionary<string, string?> values)
        {
            var previous = values.Keys.ToDictionary(key => key, Environment.GetEnvironmentVariable);
            foreach (var (key, value) in values) Environment.SetEnvironmentVariable(key, value);
            return new ProcessEnvironmentOverride(previous);
        }

        public void Dispose()
        {
            foreach (var (key, value) in previousValues) Environment.SetEnvironmentVariable(key, value);
        }
    }

    internal sealed class StockStandardApiFactory(string platformConnection, string tenantConnection, string studioConnection,
        ITenantSqlCredentialReader credentialReader) : WebApplicationFactory<ApiEntryPointMarker>
    {
        protected override IHost CreateHost(IHostBuilder builder)
        {
            builder.ConfigureHostConfiguration(configuration => configuration.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Vault:Address"] = "https://vault.test",
                ["Vault:TenantSqlCredentialReader:RoleId"] = "stock-standard-test-role",
                ["Vault:TenantSqlCredentialReader:SecretId"] = "stock-standard-test-secret"
            }));
            return base.CreateHost(builder);
        }

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Production);
            builder.ConfigureAppConfiguration((_, configuration) => configuration.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Authentication:SigningKey"] = "synthetic-stock-standard-acceptance-key-at-least-32-bytes",
                ["PluginHost:SigningKey"] = "different-synthetic-plugin-key-at-least-32-bytes-long",
                ["Authentication:Issuer"] = "AIERP", ["Authentication:Audience"] = "AIERP",
                ["ConnectionStrings:Platform"] = platformConnection, ["ConnectionStrings:Tenant"] = tenantConnection,
                ["ConnectionStrings:AIStudio"] = studioConnection,
                ["Database:SeparationEnabled"] = "true", ["Database:ApplyMigrationsOnStartup"] = "false"
            }));
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<ITenantSqlCredentialReader>();
                services.AddSingleton(credentialReader);
                services.AddAuthentication("report-test").AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("report-test", _ => { });
                foreach (var worker in services.Where(x => x.ServiceType == typeof(IHostedService)
                             && x.ImplementationType?.Name is "IntegrationOperationWorker" or "AuditRetentionWorker" or "TcmbExchangeRateWorker").ToArray())
                    services.Remove(worker);
            });
        }
    }
}
