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
/// Dış Ticaret system pages (foreign-trade, foreign-trade-case): the disTicaret.* ERP operations, the list's q / totalCount and
/// server-joined view fields, the single-case and summary endpoints, the declared value default and HS code clean-up, the
/// stock document link permission (execute), the menu keys and the two standards.
/// </summary>
public sealed class ForeignTradeSystemPagesTests
{
    private static readonly Guid ExecuteUser = Guid.Parse("dddddddd-dddd-dddd-dddd-dddddddddddd");
    private static readonly Guid CreateUser = Guid.Parse("eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee");
    private static readonly Guid Supplier = Guid.Parse("a0000000-0000-0000-0000-000000000001");
    private static readonly Guid Customer = Guid.Parse("a0000000-0000-0000-0000-000000000002");
    private static readonly Guid PurchaseOrderId = Guid.Parse("b0000000-0000-0000-0000-000000000001");
    private static readonly Guid SalesOrderId = Guid.Parse("b0000000-0000-0000-0000-000000000002");
    private static readonly Guid CancelledPurchaseOrderId = Guid.Parse("b0000000-0000-0000-0000-000000000003");

    private static readonly string[] Operations =
    [
        "disTicaret.dosya.listele", "disTicaret.dosya.getir", "disTicaret.dosya.ozet", "disTicaret.dosya.olustur", "disTicaret.dosya.guncelle",
        "disTicaret.dosya.planla", "disTicaret.dosya.sevkEt", "disTicaret.dosya.gumrugeGecir", "disTicaret.dosya.varisKaydet",
        "disTicaret.dosya.kapat", "disTicaret.dosya.iptalEt", "disTicaret.dosya.stokBelgeleri", "disTicaret.dosya.stokBelgesiBagla",
        "disTicaret.siparis.ithalatSecenekleri", "disTicaret.siparis.ihracatSecenekleri"
    ];

    // ---- Catalog ----

