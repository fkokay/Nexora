using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.RegularExpressions;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.Routing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Xunit;

namespace AIERP.Api.IntegrationTests;

public sealed class ErpOperationCatalogTests
{
    internal static readonly Guid TenantA = Guid.Parse("11111111-1111-1111-1111-111111111111");
    internal static readonly Guid TenantB = Guid.Parse("22222222-2222-2222-2222-222222222222");
    internal static readonly Guid Admin = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private static readonly Guid Reader = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    private static readonly Guid Writer = Guid.Parse("cccccccc-cccc-cccc-cccc-cccccccccccc");

    [Fact]
    public async Task Every_operation_matches_a_registered_endpoint()
    {
        await using var factory = new ErpOperationApiFactory();
        var endpoints = factory.Services.GetRequiredService<EndpointDataSource>().Endpoints.OfType<RouteEndpoint>().ToArray();
        var missing = ErpOperationCatalog.All
            .SelectMany(op => op.RouteVariants.Select(x => x.Route).Prepend(op.Route).Select(route => (op, route)))
            .Where(x => !endpoints.Any(endpoint =>
                endpoint.Metadata.GetMetadata<HttpMethodMetadata>()?.HttpMethods.Contains(x.op.Method, StringComparer.OrdinalIgnoreCase) == true
                && ErpOperationCatalog.NormalizeRoutePattern(endpoint.RoutePattern.RawText) == x.route))
            .Select(x => $"{x.op.Name}: {x.op.Method} {x.route}").ToArray();
        Assert.Empty(missing);
        foreach (var op in ErpOperationCatalog.All)
            foreach (var variant in op.RouteVariants)
            {
                var selector = Assert.Single(op.Parameters, x => x.In == "route" && x.Name == variant.When);
                Assert.False(selector.Required, $"{op.Name}.{variant.When}");
                Assert.Contains("{" + variant.When + "}", variant.Route);
                Assert.DoesNotContain("{" + variant.When + "}", op.Route);
            }
    }

    private static readonly string[] Proje2FazAOperations =
    [
        "depo.konumlari", "depo.listele", "stok.bakiye.sayfa", "stok.hareket.ekle", "stok.hareket.listele", "stok.hareket.tersKayit",
        "stok.kart.birimEkle", "stok.kart.birimSil", "stok.kart.birimleri", "stok.kart.depoBakiyeleri", "stok.kart.ozelAlanKaydet"
    ];

    private const string MovementHistory = "stok.hareket.gecmisi";

    [Fact]
    public void Movement_history_reads_card_route_with_warehouse_variant()
    {
        Assert.True(ErpOperationCatalog.TryGet(MovementHistory, out var op));
        Assert.Equal(("read", "GET", "/api/stock/items/{stockItemId}/transactions", "Stok"), (op.Kind, op.Method, op.Route, op.Module));
        var variant = Assert.Single(op.RouteVariants);
        Assert.Equal(("/api/warehouses/{warehouseId}/stock/{stockItemId}/transactions", "warehouseId"), (variant.Route, variant.When));
        Assert.Equal(new[] { "stockItemId:route:True", "warehouseId:route:False", "page:query:False", "pageSize:query:False" },
            op.Parameters.Select(x => $"{x.Name}:{x.In}:{x.Required}"));
        Assert.Equal(("list", "items"), (op.Result.Shape, op.Result.RowsPath));
        Assert.Equal(new[] { "page", "pageSize", "totalCount" }, op.Result.MetaPaths);
        Assert.Empty(op.Result.Flatten);
        var codes = op.Result.Columns.Select(x => x.Code).ToArray();
        foreach (var code in new[] { "entryDate", "direction", "isReversal", "warehouseCode", "warehouseName", "storageLocationName", "description", "unitCostBase" })
            Assert.Contains(code, codes);
        Assert.Equal(("Miktar", "decimal"), Column(op, "displayQuantity"));
        Assert.Equal(("Birim", "text"), Column(op, "displayUnitCode"));
        Assert.Equal(("Lot / seri", "text"), Column(op, "trackingText"));
        // The older transaction operations keep their frozen columns: the display members are not constructor parameters.
        foreach (var name in new[] { "stok.kart.hareketleri", "stok.hareket.listele", "stok.hareket.ekle", "stok.hareket.tersKayit" })
        {
            Assert.True(ErpOperationCatalog.TryGet(name, out var older));
            Assert.DoesNotContain(older.Result.Columns, x => x.Code is "displayQuantity" or "displayUnitCode" or "trackingText" or "baseUnitCode");
            Assert.Equal(codes.Take(older.Result.Columns.Count), older.Result.Columns.Select(x => x.Code));
        }
    }

    private static (string Label, string DataType) Column(ErpOperation op, string code)
    {
        var column = Assert.Single(op.Result.Columns, x => x.Code == code);
        return (column.Label, column.DataType);
    }

    [Fact]
    public async Task Movement_history_needs_both_route_permissions()
    {
        await using var factory = new ErpOperationApiFactory();
        await SeedAsync(factory, platformDb =>
        {
            foreach (var code in new[] { "erp.custom-menus.read", "erp.stock-items.read", "erp.warehouses.read" })
                platformDb.TenantPermissionRules.Add(Rule(code, TenantPermissionEffect.Allow));
            platformDb.TenantPermissionRules.Add(Rule("erp.warehouses.read", TenantPermissionEffect.Deny, Reader));
        });
        using var client = factory.CreateClient();

        // The reader may run the all-warehouses route but not the per-warehouse one, so the operation is not allowed.
        SetIdentity(client, Reader, "TenantUser");
        var readerOps = await GetOperationsAsync(client);
        Assert.True(readerOps["stok.kart.hareketleri"].GetProperty("allowed").GetBoolean());
        Assert.False(readerOps[MovementHistory].GetProperty("allowed").GetBoolean());
        var variant = Assert.Single(readerOps[MovementHistory].GetProperty("routeVariants").EnumerateArray());
        Assert.Equal("warehouseId", variant.GetProperty("when").GetString());

        SetIdentity(client, Writer, "TenantUser");
        Assert.True((await GetOperationsAsync(client))[MovementHistory].GetProperty("allowed").GetBoolean());
        SetIdentity(client, Admin, "TenantAdmin");
        Assert.True((await GetOperationsAsync(client))[MovementHistory].GetProperty("allowed").GetBoolean());
    }

    /// <summary>
    /// The display members the history reads add (the routes themselves need SQL Server: InMemory cannot translate their grouped
    /// lot / serial read, see <c>InventoryStockMovementsSqlAcceptanceTests</c>).
    /// </summary>
    [Fact]
    public void Movement_view_display_members()
    {
        var view = new InventoryTransactionView(Guid.NewGuid(), new DateOnly(2026, 11, 2), InventoryDirection.Receipt, 1250, "Lot girişi", null, false, false,
            Tracking: [new InventoryTrackingAllocationView("LOT-1", 1000.5m, null), new InventoryTrackingAllocationView("LOT-2", 249.5m, null)]);
        Assert.Equal("LOT-1 (1.000,5), LOT-2 (249,5)", view.TrackingText);
        Assert.Null((view with { Tracking = [] }).TrackingText);
        Assert.Null((view with { Tracking = null }).TrackingText);
        // Without an entered unit: the base quantity in the card's base unit (known only to the history reads).
        Assert.Equal((1250m, (string?)null), (view.DisplayQuantity, view.DisplayUnitCode));
        Assert.Equal("ADET", (view with { BaseUnitCode = "ADET" }).DisplayUnitCode);
        var entered = view with { EnteredQuantity = 3, EnteredUnitCode = "KOLI", BaseUnitCode = "ADET" };
        Assert.Equal((3m, "KOLI"), (entered.DisplayQuantity, entered.DisplayUnitCode));
        // The API's web serializer writes the display members.
        var json = JsonSerializer.SerializeToElement(view with { BaseUnitCode = "ADET" }, new JsonSerializerOptions(JsonSerializerDefaults.Web));
        Assert.Equal(("ADET", 1250m, "ADET"), (json.GetProperty("baseUnitCode").GetString(), json.GetProperty("displayQuantity").GetDecimal(),
            json.GetProperty("displayUnitCode").GetString()));
        Assert.Equal("LOT-1 (1.000,5), LOT-2 (249,5)", json.GetProperty("trackingText").GetString());
    }
    // Stok & Depo screen standards (after the stock pilot): paged reads with meta.
    private static readonly string[] StockScreenOperations = ["stok.izleme.bakiyeler"];

    [Fact]
    public void Depo_operations_use_depo_module()
    {
        var depo = ErpOperationCatalog.All.Where(x => x.Name.StartsWith("depo.", StringComparison.Ordinal)).ToArray();
        Assert.Equal(14, depo.Length);
        Assert.All(depo, x => Assert.Equal("Depo", x.Module));
        Assert.All(Proje2FazAOperations, name => Assert.True(ErpOperationCatalog.TryGet(name, out _), name));
    }

