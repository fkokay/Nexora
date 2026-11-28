using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>
/// Üretim system pages (manufacturing-orders, manufacturing-order-create, manufacturing-recipes, manufacturing-cost-variance):
/// the uretim.* ERP operations, the manufacturing API read additions (single order / recipe reads, order flags and counters,
/// the recipe isActive filter and counts, the operator list, the cost report's flat page totals), the menu entry and the four
/// standards.
/// </summary>
public sealed class ManufacturingSystemPagesTests
{
    private static readonly Guid ReadUser = Guid.Parse("dddddddd-dddd-dddd-dddd-dddddddddddd");
    private static readonly Guid Product = Guid.Parse("b0000000-0000-0000-0000-000000000001");
    private static readonly Guid Component = Guid.Parse("b0000000-0000-0000-0000-000000000002");
    private static readonly Guid Warehouse = Guid.Parse("b0000000-0000-0000-0000-000000000003");
    private static readonly Guid ActiveBom = Guid.Parse("b0000000-0000-0000-0000-000000000004");
    private static readonly Guid PassiveBom = Guid.Parse("b0000000-0000-0000-0000-000000000005");
    private static readonly Guid OtherTenantBom = Guid.Parse("b0000000-0000-0000-0000-000000000006");
    private static readonly Guid WorkCenter = Guid.Parse("b0000000-0000-0000-0000-000000000007");
    private static readonly Guid SalesOrder = Guid.Parse("b0000000-0000-0000-0000-000000000008");
    private static readonly Guid Customer = Guid.Parse("b0000000-0000-0000-0000-000000000009");

    /// <summary>Every uretim.* operation this work adds (uretim.recete.listele, the stock card standard's read, is older).</summary>
    internal static readonly string[] NewOperations =
    [
        "uretim.emir.listele", "uretim.emir.getir", "uretim.emir.operasyonlari", "uretim.emir.bilesenleri", "uretim.emir.olustur",
        "uretim.emir.cizelgele", "uretim.emir.serbestBirak", "uretim.emir.operasyonBaslat", "uretim.emir.operasyonTamamla", "uretim.emir.tamamla",
        "uretim.emir.iptal", "uretim.operatorler", "uretim.recete.tumunuListele", "uretim.recete.getir", "uretim.recete.bilesenleri",
        "uretim.recete.sil", "uretim.recete.etkinlestir", "uretim.recete.pasifeAl", "uretim.maliyetAnalizi"
    ];

    internal static bool IsNewOperation(string name) => NewOperations.Contains(name, StringComparer.Ordinal);

    private static readonly string[] ReadOperations =
    [
        "uretim.emir.listele", "uretim.emir.getir", "uretim.emir.operasyonlari", "uretim.emir.bilesenleri", "uretim.operatorler",
        "uretim.recete.tumunuListele", "uretim.recete.getir", "uretim.recete.bilesenleri"
    ];

    // ---- Catalog ----