    [Fact]
    public void Catalog_declares_every_foreign_trade_operation_with_its_shape()
    {
        foreach (var name in Operations)
        {
            var op = Op(name);
            Assert.Equal(("Dış Ticaret", false, false), (op.Module, op.Deprecated, op.RequiresTenantAdmin));
            Assert.Null(ErpOperationCatalog.ParameterShapeError(op));
        }
        Assert.Equal(Operations.Order(StringComparer.Ordinal), ErpOperationCatalog.All.Where(x => x.Name.StartsWith("disTicaret.", StringComparison.Ordinal))
            .Select(x => x.Name).Order(StringComparer.Ordinal));

        var list = Op("disTicaret.dosya.listele");
        Assert.Equal(("GET", "/api/foreign-trade/cases", "list", "items"), (list.Method, list.Route, list.Result.Shape, list.Result.RowsPath));
        Assert.Equal(new[] { "q:text", "direction:text", "status:text", "page:int", "pageSize:int" }, list.Parameters.Select(x => $"{x.Name}:{x.Type}"));
        Assert.Equal(new[] { "page", "pageSize", "totalCount" }, list.Result.MetaPaths);
        var codes = list.Result.Columns.Select(x => x.Code).ToArray();
        foreach (var code in new[] { "id", "referenceCode", "direction", "status", "incotermsCode", "declaredValue", "salesDeliveryId", "purchaseReceiptId",
                     "orderCode", "counterpartyName", "route", "shipDate", "arrivalDate" })
            Assert.Contains(code, codes);
        Assert.Equal(("date", "Sevk"), (list.Result.Columns.Single(x => x.Code == "shipDate").DataType, list.Result.Columns.Single(x => x.Code == "shipDate").Label));
        Assert.Equal(list.Result.Columns, Op("disTicaret.dosya.getir").Result.Columns);
        Assert.Equal(("GET", "/api/foreign-trade/cases/{id}", "record"), (Op("disTicaret.dosya.getir").Method, Op("disTicaret.dosya.getir").Route, Op("disTicaret.dosya.getir").Result.Shape));

        var summary = Op("disTicaret.dosya.ozet");
        Assert.Equal(("GET", "/api/foreign-trade/cases/summary", "record"), (summary.Method, summary.Route, summary.Result.Shape));
        Assert.Equal(new[] { "q" }, summary.Parameters.Select(x => x.Name));
        Assert.Equal(new[] { "totalCount", "importCount", "exportCount", "draftCount", "bookedCount", "shippedCount", "customsClearanceCount",
            "arrivedCount", "closedCount", "cancelledCount" }, summary.Result.Columns.Select(x => x.Code));
        Assert.Equal("Dosya", summary.Result.Columns[0].Label);

        var create = Op("disTicaret.dosya.olustur");
        Assert.Equal(("POST", "/api/foreign-trade/cases", "insert", null), (create.Method, create.Route, create.PageKind, create.SourceOperation));
        Assert.Equal(new[] { "direction", "purchaseOrderId", "salesOrderId", "referenceCode", "originCountryCode", "destinationCountryCode", "incotermsCode",
            "harmonizedSystemCode", "transportMode", "carrierReference", "customsReference", "declaredValue", "plannedShipDate", "plannedArrivalDate", "notes" },
            create.Parameters.Select(x => x.Name));
        // declaredValue may be empty (the API writes the order total): nothing is required.
        Assert.DoesNotContain(create.Parameters, x => x.Required);
        var update = Op("disTicaret.dosya.guncelle");
        Assert.Equal(("PUT", "/api/foreign-trade/cases/{id}", "update", "disTicaret.dosya.getir"), (update.Method, update.Route, update.PageKind, update.SourceOperation));
        Assert.DoesNotContain(update.Parameters, x => x.Required && x.In == "body");

        foreach (var (name, status, body) in new[] { ("disTicaret.dosya.planla", "Booked", ""), ("disTicaret.dosya.sevkEt", "Shipped", "actualDate:date,carrierReference:text"),
                     ("disTicaret.dosya.gumrugeGecir", "CustomsClearance", "customsReference:text"), ("disTicaret.dosya.varisKaydet", "Arrived", "actualDate:date"),
                     ("disTicaret.dosya.kapat", "Closed", ""), ("disTicaret.dosya.iptalEt", "Cancelled", "") })
        {
            var op = Op(name);
            Assert.Equal(("POST", "/api/foreign-trade/cases/{id}/transition", "update", "record"), (op.Method, op.Route, op.PageKind, op.Result.Shape));
            Assert.Equal(new[] { "id:route:guid" }.Concat(body.Split(',', StringSplitOptions.RemoveEmptyEntries).Select(x => x.Replace(":", ":body:", StringComparison.Ordinal))),
                op.Parameters.Select(x => $"{x.Name}:{x.In}:{x.Type}"));
            Assert.DoesNotContain(op.Parameters, x => x.In == "body" && x.Required);
            Assert.Equal(new Dictionary<string, object?> { ["status"] = status }, op.FixedBody);
        }

        var documents = Op("disTicaret.dosya.stokBelgeleri");
        Assert.Equal(("GET", "/api/foreign-trade/cases/{id}/inventory-documents", "list", null), (documents.Method, documents.Route, documents.Result.Shape, documents.Result.RowsPath));
        Assert.Equal(new[] { "id", "code", "documentDate", "warehouseName", "lineCount", "isLinked" }, documents.Result.Columns.Select(x => x.Code));
        Assert.Equal("Belge tarihi", documents.Result.Columns.Single(x => x.Code == "documentDate").Label);
        var link = Op("disTicaret.dosya.stokBelgesiBagla");
        Assert.Equal(("POST", "/api/foreign-trade/cases/{id}/inventory-document", "update"), (link.Method, link.Route, link.PageKind));
        Assert.Equal(new[] { "id:route", "documentId:body" }, link.Parameters.Select(x => $"{x.Name}:{x.In}"));

        foreach (var (name, direction) in new[] { ("disTicaret.siparis.ithalatSecenekleri", "Import"), ("disTicaret.siparis.ihracatSecenekleri", "Export") })
        {
            var op = Op(name);
            Assert.Equal(("GET", "/api/foreign-trade/orders", "list", null), (op.Method, op.Route, op.Result.Shape, op.Result.RowsPath));
            Assert.Empty(op.Parameters);
            Assert.Equal(new Dictionary<string, object?> { ["direction"] = direction }, op.FixedQuery);
            Assert.Equal(new[] { "id", "code", "counterpartyName", "orderDate", "currencyCode", "grandTotal", "status" }, op.Result.Columns.Select(x => x.Code));
        }
    }

