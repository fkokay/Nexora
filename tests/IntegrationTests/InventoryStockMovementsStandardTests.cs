using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using AIERP.Api;
using AIERP.Api.IntegrationTests;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Xunit;

/// <summary>
/// "Stok Hareketleri" standard (inventory-stock-movements): the legacy InventoryMovementsPage as a system page. A stock card
/// lookup and a warehouse choice ("Tüm depolar" or one warehouse) drive one server-paged movement list read through
/// stok.hareket.gecmisi; the list follows the "Görünümü düzenle" view <c>inventory-movement-history</c>.
/// </summary>
public sealed class InventoryStockMovementsStandardTests
{
    private const string Key = "inventory-stock-movements";
    private static readonly string[] ViewFields = ["entryDate", "direction", "quantity", "warehouse", "storageLocation", "tracking", "description", "unitCostBase"];

    [Fact]
    public void Header_is_preview_version_1_on_the_standard_menu()
    {
        var standard = SystemPageStandards.All[Key];
        Assert.Equal((1, "preview"), (standard.Version, standard.Stage));
        Assert.Equal("Stok Hareketleri", standard.Title);
        Assert.Equal("Bir stok seçerek depo hareket geçmişini görüntüleyin.", standard.Description);
        Assert.Equal("Stok & Depo", standard.Module);
        Assert.Contains(Key, StandardMenuEndpoints.PageKeys);
        Assert.True(TenantCustomPageSchema.Validate(standard.DefinitionJson, out var error), error);
        Assert.All(standard.Items, x => Assert.True(x.Since == 1 && x.Label.Length is > 0 and <= 80, x.Key));
    }

    [Fact]
    public void Queries_use_existing_operations_only()
    {
        var operations = Definition()["queries"]!.AsArray().OfType<JsonObject>().Select(x => (string)x["operation"]!).ToArray();
        Assert.Equal(new[] { "stok.kart.listele", "depo.listele", "stok.hareket.gecmisi" }, operations);
        Assert.All(operations, name => Assert.True(ErpOperationCatalog.TryGet(name, out var op) && op.Kind == "read" && !op.Deprecated, name));
        // Read-only screen: no write query, no write command.
        Assert.All(Definition()["queries"]!.AsArray().OfType<JsonObject>(), x => Assert.Equal(("read", "load"), ((string)x["kind"]!, (string)x["runOn"]!)));
        var bar = Props("komutlar");
        Assert.Equal(new[] { "exportTable", "hiddenCommands", "titleCount" }, bar.Select(x => x.Key).Order(StringComparer.Ordinal));
        // Yalnız okunan ekran: çubukta Yenile ve Excel kalır.
        Assert.Equal(new[] { "new", "open", "save", "delete", "filter", "print" }, bar["hiddenCommands"]!.AsArray().Select(x => (string)x!));
        Assert.Equal(("liste", "{{gecmis.meta.totalCount}}"), ((string)bar["exportTable"]!, (string)bar["titleCount"]!));
    }

    [Fact]
    public void Filter_row_selects_stock_card_and_warehouse()
    {
        var card = Props("suzgecKarti");
        Assert.Equal(("formCard", "inline"), ((string)Component("suzgecKarti")["type"]!, (string)card["layout"]!));
        Assert.Equal(new[] { "stokSecimi", "depoSecimi" }, Strings(card["inputs"]));

        var stock = Props("stokSecimi");
        Assert.Equal(("lookup", "Stok kartı", "Stok kodu veya adıyla ara"), ((string)stock["inputType"]!, (string)stock["label"]!, (string)stock["placeholder"]!));
        Assert.Equal(("stokKartlari", "id", "name", "code"), ((string)stock["optionsQuery"]!, (string)stock["optionValueColumn"]!,
            (string)stock["optionLabelColumn"]!, (string)stock["optionDescriptionColumn"]!));
        // Server search: the options query sends the typed text as q.
        Assert.Equal("{{stokSecimi.search}}", Binding("stokKartlari", "q"));

        var warehouse = Props("depoSecimi");
        Assert.Equal(("lookup", "Depo", "depolar", "id"), ((string)warehouse["inputType"]!, (string)warehouse["label"]!,
            (string)warehouse["optionsQuery"]!, (string)warehouse["optionValueColumn"]!));
        // "Tüm depolar" is the empty value: the all-warehouses route.
        Assert.Equal(new[] { "=Tüm depolar" }, Strings(warehouse["staticOptions"]));
    }