    [Fact]
    public void Catalog_declares_every_manufacturing_operation_in_the_manufacturing_module()
    {
        Assert.Equal(19, NewOperations.Length);
        Assert.Equal(NewOperations.Append("uretim.recete.listele").Order(StringComparer.Ordinal),
            ErpOperationCatalog.All.Where(x => x.Name.StartsWith("uretim.", StringComparison.Ordinal)).Select(x => x.Name).Order(StringComparer.Ordinal));
        foreach (var name in NewOperations)
        {
            var op = Op(name);
            Assert.Equal(("Üretim", false, false), (op.Module, op.Deprecated, op.RequiresTenantAdmin));
            Assert.Null(ErpOperationCatalog.ParameterShapeError(op));
            Assert.All(op.Result.Columns, column => Assert.False(string.IsNullOrWhiteSpace(column.Label), $"{name}.{column.Code}"));
        }
        // The stock card standard's recipe read keeps its contract: required product filter, constructor columns only.
        var stockCardRecipes = Op("uretim.recete.listele");
        Assert.Equal(new[] { "productStockItemId:query:True" }, stockCardRecipes.Parameters.Select(x => $"{x.Name}:{x.In}:{x.Required}"));
        Assert.DoesNotContain(stockCardRecipes.Result.Columns, x => x.Code is "lineCount" or "operationCount");

        var list = Op("uretim.emir.listele");
        Assert.Equal(("GET", "/api/manufacturing/orders", "list", "items"), (list.Method, list.Route, list.Result.Shape, list.Result.RowsPath));
        Assert.Equal(new[] { "q:text", "status:text", "page:int", "pageSize:int" }, list.Parameters.Select(x => $"{x.Name}:{x.Type}"));
        Assert.Equal(new[] { "page", "pageSize", "totalCount", "openOrderCount", "unscheduledOrderCount", "completedOrderCount", "openPlannedCostBase" },
            list.Result.MetaPaths);
        var codes = list.Result.Columns.Select(x => x.Code).ToArray();
        foreach (var code in new[] { "productStockItemId", "productCode", "productName", "productTrackingMode", "operationCount", "scheduledOperationCount",
                     "startedOperationCount", "completedOperationCount", "canSchedule", "canRelease", "canComplete", "canCancel", "componentCodes",
                     "plannedMaterialCostBase", "plannedOperationCostBase", "plannedCostBase", "actualOperationCostBase", "routeSummary", "sourceText" })
            Assert.Contains(code, codes);
        Assert.DoesNotContain("lines", codes);
        Assert.DoesNotContain("operations", codes);
        Assert.Equal("bool", list.Result.Columns.Single(x => x.Code == "canSchedule").DataType);
        Assert.Equal(list.Result.Columns, Op("uretim.emir.getir").Result.Columns);
        Assert.Equal(("GET", "/api/manufacturing/orders/{id}", "record"), (Op("uretim.emir.getir").Method, Op("uretim.emir.getir").Route, Op("uretim.emir.getir").Result.Shape));
        Assert.Equal(("/api/manufacturing/orders/{id}", "operations"), (Op("uretim.emir.operasyonlari").Route, Op("uretim.emir.operasyonlari").Result.RowsPath));
        Assert.Contains(Op("uretim.emir.operasyonlari").Result.Columns, x => x.Code == "status");
        Assert.Equal(("/api/manufacturing/orders/{id}", "lines"), (Op("uretim.emir.bilesenleri").Route, Op("uretim.emir.bilesenleri").Result.RowsPath));

        var create = Op("uretim.emir.olustur");
        Assert.Equal(("POST", "/api/manufacturing/orders", "insert"), (create.Method, create.Route, create.PageKind));
        Assert.Equal(new[] { "code", "billOfMaterialId", "warehouseId", "plannedQuantity", "plannedDate", "sourceSalesOrderId", "sourceSalesOrderLineNumber" },
            create.Parameters.Select(x => x.Name));
        Assert.Equal(new[] { "billOfMaterialId", "warehouseId", "plannedQuantity", "plannedDate" }, create.Parameters.Where(x => x.Required).Select(x => x.Name));

        foreach (var (name, suffix) in new[] { ("uretim.emir.cizelgele", "/schedule"), ("uretim.emir.serbestBirak", "/release"), ("uretim.emir.iptal", "/cancel") })
        {
            var op = Op(name);
            Assert.Equal(("POST", "/api/manufacturing/orders/{id}" + suffix, "update", null), (op.Method, op.Route, op.PageKind, op.FixedBody));
            Assert.Equal(new[] { "id:route" }, op.Parameters.Select(x => $"{x.Name}:{x.In}"));
        }
        Assert.Equal("none", Op("uretim.emir.iptal").Result.Shape);
        var start = Op("uretim.emir.operasyonBaslat");
        Assert.Equal(("POST", "/api/manufacturing/orders/{id}/operations/{operationId}/start"), (start.Method, start.Route));
        Assert.Equal(new[] { "id:route:guid", "operationId:route:guid" }, start.Parameters.Select(x => $"{x.Name}:{x.In}:{x.Type}"));
        var actuals = Op("uretim.emir.operasyonTamamla");
        Assert.Equal("/api/manufacturing/orders/{id}/operations/{operationId}/complete", actuals.Route);
        Assert.Equal(new[] { "id", "operationId", "actualSetupMinutes", "actualRunMinutes", "performedByEmployeeId", "actualEnergyQuantityKwh",
            "actualEnergyCostPerKwhBase" }, actuals.Parameters.Select(x => x.Name));
        Assert.Equal(new[] { "id", "operationId", "actualSetupMinutes", "actualRunMinutes", "performedByEmployeeId" },
            actuals.Parameters.Where(x => x.Required).Select(x => x.Name));

        var complete = Op("uretim.emir.tamamla");
        Assert.Equal(("POST", "/api/manufacturing/orders/{id}/complete", "record"), (complete.Method, complete.Route, complete.Result.Shape));
        Assert.Equal(new[] { "id", "componentStorageLocationId", "finishedGoodsStorageLocationId", "actualGoodQuantity", "scrapQuantity", "scrapReason",
            "finishedGoodsTracking" }, complete.Parameters.Select(x => x.Name));
        var tracking = complete.Parameters.Single(x => x.Name == "finishedGoodsTracking");
        Assert.Equal(("list", "body", false), (tracking.Type, tracking.In, tracking.Required));
        Assert.Equal(new[] { ("trackingCode", "text", true), ("quantity", "decimal", true), ("expiryDate", "date", false) },
            tracking.Items!.Select(x => (x.Code, x.DataType, x.Required)));
        Assert.Equal(new[] { "baseCurrencyCode", "totalCostBase", "unitCostBase", "operationCostBase", "costStatus" }, complete.Result.Columns.Select(x => x.Code));

        Assert.Equal(("GET", "/api/manufacturing/operators", "list", null), (Op("uretim.operatorler").Method, Op("uretim.operatorler").Route,
            Op("uretim.operatorler").Result.Shape, Op("uretim.operatorler").Result.RowsPath));
        Assert.Equal(new[] { "id", "code", "fullName" }, Op("uretim.operatorler").Result.Columns.Select(x => x.Code));

        var recipes = Op("uretim.recete.tumunuListele");
        Assert.Equal(("GET", "/api/manufacturing/boms", null), (recipes.Method, recipes.Route, recipes.Result.RowsPath));
        Assert.Equal(new[] { "productStockItemId:guid:False", "isActive:bool:False" }, recipes.Parameters.Select(x => $"{x.Name}:{x.Type}:{x.Required}"));
        Assert.Contains(recipes.Result.Columns, x => x.Code == "lineCount" && x.Label == "Bileşen sayısı");
        Assert.Contains(recipes.Result.Columns, x => x.Code == "operationCount");
        Assert.Equal(recipes.Result.Columns, Op("uretim.recete.getir").Result.Columns);
        Assert.Equal(("/api/manufacturing/boms/{id}", "lines"), (Op("uretim.recete.bilesenleri").Route, Op("uretim.recete.bilesenleri").Result.RowsPath));
        Assert.Equal(("DELETE", "/api/manufacturing/boms/{id}", "delete"), (Op("uretim.recete.sil").Method, Op("uretim.recete.sil").Route, Op("uretim.recete.sil").PageKind));
        Assert.Equal("/api/manufacturing/boms/{id}/activate", Op("uretim.recete.etkinlestir").Route);
        Assert.Equal("/api/manufacturing/boms/{id}/deactivate", Op("uretim.recete.pasifeAl").Route);

        var report = Op("uretim.maliyetAnalizi");
        Assert.Equal(("GET", "/api/reports/manufacturing-cost-variance", "list", "orders"), (report.Method, report.Route, report.Result.Shape, report.Result.RowsPath));
        Assert.Equal(new[] { "from:date:True", "to:date:True", "page:int:False", "pageSize:int:False" },
            report.Parameters.Select(x => $"{x.Name}:{x.Type}:{x.Required}"));
        Assert.Equal(new[] { "from", "to", "periodBasis", "baseCurrencyCode", "page", "pageSize", "totalCount", "limitations",
            "pagePlannedMaterialBase", "pagePlannedConversionBase", "pageActualMaterialBase" }, report.Result.MetaPaths);
        Assert.Contains(report.Result.Columns, x => x.Code == "totalVarianceBase" && x.Label == "Toplam fark");
    }