    [Fact]
    public async Task Allowed_follows_the_foreign_trade_permissions_and_linking_needs_only_execute()
    {
        await using var factory = new ErpOperationCatalogTests.ErpOperationApiFactory();
        await ErpOperationCatalogTests.SeedAsync(factory, platform =>
        {
            AddUser(platform, ExecuteUser);
            AddUser(platform, CreateUser);
            platform.TenantPermissionRules.Add(Rule("erp.foreign-trade.read", ExecuteUser));
            platform.TenantPermissionRules.Add(Rule("erp.foreign-trade.execute", ExecuteUser));
            platform.TenantPermissionRules.Add(Rule("erp.foreign-trade.read", CreateUser));
            platform.TenantPermissionRules.Add(Rule("erp.foreign-trade.create", CreateUser));
        });
        await SeedOrdersAsync(factory);
        var draft = Case("IMP-1", ForeignTradeDirection.Import, ForeignTradeStatus.Draft, purchaseOrderId: PurchaseOrderId);
        await SeedCasesAsync(factory, draft);
        using var client = factory.CreateClient();

        ErpOperationCatalogTests.SetIdentity(client, ExecuteUser, "TenantUser");
        var executor = await OperationsAsync(client);
        Assert.True(executor["disTicaret.dosya.listele"] && executor["disTicaret.dosya.getir"] && executor["disTicaret.dosya.ozet"]);
        Assert.True(executor["disTicaret.dosya.stokBelgesiBagla"]);
        Assert.True(executor["disTicaret.dosya.planla"] && executor["disTicaret.dosya.iptalEt"]);
        Assert.False(executor["disTicaret.dosya.olustur"]);
        Assert.False(executor["disTicaret.dosya.guncelle"]);
        // execute without create reaches the handler: the case is a draft, so the link is refused by the workflow (409), not by permission.
        using (var linked = await client.PostAsJsonAsync($"/api/foreign-trade/cases/{draft.Id}/inventory-document", new { documentId = Guid.NewGuid() }))
            Assert.Equal(HttpStatusCode.Conflict, linked.StatusCode);

        ErpOperationCatalogTests.SetIdentity(client, CreateUser, "TenantUser");
        var creator = await OperationsAsync(client);
        Assert.True(creator["disTicaret.dosya.olustur"]);
        Assert.False(creator["disTicaret.dosya.stokBelgesiBagla"]);
        Assert.False(creator["disTicaret.dosya.planla"]);
        using (var forbidden = await client.PostAsJsonAsync($"/api/foreign-trade/cases/{draft.Id}/inventory-document", new { documentId = Guid.NewGuid() }))
            Assert.Equal(HttpStatusCode.Forbidden, forbidden.StatusCode);

        ErpOperationCatalogTests.SetIdentity(client, ErpOperationCatalogTests.Admin, "TenantAdmin");
        Assert.All((await OperationsAsync(client)).Where(x => x.Key.StartsWith("disTicaret.", StringComparison.Ordinal)), x => Assert.True(x.Value, x.Key));
    }

    // ---- Endpoints ----