    [Fact]
    public void Flatten_and_meta_are_consistent()
    {
        foreach (var op in ErpOperationCatalog.All)
        {
            foreach (var name in op.Result.Flatten)
                Assert.True(op.Result.Columns.Any(x => x.Code.StartsWith(name + ".", StringComparison.Ordinal)), $"{op.Name}: {name}");
            // depo.ozelAlanKaydet carries the same body map as stok.kart.ozelAlanKaydet.
            if (Proje2FazAOperations.Contains(op.Name) || StockScreenOperations.Contains(op.Name) || op.Name == MovementHistory || op.Name == "depo.ozelAlanKaydet"
                || op.Name == "stok.bakiye.kart") continue;
            // Proje 1 operations keep their contract: the new wire fields stay at their defaults.
            Assert.Empty(op.Result.Flatten);
            Assert.Empty(op.Result.MetaPaths);
            Assert.Empty(op.RouteVariants);
            Assert.Null(op.BodyMap);
        }
        Assert.True(ErpOperationCatalog.TryGet("stok.bakiye.sayfa", out var page));
        Assert.Equal(new[] { "page", "pageSize", "totalCount", "belowMinimumCount", "pageValuationAmountBase", "pageAvailableQuantity", "pageUnitCode", "pageAvailableCount", "pageUnvaluedCount", "baseCurrencyCode" }, page.Result.MetaPaths);
        var codes = page.Result.Columns.Select(x => x.Code).ToArray();
        Assert.Contains("balance.code", codes);
        Assert.Contains("stockItem.barcode", codes);
        foreach (var hidden in new[] { "stockItem.code", "stockItem.name", "stockItem.unitCode", "stockItem.minimumStock" })
            Assert.DoesNotContain(hidden, codes);
        // A prefixed column keeps the label of its inner code.
        Assert.Equal("Kod", page.Result.Columns.Single(x => x.Code == "balance.code").Label);
        Assert.Equal("Eldeki miktar", page.Result.Columns.Single(x => x.Code == "balance.quantityOnHand").Label);
        // stok.bakiye.kart is the same read filtered to one required stock card: same result, same routes.
        Assert.True(ErpOperationCatalog.TryGet("stok.bakiye.kart", out var card));
        Assert.Same(page.Result, card.Result);
        Assert.Equal(page.RouteVariants, card.RouteVariants);
        Assert.Equal(page.Route, card.Route);
        Assert.Equal(("query", "guid", true), card.Parameters.Where(x => x.Name == "stockItemId").Select(x => (x.In, x.Type, x.Required)).Single());
        Assert.True(ErpOperationCatalog.TryGet("stok.hareket.tersKayit", out var reverse));
        Assert.True(reverse.Parameters.Single(x => x.Name == "reason").Required);
        Assert.True(ErpOperationCatalog.TryGet("stok.izleme.bakiyeler", out var tracking));
        Assert.Equal(new[] { "page", "pageSize", "totalCount" }, tracking.Result.MetaPaths);
        Assert.Equal("items", tracking.Result.RowsPath);
        Assert.Empty(tracking.Result.Flatten);
        Assert.Equal(new[] { "stockItemId", "stockItemCode", "stockItemName", "unitCode", "trackingMode", "warehouseId", "warehouseCode",
            "warehouseName", "trackingCode", "expiryDate", "quantityOnHand", "lastMovementDate" }, tracking.Result.Columns.Select(x => x.Code));
    }

    [Fact]
    public void Body_map_source_is_a_read_operation()
    {
        Assert.True(ErpOperationCatalog.TryGet("stok.kart.ozelAlanKaydet", out var save));
        var map = Assert.IsType<ErpOperationBodyMap>(save.BodyMap);
        Assert.Equal("values", map.Property);
        Assert.True(ErpOperationCatalog.TryGet(map.SourceOperation, out var source), map.SourceOperation);
        Assert.Equal("read", source.Kind);
        Assert.Contains(source.Result.Columns, x => x.Code == map.KeyColumn);
        Assert.Contains(source.Result.Columns, x => x.Code == map.ValueColumn);
        Assert.Null(save.SourceOperation);
        Assert.Equal(["id", "values"], save.Parameters.Select(x => x.Name));
        Assert.True(save.Parameters[0].Required);
        // The declared map parameter is the body map's property (Faz B).
        Assert.Equal("map", save.Parameters.Single(x => x.Name == map.Property).Type);
        Assert.All(ErpOperationCatalog.All.Where(x => x.BodyMap is not null), x => Assert.Equal("write", x.Kind));
    }

    [Fact]
    public async Task Catalog_endpoint_returns_new_fields()
    {
        await using var factory = new ErpOperationApiFactory();
        await SeedAsync(factory, _ => { });
        using var client = factory.CreateClient();
        SetIdentity(client, Admin, "TenantAdmin");
        var ops = await GetOperationsAsync(client);

        var page = ops["stok.bakiye.sayfa"];
        var variant = Assert.Single(page.GetProperty("routeVariants").EnumerateArray());
        Assert.Equal("warehouseId", variant.GetProperty("when").GetString());
        Assert.Equal("/api/warehouses/{warehouseId}/balances/page", variant.GetProperty("route").GetString());
        Assert.Equal(new[] { "balance", "stockItem" }, page.GetProperty("result").GetProperty("flatten").EnumerateArray().Select(x => x.GetString()));
        Assert.Equal(new[] { "page", "pageSize", "totalCount", "belowMinimumCount", "pageValuationAmountBase", "pageAvailableQuantity", "pageUnitCode", "pageAvailableCount", "pageUnvaluedCount", "baseCurrencyCode" },
            page.GetProperty("result").GetProperty("metaPaths").EnumerateArray().Select(x => x.GetString()));
        Assert.Equal(JsonValueKind.Null, page.GetProperty("bodyMap").ValueKind);
        Assert.True(page.GetProperty("allowed").GetBoolean());

        var list = ops["stok.kart.listele"];
        Assert.Empty(list.GetProperty("routeVariants").EnumerateArray());
        Assert.Empty(list.GetProperty("result").GetProperty("metaPaths").EnumerateArray());
        Assert.Empty(list.GetProperty("result").GetProperty("flatten").EnumerateArray());
        Assert.Equal(JsonValueKind.Null, list.GetProperty("bodyMap").ValueKind);

        var bodyMap = ops["stok.kart.ozelAlanKaydet"].GetProperty("bodyMap");
        Assert.Equal("values", bodyMap.GetProperty("property").GetString());
        Assert.Equal("stok.kart.ozelAlanDegerleri", bodyMap.GetProperty("sourceOperation").GetString());
        Assert.Equal("code", bodyMap.GetProperty("keyColumn").GetString());
        Assert.Equal("value", bodyMap.GetProperty("valueColumn").GetString());
        Assert.Equal("Depo", ops["depo.listele"].GetProperty("module").GetString());
        // Every new operation resolves to a registered endpoint and permission for an admin.
        Assert.All(Proje2FazAOperations, name => Assert.True(ops[name].GetProperty("allowed").GetBoolean(), name));
        Assert.All(StockScreenOperations, name => Assert.True(ops[name].GetProperty("allowed").GetBoolean(), name));
        // Proje 4: both new operations resolve to an endpoint and a permission for an admin.
        Assert.True(ops["uretim.recete.listele"].GetProperty("allowed").GetBoolean());
        Assert.True(ops["ayar.negatifStok"].GetProperty("allowed").GetBoolean());
        Assert.Equal("Üretim", ops["uretim.recete.listele"].GetProperty("module").GetString());
        var productFilter = Assert.Single(ops["uretim.recete.listele"].GetProperty("parameters").EnumerateArray());
        Assert.Equal("productStockItemId", productFilter.GetProperty("name").GetString());
        Assert.Equal("query", productFilter.GetProperty("in").GetString());
        Assert.True(productFilter.GetProperty("required").GetBoolean());
        Assert.Equal("record", ops["ayar.negatifStok"].GetProperty("result").GetProperty("shape").GetString());
    }

    [Fact]
    public async Task Unit_writes_require_tenant_admin()
    {
        await using var factory = new ErpOperationApiFactory();
        await SeedAsync(factory, platformDb =>
        {
            foreach (var code in new[] { "erp.custom-menus.read", "erp.stock-items.read", "erp.stock-items.create", "erp.stock-items.delete" })
                platformDb.TenantPermissionRules.Add(Rule(code, TenantPermissionEffect.Allow));
        });
        using var client = factory.CreateClient();
        SetIdentity(client, Writer, "TenantUser");
        var userOps = await GetOperationsAsync(client);
        Assert.True(userOps["stok.kart.birimleri"].GetProperty("allowed").GetBoolean());
        // The rules allow create and delete, but the unit handlers themselves only accept TenantAdmin.
        Assert.True(userOps["stok.kart.olustur"].GetProperty("allowed").GetBoolean());
        Assert.False(userOps["stok.kart.birimEkle"].GetProperty("allowed").GetBoolean());
        Assert.False(userOps["stok.kart.birimSil"].GetProperty("allowed").GetBoolean());

        SetIdentity(client, Admin, "TenantAdmin");
        var adminOps = await GetOperationsAsync(client);
        Assert.True(adminOps["stok.kart.birimEkle"].GetProperty("allowed").GetBoolean());
        Assert.True(adminOps["stok.kart.birimSil"].GetProperty("allowed").GetBoolean());
    }