    [Fact]
    public async Task Allowed_follows_the_manufacturing_permissions()
    {
        await using var factory = new ErpOperationCatalogTests.ErpOperationApiFactory();
        await ErpOperationCatalogTests.SeedAsync(factory, platform =>
        {
            AddUser(platform, ReadUser);
            platform.TenantPermissionRules.Add(Rule("erp.manufacturing.read", ReadUser));
        });
        using var client = factory.CreateClient();

        ErpOperationCatalogTests.SetIdentity(client, ReadUser, "TenantUser");
        var read = await OperationsAsync(client);
        Assert.All(ReadOperations, name => Assert.True(read[name], name));
        Assert.All(NewOperations.Except(ReadOperations).Where(x => x != "uretim.maliyetAnalizi"), name => Assert.False(read[name], name));

        ErpOperationCatalogTests.SetIdentity(client, ErpOperationCatalogTests.Admin, "TenantAdmin");
        // Every route resolves (an unresolved route would never be allowed, even for a TenantAdmin).
        Assert.All((await OperationsAsync(client)).Where(x => x.Key.StartsWith("uretim.", StringComparison.Ordinal)), x => Assert.True(x.Value, x.Key));
    }

    // ---- Endpoints ----

    [Fact]
    public async Task Order_list_carries_product_flags_route_summary_and_company_wide_counters()
    {
        await using var factory = await SeededFactoryAsync();
        using var client = AdminClient(factory);

        var page = await client.GetFromJsonAsync<JsonElement>("/api/manufacturing/orders?page=1&pageSize=25");
        Assert.Equal((6, 4, 1, 1), (Int(page, "totalCount"), Int(page, "openOrderCount"), Int(page, "unscheduledOrderCount"), Int(page, "completedOrderCount")));
        // Open orders: MO-1, MO-2 (Released), MO-5 and MO-6 (see OpenPlannedCost).
        Assert.Equal(OpenPlannedCost, page.GetProperty("openPlannedCostBase").GetDecimal());
        var items = page.GetProperty("items").EnumerateArray().ToDictionary(x => x.GetProperty("code").GetString()!);
        Assert.DoesNotContain("MO-B", items.Keys);

        var planned = items["MO-1"];
        Assert.Equal((Product, "MAMUL-1", "Masa", "Lot"), (planned.GetProperty("productStockItemId").GetGuid(), Str(planned, "productCode"),
            Str(planned, "productName"), Str(planned, "productTrackingMode")));
        Assert.Equal((2, 1, 0, 0), (Int(planned, "operationCount"), Int(planned, "scheduledOperationCount"), Int(planned, "startedOperationCount"),
            Int(planned, "completedOperationCount")));
        Assert.Equal((true, false, false, true), (Bool(planned, "canSchedule"), Bool(planned, "canRelease"), Bool(planned, "canComplete"), Bool(planned, "canCancel")));
        Assert.Equal(("2 op · çizelgelenmedi", "Stoka üretim", "KOMP-1"), (Str(planned, "routeSummary"), Str(planned, "sourceText"), Str(planned, "componentCodes")));
        Assert.Equal((10m, 7m, 17m), (Dec(planned, "plannedMaterialCostBase"), Dec(planned, "plannedOperationCostBase"), Dec(planned, "plannedCostBase")));
        Assert.Equal(JsonValueKind.Null, planned.GetProperty("actualOperationCostBase").ValueKind);
        // Existing fields stay as they were (nested lines and operations included).
        Assert.Equal(("REC-1 · Masa reçetesi", "Planned"), (Str(planned, "billOfMaterialName"), Str(planned, "status")));
        Assert.Equal(2, planned.GetProperty("operations").GetArrayLength());

        var released = items["MO-2"];
        Assert.Equal((2, 2, 1), (Int(released, "startedOperationCount"), Int(released, "scheduledOperationCount"), Int(released, "completedOperationCount")));
        Assert.Equal((false, false, false, true), (Bool(released, "canSchedule"), Bool(released, "canRelease"), Bool(released, "canComplete"), Bool(released, "canCancel")));
        Assert.Equal(("1 / 2 tamamlandı", "SO-7 · satır 2"), (Str(released, "routeSummary"), Str(released, "sourceText")));
        Assert.Equal(12.5m, Dec(released, "actualOperationCostBase"));

        Assert.Equal(("1 / 1 tamamlandı", false, false), (Str(items["MO-3"], "routeSummary"), Bool(items["MO-3"], "canCancel"), Bool(items["MO-3"], "canComplete")));
        Assert.Equal("1 op", Str(items["MO-4"], "routeSummary"));
        Assert.Equal(("rota yok", false, true), (Str(items["MO-5"], "routeSummary"), Bool(items["MO-5"], "canSchedule"), Bool(items["MO-5"], "canRelease")));
        Assert.Equal(("1 op · çizelgelendi", true), (Str(items["MO-6"], "routeSummary"), Bool(items["MO-6"], "canRelease")));

        // The counters ignore the filters; totalCount follows them.
        var filtered = await client.GetFromJsonAsync<JsonElement>("/api/manufacturing/orders?page=1&status=Completed&q=MO");
        Assert.Equal((1, 4, 1, 1), (Int(filtered, "totalCount"), Int(filtered, "openOrderCount"), Int(filtered, "unscheduledOrderCount"), Int(filtered, "completedOrderCount")));
        Assert.Equal(OpenPlannedCost, filtered.GetProperty("openPlannedCostBase").GetDecimal());
        // Without page the legacy flat array is unchanged.
        Assert.Equal(JsonValueKind.Array, (await client.GetFromJsonAsync<JsonElement>("/api/manufacturing/orders")).ValueKind);
    }