    [Fact]
    public async Task List_search_total_count_single_case_and_summary_are_tenant_scoped_with_server_view_fields()
    {
        await using var factory = new ErpOperationCatalogTests.ErpOperationApiFactory();
        await ErpOperationCatalogTests.SeedAsync(factory, _ => { });
        await SeedOrdersAsync(factory);
        // The import case's order was cancelled later: its code and supplier still show.
        var import = Case("IMP-1", ForeignTradeDirection.Import, ForeignTradeStatus.CustomsClearance, purchaseOrderId: CancelledPurchaseOrderId,
            customs: "26TR3400GUM", plannedShip: new DateOnly(2026, 11, 1), actualShip: new DateOnly(2026, 11, 3), plannedArrival: new DateOnly(2026, 11, 20));
        var exportDraft = Case("EXP-1", ForeignTradeDirection.Export, ForeignTradeStatus.Draft, salesOrderId: SalesOrderId);
        var exportShipped = Case("EXP-2", ForeignTradeDirection.Export, ForeignTradeStatus.Shipped, salesOrderId: SalesOrderId, carrier: "ABC-LOJ-77812");
        var otherTenant = Case("IMP-B", ForeignTradeDirection.Import, ForeignTradeStatus.Draft, purchaseOrderId: PurchaseOrderId, tenantId: ErpOperationCatalogTests.TenantB,
            customs: "26TR3400GUM");
        await SeedCasesAsync(factory, import, exportDraft, exportShipped, otherTenant);
        using var client = factory.CreateClient();
        ErpOperationCatalogTests.SetIdentity(client, ErpOperationCatalogTests.Admin, "TenantAdmin");

        var page = await client.GetFromJsonAsync<JsonElement>("/api/foreign-trade/cases?pageSize=2");
        Assert.Equal((3, 3, 2), (Int(page, "total"), Int(page, "totalCount"), page.GetProperty("items").GetArrayLength()));
        async Task<string[]> Refs(string query) => (await client.GetFromJsonAsync<JsonElement>("/api/foreign-trade/cases?" + query)).GetProperty("items")
            .EnumerateArray().Select(x => x.GetProperty("referenceCode").GetString()!).Order(StringComparer.Ordinal).ToArray();
        Assert.Equal(new[] { "IMP-1" }, await Refs("q=GUM"));
        Assert.Equal(new[] { "EXP-2" }, await Refs("q=ABC-LOJ"));
        Assert.Equal(new[] { "EXP-1", "EXP-2" }, await Refs("q=EXP"));
        Assert.Empty(await Refs("q=IMP-B"));
        Assert.Equal(new[] { "EXP-2" }, await Refs("q=EXP&status=Shipped"));
        Assert.Equal(new[] { "IMP-1" }, await Refs("direction=Import"));

        var row = (await client.GetFromJsonAsync<JsonElement>("/api/foreign-trade/cases?q=IMP-1")).GetProperty("items")[0];
        Assert.Equal(("PO-OLD", "Tedarik GmbH", "DE → TR", "2026-11-03", "2026-11-20"),
            (Str(row, "orderCode"), Str(row, "counterpartyName"), Str(row, "route"), Str(row, "shipDate"), Str(row, "arrivalDate")));

        var single = await client.GetFromJsonAsync<JsonElement>($"/api/foreign-trade/cases/{exportShipped.Id}");
        Assert.Equal(("EXP-2", "SO-1", "Müller GmbH", "TR → DE"), (Str(single, "referenceCode"), Str(single, "orderCode"), Str(single, "counterpartyName"), Str(single, "route")));
        Assert.Equal(JsonValueKind.Null, single.GetProperty("arrivalDate").ValueKind);
        using (var foreign = await client.GetAsync($"/api/foreign-trade/cases/{otherTenant.Id}"))
            Assert.Equal(HttpStatusCode.NotFound, foreign.StatusCode);

        var summary = await client.GetFromJsonAsync<JsonElement>("/api/foreign-trade/cases/summary");
        Assert.Equal((3, 1, 2, 1, 0, 1, 1, 0, 0, 0), (Int(summary, "totalCount"), Int(summary, "importCount"), Int(summary, "exportCount"),
            Int(summary, "draftCount"), Int(summary, "bookedCount"), Int(summary, "shippedCount"), Int(summary, "customsClearanceCount"),
            Int(summary, "arrivedCount"), Int(summary, "closedCount"), Int(summary, "cancelledCount")));
        // Same q as the list; direction and status filters are not summary parameters.
        var searched = await client.GetFromJsonAsync<JsonElement>("/api/foreign-trade/cases/summary?q=GUM&direction=Export&status=Draft");
        Assert.Equal((1, 1, 0, 1), (Int(searched, "totalCount"), Int(searched, "importCount"), Int(searched, "exportCount"), Int(searched, "customsClearanceCount")));

        // Without a read rule the new reads are forbidden like the list.
        ErpOperationCatalogTests.SetIdentity(client, Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"), "TenantUser");
        foreach (var path in new[] { "/api/foreign-trade/cases/summary", $"/api/foreign-trade/cases/{import.Id}" })
        {
            using var forbidden = await client.GetAsync(path);
            Assert.Equal(HttpStatusCode.Forbidden, forbidden.StatusCode);
        }
    }

    [Fact]
    public async Task Empty_declared_value_takes_the_order_total_and_the_hs_code_may_contain_dots()
    {
        await using var factory = new ErpOperationCatalogTests.ErpOperationApiFactory();
        await ErpOperationCatalogTests.SeedAsync(factory, _ => { });
        await SeedOrdersAsync(factory);
        using var client = factory.CreateClient();
        ErpOperationCatalogTests.SetIdentity(client, ErpOperationCatalogTests.Admin, "TenantAdmin");

        object Body(string reference, decimal? declaredValue, string? hs) => new
        {
            direction = "Export", purchaseOrderId = (Guid?)null, salesOrderId = SalesOrderId, referenceCode = reference, originCountryCode = "tr",
            destinationCountryCode = "DE", incotermsCode = "FCA", harmonizedSystemCode = hs, transportMode = "Road", carrierReference = (string?)null,
            customsReference = (string?)null, declaredValue, plannedShipDate = "2026-11-18", plannedArrivalDate = "2026-11-27", notes = (string?)null
        };
        using var created = await client.PostAsJsonAsync("/api/foreign-trade/cases", Body("EXP-2026-001", null, "8443.32"));
        Assert.True(created.StatusCode == HttpStatusCode.Created, await created.Content.ReadAsStringAsync());
        var view = await created.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal((48750m, "EUR", "844332", "SO-1", "Müller GmbH"), (view.GetProperty("declaredValue").GetDecimal(), Str(view, "currencyCode"),
            Str(view, "harmonizedSystemCode"), Str(view, "orderCode"), Str(view, "counterpartyName")));
        var id = view.GetProperty("id").GetGuid();

        // An explicit value is kept; an empty one on update is the order total again.
        using (var updated = await client.PutAsJsonAsync($"/api/foreign-trade/cases/{id}", Body("EXP-2026-001", 1000m, " 8443 32 10 ")))
        {
            Assert.True(updated.IsSuccessStatusCode, await updated.Content.ReadAsStringAsync());
            var body = await updated.Content.ReadFromJsonAsync<JsonElement>();
            Assert.Equal((1000m, "84433210"), (body.GetProperty("declaredValue").GetDecimal(), Str(body, "harmonizedSystemCode")));
        }
        using (var updated = await client.PutAsJsonAsync($"/api/foreign-trade/cases/{id}", Body("EXP-2026-001", null, null)))
        {
            Assert.True(updated.IsSuccessStatusCode, await updated.Content.ReadAsStringAsync());
            var body = await updated.Content.ReadFromJsonAsync<JsonElement>();
            Assert.Equal((48750m, JsonValueKind.Null), (body.GetProperty("declaredValue").GetDecimal(), body.GetProperty("harmonizedSystemCode").ValueKind));
        }
        // Still only digits are stored: letters or too few digits are rejected after the clean-up.
        foreach (var hs in new[] { "8443.3", "84AB.32" })
        {
            using var invalid = await client.PostAsJsonAsync("/api/foreign-trade/cases", Body("EXP-2026-002", null, hs));
            Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);
        }
    }