    [Fact]
    public async Task Warehouse_status_follows_create_and_location_writes_require_tenant_admin()
    {
        string[] all = ["depo.olustur", "depo.guncelle", "depo.pasifeAl", "depo.aktifEt", "depo.ozelAlanTanimlari", "depo.ozelAlanDegerleri",
            "depo.ozelAlanKaydet", "depo.konum.olustur", "depo.konum.guncelle", "depo.konum.pasifeAl", "depo.konum.bakiyeleri", "depo.konumlandirmaDenetimi"];
        async Task<Dictionary<string, bool>> AllowedAsync(string[] rules, Guid user, string role)
        {
            await using var factory = new ErpOperationApiFactory();
            await SeedAsync(factory, platformDb =>
            {
                foreach (var code in rules) platformDb.TenantPermissionRules.Add(Rule(code, TenantPermissionEffect.Allow));
            });
            using var client = factory.CreateClient();
            SetIdentity(client, user, role);
            var ops = await GetOperationsAsync(client);
            return all.ToDictionary(x => x, x => ops[x].GetProperty("allowed").GetBoolean());
        }

        // Read and update only: POST …/status resolves to erp.warehouses.create, so the status changes stay closed.
        var update = await AllowedAsync(["erp.custom-menus.read", "erp.warehouses.read", "erp.warehouses.update"], Writer, "TenantUser");
        Assert.True(update["depo.guncelle"]);
        Assert.True(update["depo.ozelAlanKaydet"]);
        Assert.True(update["depo.ozelAlanTanimlari"] && update["depo.ozelAlanDegerleri"]);
        Assert.True(update["depo.konum.bakiyeleri"] && update["depo.konumlandirmaDenetimi"]);
        Assert.False(update["depo.olustur"]);
        Assert.False(update["depo.pasifeAl"]);
        Assert.False(update["depo.aktifEt"]);
        // The location write handlers only accept TenantAdmin, whatever the rules say.
        Assert.False(update["depo.konum.guncelle"]);
        Assert.False(update["depo.konum.pasifeAl"]);

        var create = await AllowedAsync(["erp.custom-menus.read", "erp.warehouses.read", "erp.warehouses.create", "erp.warehouses.update"], Writer, "TenantUser");
        Assert.True(create["depo.olustur"] && create["depo.pasifeAl"] && create["depo.aktifEt"]);
        Assert.False(create["depo.konum.olustur"]);
        Assert.False(create["depo.konum.guncelle"]);
        Assert.False(create["depo.konum.pasifeAl"]);

        var admin = await AllowedAsync([], Admin, "TenantAdmin");
        Assert.All(all, name => Assert.True(admin[name], name));
    }

    [Fact]
    public void Warehouse_status_and_location_deactivation_fix_their_body()
    {
        Assert.True(ErpOperationCatalog.TryGet("depo.pasifeAl", out var deactivate));
        Assert.True(ErpOperationCatalog.TryGet("depo.aktifEt", out var activate));
        Assert.Equal("/api/warehouses/{warehouseId}/status", deactivate.Route);
        Assert.Equal(activate.Route, deactivate.Route);
        Assert.Equal(false, deactivate.FixedBody!["isActive"]);
        Assert.Equal(true, activate.FixedBody!["isActive"]);
        Assert.All(new[] { deactivate, activate }, op => Assert.Equal(true, op.FixedBody!["confirmation"]));
        Assert.DoesNotContain(deactivate.Parameters, x => x.Name is "isActive" or "confirmation");

        Assert.True(ErpOperationCatalog.TryGet("depo.konum.pasifeAl", out var location));
        Assert.True(location.RequiresTenantAdmin);
        Assert.Equal(false, location.FixedBody!["isActive"]);
        Assert.DoesNotContain(location.Parameters, x => x.Name == "isActive");
        Assert.True(ErpOperationCatalog.TryGet("depo.konum.guncelle", out var update));
        Assert.Equal(update.Route, location.Route);
        Assert.Null(update.FixedBody);
        // No single-record read exists: the updates are not source-backed, so the page binds rowVersion from the list row.
        Assert.True(ErpOperationCatalog.TryGet("depo.guncelle", out var warehouse));
        Assert.Null(warehouse.SourceOperation);
        Assert.Null(update.SourceOperation);
        Assert.Contains(warehouse.Parameters, x => x.Name == "rowVersion" && x.In == "body");

        Assert.True(ErpOperationCatalog.TryGet("depo.ozelAlanKaydet", out var save));
        Assert.Equal(new ErpOperationBodyMap("values", "depo.ozelAlanDegerleri", "code", "value"), save.BodyMap);
        Assert.True(ErpOperationCatalog.TryGet("depo.konum.bakiyeleri", out var balances));
        Assert.Equal("items", balances.Result.RowsPath);
        Assert.Equal(["stockItemId", "stockItemCode", "stockItemName", "unitCode", "quantity"], balances.Result.Columns.Select(x => x.Code));
        Assert.True(ErpOperationCatalog.TryGet("depo.konumlandirmaDenetimi", out var reconciliation));
        Assert.Equal("items", reconciliation.Result.RowsPath);
        Assert.Equal("Konumu boş", reconciliation.Result.Columns.Single(x => x.Code == "unlocatedQuantity").Label);
    }

    [Fact]
    public async Task Location_reads_match_catalog_columns()
    {
        await using var factory = new ErpOperationApiFactory();
        await SeedAsync(factory, _ => { });
        var item = new StockItem { TenantId = TenantA, Code = "STK-1", Name = "Vida", UnitCode = "EA", IsActive = true };
        var warehouse = new Warehouse { TenantId = TenantA, Code = "A", Name = "Ana depo", IsActive = true };
        var location = new WarehouseLocation { TenantId = TenantA, WarehouseId = warehouse.Id, Code = "R1", Name = "Raf 1" };
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            db.Tenants.Add(new Tenant { Id = TenantA, Name = "A", Slug = "tenant-a" });
            db.StockItems.Add(item);
            db.Warehouses.Add(warehouse);
            db.WarehouseLocations.Add(location);
            db.InventoryTransactions.AddRange(
                new InventoryTransaction { TenantId = TenantA, WarehouseId = warehouse.Id, StockItemId = item.Id, EntryDate = new DateOnly(2026, 11, 1),
                    Direction = InventoryDirection.Receipt, Quantity = 5m, Description = "Konumlu", StorageLocationId = location.Id },
                new InventoryTransaction { TenantId = TenantA, WarehouseId = warehouse.Id, StockItemId = item.Id, EntryDate = new DateOnly(2026, 11, 1),
                    Direction = InventoryDirection.Receipt, Quantity = 2m, Description = "Konumsuz" });
            await db.SaveChangesAsync();
        }
        using var client = factory.CreateClient();
        SetIdentity(client, Admin, "TenantAdmin");