    [Fact]
    public async Task Single_order_and_recipe_reads_are_tenant_scoped()
    {
        await using var factory = await SeededFactoryAsync();
        using var client = AdminClient(factory);
        var list = await client.GetFromJsonAsync<JsonElement>("/api/manufacturing/orders?page=1");
        var row = list.GetProperty("items").EnumerateArray().Single(x => Str(x, "code") == "MO-2");

        var single = await client.GetFromJsonAsync<JsonElement>($"/api/manufacturing/orders/{row.GetProperty("id").GetGuid()}");
        Assert.True(JsonNode.DeepEquals(JsonNode.Parse(row.GetRawText()), JsonNode.Parse(single.GetRawText())));
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/manufacturing/orders/{Guid.NewGuid()}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/manufacturing/orders/{OtherTenantOrder}")).StatusCode);

        var bom = await client.GetFromJsonAsync<JsonElement>($"/api/manufacturing/boms/{ActiveBom}");
        Assert.Equal(("REC-1", 1, 2, 6), (Str(bom, "code"), Int(bom, "lineCount"), Int(bom, "operationCount"), Int(bom, "orderCount")));
        Assert.Equal(1, bom.GetProperty("lines").GetArrayLength());
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/manufacturing/boms/{OtherTenantBom}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/manufacturing/boms/{Guid.NewGuid()}")).StatusCode);

        async Task<string[]> Codes(string query) => (await client.GetFromJsonAsync<JsonElement>("/api/manufacturing/boms" + query)).EnumerateArray()
            .Select(x => Str(x, "code")).ToArray();
        Assert.Equal(new[] { "REC-1", "REC-2" }, await Codes(""));
        Assert.Equal(new[] { "REC-1" }, await Codes("?isActive=true"));
        Assert.Equal(new[] { "REC-2" }, await Codes("?isActive=false"));
        Assert.Equal(new[] { "REC-1" }, await Codes($"?productStockItemId={Product}&isActive=true"));
        var passive = (await client.GetFromJsonAsync<JsonElement>("/api/manufacturing/boms?isActive=false")).EnumerateArray().Single();
        Assert.Equal((0, 0), (Int(passive, "lineCount") - 1, Int(passive, "operationCount")));
    }