    // ---- Menu and standards ----

    [Fact]
    public void Both_keys_are_in_the_standard_menu_under_dis_ticaret()
    {
        Assert.Contains("foreign-trade", StandardMenuEndpoints.PageKeys);
        Assert.Contains("foreign-trade-case", StandardMenuEndpoints.PageKeys);
        Assert.Contains("foreign-trade-case", StandardMenuEndpoints.NavigablePageKeys);
    }

    [Theory]
    [InlineData("foreign-trade", "Dış Ticaret Dosyaları")]
    [InlineData("foreign-trade-case", "Dış ticaret dosyası")]
    public void Standard_is_preview_version_1_and_uses_catalog_operations(string key, string title)
    {
        var standard = SystemPageStandards.All[key];
        Assert.Equal((1, "preview", title, "Dış Ticaret"), (standard.Version, standard.Stage, standard.Title, standard.Module));
        Assert.True(TenantCustomPageSchema.Validate(standard.DefinitionJson, out var error), error);
        Assert.All(standard.Items, x => Assert.True(x.Since == 1 && x.Label.Length is > 0 and <= 80, x.Key));
        var operations = Definition(key)["queries"]!.AsArray().OfType<JsonObject>().Select(x => (string)x["operation"]!).ToArray();
        Assert.All(operations, name => Assert.True(name.StartsWith("disTicaret.", StringComparison.Ordinal)
            && ErpOperationCatalog.TryGet(name, out var op) && !op.Deprecated, name));
    }