        foreach (var (name, path) in new[] { ("depo.konum.bakiyeleri", $"/api/warehouses/{warehouse.Id:D}/locations/{location.Id:D}/balances"),
                     ("depo.konumlandirmaDenetimi", $"/api/warehouses/{warehouse.Id:D}/location-reconciliation") })
        {
            using var response = await client.GetAsync(path);
            Assert.True(response.StatusCode == HttpStatusCode.OK, $"{path} {response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
            Assert.True(ErpOperationCatalog.TryGet(name, out var op));
            var rows = (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty(op.Result.RowsPath!).EnumerateArray().ToArray();
            var row = Assert.Single(rows);
            Assert.All(op.Result.Columns, column => Assert.True(row.TryGetProperty(column.Code, out _), $"{name}: {column.Code}"));
        }
    }

    [Fact]
    public async Task Stock_item_balances_return_active_warehouses()
    {
        await using var factory = new ErpOperationApiFactory();
        await SeedAsync(factory, _ => { });
        var item = new StockItem { TenantId = TenantA, Code = "STK-1", Name = "Vida", UnitCode = "EA", IsActive = true };
        var foreign = new StockItem { TenantId = TenantB, Code = "STK-B", Name = "Başka firma", UnitCode = "EA", IsActive = true };
        var warehouseA = new Warehouse { TenantId = TenantA, Code = "A", Name = "Ana depo", IsActive = true };
        var warehouseB = new Warehouse { TenantId = TenantA, Code = "B", Name = "Yan depo", IsActive = true };
        var inactive = new Warehouse { TenantId = TenantA, Code = "C", Name = "Kapalı depo", IsActive = false };
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            db.Tenants.AddRange(new Tenant { Id = TenantA, Name = "A", Slug = "tenant-a" }, new Tenant { Id = TenantB, Name = "B", Slug = "tenant-b" });
            db.StockItems.AddRange(item, foreign);
            // Listed out of code order to prove the ordering.
            db.Warehouses.AddRange(warehouseB, inactive, warehouseA);
            db.InventoryTransactions.AddRange(
                new InventoryTransaction { TenantId = TenantA, WarehouseId = warehouseA.Id, StockItemId = item.Id, EntryDate = new DateOnly(2026, 11, 1),
                    Direction = InventoryDirection.Receipt, Quantity = 5m, Description = "Giriş" },
                new InventoryTransaction { TenantId = TenantA, WarehouseId = warehouseA.Id, StockItemId = item.Id, EntryDate = new DateOnly(2026, 11, 2),
                    Direction = InventoryDirection.Issue, Quantity = 2m, Description = "Çıkış" },
                new InventoryTransaction { TenantId = TenantA, WarehouseId = inactive.Id, StockItemId = item.Id, EntryDate = new DateOnly(2026, 11, 2),
                    Direction = InventoryDirection.Receipt, Quantity = 7m, Description = "Kapalı depoda" });
            await db.SaveChangesAsync();
        }
        using var client = factory.CreateClient();
        SetIdentity(client, Admin, "TenantAdmin");

        using var response = await client.GetAsync($"/api/stock/items/{item.Id:D}/balances");
        Assert.True(response.StatusCode == HttpStatusCode.OK, $"{response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
        var rows = (await response.Content.ReadFromJsonAsync<JsonElement>()).EnumerateArray().ToArray();
        Assert.Equal(2, rows.Length);
        Assert.Equal(warehouseA.Id, rows[0].GetProperty("warehouseId").GetGuid());
        Assert.Equal("A", rows[0].GetProperty("warehouseCode").GetString());
        Assert.Equal(3m, rows[0].GetProperty("quantityOnHand").GetDecimal());
        Assert.Equal(3m, rows[0].GetProperty("availableQuantity").GetDecimal());
        Assert.Equal(warehouseB.Id, rows[1].GetProperty("warehouseId").GetGuid());
        Assert.Equal(0m, rows[1].GetProperty("quantityOnHand").GetDecimal());
        Assert.False(string.IsNullOrWhiteSpace(rows[1].GetProperty("baseCurrencyCode").GetString()));
        // Every catalog column is a property of the response row.
        Assert.True(ErpOperationCatalog.TryGet("stok.kart.depoBakiyeleri", out var op));
        Assert.All(op.Result.Columns, column => Assert.True(rows[0].TryGetProperty(column.Code, out _), column.Code));

        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/stock/items/{foreign.Id:D}/balances")).StatusCode);
    }

    [Fact]
    public async Task Stock_item_balances_follow_warehouse_permission()
    {
        await using var factory = new ErpOperationApiFactory();
        await SeedAsync(factory, platformDb =>
        {
            foreach (var code in new[] { "erp.custom-menus.read", "erp.stock-items.read", "erp.warehouses.read" })
                platformDb.TenantPermissionRules.Add(Rule(code, TenantPermissionEffect.Allow));
            platformDb.TenantPermissionRules.Add(Rule("erp.warehouses.read", TenantPermissionEffect.Deny, Reader));
        });
        var item = new StockItem { TenantId = TenantA, Code = "STK-1", Name = "Vida", UnitCode = "EA", IsActive = true };
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            db.Tenants.Add(new Tenant { Id = TenantA, Name = "A", Slug = "tenant-a" });
            db.StockItems.Add(item);
            db.Warehouses.Add(new Warehouse { TenantId = TenantA, Code = "A", Name = "Ana depo", IsActive = true });
            await db.SaveChangesAsync();
        }
        using var client = factory.CreateClient();

        SetIdentity(client, Reader, "TenantUser");
        // The reader may read stock cards, but warehouse balances are denied, also through /api/stock.
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"/api/stock/items/{item.Id:D}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"/api/stock/items/{item.Id:D}/balances")).StatusCode);
        // Request casing or a trailing slash must not fall back to the stock-card permission.
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"/API/Stock/Items/{item.Id.ToString("D").ToUpperInvariant()}/BALANCES")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"/api/stock/items/{item.Id:D}/balances/")).StatusCode);
        var readerOps = await GetOperationsAsync(client);
        Assert.True(readerOps["stok.kart.getir"].GetProperty("allowed").GetBoolean());
        Assert.False(readerOps["stok.kart.depoBakiyeleri"].GetProperty("allowed").GetBoolean());
        Assert.False(readerOps["stok.bakiye.sayfa"].GetProperty("allowed").GetBoolean());

        // Positive control: a user with the warehouses Allow reads them.
        SetIdentity(client, Writer, "TenantUser");
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"/api/stock/items/{item.Id:D}/balances")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"/API/Stock/Items/{item.Id.ToString("D").ToUpperInvariant()}/BALANCES")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"/api/stock/items/{item.Id:D}/balances/")).StatusCode);
        var writerOps = await GetOperationsAsync(client);
        Assert.True(writerOps["stok.kart.depoBakiyeleri"].GetProperty("allowed").GetBoolean());
        Assert.True(writerOps["stok.bakiye.sayfa"].GetProperty("allowed").GetBoolean());
    }

    [Fact]
    public async Task Balance_page_defaults_when_query_omitted()
    {
        await using var factory = new ErpOperationApiFactory();
        await SeedAsync(factory, _ => { });
        var warehouse = new Warehouse { TenantId = TenantA, Code = "A", Name = "Ana depo", IsActive = true };
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            db.Tenants.Add(new Tenant { Id = TenantA, Name = "A", Slug = "tenant-a" });
            db.Warehouses.Add(warehouse);
            await db.SaveChangesAsync();
        }
        using var client = factory.CreateClient();
        SetIdentity(client, Admin, "TenantAdmin");

        foreach (var route in new[] { "/api/warehouses/balances/page", $"/api/warehouses/{warehouse.Id:D}/balances/page" })
        {
            using var response = await client.GetAsync(route);
            Assert.True(response.StatusCode == HttpStatusCode.OK, $"{route} {response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
            var body = await response.Content.ReadFromJsonAsync<JsonElement>();
            Assert.Equal(1, body.GetProperty("page").GetInt32());
            Assert.Equal(25, body.GetProperty("pageSize").GetInt32());
        }
    }

    [Fact]
    public void Recipe_list_operation_requires_product_filter()
    {
        Assert.True(ErpOperationCatalog.TryGet("uretim.recete.listele", out var op));
        Assert.Equal("Üretim", op.Module);
        Assert.Equal("read", op.Kind);
        Assert.Equal("GET", op.Method);
        Assert.Equal("/api/manufacturing/boms", op.Route);
        var parameter = Assert.Single(op.Parameters);
        Assert.Equal(new ErpOperationParameter("productStockItemId", "query", "guid", true), parameter);
        Assert.Equal("list", op.Result.Shape);
        Assert.Null(op.Result.RowsPath);
        Assert.Equal(["id", "code", "name", "productStockItemId", "productName", "productTrackingMode", "outputQuantity", "isActive", "orderCount", "rowVersion"],
            op.Result.Columns.Select(x => x.Code));
        Assert.Equal("Mamul stok kartı", op.Result.Columns.Single(x => x.Code == "productStockItemId").Label);
        Assert.Equal("Üretim emri sayısı", op.Result.Columns.Single(x => x.Code == "orderCount").Label);
    }

    [Fact]
    public void Negative_stock_setting_operation_reads_settings()
    {
        Assert.True(ErpOperationCatalog.TryGet("ayar.negatifStok", out var op));
        Assert.Equal("Ayarlar", op.Module);
        Assert.Equal("read", op.Kind);
        Assert.Equal("GET", op.Method);
        Assert.Equal("/api/tenant-settings/operations", op.Route);
        Assert.Empty(op.Parameters);
        Assert.Equal("record", op.Result.Shape);
        Assert.Equal(["tenantId", "allowNegativeStock", "updatedByUserId", "updatedAt", "rowVersion"], op.Result.Columns.Select(x => x.Code));
        var column = op.Result.Columns.Single(x => x.Code == "allowNegativeStock");
        Assert.Equal("bool", column.DataType);
        Assert.Equal("Negatif stoka izin ver", column.Label);
    }

    [Fact]
    public void Balance_page_accepts_include_inactive_and_status()
    {
        Assert.True(ErpOperationCatalog.TryGet("stok.bakiye.sayfa", out var op));
        Assert.Equal(["warehouseId", "q", "belowMinimumOnly", "includeInactive", "page", "pageSize"], op.Parameters.Select(x => x.Name));
        Assert.Equal(new ErpOperationParameter("includeInactive", "query", "bool", false), op.Parameters.Single(x => x.Name == "includeInactive"));
        Assert.Equal(new ErpOperationColumn("status", "Durum", "text"), op.Result.Columns[^1]);
    }

    [Fact]
    public async Task Bom_list_filters_by_product_stock_item()
    {
        await using var factory = new ErpOperationApiFactory();
        await SeedAsync(factory, _ => { });
        var first = new StockItem { TenantId = TenantA, Code = "MAM-1", Name = "Mamul 1", UnitCode = "EA", IsActive = true };
        var second = new StockItem { TenantId = TenantA, Code = "MAM-2", Name = "Mamul 2", UnitCode = "EA", IsActive = true };
        var foreignBom = new BillOfMaterial { TenantId = TenantB, Code = "BOM-B", Name = "Başka firma", ProductStockItemId = first.Id, OutputQuantity = 1m };
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            db.Tenants.AddRange(new Tenant { Id = TenantA, Name = "A", Slug = "tenant-a" }, new Tenant { Id = TenantB, Name = "B", Slug = "tenant-b" });
            db.StockItems.AddRange(first, second);
            db.BillOfMaterials.AddRange(
                new BillOfMaterial { TenantId = TenantA, Code = "BOM-1", Name = "Reçete 1", ProductStockItemId = first.Id, OutputQuantity = 1m },
                new BillOfMaterial { TenantId = TenantA, Code = "BOM-2", Name = "Reçete 2", ProductStockItemId = second.Id, OutputQuantity = 2m },
                foreignBom);
            await db.SaveChangesAsync();
        }
        using var client = factory.CreateClient();
        SetIdentity(client, Admin, "TenantAdmin");

        async Task<string[]> CodesAsync(string query)
        {
            using var response = await client.GetAsync("/api/manufacturing/boms" + query);
            Assert.True(response.StatusCode == HttpStatusCode.OK, $"{query} {response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
            var rows = (await response.Content.ReadFromJsonAsync<JsonElement>()).EnumerateArray().ToArray();
            if (rows.Length > 0)
            {
                Assert.True(ErpOperationCatalog.TryGet("uretim.recete.listele", out var op));
                Assert.All(op.Result.Columns, column => Assert.True(rows[0].TryGetProperty(column.Code, out _), column.Code));
            }
            return rows.Select(x => x.GetProperty("code").GetString()!).ToArray();
        }

        Assert.Equal(["BOM-1"], await CodesAsync($"?productStockItemId={first.Id:D}"));
        Assert.Equal(["BOM-2"], await CodesAsync($"?productStockItemId={second.Id:D}"));
        Assert.Equal(["BOM-1", "BOM-2"], await CodesAsync(""));
        Assert.Empty(await CodesAsync($"?productStockItemId={Guid.NewGuid():D}"));
    }

    private static readonly HashSet<string> ScalarTypes =new(StringComparer.Ordinal) { "text", "int", "decimal", "date", "bool", "guid" };

    [Fact]
    public void Collection_parameters_are_body_and_optional()
    {
        var collections = ErpOperationCatalog.All.SelectMany(op => op.Parameters.Select(p => (op, p)))
            .Where(x => x.p.Type is "list" or "map").ToArray();
        Assert.Equal(6, collections.Length);
        foreach (var (op, parameter) in collections)
        {
            Assert.Equal("body", parameter.In);
            Assert.False(parameter.Required, $"{op.Name}.{parameter.Name}");
            if (parameter.Type == "map") { Assert.Null(parameter.Items); continue; }
            Assert.NotNull(parameter.Items);
            Assert.NotEmpty(parameter.Items);
            Assert.All(parameter.Items, item => Assert.True(ScalarTypes.Contains(item.DataType) || item.DataType == "map", $"{parameter.Name}.{item.Code}"));
        }
        // Scalar parameters carry no items.
        Assert.All(ErpOperationCatalog.All.SelectMany(x => x.Parameters).Where(x => x.Type is not ("list" or "map")), x => Assert.Null(x.Items));
    }

    /// <summary>Parameter names of every operation before Faz B (Proje 1 and Faz A), in catalog order.</summary>
    private static readonly IReadOnlyDictionary<string, string> FazAParameterNames = new Dictionary<string, string>(StringComparer.Ordinal)
    {
        ["stok.kart.listele"] = "q,page,pageSize",
        ["stok.kart.getir"] = "id",
        ["stok.hareket.gecmisi"] = "stockItemId,warehouseId,page,pageSize",
        ["stok.kart.olustur"] = "code,name,barcode,unitCode,category,minimumStock,isActive,trackingMode,procurementLeadTimeDays,manufacturingLeadTimeDays,purchaseListPrice,salesListPrice,priceCurrencyCode,purchaseVatPercent,salesVatPercent,exciseTaxPercent,communicationTaxPercent,purchaseDiscountPercent,salesDiscountPercent,maximumStock,reorderPoint,safetyStock,netWeight,grossWeight,length,width,height,productImageUrl,purchaseAccountCode,salesAccountCode,costAccountCode,marketplaceProductId,withholdingTaxPercent,stampTaxPercent",
        ["stok.kart.guncelle"] = "id,code,name,barcode,unitCode,category,minimumStock,rowVersion,trackingMode,procurementLeadTimeDays,manufacturingLeadTimeDays,purchaseListPrice,salesListPrice,priceCurrencyCode,purchaseVatPercent,salesVatPercent,exciseTaxPercent,communicationTaxPercent,purchaseDiscountPercent,salesDiscountPercent,maximumStock,reorderPoint,safetyStock,netWeight,grossWeight,length,width,height,productImageUrl,purchaseAccountCode,salesAccountCode,costAccountCode,marketplaceProductId,withholdingTaxPercent,stampTaxPercent",
        ["stok.kart.sil"] = "id",
        ["stok.kart.pasifeAl"] = "id,rowVersion",
        ["stok.kart.aktifEt"] = "id,rowVersion",
        ["stok.kart.hareketleri"] = "stockItemId,page,pageSize",
        ["stok.kart.varyantlari"] = "id",
        ["stok.kart.ozelAlanDegerleri"] = "id",
        // Proje 4 adds the optional includeInactive filter after belowMinimumOnly; parameters bind by name.
        ["stok.bakiye.sayfa"] = "warehouseId,q,belowMinimumOnly,includeInactive,page,pageSize",
        // Stok Hareketleri adım adım: one stock card's balance through the same routes.
        ["stok.bakiye.kart"] = "stockItemId,warehouseId",
        ["uretim.recete.listele"] = "productStockItemId",
        ["depo.konumlari"] = "warehouseId",
        ["stok.kart.birimleri"] = "id",
        ["stok.kart.birimEkle"] = "id,unitCode,factorToBase",
        ["stok.kart.birimSil"] = "id,conversionId",
        ["stok.kart.ozelAlanKaydet"] = "id",
        ["stok.hareket.listele"] = "warehouseId,stockItemId,page,pageSize",
        ["stok.hareket.ekle"] = "warehouseId,stockItemId,entryDate,direction,quantity,description,unitCostBase,unitCode,storageLocationId",
        ["stok.hareket.tersKayit"] = "warehouseId,stockItemId,entryId,reason",
        ["stok.kart.depoBakiyeleri"] = "id",
        // Depo Yönetimi v2 and Raf ve Konumlar v1 (no single-record reads: rowVersion comes from the list row).
        ["depo.olustur"] = "code,name",
        ["depo.guncelle"] = "warehouseId,code,name,rowVersion",
        ["depo.pasifeAl"] = "warehouseId",
        ["depo.aktifEt"] = "warehouseId",
        ["depo.ozelAlanTanimlari"] = "",
        ["depo.ozelAlanDegerleri"] = "warehouseId",
        ["depo.ozelAlanKaydet"] = "warehouseId",
        ["depo.konum.olustur"] = "warehouseId,code,name,parentLocationId",
        ["depo.konum.guncelle"] = "warehouseId,locationId,code,name,parentLocationId,isActive,rowVersion",
        ["depo.konum.pasifeAl"] = "warehouseId,locationId,code,name,parentLocationId,rowVersion",
        ["depo.konum.bakiyeleri"] = "warehouseId,locationId,asOfDate",
        ["depo.konumlandirmaDenetimi"] = "warehouseId,asOfDate",
        // Stok Değerleme (inventory-cost).
        ["stok.maliyet.kayitlari"] = "warehouseId,stockItemId",
        ["stok.maliyet.yenidenDegerle"] = "warehouseId,stockItemId,entryDate,amountBase,reason",
        ["stok.maliyet.tersKayit"] = "id,reason",
        ["satinalma.malKabul.listele"] = "page,pageSize",
        ["satinalma.malKabul.ekMaliyetler"] = "id",
        ["satinalma.malKabul.ekMaliyetDagit"] = "id,entryDate,amountBase,allocationMethod,description",
        ["satinalma.malKabul.ekMaliyetTersKayit"] = "id,adjustmentId,reason",
        ["stok.izleme.bakiyeler"] = "q,warehouseId,trackingMode,page,pageSize",
    };

    [Fact]
    public void Collection_parameters_only_extend_three_operations()
    {
        var additions = new Dictionary<string, string[]>(StringComparer.Ordinal)
        {
            ["stok.kart.olustur"] = ["customFields", "variants"],
            ["stok.hareket.ekle"] = ["tracking"],
            ["stok.kart.ozelAlanKaydet"] = ["values"],
            ["depo.olustur"] = ["customFields"],
            ["depo.ozelAlanKaydet"] = ["values"]
        };
        foreach (var op in ErpOperationCatalog.All)
        {
            var expected = (FazAParameterNames.TryGetValue(op.Name, out var names) ? names.Split(',', StringSplitOptions.RemoveEmptyEntries) : [])
                .Concat(additions.TryGetValue(op.Name, out var added) ? added : []);
            Assert.Equal(expected, op.Parameters.Select(x => x.Name));
        }
    }

    [Fact]
    public void Variant_items_follow_write_request()
    {
        Assert.True(ErpOperationCatalog.TryGet("stok.kart.olustur", out var create));
        var variants = create.Parameters.Single(x => x.Name == "variants");
        Assert.Equal("list", variants.Type);
        Assert.Equal(
            [("code", "Kod", "text", true), ("name", "Ad", "text", true), ("barcode", "Barkod", "text", false), ("attributes", "Özellikler", "map", true)],
            variants.Items!.Select(x => (x.Code, x.Label, x.DataType, x.Required)));
        var customFields = create.Parameters.Single(x => x.Name == "customFields");
        Assert.Equal(("map", "body", false), (customFields.Type, customFields.In, customFields.Required));

        Assert.True(ErpOperationCatalog.TryGet("stok.hareket.ekle", out var add));
        var tracking = add.Parameters.Single(x => x.Name == "tracking");
        Assert.Equal("list", tracking.Type);
        Assert.Equal(
            [("trackingCode", "Lot / seri kodu", "text", true), ("quantity", "Miktar", "decimal", true), ("expiryDate", "Son kullanma tarihi", "date", false)],
            tracking.Items!.Select(x => (x.Code, x.Label, x.DataType, x.Required)));
    }

    [Fact]
    public async Task Catalog_endpoint_returns_parameter_items()
    {
        await using var factory = new ErpOperationApiFactory();
        await SeedAsync(factory, _ => { });
        using var client = factory.CreateClient();
        SetIdentity(client, Admin, "TenantAdmin");
        var ops = await GetOperationsAsync(client);

        var parameters = ops["stok.kart.olustur"].GetProperty("parameters").EnumerateArray().ToArray();
        var id = ops["stok.kart.getir"].GetProperty("parameters").EnumerateArray().Single(x => x.GetProperty("name").GetString() == "id");
        Assert.Equal(JsonValueKind.Null, id.GetProperty("items").ValueKind);
        var variants = parameters.Single(x => x.GetProperty("name").GetString() == "variants");
        Assert.Equal("list", variants.GetProperty("type").GetString());
        Assert.Equal("body", variants.GetProperty("in").GetString());
        Assert.False(variants.GetProperty("required").GetBoolean());
        var items = variants.GetProperty("items");
        Assert.Equal(4, items.GetArrayLength());
        Assert.Equal("attributes", items[3].GetProperty("code").GetString());
        Assert.Equal("Özellikler", items[3].GetProperty("label").GetString());
        Assert.Equal("map", items[3].GetProperty("dataType").GetString());
        Assert.True(items[3].GetProperty("required").GetBoolean());
        var customFields = parameters.Single(x => x.GetProperty("name").GetString() == "customFields");
        Assert.Equal("map", customFields.GetProperty("type").GetString());
        Assert.Equal(JsonValueKind.Null, customFields.GetProperty("items").ValueKind);
        // Every scalar parameter of every operation carries items: null.
        Assert.All(ops.Values.SelectMany(op => op.GetProperty("parameters").EnumerateArray())
            .Where(x => x.GetProperty("type").GetString() != "list"), x => Assert.Equal(JsonValueKind.Null, x.GetProperty("items").ValueKind));
    }

    [Fact]
    public void Names_are_append_only()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "ErpOperationCatalog.names.txt");
        var recorded = File.ReadAllLines(path).Select(x => x.Trim()).Where(x => x.Length > 0).ToArray();
        var current = ErpOperationCatalog.All.Select(x => x.Name).ToHashSet(StringComparer.Ordinal);
        // A name in the file must never disappear from the catalog; deprecate it instead.
        Assert.DoesNotContain(recorded, x => !current.Contains(x));
        // A new operation must be recorded in the file in the same change.
        Assert.DoesNotContain(current, x => !recorded.Contains(x, StringComparer.Ordinal));
        Assert.Equal(recorded.OrderBy(x => x, StringComparer.Ordinal), recorded);
    }

    [Fact]
    public void Report_operations_match_report_sources()
    {
        var reportOps = ErpOperationCatalog.All.Where(x => x.Name.StartsWith("rapor.", StringComparison.Ordinal))
            .Select(x => x.Name["rapor.".Length..]).ToHashSet(StringComparer.Ordinal);
        Assert.True(reportOps.SetEquals(ReportEndpoints.ReportSourcePermissions.Keys),
            $"Fark: {string.Join(", ", reportOps.Except(ReportEndpoints.ReportSourcePermissions.Keys).Concat(ReportEndpoints.ReportSourcePermissions.Keys.Except(reportOps)))}");
        foreach (var op in ErpOperationCatalog.All.Where(x => x.Name.StartsWith("rapor.", StringComparison.Ordinal)))
        {
            Assert.Equal("POST", op.Method);
            Assert.Equal("/api/reports/run", op.Route);
            Assert.Equal("Raporlar", op.Module);
            Assert.StartsWith("Rapor: ", op.Label);
            Assert.Equal("list", op.Result.Shape);
            Assert.Equal("rows", op.Result.RowsPath);
            Assert.NotEmpty(op.Result.Columns);
            Assert.NotNull(op.FixedBody);
            Assert.Equal(op.Name["rapor.".Length..], op.FixedBody!["source"]);
            Assert.Equal(100, op.FixedBody["pageSize"]);
        }
    }

    [Fact]
    public void Every_report_fixed_body_passes_report_run_validation()
    {
        foreach (var op in ErpOperationCatalog.All.Where(x => x.Name.StartsWith("rapor.", StringComparison.Ordinal)))
        {
            var request = JsonSerializer.Deserialize<ReportRunRequest>(JsonSerializer.Serialize(op.FixedBody), new JsonSerializerOptions(JsonSerializerDefaults.Web));
            Assert.True(ReportEndpoints.Validate(request, out _, out var errors),
                $"{op.Name}: {string.Join("; ", errors!.Select(x => x.Key + "=" + string.Join(",", x.Value)))}");
            var columns = Assert.IsAssignableFrom<IReadOnlyList<string>>(op.FixedBody!["columns"]);
            Assert.InRange(columns.Count, 1, 12);
            Assert.Equal(columns, op.Result.Columns.Select(x => x.Code));
        }
    }

    [Fact]
    public async Task Stock_items_report_operation_runs_with_catalog_body()
    {
        await using var factory = new ErpOperationApiFactory();
        await SeedAsync(factory, _ => { });
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            db.Tenants.Add(new Tenant { Id = TenantA, Name = "A", Slug = "tenant-a" });
            db.StockItems.Add(new StockItem { TenantId = TenantA, Code = "STK-R", Name = "Rapor vidası", UnitCode = "EA", IsActive = true });
            await db.SaveChangesAsync();
        }
        Assert.True(ErpOperationCatalog.TryGet("rapor.stockItems", out var op));
        using var client = factory.CreateClient();
        SetIdentity(client, Admin, "TenantAdmin");

        using var response = await client.PostAsJsonAsync(op.Route, op.FixedBody);
        Assert.True(response.StatusCode == HttpStatusCode.OK, $"{response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        var rows = body.GetProperty(op.Result.RowsPath!).EnumerateArray().ToArray();
        Assert.Single(rows);
    }

    [Fact]
    public async Task Tracking_balances_operation_reads_its_route_with_catalog_parameters()
    {
        await using var factory = new ErpOperationApiFactory();
        await SeedAsync(factory, _ => { });
        Guid warehouseId;
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            db.Tenants.Add(new Tenant { Id = TenantA, Name = "A", Slug = "tenant-a" });
            var warehouse = new Warehouse { TenantId = TenantA, Code = "MRK", Name = "Merkez" };
            var item = new StockItem { TenantId = TenantA, Code = "ILC", Name = "İlaç", UnitCode = "KUTU", IsActive = true, TrackingMode = InventoryTrackingMode.Lot };
            var movement = new InventoryTransaction { TenantId = TenantA, WarehouseId = warehouse.Id, StockItemId = item.Id, EntryDate = new DateOnly(2026, 11, 1),
                Direction = InventoryDirection.Receipt, Quantity = 5, Description = "Giriş" };
            db.AddRange(warehouse, item, movement, new InventoryTransactionTrace { TenantId = TenantA, InventoryTransactionId = movement.Id, StockItemId = item.Id,
                TrackingMode = InventoryTrackingMode.Lot, TrackingCode = "LOT-1", Quantity = 5, ExpiryDate = new DateOnly(2026, 12, 1) });
            await db.SaveChangesAsync();
            warehouseId = warehouse.Id;
        }
        Assert.True(ErpOperationCatalog.TryGet("stok.izleme.bakiyeler", out var op));
        using var client = factory.CreateClient();
        SetIdentity(client, Admin, "TenantAdmin");

        using var response = await client.GetAsync($"{op.Route}?warehouseId={warehouseId}&trackingMode=Lot&q=LOT&page=1&pageSize=50");
        Assert.True(response.StatusCode == HttpStatusCode.OK, $"{response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        foreach (var meta in op.Result.MetaPaths) Assert.True(body.TryGetProperty(meta, out _), meta);
        var row = Assert.Single(body.GetProperty(op.Result.RowsPath!).EnumerateArray());
        foreach (var column in op.Result.Columns) Assert.True(row.TryGetProperty(column.Code, out _), column.Code);
        Assert.Equal(("LOT-1", "Lot", "2026-12-01"), (row.GetProperty("trackingCode").GetString(), row.GetProperty("trackingMode").GetString(),
            row.GetProperty("expiryDate").GetString()));
    }

    [Fact]
    public void Names_are_unique_and_well_formed()
    {
        var all = ErpOperationCatalog.All;
        Assert.Equal(all.Count, all.Select(x => x.Name).Distinct(StringComparer.Ordinal).Count());
        var pattern = new Regex("^[a-z]+(\\.[a-zA-Z]+)+$");
        var types = new HashSet<string> { "text", "int", "decimal", "date", "bool", "guid" };
        foreach (var op in all)
        {
            Assert.Matches(pattern, op.Name);
            Assert.True(ErpOperationCatalog.TryGet(op.Name, out var found) && ReferenceEquals(op, found), op.Name);
            Assert.Contains(op.Kind, new[] { "read", "write" });
            if (op.Kind == "read") Assert.Equal("read", op.PageKind);
            else Assert.Contains(op.PageKind, new[] { "insert", "update", "delete" });
            Assert.Contains(op.Result.Shape, new[] { "list", "record", "none" });
            Assert.Equal("2026-11-18", op.Since);
            Assert.False(string.IsNullOrWhiteSpace(op.Label));
            foreach (var parameter in op.Parameters)
            {
                Assert.Contains(parameter.In, new[] { "route", "query", "body" });
                // Faz B: list and map parameters exist only in the body.
                Assert.Contains(parameter.Type, parameter.In == "body" ? [.. types, "list", "map"] : types);
                if (parameter.In != "route") continue;
                var variants = op.RouteVariants.Where(x => x.When == parameter.Name).ToArray();
                if (variants.Length > 0)
                {
                    // A variant's selector is optional and appears in that variant's route.
                    Assert.False(parameter.Required, $"{op.Name}.{parameter.Name}");
                    foreach (var variant in variants) Assert.Contains("{" + parameter.Name + "}", variant.Route);
                }
                else
                {
                    Assert.True(parameter.Required, $"{op.Name}.{parameter.Name}");
                    Assert.Contains("{" + parameter.Name + "}", op.Route);
                }
            }
            foreach (var route in op.RouteVariants.Select(x => x.Route).Prepend(op.Route))
                foreach (Match match in Regex.Matches(route, "\\{([A-Za-z]+)\\}"))
                    Assert.Contains(op.Parameters, x => x.In == "route" && x.Name == match.Groups[1].Value);
            if (op.SourceOperation is not null)
            {
                Assert.True(ErpOperationCatalog.TryGet(op.SourceOperation, out var source), op.SourceOperation);
                Assert.Equal("read", source.Kind);
            }
        }
        Assert.False(ErpOperationCatalog.TryGet("yok.islem", out _));
    }

    [Fact]
    public async Task Catalog_endpoint_returns_operations_with_allowed_flags()
    {
        await using var factory = new ErpOperationApiFactory();
        await SeedAsync(factory, platformDb =>
        {
            foreach (var code in new[] { "erp.custom-menus.read", "erp.stock-items.read", "erp.stock-items.delete" })
                platformDb.TenantPermissionRules.Add(Rule(code, TenantPermissionEffect.Allow));
            platformDb.TenantPermissionRules.Add(Rule("erp.stock-items.delete", TenantPermissionEffect.Deny, Reader));
            platformDb.TenantPermissionRules.Add(Rule("erp.stock-items.create", TenantPermissionEffect.Allow, Writer));
            platformDb.TenantPermissionRules.Add(Rule("erp.reports.execute", TenantPermissionEffect.Allow, Writer));
        });
        using var client = factory.CreateClient();

        SetIdentity(client, Admin, "TenantAdmin");
        var adminOps = await GetOperationsAsync(client);
        Assert.True(adminOps["stok.kart.sil"].GetProperty("allowed").GetBoolean());
        var update = adminOps["stok.kart.guncelle"];
        Assert.Equal("Stok kartı güncelle", update.GetProperty("label").GetString());
        Assert.Equal("Stok", update.GetProperty("module").GetString());
        Assert.Equal("write", update.GetProperty("kind").GetString());
        Assert.Equal("update", update.GetProperty("pageKind").GetString());
        Assert.Equal("PUT", update.GetProperty("method").GetString());
        Assert.Equal("/api/stock/items/{id}", update.GetProperty("route").GetString());
        Assert.Equal("stok.kart.getir", update.GetProperty("sourceOperation").GetString());
        Assert.Equal("2026-11-18", update.GetProperty("since").GetString());
        Assert.False(update.GetProperty("deprecated").GetBoolean());
        var id = update.GetProperty("parameters").EnumerateArray().First();
        Assert.Equal("id", id.GetProperty("name").GetString());
        Assert.Equal("route", id.GetProperty("in").GetString());
        Assert.Equal("guid", id.GetProperty("type").GetString());
        Assert.True(id.GetProperty("required").GetBoolean());
        Assert.Contains(update.GetProperty("result").GetProperty("columns").EnumerateArray(), x => x.GetProperty("code").GetString() == "rowVersion");
        var deactivate = adminOps["stok.kart.pasifeAl"];
        Assert.True(deactivate.GetProperty("fixedBody").GetProperty("confirmation").GetBoolean());
        var report = adminOps["rapor.stockItems"];
        Assert.Equal("stockItems", report.GetProperty("fixedBody").GetProperty("source").GetString());
        Assert.Equal("rows", report.GetProperty("result").GetProperty("rowsPath").GetString());
        Assert.Equal(JsonValueKind.Null, adminOps["stok.kart.varyantlari"].GetProperty("result").GetProperty("rowsPath").ValueKind);
        Assert.Equal("items", adminOps["stok.kart.listele"].GetProperty("result").GetProperty("rowsPath").GetString());

        SetIdentity(client, Reader, "TenantUser");
        var readerOps = await GetOperationsAsync(client);
        Assert.True(readerOps["stok.kart.listele"].GetProperty("allowed").GetBoolean());
        Assert.True(readerOps["stok.kart.getir"].GetProperty("allowed").GetBoolean());
        // Deny wins over the Allow rule on the same permission.
        Assert.False(readerOps["stok.kart.sil"].GetProperty("allowed").GetBoolean());
        // No create/update/execute rule and no reports permission for the reader.
        Assert.False(readerOps["stok.kart.olustur"].GetProperty("allowed").GetBoolean());
        Assert.False(readerOps["stok.kart.pasifeAl"].GetProperty("allowed").GetBoolean());
        Assert.False(readerOps["rapor.stockItems"].GetProperty("allowed").GetBoolean());

        SetIdentity(client, Writer, "TenantUser");
        var writerOps = await GetOperationsAsync(client);
        Assert.True(writerOps["stok.kart.olustur"].GetProperty("allowed").GetBoolean());
        // Report run permission plus the source's own read permission.
        Assert.True(writerOps["rapor.stockItems"].GetProperty("allowed").GetBoolean());
        Assert.False(writerOps["rapor.customers"].GetProperty("allowed").GetBoolean());
        // The delete rule allows it, but the DELETE handler itself only accepts TenantAdmin.
        Assert.False(writerOps["stok.kart.sil"].GetProperty("allowed").GetBoolean());
        Assert.True(ErpOperationCatalog.TryGet("stok.kart.sil", out var delete) && delete.RequiresTenantAdmin);
        Assert.DoesNotContain(ErpOperationCatalog.All, x => x.Deprecated);
        // The wire contract carries no RequiresTenantAdmin field.
        Assert.False(writerOps["stok.kart.sil"].TryGetProperty("requiresTenantAdmin", out _));
    }

    [Fact]
    public async Task Get_stock_item_by_id_returns_view_and_404_for_other_tenant()
    {
        await using var factory = new ErpOperationApiFactory();
        var own = new StockItem { TenantId = TenantA, Code = "STK-1", Name = "Vida", UnitCode = "EA", MinimumStock = 3m, IsActive = true };
        var foreign = new StockItem { TenantId = TenantB, Code = "STK-B", Name = "Başka firma", UnitCode = "EA", IsActive = true };
        await SeedAsync(factory, _ => { });
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            db.Tenants.AddRange(new Tenant { Id = TenantA, Name = "A", Slug = "tenant-a" }, new Tenant { Id = TenantB, Name = "B", Slug = "tenant-b" });
            db.StockItems.AddRange(own, foreign);
            await db.SaveChangesAsync();
        }
        using var client = factory.CreateClient();
        SetIdentity(client, Admin, "TenantAdmin");

        using var response = await client.GetAsync($"/api/stock/items/{own.Id:D}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var view = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(own.Id, view.GetProperty("id").GetGuid());
        Assert.Equal("STK-1", view.GetProperty("code").GetString());
        Assert.Equal("Vida", view.GetProperty("name").GetString());
        Assert.Equal(3m, view.GetProperty("minimumStock").GetDecimal());
        Assert.True(view.TryGetProperty("rowVersion", out _));

        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/stock/items/{foreign.Id:D}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/stock/items/{Guid.NewGuid():D}")).StatusCode);
    }

    private static TenantPermissionRule Rule(string code, TenantPermissionEffect effect, Guid? user = null) => new()
    {
        TenantId = TenantA, SubjectType = user is null ? TenantPermissionSubjectType.Role : TenantPermissionSubjectType.User,
        SubjectRole = user is null ? "TenantUser" : null, SubjectUserId = user, PermissionCode = code,
        ResourceType = PlatformPermissionCatalog.Definitions.Single(x => x.Code == code).ResourceType, Effect = effect, IsActive = true
    };

    private static async Task<Dictionary<string, JsonElement>> GetOperationsAsync(HttpClient client)
    {
        using var response = await client.GetAsync("/api/custom-pages/erp-operations");
        Assert.True(response.StatusCode == HttpStatusCode.OK, $"{response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        return body.GetProperty("operations").EnumerateArray().ToDictionary(x => x.GetProperty("name").GetString()!, x => x.Clone());
    }

    internal static async Task SeedAsync(ErpOperationApiFactory factory, Action<PlatformDbContext> rules)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        var tenant = new Tenant { Id = TenantA, Name = "Tenant A", Slug = "tenant-a", IsActive = true };
        db.Tenants.Add(tenant);
        db.TenantDatabaseCatalog.Add(new TenantDatabaseCatalogEntry
        {
            TenantId = TenantA, Tenant = tenant, DatabaseName = $"AIERPTenant_{TenantA:N}", State = TenantDatabaseProvisioningState.Ready
        });
        var admin = new AppUser { Id = Admin, Email = "admin@example.invalid", DisplayName = "Admin", IsActive = true };
        var reader = new AppUser { Id = Reader, Email = "reader@example.invalid", DisplayName = "Reader", IsActive = true };
        var writer = new AppUser { Id = Writer, Email = "writer@example.invalid", DisplayName = "Writer", IsActive = true };
        db.Users.AddRange(admin, reader, writer);
        db.TenantMemberships.Add(new TenantMembership { TenantId = TenantA, UserId = Writer, Tenant = tenant, User = writer, Role = "TenantUser" });
        db.TenantMemberships.Add(new TenantMembership { TenantId = TenantA, UserId = Admin, Tenant = tenant, User = admin, Role = "TenantAdmin" });
        db.TenantMemberships.Add(new TenantMembership { TenantId = TenantA, UserId = Reader, Tenant = tenant, User = reader, Role = "TenantUser" });
        rules(db);
        await db.SaveChangesAsync();
    }

    internal static void SetIdentity(HttpClient client, Guid user, string role)
    {
        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Remove("X-Test-User");
        client.DefaultRequestHeaders.Remove("X-Test-Role");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString("D"));
        client.DefaultRequestHeaders.Add("X-Test-User", user.ToString("D"));
        client.DefaultRequestHeaders.Add("X-Test-Role", role);
    }

    /// <summary>Full API host with InMemory stores and the real permission policy and authorizer.</summary>
    internal sealed class ErpOperationApiFactory : WebApplicationFactory<ApiEntryPointMarker>
    {
        private readonly string _databaseName = $"erp-operation-catalog-{Guid.NewGuid():N}";

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Production);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<PlatformDbContext>();
                services.RemoveAll<DbContextOptions<PlatformDbContext>>();
                services.RemoveAll<IDbContextOptionsConfiguration<PlatformDbContext>>();
                services.AddDbContext<PlatformDbContext>(options => options.UseInMemoryDatabase(_databaseName));
                services.RemoveAll<TenantDbContext>();
                services.RemoveAll<DbContextOptions<TenantDbContext>>();
                services.RemoveAll<IDbContextOptionsConfiguration<TenantDbContext>>();
                services.AddDbContext<TenantDbContext>(options => options.UseInMemoryDatabase($"{_databaseName}-tenant"));
                services.RemoveAll<ITenantSqlCredentialReader>();
                services.AddSingleton<ITenantSqlCredentialReader, TestTenantCredentialReader>();
                services.AddAuthentication(options =>
                {
                    options.DefaultAuthenticateScheme = TestAuthenticationHandler.SchemeName;
                    options.DefaultChallengeScheme = TestAuthenticationHandler.SchemeName;
                    options.DefaultForbidScheme = TestAuthenticationHandler.SchemeName;
                }).AddScheme<AuthenticationSchemeOptions, TestAuthenticationHandler>(TestAuthenticationHandler.SchemeName, _ => { });
                foreach (var worker in services.Where(x => x.ServiceType == typeof(IHostedService)
                             && x.ImplementationType?.Name is "IntegrationOperationWorker" or "AuditRetentionWorker" or "TcmbExchangeRateWorker").ToArray())
                    services.Remove(worker);
            });
        }

        protected override IHost CreateHost(IHostBuilder builder)
        {
            builder.ConfigureHostConfiguration(configuration => configuration.AddInMemoryCollection(
                new Dictionary<string, string?>
                {
                    ["Authentication:SigningKey"] = "synthetic-erp-operation-auth-signing-key-32-bytes",
                    ["Authentication:Issuer"] = "AIERP",
                    ["Authentication:Audience"] = "AIERP",
                    ["PluginHost:SigningKey"] = "synthetic-erp-operation-plugin-signing-key-32-bytes",
                    ["PluginHost:BaseUrl"] = "http://plugin-host.invalid",
                    ["ConnectionStrings:Platform"] = "Server=localhost;Database=unused;User Id=test;Password=test;TrustServerCertificate=True",
                    ["ConnectionStrings:Tenant"] = "Server=localhost;Database=unused;User Id=test;Password=test;TrustServerCertificate=True",
                    ["ConnectionStrings:AIStudio"] = "Server=localhost;Database=unused;User Id=test;Password=test;TrustServerCertificate=True",
                    ["Database:SeparationEnabled"] = "true",
                    ["Database:ApplyMigrationsOnStartup"] = "false",
                    ["Vault:Address"] = "https://vault.test",
                    ["Vault:TenantSqlCredentialReader:RoleId"] = "erp-operation-test-role",
                    ["Vault:TenantSqlCredentialReader:SecretId"] = "erp-operation-test-secret",
                    ["AI:SettingsEncryptionKey"] = Convert.ToBase64String(Enumerable.Range(1, 32).Select(x => (byte)x).ToArray()),
                    ["AI:LiveEvaluation:Enabled"] = "false"
                }));
            return base.CreateHost(builder);
        }

        private sealed class TestAuthenticationHandler(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder)
            : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
        {
            public const string SchemeName = "erp-operation-catalog-test";

            protected override Task<AuthenticateResult> HandleAuthenticateAsync()
            {
                if (!Guid.TryParse(Request.Headers["X-Test-Tenant"], out var tenantId)
                    || !Guid.TryParse(Request.Headers["X-Test-User"], out var userId))
                    return Task.FromResult(AuthenticateResult.NoResult());
                var claims = new[]
                {
                    new Claim("tenant_id", tenantId.ToString("D")),
                    new Claim("sub", userId.ToString("D")),
                    new Claim("role", Request.Headers["X-Test-Role"].FirstOrDefault() ?? "TenantAdmin")
                };
                return Task.FromResult(AuthenticateResult.Success(
                    new AuthenticationTicket(new ClaimsPrincipal(new ClaimsIdentity(claims, Scheme.Name)), Scheme.Name)));
            }
        }

        private sealed class TestTenantCredentialReader : ITenantSqlCredentialReader
        {
            public Task<TenantSqlCredential> ReadAsync(Guid tenantId, TenantSqlDatabaseComponent component,
                string secretReference, CancellationToken cancellationToken = default)
            {
                var userName = component == TenantSqlDatabaseComponent.Erp ? $"aierp_t_{tenantId:N}" : $"aierp_s_{tenantId:N}";
                return Task.FromResult(new TenantSqlCredential(TenantSqlCredentialPath.DatabaseName(tenantId, component), userName, "synthetic-password", 1));
            }
        }
    }
}