    [Fact]
    public void List_is_server_paged_movement_history()
    {
        var props = Props("liste");
        Assert.Equal(("gecmis", "server", 50), ((string)props["query"]!, (string)props["paging"]!, (int)props["pageSize"]!));
        Assert.Equal("stok.hareket.gecmisi", (string)Query("gecmis")["operation"]!);
        var expected = new Dictionary<string, string>
        {
            ["stockItemId"] = "{{stokSecimi.value}}", ["warehouseId"] = "{{depoSecimi.value}}",
            ["page"] = "{{liste.sayfa}}", ["pageSize"] = "{{liste.sayfaBoyutu}}"
        };
        Assert.Equal(expected.Count, Query("gecmis")["parameters"]!.AsArray().Count);
        foreach (var (parameter, binding) in expected) Assert.Equal(binding, Binding("gecmis", parameter));

        // Until a stock card is chosen the list gives way to the legacy hint.
        Assert.Equal("stokSecimi.value != null", (string)props["visibleWhen"]!);
        Assert.Equal("stokSecimi.value == null", (string)Props("stokSecinBilgisi")["visibleWhen"]!);
        Assert.Equal("Hareketleri görmek için bir stok kartı seçin.", (string)Props("stokSecinBilgisi")["text"]!);
        Assert.Equal("Seçili stok ve depoda hareket bulunmuyor.", (string)props["emptyText"]!);

        // Legacy tones: Giriş ok (success), Çıkış info; a reversal shows "İade".
        Assert.Equal(new[] { "direction:Receipt=Giriş", "direction:Issue=Çıkış", "isReversal:true=İade", "isReversal:false=—" }, Strings(props["valueLabels"]));
        Assert.Equal(new[] { "Giriş=success", "Çıkış=info" }, Strings(props["toneMap"]));
        Assert.Equal(new[] { "displayQuantity=displayUnitCode", "warehouseCode=warehouseName", "storageLocationCode=storageLocationName" },
            Strings(props["columnUnits"]));
    }

    [Fact]
    public void List_columns_follow_screen_view_mapping()
    {
        var standard = SystemPageStandards.All[Key];
        var view = Assert.Single(standard.ScreenViews);
        // The page's view key is inventory-movement-history; inventory-stock-movements is the stock card dialog's view.
        Assert.Equal(("inventory-movement-history", "liste"), (view.Key, view.Component));
        Assert.True(TenantScreenViewEndpoints.TryGetCatalogFields(view.Key, out var fields));
        Assert.Equal(ViewFields, fields.Select(x => x.Key));
        Assert.Equal(ViewFields, view.Fields.Keys);
        Assert.True(ErpOperationCatalog.TryGet("stok.hareket.gecmisi", out var op));
        Assert.All(view.Fields.Values, column => Assert.Contains(op.Result.Columns, x => x.Code == column));
        // Legacy order; the hidden-by-default unit cost is left out, the reversal flag is an extra column after the direction.
        var visible = fields.Where(x => x.DefaultVisible).Select(x => view.Fields[x.Key]).ToList();
        visible.Insert(2, "isReversal");
        Assert.Equal(visible, Strings(Props("liste")["columns"]));
        Assert.False(fields.Single(x => x.Key == "unitCostBase").DefaultVisible);
        var labels = Strings(Props("liste")["columnLabels"]).Select(x => x.Split('=', 2)).ToDictionary(x => x[0], x => x[1]);
        foreach (var field in fields) Assert.Equal(field.Label, labels[view.Fields[field.Key]]);
    }