    [Fact]
    public void List_follows_the_screen_view_and_binds_filters_stages_and_dialogs()
    {
        const string key = "foreign-trade";
        var view = Assert.Single(SystemPageStandards.All[key].ScreenViews);
        Assert.Equal(("foreign-trade-files", "liste"), (view.Key, view.Component));
        Assert.True(TenantScreenViewEndpoints.TryGetCatalogFields("foreign-trade-files", out var fields));
        Assert.Equal(fields.Where(x => x.Key != "actions").Select(x => x.Key), view.Fields.Keys);
        var table = Props(key, "liste");
        Assert.Equal(("server", 50, "id", "acDugmesi"), ((string)table["paging"]!, (int)table["pageSize"]!, (string)table["openParam"]!, (string)table["rowOpenAction"]!));
        Assert.Equal(new[] { "referenceCode", "direction", "orderCode", "counterpartyName", "route", "incotermsCode", "shipDate", "arrivalDate", "status" }, Strings(table["columns"]));
        var bar = Props(key, "komutlar");
        Assert.Equal("{{dosyalar.meta.totalCount}}", (string)bar["titleCount"]!);
        Assert.Contains("delete", Strings(bar["hiddenCommands"]));
        Assert.Equal(new[] { "direction={{yonSecimi.value}}" }, Strings(Props(key, "yeniDugmesi")["params"]));
        Assert.Equal(("@foreign-trade-case", "Yalnız Taslak ve Planlandı dosyalar düzenlenebilir"),
            ((string)Props(key, "acDugmesi")["pageCode"]!, (string)Props(key, "acDugmesi")["disabledReason"]!));
        Assert.Equal(("{{suzgec.q}}", "{{yonSecimi.value}}", "{{durumSecimi.value}}"), (Binding(key, "dosyalar", "q"), Binding(key, "dosyalar", "direction"), Binding(key, "dosyalar", "status")));
        Assert.Equal("{{suzgec.q}}", Binding(key, "ozet", "q"));
        Assert.Equal("Önce dosyayı açıp planlanan sevk tarihi, beyan değeri ve Incoterms girin", (string)Props(key, "sevkDugmesi")["disabledReason"]!);
        // The actual date inputs have no default: empty means the server's today (its future check is in UTC).
        foreach (var input in new[] { "sevkTarihi", "varisTarihi" }) Assert.False(Props(key, input).ContainsKey("defaultValue"), input);
        Assert.Equal(("{{sevkTarihi.value}}", "{{sevkTasiyici.value}}"), (Binding(key, "sevkEt", "actualDate"), Binding(key, "sevkEt", "carrierReference")));
        Assert.Equal("{{varisTarihi.value}}", Binding(key, "varisKaydet", "actualDate"));
        Assert.Equal("{{gumrukReferansi.value}}", Binding(key, "gumrugeGecir", "customsReference"));
        Assert.Equal("{{belgeListesi.seciliSatir.id}}", Binding(key, "bagla", "documentId"));
        Assert.True((bool)Props(key, "iptalDugmesi")["confirmEnabled"]!);
        foreach (var id in new[] { "planlaDugmesi", "kapatDugmesi", "iptalDugmesi", "sevkPenceresi", "gumrukPenceresi", "varisPenceresi", "belgePenceresi" })
            Assert.Equal(new[] { "dosyalar", "ozet", "dosya", "belgeler" }, Strings(Props(key, id)["refreshQueries"]));
    }

