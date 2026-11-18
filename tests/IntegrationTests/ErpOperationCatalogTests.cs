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
    private static readonly Guid TenantA = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid TenantB = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid Admin = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
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

    [Fact]
    public void Depo_operations_use_depo_module()
    {
        var depo = ErpOperationCatalog.All.Where(x => x.Name.StartsWith("depo.", StringComparison.Ordinal)).ToArray();
        Assert.Equal(2, depo.Length);
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
            if (Proje2FazAOperations.Contains(op.Name)) continue;
            // Proje 1 operations keep their contract: the new wire fields stay at their defaults.
            Assert.Empty(op.Result.Flatten);
            Assert.Empty(op.Result.MetaPaths);
            Assert.Empty(op.RouteVariants);
            Assert.Null(op.BodyMap);
        }
        Assert.True(ErpOperationCatalog.TryGet("stok.bakiye.sayfa", out var page));
        Assert.Equal(new[] { "page", "pageSize", "totalCount", "belowMinimumCount" }, page.Result.MetaPaths);
        var codes = page.Result.Columns.Select(x => x.Code).ToArray();
        Assert.Contains("balance.code", codes);
        Assert.Contains("stockItem.barcode", codes);
        foreach (var hidden in new[] { "stockItem.code", "stockItem.name", "stockItem.unitCode", "stockItem.minimumStock" })
            Assert.DoesNotContain(hidden, codes);
        // A prefixed column keeps the label of its inner code.
        Assert.Equal("Kod", page.Result.Columns.Single(x => x.Code == "balance.code").Label);
        Assert.Equal("Eldeki miktar", page.Result.Columns.Single(x => x.Code == "balance.quantityOnHand").Label);
        Assert.True(ErpOperationCatalog.TryGet("stok.hareket.ekle", out var add));
        Assert.DoesNotContain(add.Parameters, x => x.Name == "tracking");
        Assert.True(ErpOperationCatalog.TryGet("stok.hareket.tersKayit", out var reverse));
        Assert.True(reverse.Parameters.Single(x => x.Name == "reason").Required);
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
        var id = Assert.Single(save.Parameters);
        Assert.Equal("id", id.Name);
        Assert.True(id.Required);
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
        Assert.Equal(new[] { "page", "pageSize", "totalCount", "belowMinimumCount" },
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
                Assert.Contains(parameter.Type, types);
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

    private static async Task SeedAsync(ErpOperationApiFactory factory, Action<PlatformDbContext> rules)
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

    private static void SetIdentity(HttpClient client, Guid user, string role)
    {
        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Remove("X-Test-User");
        client.DefaultRequestHeaders.Remove("X-Test-Role");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString("D"));
        client.DefaultRequestHeaders.Add("X-Test-User", user.ToString("D"));
        client.DefaultRequestHeaders.Add("X-Test-Role", role);
    }

    /// <summary>Full API host with InMemory stores and the real permission policy and authorizer.</summary>
    private sealed class ErpOperationApiFactory : WebApplicationFactory<ApiEntryPointMarker>
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