    [Fact]
    public async Task Operators_are_the_active_employees_of_the_tenant_by_name()
    {
        await using var factory = await SeededFactoryAsync();
        using var client = AdminClient(factory);
        var operators = (await client.GetFromJsonAsync<JsonElement>("/api/manufacturing/operators")).EnumerateArray().ToArray();
        Assert.Equal(new[] { "Ayşe Kaya", "Mehmet Demir" }, operators.Select(x => Str(x, "fullName")));
        Assert.Equal(("P-002", JsonValueKind.Null), (Str(operators[0], "code"), operators[1].GetProperty("code").ValueKind));

        // Under the manufacturing read permission, not HR.
        await using var other = new ErpOperationCatalogTests.ErpOperationApiFactory();
        await ErpOperationCatalogTests.SeedAsync(other, platform =>
        {
            AddUser(platform, ReadUser);
            platform.TenantPermissionRules.Add(Rule("erp.manufacturing.read", ReadUser));
        });
        using var reader = other.CreateClient();
        ErpOperationCatalogTests.SetIdentity(reader, ReadUser, "TenantUser");
        Assert.Equal(HttpStatusCode.OK, (await reader.GetAsync("/api/manufacturing/operators")).StatusCode);
        ErpOperationCatalogTests.SetIdentity(reader, Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"), "TenantUser");
        Assert.Equal(HttpStatusCode.Forbidden, (await reader.GetAsync("/api/manufacturing/operators")).StatusCode);
    }

    [Fact]
    public async Task Cost_variance_report_has_flat_page_totals()
    {
        await using var factory = await SeededFactoryAsync();
        using var client = AdminClient(factory);
        var today = TcmbExchangeRateImporter.IstanbulLocalDate(DateTimeOffset.UtcNow);
        var report = await client.GetFromJsonAsync<JsonElement>(
            $"/api/reports/manufacturing-cost-variance?from={today.AddDays(-30):yyyy-MM-dd}&to={today.AddDays(30):yyyy-MM-dd}&page=1&pageSize=50");
        var totals = report.GetProperty("pageTotals");
        Assert.Equal(6, Int(report, "totalCount"));
        Assert.Equal(totals.GetProperty("plannedMaterialBase").GetDecimal(), report.GetProperty("pagePlannedMaterialBase").GetDecimal());
        Assert.Equal(totals.GetProperty("plannedLaborBase").GetDecimal() + totals.GetProperty("plannedOverheadBase").GetDecimal()
            + totals.GetProperty("plannedEnergyBase").GetDecimal(), report.GetProperty("pagePlannedConversionBase").GetDecimal());
        Assert.Equal(totals.GetProperty("actualMaterialBase").ValueKind, report.GetProperty("pageActualMaterialBase").ValueKind);
        Assert.False(string.IsNullOrWhiteSpace(Str(report, "limitations")));
    }

    [Fact]
    public void Standard_menu_lists_the_new_order_screen()
    {
        Assert.Contains("manufacturing-order-create", StandardMenuEndpoints.PageKeys);
        Assert.Contains("manufacturing-order-create", StandardMenuEndpoints.NavigablePageKeys);
    }

    // ---- Standards ----

    [Theory]
    [InlineData("manufacturing-orders", "Üretim emirleri")]
    [InlineData("manufacturing-order-create", "Yeni üretim emri")]
    [InlineData("manufacturing-recipes", "Tanımlı reçeteler")]
    [InlineData("manufacturing-cost-variance", "Üretim maliyet analizi")]
    public void Standard_is_preview_and_uses_catalog_operations(string key, string title)
    {
        var standard = SystemPageStandards.All[key];
        // Üretim ekranları 2. sürümde Liste ve Kayıt kartı kalıplarına taşındı.
        var version = key == "manufacturing-cost-variance" || key is "manufacturing-orders" or "manufacturing-order-create" or "manufacturing-recipes" ? 2 : 1;
        Assert.Equal((version, "preview", title, "Üretim"), (standard.Version, standard.Stage, standard.Title, standard.Module));
        Assert.True(TenantCustomPageSchema.Validate(standard.DefinitionJson, out var error), error);
        Assert.All(standard.Items, x => Assert.True(x.Since is 1 or 2 && x.Label.Length is > 0 and <= 80, x.Key));
        string[] pickers = ["depo.listele", "satis.siparis.listele", "satis.siparis.kalemleri"];
        Assert.All(Operations(key), name => Assert.True((IsNewOperation(name) || pickers.Contains(name))
            && ErpOperationCatalog.TryGet(name, out var op) && !op.Deprecated, name));
    }

    [Fact]
    public void Orders_list_binds_counters_state_flags_and_confirmed_cancel()
    {
        const string key = "manufacturing-orders";
        var view = Assert.Single(SystemPageStandards.All[key].ScreenViews);
        Assert.Equal(("manufacturing-orders", "liste"), (view.Key, view.Component));
        Assert.Equal(new[] { "billOfMaterialName", "code", "plannedDate", "plannedQuantity", "status", "warehouseName" }, view.Fields.Keys.Order(StringComparer.Ordinal));
        var bar = Props(key, "komutlar");
        Assert.Equal(("{{emirler.meta.totalCount}}", "yeniDugmesi"), ((string)bar["titleCount"]!, (string)bar["newButton"]!));
        Assert.Equal(new[] { "cizelgeleDugmesi", "serbestBirakDugmesi", "tamamlaDugmesi", "iptalDugmesi" }, Strings(bar["moreButtons"]));
        Assert.Contains("delete", Strings(bar["hiddenCommands"]));
        foreach (var (metric, meta) in new[] { ("acikGostergesi", "openOrderCount"), ("maliyetGostergesi", "openPlannedCostBase"),
                     ("cizelgesizGostergesi", "unscheduledOrderCount"), ("tamamlananGostergesi", "completedOrderCount") })
            Assert.Equal($"{{{{emirler.meta.{meta}}}}}", (string)Props(key, metric)["value"]!);
        Assert.Equal(("{{suzgec.q}}", "{{durumSecimi.value}}"), (Binding(key, "emirler", "q"), Binding(key, "emirler", "status")));
        var list = Props(key, "liste");
        Assert.Equal(("server", 25), ((string)list["paging"]!, (int)list["pageSize"]!));
        Assert.Equal(7, Strings(list["columns"]).Length);
        Assert.Equal("list", (string)Definition(key)["template"]!["name"]!);
        Assert.Equal("detail", (string)Props(key, "detayKarti")["slot"]!);
        Assert.Equal(("openDialog", "rotaPenceresi"), ((string)Props(key, "rotaDugmesi")["actionType"]!, (string)Props(key, "rotaDugmesi")["dialogId"]!));
        Assert.Equal(("openDialog", "bilesenPenceresi"), ((string)Props(key, "bilesenDugmesi")["actionType"]!, (string)Props(key, "bilesenDugmesi")["dialogId"]!));
        Assert.Equal("liste.seciliSatir.canSchedule == true", (string)Props(key, "cizelgeleDugmesi")["visibleWhen"]!);
        Assert.Equal("liste.seciliSatir.canRelease == true", (string)Props(key, "serbestBirakDugmesi")["visibleWhen"]!);
        Assert.Equal(("openDialog", "tamamlaPenceresi"), ((string)Props(key, "tamamlaDugmesi")["actionType"]!, (string)Props(key, "tamamlaDugmesi")["dialogId"]!));
        var cancel = Props(key, "iptalDugmesi");
        Assert.True((bool)cancel["confirmEnabled"]!);
        Assert.Contains("Başlamış operasyon varsa", (string)cancel["confirmText"]!);
        Assert.Equal("liste.seciliSatir.canCancel == true", (string)cancel["visibleWhen"]!);
        // Operation start / actuals bind both route ids; the completion sends the lot / serial rows.
        Assert.Equal(("{{liste.seciliSatir.id}}", "{{operasyonTablosu.seciliSatir.id}}"), (Binding(key, "opBaslat", "id"), Binding(key, "opBaslat", "operationId")));
        Assert.Equal(("{{liste.seciliSatir.id}}", "{{operasyonTablosu.seciliSatir.id}}", "{{operator.value}}"),
            (Binding(key, "opTamamla", "id"), Binding(key, "opTamamla", "operationId"), Binding(key, "opTamamla", "performedByEmployeeId")));
        Assert.Equal(new[] { "opBaslatDugmesi", "opTamamlaDugmesi" }, Strings(Props(key, "operasyonTablosu")["rowActions"]));
        var tracking = Parameter(Definition(key), "tamamla", "finishedGoodsTracking");
        Assert.Equal(("{{takip.satirlar}}", "list"), ((string)tracking["binding"]!, (string)tracking["type"]!));
        Assert.Equal("{{emir.rows[0].plannedQuantity}}", (string)Props(key, "iyiMiktar")["defaultValue"]!);
        Assert.Equal(("0", "fireMiktar.value > 0"), ((string)Props(key, "fireMiktar")["defaultValue"]!, (string)Props(key, "fireNedeni")["requiredWhen"]!));
        Assert.Equal("dialog", (string)Props(key, "takip")["slot"]!);
        var dialog = Props(key, "tamamlaPenceresi");
        Assert.Equal(("tamamla", "Bildir ve Tamamla"), ((string)dialog["saveQuery"]!, (string)dialog["saveLabel"]!));
        Assert.Equal(new[] { "emirler", "emir", "operasyonlar", "bilesenler" }, Strings(dialog["refreshQueries"]));
        Assert.Equal("uretim.operatorler", Operation(key, "operatorler"));
    }

    [Fact]
    public void Order_create_posts_the_order_and_returns_to_the_list()
    {
        const string key = "manufacturing-order-create";
        Assert.Empty(SystemPageStandards.All[key].ScreenViews);
        Assert.Equal(new[] { "code", "plannedDate", "warehouseId", "billOfMaterialId", "plannedQuantity", "sourceSalesOrderId", "sourceSalesOrderLineNumber" },
            Definition(key)["queries"]!.AsArray().OfType<JsonObject>().Single(x => (string)x["id"]! == "olustur")["parameters"]!.AsArray()
                .Select(x => (string)x!["name"]!));
        Assert.Equal(("{{emirKodu.value}}", "{{siparisSatiri.value}}"), (Binding(key, "olustur", "code"), Binding(key, "olustur", "sourceSalesOrderLineNumber")));
        // The recipe picker reads active recipes only; bindings are paths, so the literal sits in a hidden input.
        Assert.Equal("{{receteDurumu.value}}", Binding(key, "receteler", "isActive"));
        Assert.Equal(("true", true), ((string)Props(key, "receteDurumu")["defaultValue"]!, (bool)Props(key, "receteDurumu")["hidden"]!));
        Assert.Equal("{{bugun}}", (string)Props(key, "planTarihi")["defaultValue"]!);
        Assert.Equal("1", (string)Props(key, "miktar")["defaultValue"]!);
        Assert.Equal(("{{recete.value}}", "{{siparis.value}}"), (Binding(key, "receteBilesenleri", "id"), Binding(key, "siparisSatirlari", "id")));
        var bar = Props(key, "komutlar");
        Assert.Equal(("olustur", "@manufacturing-orders", true), ((string)bar["saveQuery"]!, (string)bar["afterSavePageCode"]!, (bool)bar["afterSaveRefresh"]!));
        Assert.Equal("@manufacturing-orders", (string)Props(key, "vazgecDugmesi")["pageCode"]!);
        Assert.Equal("record", (string)Definition(key)["template"]!["name"]!);
        Assert.Equal("summary", (string)Props(key, "ozet")["slot"]!);
        Assert.Equal("below", (string)Props(key, "icerikTablosu")["slot"]!);
    }

    [Fact]
    public void Recipes_list_opens_the_legacy_card_and_guards_delete()
    {
        const string key = "manufacturing-recipes";
        var view = Assert.Single(SystemPageStandards.All[key].ScreenViews);
        Assert.Equal(("manufacturing-recipes", "liste"), (view.Key, view.Component));
        var open = Props(key, "acDugmesi");
        Assert.Equal(("erpPage", "manufacturing-recipe-create", true), ((string)open["actionType"]!, (string)open["pageKey"]!, (bool)open["legacyScreen"]!));
        Assert.Equal(new[] { "bomId={{liste.seciliSatir.id}}" }, Strings(open["params"]));
        Assert.True((bool)Props(key, "yeniDugmesi")["legacyScreen"]!);
        var delete = Props(key, "silDugmesi");
        Assert.Equal(("Üretim emri referansı olan reçeteler silinemez.", true), ((string)delete["disabledReason"]!, (bool)delete["confirmEnabled"]!));
        Assert.Contains("orderCount > 0", (string)delete["disabledWhen"]!);
        Assert.Equal("uretim.recete.sil", Operation(key, "sil"));
        Assert.Equal(("liste.seciliSatir.isActive == true", "liste.seciliSatir.isActive == false"),
            ((string)Props(key, "pasifeAlDugmesi")["visibleWhen"]!, (string)Props(key, "etkinlestirDugmesi")["visibleWhen"]!));
        Assert.Equal("list", (string)Definition(key)["template"]!["name"]!);
        Assert.Equal(8, Strings(Props(key, "liste")["columns"]).Length);
        Assert.Equal("detail", (string)Props(key, "detayOzeti")["slot"]!);
        // No client paging value exists in the engine: the recipe list shows every row.
        Assert.False(Props(key, "liste").ContainsKey("paging"));
        Assert.Equal("{{durumSecimi.value}}", Binding(key, "receteler", "isActive"));
    }

    [Fact]
    public void Cost_variance_reads_the_period_and_page_totals()
    {
        const string key = "manufacturing-cost-variance";
        Assert.Equal(("{{baslangic.value}}", "{{bitis.value}}"), (Binding(key, "rapor", "from"), Binding(key, "rapor", "to")));
        Assert.Equal(("{{bugun}}", "{{bugun}}"), ((string)Props(key, "baslangic")["defaultValue"]!, (string)Props(key, "bitis")["defaultValue"]!));
        Assert.Equal("{{rapor.meta.pagePlannedMaterialBase}}", (string)Props(key, "malzemeGostergesi")["value"]!);
        Assert.Equal("{{rapor.meta.pagePlannedConversionBase}}", (string)Props(key, "donusumGostergesi")["value"]!);
        Assert.Equal("{{rapor.meta.pageActualMaterialBase}}", (string)Props(key, "fiiliGostergesi")["value"]!);
        Assert.Equal("{{rapor.meta.limitations}}", (string)Props(key, "kapsamNotu")["text"]!);
        Assert.Equal(("server", 50), ((string)Props(key, "liste")["paging"]!, (int)Props(key, "liste")["pageSize"]!));
        Assert.False(Props(key, "liste").ContainsKey("rowOpenAction"));
        // Liste kalıbı: yedi sütun, tam döküm seçili emrin kart grubunda; rapor salt okunur.
        Assert.Equal("list", (string)Definition(key)["template"]!["name"]!);
        Assert.Equal(7, ((JsonArray)Props(key, "liste")["columns"]!).Count);
        Assert.Equal("detail", (string)Props(key, "detayKarti")["slot"]!);
        Assert.All(Definition(key)["queries"]!.AsArray().OfType<JsonObject>(), x => Assert.Equal("read", (string)x["kind"]!));
    }

    [Theory]
    [InlineData("manufacturing-orders", "manufacturingOrdersOperations.fixture.json")]
    [InlineData("manufacturing-order-create", "manufacturingOrderCreateOperations.fixture.json")]
    [InlineData("manufacturing-recipes", "manufacturingRecipesOperations.fixture.json")]
    [InlineData("manufacturing-cost-variance", "manufacturingCostVarianceOperations.fixture.json")]
    public async Task Frontend_fixture_matches_catalog(string key, string fixtureFile)
    {
        await using var factory = new ErpOperationCatalogTests.ErpOperationApiFactory();
        await ErpOperationCatalogTests.SeedAsync(factory, _ => { });
        using var client = factory.CreateClient();
        ErpOperationCatalogTests.SetIdentity(client, ErpOperationCatalogTests.Admin, "TenantAdmin");
        var live = (await client.GetFromJsonAsync<JsonElement>("/api/custom-pages/erp-operations")).GetProperty("operations")
            .EnumerateArray().ToDictionary(x => x.GetProperty("name").GetString()!, x => JsonNode.Parse(x.GetRawText())!);
        var fixture = JsonNode.Parse(File.ReadAllText(Path.Combine(RepositoryRoot(), "frontend", "erp-web", "src", "system-pages", fixtureFile)))!["operations"]!.AsArray();
        Assert.Equal(Operations(key).Distinct().Order(StringComparer.Ordinal), fixture.Select(x => (string)x!["name"]!).Order(StringComparer.Ordinal));
        foreach (var operation in fixture)
            Assert.True(JsonNode.DeepEquals(live[(string)operation!["name"]!], operation), (string)operation["name"]!);
    }

    // ---- Seed ----

    // Open orders' planned cost: MO-1 (line 10 + operations 3 + 4), MO-2 (line 20 + operations 5 + 6), MO-5 (nothing), MO-6 (operation 8).
    private const decimal OpenPlannedCost = 10m + 3m + 4m + 20m + 5m + 6m + 8m;
    private static readonly Guid OtherTenantOrder = Guid.Parse("b0000000-0000-0000-0000-0000000000ff");

    private static async Task<ErpOperationCatalogTests.ErpOperationApiFactory> SeededFactoryAsync()
    {
        var factory = new ErpOperationCatalogTests.ErpOperationApiFactory();
        await ErpOperationCatalogTests.SeedAsync(factory, _ => { });
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        var a = ErpOperationCatalogTests.TenantA;
        var b = ErpOperationCatalogTests.TenantB;
        var today = TcmbExchangeRateImporter.IstanbulLocalDate(DateTimeOffset.UtcNow);
        db.StockItems.AddRange(
            new StockItem { Id = Product, TenantId = a, Code = "MAMUL-1", Name = "Masa", UnitCode = "ADET", IsActive = true, TrackingMode = InventoryTrackingMode.Lot },
            new StockItem { Id = Component, TenantId = a, Code = "KOMP-1", Name = "Tabla", UnitCode = "ADET", IsActive = true });
        db.Warehouses.Add(new Warehouse { Id = Warehouse, TenantId = a, Code = "MRK", Name = "Merkez depo", IsActive = true });
        db.ManufacturingWorkCenters.Add(new ManufacturingWorkCenter { Id = WorkCenter, TenantId = a, Code = "KESIM", Name = "Kesim", IsActive = true });
        db.CustomerAccounts.Add(new CustomerAccount { Id = Customer, TenantId = a, Code = "C-1", Name = "Örnek", Type = CounterpartyType.Customer, CurrencyCode = "TRY", IsActive = true });
        db.SalesOrders.Add(new SalesOrder { Id = SalesOrder, TenantId = a, Code = "SO-7", CustomerId = Customer, CurrencyCode = "TRY", OrderDate = today });
        db.BillOfMaterials.AddRange(
            new BillOfMaterial
            {
                Id = ActiveBom, TenantId = a, Code = "REC-1", Name = "Masa reçetesi", ProductStockItemId = Product, IsActive = true,
                Lines = [new BillOfMaterialLine { TenantId = a, ComponentStockItemId = Component, Quantity = 1m, StandardUnitCostBase = 10m }],
                Operations =
                [
                    new BillOfMaterialOperation { TenantId = a, Sequence = 10, WorkCenterId = WorkCenter, RunMinutesPerOutputUnit = 1m },
                    new BillOfMaterialOperation { TenantId = a, Sequence = 20, WorkCenterId = WorkCenter, RunMinutesPerOutputUnit = 1m }
                ]
            },
            new BillOfMaterial
            {
                Id = PassiveBom, TenantId = a, Code = "REC-2", Name = "Eski reçete", ProductStockItemId = Product, IsActive = false,
                Lines = [new BillOfMaterialLine { TenantId = a, ComponentStockItemId = Component, Quantity = 2m }]
            },
            new BillOfMaterial { Id = OtherTenantBom, TenantId = b, Code = "REC-B", Name = "Başka firma", ProductStockItemId = Guid.NewGuid() });

        ManufacturingOrderOperation Op(int sequence, decimal plannedCost, ManufacturingOperationStatus status, bool scheduled, decimal? actualCost = null) => new()
        {
            TenantId = a, Sequence = sequence, WorkCenterId = WorkCenter, WorkCenterCodeSnapshot = "KESIM", WorkCenterNameSnapshot = "Kesim",
            PlannedCostBase = plannedCost, Status = status, ScheduledStartDate = scheduled ? today : null, ScheduledEndDate = scheduled ? today : null,
            ActualCostBase = actualCost
        };
        ManufacturingOrderLine Line(decimal plannedCost) => new()
        {
            TenantId = a, ComponentStockItemId = Component, ComponentCodeSnapshot = "KOMP-1", ComponentNameSnapshot = "Tabla", RequiredQuantity = 1m,
            StandardUnitCostBaseSnapshot = plannedCost, PlannedCostBase = plannedCost
        };
        ManufacturingOrder Order(string code, ManufacturingOrderStatus status, int dayOffset, IEnumerable<ManufacturingOrderLine> lines,
            IEnumerable<ManufacturingOrderOperation> operations, Guid? tenantId = null) => new()
        {
            TenantId = tenantId ?? a, Code = code, BillOfMaterialId = ActiveBom, WarehouseId = Warehouse, PlannedQuantity = 40m, Status = status,
            PlannedDate = today.AddDays(dayOffset), Lines = lines.ToList(), Operations = operations.ToList()
        };
        var released = Order("MO-2", ManufacturingOrderStatus.Released, -2, [Line(20m)],
            [Op(10, 5m, ManufacturingOperationStatus.Completed, true, 12.5m), Op(20, 6m, ManufacturingOperationStatus.InProgress, true)]);
        released.SourceSalesOrderId = SalesOrder;
        released.SourceSalesOrderLineNumber = 2;
        db.ManufacturingOrders.AddRange(
            Order("MO-1", ManufacturingOrderStatus.Planned, -1, [Line(10m)],
                [Op(10, 3m, ManufacturingOperationStatus.Planned, true), Op(20, 4m, ManufacturingOperationStatus.Planned, false)]),
            released,
            Order("MO-3", ManufacturingOrderStatus.Completed, -3, [Line(100m)], [Op(10, 100m, ManufacturingOperationStatus.Completed, true, 1m)]),
            Order("MO-4", ManufacturingOrderStatus.Cancelled, -4, [Line(100m)], [Op(10, 100m, ManufacturingOperationStatus.Planned, false)]),
            Order("MO-5", ManufacturingOrderStatus.Planned, -5, [], []),
            Order("MO-6", ManufacturingOrderStatus.Planned, -6, [], [Op(10, 8m, ManufacturingOperationStatus.Planned, true)]));
        var otherTenant = Order("MO-B", ManufacturingOrderStatus.Planned, 0, [], [], b);
        otherTenant.Id = OtherTenantOrder;
        otherTenant.BillOfMaterialId = OtherTenantBom;
        db.ManufacturingOrders.Add(otherTenant);
        db.EmployeeRecords.AddRange(
            new EmployeeRecord { TenantId = a, PersonnelCode = "", FullName = "Mehmet Demir", HireDate = today.AddYears(-1) },
            new EmployeeRecord { TenantId = a, PersonnelCode = "P-002", FullName = "Ayşe Kaya", HireDate = today.AddYears(-1) },
            new EmployeeRecord { TenantId = a, PersonnelCode = "P-003", FullName = "Ayrılan Kişi", HireDate = today.AddYears(-2), TerminationDate = today.AddDays(-1) },
            new EmployeeRecord { TenantId = a, PersonnelCode = "P-004", FullName = "Askıda", HireDate = today.AddYears(-2), Status = EmployeeEmploymentStatus.Terminated },
            new EmployeeRecord { TenantId = b, PersonnelCode = "P-B", FullName = "Başka Firma", HireDate = today.AddYears(-1) });
        await db.SaveChangesAsync();
        return factory;
    }

    // ---- Helpers ----

    private static HttpClient AdminClient(ErpOperationCatalogTests.ErpOperationApiFactory factory)
    {
        var client = factory.CreateClient();
        ErpOperationCatalogTests.SetIdentity(client, ErpOperationCatalogTests.Admin, "TenantAdmin");
        return client;
    }

    private static string RepositoryRoot()
    {
        for (var directory = new DirectoryInfo(AppContext.BaseDirectory); directory is not null; directory = directory.Parent)
            if (File.Exists(Path.Combine(directory.FullName, "AIERP.slnx"))) return directory.FullName;
        throw new InvalidOperationException("AIERP.slnx bulunamadı.");
    }

    private static ErpOperation Op(string name) =>
        ErpOperationCatalog.TryGet(name, out var op) ? op : throw new Xunit.Sdk.XunitException($"İşlem yok: {name}");

    private static int Int(JsonElement element, string name) => element.GetProperty(name).GetInt32();
    private static decimal Dec(JsonElement element, string name) => element.GetProperty(name).GetDecimal();
    private static bool Bool(JsonElement element, string name) => element.GetProperty(name).GetBoolean();
    private static string Str(JsonElement element, string name) => element.GetProperty(name).GetString()!;

    private static async Task<Dictionary<string, bool>> OperationsAsync(HttpClient client)
    {
        using var response = await client.GetAsync("/api/custom-pages/erp-operations");
        Assert.True(response.StatusCode == HttpStatusCode.OK, await response.Content.ReadAsStringAsync());
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        return body.GetProperty("operations").EnumerateArray().ToDictionary(x => x.GetProperty("name").GetString()!, x => x.GetProperty("allowed").GetBoolean());
    }

    private static void AddUser(PlatformDbContext platform, Guid id)
    {
        var tenant = platform.Tenants.Local.Single(x => x.Id == ErpOperationCatalogTests.TenantA);
        var user = new AppUser { Id = id, Email = $"{id:N}@example.invalid", DisplayName = "Üretim user", IsActive = true };
        platform.Users.Add(user);
        platform.TenantMemberships.Add(new TenantMembership { TenantId = tenant.Id, UserId = id, Tenant = tenant, User = user, Role = "TenantUser" });
        platform.TenantPermissionRules.Add(Rule("erp.custom-menus.read", id));
    }

    private static TenantPermissionRule Rule(string code, Guid user) => new()
    {
        TenantId = ErpOperationCatalogTests.TenantA, SubjectType = TenantPermissionSubjectType.User, SubjectUserId = user, PermissionCode = code,
        ResourceType = PlatformPermissionCatalog.Definitions.Single(x => x.Code == code).ResourceType, Effect = TenantPermissionEffect.Allow, IsActive = true
    };

    private static JsonObject Definition(string key) => JsonNode.Parse(SystemPageStandards.All[key].DefinitionJson)!.AsObject();

    private static string[] Operations(string key) =>
        Definition(key)["queries"]!.AsArray().OfType<JsonObject>().Select(x => (string)x["operation"]!).ToArray();

    private static string Operation(string key, string queryId) =>
        (string)Definition(key)["queries"]!.AsArray().OfType<JsonObject>().Single(x => (string)x["id"]! == queryId)["operation"]!;

    private static JsonObject Props(string key, string id) =>
        Definition(key)["components"]!.AsArray().OfType<JsonObject>().Single(x => (string)x["id"]! == id)["props"]!.AsObject();

    private static JsonObject Parameter(JsonObject definition, string queryId, string name) =>
        definition["queries"]!.AsArray().OfType<JsonObject>().Single(x => (string)x["id"]! == queryId)["parameters"]!.AsArray()
            .OfType<JsonObject>().Single(x => (string)x["name"]! == name);

    private static string? Binding(string key, string queryId, string parameter) =>
        (string?)Definition(key)["queries"]!.AsArray().OfType<JsonObject>().Single(x => (string)x["id"]! == queryId)["parameters"]!.AsArray()
            .OfType<JsonObject>().SingleOrDefault(x => (string)x["name"]! == parameter)?["binding"];

    private static string[] Strings(JsonNode? node) => node!.AsArray().Select(x => (string)x!).ToArray();
}