    [Fact]
    public void Case_card_is_one_standard_for_new_and_edit()
    {
        const string key = "foreign-trade-case";
        Assert.Equal("{{sayfa.parametre.id}}", Binding(key, "kart", "id"));
        Assert.Equal("{{kart.rows[0].direction}}{{sayfa.parametre.direction}}", (string)Props(key, "yon")["defaultValue"]!);
        Assert.Equal(("{{yon.value}}", "{{ithalatSiparisi.value}}", "{{ihracatSiparisi.value}}"),
            (Binding(key, "olustur", "direction"), Binding(key, "olustur", "purchaseOrderId"), Binding(key, "olustur", "salesOrderId")));
        Assert.Equal(("{{kart.rows[0].direction}}", "{{kart.rows[0].purchaseOrderId}}", "{{kart.rows[0].salesOrderId}}"),
            (Binding(key, "guncelle", "direction"), Binding(key, "guncelle", "purchaseOrderId"), Binding(key, "guncelle", "salesOrderId")));
        Assert.Equal("{{beyanDegeri.value}}", Binding(key, "olustur", "declaredValue"));
        var bar = Props(key, "komutlar");
        Assert.Equal(("@foreign-trade", true), ((string)bar["afterSavePageCode"]!, (bool)bar["afterSaveRefresh"]!));
        Assert.False(bar.ContainsKey("saveAndNew"));
        Assert.Contains("save=kart.rows[0].id == null || kart.rows[0].status in ['Draft', 'Booked']", Strings(bar["commandWhen"]));
    }

    [Theory]
    [InlineData("foreign-trade", "foreignTradeOperations.fixture.json")]
    [InlineData("foreign-trade-case", "foreignTradeCaseOperations.fixture.json")]
    public async Task Frontend_fixture_matches_catalog(string key, string fixtureFile)
    {
        await using var factory = new ErpOperationCatalogTests.ErpOperationApiFactory();
        await ErpOperationCatalogTests.SeedAsync(factory, _ => { });
        using var client = factory.CreateClient();
        ErpOperationCatalogTests.SetIdentity(client, ErpOperationCatalogTests.Admin, "TenantAdmin");
        var live = (await client.GetFromJsonAsync<JsonElement>("/api/custom-pages/erp-operations")).GetProperty("operations")
            .EnumerateArray().ToDictionary(x => x.GetProperty("name").GetString()!, x => JsonNode.Parse(x.GetRawText())!);
        var fixture = JsonNode.Parse(File.ReadAllText(Path.Combine(RepositoryRoot(), "frontend", "erp-web", "src", "system-pages", fixtureFile)))!["operations"]!.AsArray();
        var used = Definition(key)["queries"]!.AsArray().OfType<JsonObject>().Select(x => (string)x["operation"]!).Distinct().Order(StringComparer.Ordinal);
        Assert.Equal(used, fixture.Select(x => (string)x!["name"]!).Order(StringComparer.Ordinal));
        foreach (var operation in fixture)
            Assert.True(JsonNode.DeepEquals(live[(string)operation!["name"]!], operation), (string)operation["name"]!);
    }

    // ---- Helpers ----

    private static string RepositoryRoot()
    {
        for (var directory = new DirectoryInfo(AppContext.BaseDirectory); directory is not null; directory = directory.Parent)
            if (File.Exists(Path.Combine(directory.FullName, "AIERP.slnx"))) return directory.FullName;
        throw new InvalidOperationException("AIERP.slnx bulunamadı.");
    }

    private static ErpOperation Op(string name) =>
        ErpOperationCatalog.TryGet(name, out var op) ? op : throw new Xunit.Sdk.XunitException($"İşlem yok: {name}");