    [Fact]
    public void Screen_view_import_hides_mapped_columns()
    {
        var standard = SystemPageStandards.All[Key];
        Assert.True(TenantScreenViewEndpoints.TryGetCatalogFields("inventory-movement-history", out var fields));
        var states = fields.Select(x => new ScreenViewFieldState(x.Key, x.Label, x.Key is not ("tracking" or "unitCostBase"), false)).ToArray();
        var result = SystemPageMerge.ImportScreenViews(standard,
            new Dictionary<string, IReadOnlyList<ScreenViewFieldState>> { ["inventory-movement-history"] = states });
        Assert.Empty(result.Notes);
        var props = JsonNode.Parse(result.DefinitionJson)!["components"]!.AsArray().OfType<JsonObject>().Single(x => (string)x["id"]! == "liste")["props"]!;
        Assert.DoesNotContain("trackingText", Strings(props["columns"]));
        Assert.Equal(7, Strings(props["columns"]).Length);
        Assert.True(TenantCustomPageSchema.Validate(result.DefinitionJson, out var error), error);
    }

    [Fact]
    public async Task Frontend_fixture_matches_catalog()
    {
        await using var factory = new ErpOperationCatalogTests.ErpOperationApiFactory();
        await ErpOperationCatalogTests.SeedAsync(factory, _ => { });
        using var client = factory.CreateClient();
        ErpOperationCatalogTests.SetIdentity(client, ErpOperationCatalogTests.Admin, "TenantAdmin");
        var live = (await client.GetFromJsonAsync<JsonElement>("/api/custom-pages/erp-operations")).GetProperty("operations")
            .EnumerateArray().ToDictionary(x => x.GetProperty("name").GetString()!, x => JsonNode.Parse(x.GetRawText())!);
        var fixture = JsonNode.Parse(File.ReadAllText(Path.Combine(RepositoryRoot(), "frontend", "erp-web", "src", "system-pages",
            "inventoryStockMovementsOperations.fixture.json")))!["operations"]!.AsArray();
        Assert.Equal(3, fixture.Count);
        foreach (var operation in fixture)
            Assert.True(JsonNode.DeepEquals(live[(string)operation!["name"]!], operation), (string)operation["name"]!);
    }

    private static string RepositoryRoot()
    {
        for (var directory = new DirectoryInfo(AppContext.BaseDirectory); directory is not null; directory = directory.Parent)
            if (File.Exists(Path.Combine(directory.FullName, "AIERP.slnx"))) return directory.FullName;
        throw new InvalidOperationException("AIERP.slnx bulunamadı.");
    }

    private static JsonObject Definition() => JsonNode.Parse(SystemPageStandards.All[Key].DefinitionJson)!.AsObject();

    private static JsonObject Component(string id) =>
        Definition()["components"]!.AsArray().OfType<JsonObject>().SingleOrDefault(x => (string)x["id"]! == id)
        ?? throw new Xunit.Sdk.XunitException($"Bileşen yok: {id}");

    private static JsonObject Props(string id) => Component(id)["props"]!.AsObject();

    private static JsonObject Query(string id) =>
        Definition()["queries"]!.AsArray().OfType<JsonObject>().SingleOrDefault(x => (string)x["id"]! == id)
        ?? throw new Xunit.Sdk.XunitException($"Sorgu yok: {id}");

    private static string? Binding(string queryId, string parameter) =>
        (string?)Query(queryId)["parameters"]!.AsArray().OfType<JsonObject>().SingleOrDefault(x => (string)x["name"]! == parameter)?["binding"];

    private static string[] Strings(JsonNode? node) => node!.AsArray().Select(x => (string)x!).ToArray();
}