    private static int Int(JsonElement element, string name) => element.GetProperty(name).GetInt32();
    private static string? Str(JsonElement element, string name) => element.GetProperty(name).GetString();

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
        var user = new AppUser { Id = id, Email = $"{id:N}@example.invalid", DisplayName = "Foreign trade user", IsActive = true };
        platform.Users.Add(user);
        platform.TenantMemberships.Add(new TenantMembership { TenantId = tenant.Id, UserId = id, Tenant = tenant, User = user, Role = "TenantUser" });
        platform.TenantPermissionRules.Add(Rule("erp.custom-menus.read", id));
    }

    private static TenantPermissionRule Rule(string code, Guid user) => new()
    {
        TenantId = ErpOperationCatalogTests.TenantA, SubjectType = TenantPermissionSubjectType.User, SubjectUserId = user, PermissionCode = code,
        ResourceType = PlatformPermissionCatalog.Definitions.Single(x => x.Code == code).ResourceType, Effect = TenantPermissionEffect.Allow, IsActive = true
    };

    private static ForeignTradeCase Case(string reference, ForeignTradeDirection direction, ForeignTradeStatus status, Guid? purchaseOrderId = null,
        Guid? salesOrderId = null, Guid? tenantId = null, string? customs = null, string? carrier = null, DateOnly? plannedShip = null,
        DateOnly? actualShip = null, DateOnly? plannedArrival = null) => new()
    {
        TenantId = tenantId ?? ErpOperationCatalogTests.TenantA, ReferenceCode = reference, Direction = direction, Status = status,
        PurchaseOrderId = purchaseOrderId, SalesOrderId = salesOrderId, InventoryPostingRequired = true,
        OriginCountryCode = direction == ForeignTradeDirection.Import ? "DE" : "TR", DestinationCountryCode = direction == ForeignTradeDirection.Import ? "TR" : "DE",
        TransportMode = "Road", CurrencyCode = "EUR", DeclaredValue = 100m, CustomsReference = customs, CarrierReference = carrier,
        PlannedShipDate = plannedShip, ActualShipDate = actualShip, PlannedArrivalDate = plannedArrival
    };

    private static async Task SeedCasesAsync(ErpOperationCatalogTests.ErpOperationApiFactory factory, params ForeignTradeCase[] cases)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        db.Set<ForeignTradeCase>().AddRange(cases);
        await db.SaveChangesAsync();
    }

    private static async Task SeedOrdersAsync(ErpOperationCatalogTests.ErpOperationApiFactory factory)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        var tenantA = ErpOperationCatalogTests.TenantA;
        var supplier = new CustomerAccount { Id = Supplier, TenantId = tenantA, Code = "C-1", Name = "Tedarik GmbH", Type = CounterpartyType.Supplier, CurrencyCode = "EUR", IsActive = true };
        var customer = new CustomerAccount { Id = Customer, TenantId = tenantA, Code = "C-2", Name = "Müller GmbH", Type = CounterpartyType.Customer, CurrencyCode = "EUR", IsActive = true };
        db.CustomerAccounts.AddRange(supplier, customer);
        db.PurchaseOrders.AddRange(
            new PurchaseOrder { Id = PurchaseOrderId, TenantId = tenantA, SupplierId = Supplier, Supplier = supplier, Code = "PO-1", OrderDate = new DateOnly(2026, 11, 1),
                CurrencyCode = "EUR", GrandTotal = 1250m, Status = PurchaseOrderStatus.Open },
            new PurchaseOrder { Id = CancelledPurchaseOrderId, TenantId = tenantA, SupplierId = Supplier, Supplier = supplier, Code = "PO-OLD", OrderDate = new DateOnly(2026, 1, 1),
                CurrencyCode = "EUR", GrandTotal = 10m, Status = PurchaseOrderStatus.Cancelled });
        db.SalesOrders.Add(new SalesOrder { Id = SalesOrderId, TenantId = tenantA, CustomerId = Customer, Customer = customer, Code = "SO-1",
            OrderDate = new DateOnly(2026, 11, 2), CurrencyCode = "EUR", GrandTotal = 48750m, Status = SalesOrderStatus.Open });
        await db.SaveChangesAsync();
    }

    private static JsonObject Definition(string key) => JsonNode.Parse(SystemPageStandards.All[key].DefinitionJson)!.AsObject();

    private static JsonObject Props(string key, string id) =>
        Definition(key)["components"]!.AsArray().OfType<JsonObject>().Single(x => (string)x["id"]! == id)["props"]!.AsObject();

    private static string? Binding(string key, string queryId, string parameter) =>
        (string?)Definition(key)["queries"]!.AsArray().OfType<JsonObject>().Single(x => (string)x["id"]! == queryId)["parameters"]!.AsArray()
            .OfType<JsonObject>().SingleOrDefault(x => (string)x["name"]! == parameter)?["binding"];

    private static string[] Strings(JsonNode? node) => node!.AsArray().Select(x => (string)x!).ToArray();
}