/// <summary>
/// The two routes behind stok.hareket.gecmisi on SQL Server (their grouped lot / serial read does not run on InMemory): both
/// return the warehouse code and name (the per-warehouse route used to leave them empty), the card's base unit, the display
/// quantity and unit, and the lot / serial text. Skipped without a disposable SQL Server.
/// </summary>
[Collection("SQL Server acceptance")]
public sealed class InventoryStockMovementsSqlAcceptanceTests
{
    private static readonly Guid TenantId = Guid.NewGuid();
    private static readonly Guid UserId = Guid.NewGuid();

    [SqlServerAcceptanceFact]
    public async Task History_routes_return_warehouse_display_quantity_and_tracking_text()
    {
        var configuredConnection = Environment.GetEnvironmentVariable("AIERP_REPORT_TEST_SQL_CONNECTION_STRING");
        Assert.False(string.IsNullOrWhiteSpace(configuredConnection));
        var suffix = Guid.NewGuid().ToString("N");
        var platformConnection = InventoryStockStandardMovementSqlAcceptanceTests.BuildDatabaseConnection(configuredConnection!, $"AIERP_StockMovementsPlatform_{suffix}");
        var tenantConnection = InventoryStockStandardMovementSqlAcceptanceTests.BuildDatabaseConnection(configuredConnection!, $"AIERPTenant_{TenantId:N}");
        var studioConnection = InventoryStockStandardMovementSqlAcceptanceTests.BuildDatabaseConnection(configuredConnection!, $"AIERP_StockMovementsStudio_{suffix}");
        var platformCreated = false;
        var tenantCreated = false;
        SqlAcceptanceTenantCredential? tenantCredential = null;
        try
        {
            await using var platformDb = new PlatformDbContext(new DbContextOptionsBuilder<PlatformDbContext>().UseSqlServer(platformConnection).Options);
            await using var tenantDb = new TenantDbContext(new DbContextOptionsBuilder<TenantDbContext>().UseSqlServer(tenantConnection).Options);
            platformCreated = await platformDb.Database.EnsureCreatedAsync();
            tenantCreated = await tenantDb.Database.EnsureCreatedAsync();
            Assert.True(platformCreated && tenantCreated);
            tenantCredential = await SqlAcceptanceTenantCredential.CreateAsync(configuredConnection!, TenantId);

            var tenant = new Tenant { Id = TenantId, Name = "Stock movements acceptance", Slug = $"stock-movements-{suffix}" };
            var warehouse = new Warehouse { TenantId = TenantId, Tenant = tenant, Code = "MRK", Name = "Merkez" };
            var item = new StockItem { TenantId = TenantId, Tenant = tenant, Code = "SKU-LOT", Name = "Lot item", UnitCode = "ADET", TrackingMode = InventoryTrackingMode.Lot };
            platformDb.Tenants.Add(tenant);
            platformDb.Users.Add(new AppUser { Id = UserId, Email = $"stock-movements-{suffix}@example.invalid", DisplayName = "Synthetic Tenant User", PasswordHash = "test" });
            platformDb.TenantMemberships.Add(new TenantMembership { TenantId = TenantId, UserId = UserId, Role = "TenantAdmin" });
            platformDb.TenantDatabaseCatalog.Add(new TenantDatabaseCatalogEntry
            {
                TenantId = TenantId, Tenant = tenant, DatabaseName = new SqlConnectionStringBuilder(tenantConnection).InitialCatalog,
                State = TenantDatabaseProvisioningState.Ready, ReadyAt = DateTimeOffset.UtcNow
            });
            await platformDb.SaveChangesAsync();
            var converted = new InventoryTransaction
            {
                TenantId = TenantId, Warehouse = warehouse, StockItem = item, EntryDate = new DateOnly(2026, 11, 2), Direction = InventoryDirection.Receipt,
                Quantity = 24, EnteredQuantity = 2, EnteredUnitCode = "KOLI", Description = "Koli girişi"
            };
            var plain = new InventoryTransaction
            {
                TenantId = TenantId, Warehouse = warehouse, StockItem = item, EntryDate = new DateOnly(2026, 11, 1), Direction = InventoryDirection.Issue,
                Quantity = 1.5m, Description = "Eski hareket"
            };
            tenantDb.Tenants.Add(tenant);
            tenantDb.InventoryTransactions.AddRange(converted, plain);
            tenantDb.InventoryTransactionTraces.AddRange(
                new InventoryTransactionTrace { TenantId = TenantId, InventoryTransaction = converted, StockItemId = item.Id, TrackingMode = InventoryTrackingMode.Lot, TrackingCode = "LOT-1", Quantity = 12.5m },
                new InventoryTransactionTrace { TenantId = TenantId, InventoryTransaction = converted, StockItemId = item.Id, TrackingMode = InventoryTrackingMode.Lot, TrackingCode = "LOT-2", Quantity = 11.5m });
            await tenantDb.SaveChangesAsync();

            using var startupConfiguration = InventoryStockStandardMovementSqlAcceptanceTests.ProcessEnvironmentOverride.Push(new Dictionary<string, string?>
            {
                ["Authentication__SigningKey"] = "synthetic-stock-movements-acceptance-key-at-least-32-bytes",
                ["PluginHost__SigningKey"] = "different-synthetic-plugin-key-at-least-32-bytes-long",
                ["Authentication__Issuer"] = "AIERP", ["Authentication__Audience"] = "AIERP",
                ["ConnectionStrings__Platform"] = platformConnection, ["ConnectionStrings__Tenant"] = tenantConnection,
                ["ConnectionStrings__AIStudio"] = studioConnection,
                ["Database__SeparationEnabled"] = "true", ["Database__ApplyMigrationsOnStartup"] = "false"
            });
            using var factory = new InventoryStockStandardMovementSqlAcceptanceTests.StockStandardApiFactory(platformConnection, tenantConnection, studioConnection,
                tenantCredential.CredentialReader);
            using var client = factory.CreateClient();
            client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantId.ToString("D"));
            client.DefaultRequestHeaders.Add("X-Test-User", UserId.ToString("D"));
            client.DefaultRequestHeaders.Add("X-Test-Role", "TenantAdmin");

            foreach (var route in new[] { $"/api/stock/items/{item.Id:D}/transactions", $"/api/warehouses/{warehouse.Id:D}/stock/{item.Id:D}/transactions" })
            {
                using var response = await client.GetAsync(route);
                Assert.True(response.IsSuccessStatusCode, $"{route} {(int)response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
                var body = await response.Content.ReadFromJsonAsync<JsonElement>();
                Assert.Equal(2, body.GetProperty("totalCount").GetInt32());
                var rows = body.GetProperty("items").EnumerateArray().ToArray();
                Assert.All(rows, row => Assert.Equal((warehouse.Id, "MRK", "Merkez", "ADET"), (row.GetProperty("warehouseId").GetGuid(),
                    row.GetProperty("warehouseCode").GetString(), row.GetProperty("warehouseName").GetString(), row.GetProperty("baseUnitCode").GetString())));
                Assert.Equal((2m, "KOLI", "LOT-1 (12,5), LOT-2 (11,5)"), (rows[0].GetProperty("displayQuantity").GetDecimal(),
                    rows[0].GetProperty("displayUnitCode").GetString(), rows[0].GetProperty("trackingText").GetString()));
                Assert.Equal((1.5m, "ADET", JsonValueKind.Null), (rows[1].GetProperty("displayQuantity").GetDecimal(),
                    rows[1].GetProperty("displayUnitCode").GetString(), rows[1].GetProperty("trackingText").ValueKind));
            }
            Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/warehouses/{Guid.NewGuid():D}/stock/{item.Id:D}/transactions")).StatusCode);
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
}
