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
/// Satış system pages, Aşama A (sales-quotes, sales-orders, sales-deliveries, sales-invoices): the satis.* ERP operations,
/// the page summary members ("bu sayfa"), the unified delivery list (both kinds, the old routes' permissions, tenant scope,
/// paging), the four standards and the schema additions they use (dataTable openParam, erpPage legacyScreen).
/// </summary>
public sealed class SalesSystemPagesTests
{
    private static readonly Guid RowUser = Guid.Parse("dddddddd-dddd-dddd-dddd-dddddddddddd");
    private static readonly Guid DenyUser = Guid.Parse("eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee");
    private static readonly Guid NoRuleUser = Guid.Parse("ffffffff-ffff-ffff-ffff-ffffffffffff");
    private static readonly Guid CustomerA = Guid.Parse("a0000000-0000-0000-0000-000000000001");
    private static readonly Guid WarehouseA = Guid.Parse("a0000000-0000-0000-0000-000000000010");
    private static readonly Guid OrderA = Guid.Parse("a0000000-0000-0000-0000-000000000020");
    private static readonly Guid OrderDelivery1 = Guid.Parse("a0000000-0000-0000-0000-000000000031");
    private static readonly Guid OrderDelivery2 = Guid.Parse("a0000000-0000-0000-0000-000000000032");
    private static readonly Guid InvoiceDelivery = Guid.Parse("a0000000-0000-0000-0000-000000000033");
    private static readonly Guid StandaloneDraft = Guid.Parse("a0000000-0000-0000-0000-000000000041");
    private static readonly Guid StandalonePosted = Guid.Parse("a0000000-0000-0000-0000-000000000042");
    private static readonly Guid OtherTenantDelivery = Guid.Parse("b0000000-0000-0000-0000-000000000031");

    private static readonly string[] Operations =
    [
        "satis.teklif.listele", "satis.teklif.getir", "satis.teklif.satirlari", "satis.teklif.revizyonlari", "satis.teklif.ilet",
        "satis.teklif.kabulEt", "satis.teklif.reddet", "satis.teklif.siparisOlustur", "satis.teklif.sil",
        "satis.siparis.listele", "satis.siparis.getir", "satis.siparis.kalemleri", "satis.siparis.irsaliyeleri", "satis.siparis.sil",
        "satis.siparis.stokAyir", "satis.siparis.rezervasyonBirak", "satis.siparis.teslimTarihiKaydet",
        "satis.irsaliye.listele", "satis.irsaliye.getir", "satis.irsaliye.kalemleri", "satis.irsaliye.iptal", "satis.irsaliye.sil",
        "satis.irsaliye.faturalastir",
        "satis.fatura.listele", "satis.fatura.getir", "satis.fatura.satirlari", "satis.fatura.tahsilatlari", "satis.fatura.iadeleri",
        "satis.fatura.iptal", "satis.fatura.sil", "satis.fatura.tahsilatEkle", "satis.fatura.tahsilatIptal", "satis.fatura.iadeIptal",
        "satis.fatura.ozelAlanTanimlari"
    ];

    // ---- Catalog ----

    [Fact]
    public void Catalog_declares_every_sales_operation_in_the_satis_module()
    {
        foreach (var name in Operations)
        {
            var op = Op(name);
            Assert.Equal("Satış", op.Module);
            // Every route parameter is the endpoint's own {id}: permission resolution matches the route pattern by name.
            Assert.All(op.Parameters.Where(x => x.In == "route"), x => Assert.Equal("id", x.Name));
        }
        Assert.Equal("Finans", Op("finans.hesap.listele").Module);
        // Handlers that check TenantAdmin themselves; the voids have no role check of their own (G-SD10 is a separate PR).
        Assert.Equal(new[] { "satis.fatura.sil", "satis.irsaliye.sil", "satis.siparis.rezervasyonBirak", "satis.siparis.sil", "satis.teklif.sil" },
            Operations.Where(x => Op(x).RequiresTenantAdmin).Order(StringComparer.Ordinal));
        string[] summary = ["page", "pageSize", "totalCount", "pageGrandTotal", "pageCurrencyCode", "pageMixedCurrencies"];
        Assert.Equal(summary, Op("satis.teklif.listele").Result.MetaPaths);
        Assert.Equal(summary, Op("satis.siparis.listele").Result.MetaPaths);
        Assert.Equal(summary.Append("pagePostedCount"), Op("satis.fatura.listele").Result.MetaPaths);
        Assert.Equal(new[] { "page", "pageSize", "totalCount" }, Op("satis.irsaliye.listele").Result.MetaPaths);
        Assert.Equal(new[] { "lines", "lines", "lines", "lines", "collections", "returns" },
            new[] { "satis.teklif.satirlari", "satis.siparis.kalemleri", "satis.irsaliye.kalemleri", "satis.fatura.satirlari",
                "satis.fatura.tahsilatlari", "satis.fatura.iadeleri" }.Select(x => Op(x).Result.RowsPath));
        Assert.True(Op("satis.siparis.irsaliyeleri").Parameters.Single(x => x.Name == "orderId").Required);
        Assert.Equal("/api/customer-collections/{id}/void", Op("satis.fatura.tahsilatIptal").Route);
        Assert.Equal("/api/sales/returns/{id}/void", Op("satis.fatura.iadeIptal").Route);
        Assert.Equal(true, Op("satis.siparis.rezervasyonBirak").FixedBody!["confirmation"]);
        Assert.True(Op("satis.siparis.rezervasyonBirak").Parameters.Single(x => x.Name == "reason").Required);
        Assert.Equal(new[] { "id", "requestId", "warehouseId" }, Op("satis.siparis.stokAyir").Parameters.Select(x => x.Name));
        Assert.Equal(new[] { "id", "requestId", "collectionDate", "amount", "paymentMethod", "reference", "financialAccountId" },
            Op("satis.fatura.tahsilatEkle").Parameters.Select(x => x.Name));
        // The single quote read carries the salesperson and the order made from it (members outside the constructor).
        Assert.Contains(Op("satis.teklif.getir").Result.Columns, x => x.Code == "salesOrderId" && x.DataType == "guid");
        Assert.Contains(Op("satis.teklif.getir").Result.Columns, x => x.Code == "salespersonName");
    }

    [Fact]
    public void Invoicing_a_delivery_is_for_order_based_deliveries_with_nested_e_document_fields()
    {
        var op = Op("satis.irsaliye.faturalastir");
        Assert.Equal(("POST", "/api/sales/deliveries/{id}/invoice"), (op.Method, op.Route));
        var names = op.Parameters.Select(x => x.Name).ToArray();
        // Order-based: prices come from the delivery lines (old rows: the order), the date is today; one invoice per delivery, so
        // no requestId. lines is the optional per-line price list (free / unpriced lines need an amount).
        Assert.DoesNotContain("customerId", names);
        Assert.DoesNotContain("invoiceDate", names);
        Assert.Equal(["orderLineNumber", "unitPrice", "discountPercent", "vatPercent", "isVatIncluded"],
            op.Parameters.Single(x => x.Name == "lines").Items!.Select(x => x.Code));
        Assert.DoesNotContain("requestId", names);
        Assert.Equal("map", op.Parameters.Single(x => x.Name == "customFields").Type);
        Assert.Equal("text", op.Parameters.Single(x => x.Name == "invoiceType").Type);
        Assert.Equal(21, names.Count(x => x.StartsWith("eDocument.", StringComparison.Ordinal)));
        Assert.All(op.Parameters.Where(x => x.Name.Contains('.')), x => Assert.False(x.Required));
        Assert.Null(ErpOperationCatalog.ParameterShapeError(op));
    }

    [Fact]
    public void Unified_delivery_list_columns_mark_the_kind()
    {
        var op = Op("satis.irsaliye.listele");
        Assert.Equal(("GET", SalesDeliveryListEndpoints.Route), (op.Method, op.Route));
        var columns = op.Result.Columns.ToDictionary(x => x.Code, x => x.DataType);
        Assert.Equal(("text", "bool", "guid", "text", "text"), (columns["kind"], columns["isStandalone"], columns["salesDeliveryId"],
            columns["invoiceCode"], columns["invoiceStatus"]));
        Assert.Equal(new[] { "q", "status", "unbilledOnly", "page", "pageSize" }, op.Parameters.Select(x => x.Name));
    }

    [Fact]
    public void New_list_route_resolves_to_the_existing_delivery_read_permission()
    {
        Assert.True(PlatformPermissionCatalog.TryResolve(SalesDeliveryListEndpoints.Route, "GET", SalesDeliveryListEndpoints.Route,
            new Dictionary<string, string?>(), ErpOperationCatalogTests.TenantA, RowUser, "TenantUser", out var resolved));
        Assert.Equal("erp.sales-deliveries.read", resolved!.Permission.Code);
        // Row-filtered collection handling (a row Allow reaches the route) is covered by the endpoint tests below.
    }

    // ---- Page summaries ----

    [Fact]
    public void Page_summaries_count_the_returned_rows_and_drop_mixed_currencies()
    {
        SalesQuoteSummary Quote(string currency, decimal total, SalesQuoteStatus status = SalesQuoteStatus.Draft) =>
            new(Guid.NewGuid(), "T", null, "Alıcı", default, default, currency, status, total, 1, default);
        var quotes = new SalesQuotePage([Quote("TRY", 100m), Quote("try", 50.5m, SalesQuoteStatus.Sent)], 1, 25, 2);
        Assert.Equal((150.5m, "TRY", false), (quotes.PageGrandTotal, quotes.PageCurrencyCode, quotes.PageMixedCurrencies));
        var mixed = new SalesQuotePage([Quote("TRY", 100m), Quote("EUR", 50m)], 1, 25, 2);
        Assert.Equal(((decimal?)null, (string?)null, true), (mixed.PageGrandTotal, mixed.PageCurrencyCode, mixed.PageMixedCurrencies));
        var empty = new SalesQuotePage([], 1, 25, 0);
        Assert.Equal(((decimal?)null, false), (empty.PageGrandTotal, empty.PageMixedCurrencies));

        SalesOrderSummary Order(string currency, decimal total, SalesOrderStatus status) =>
            new(Guid.NewGuid(), "S", null, "Bağımsız", Guid.NewGuid(), "Müşteri", default, currency, status, total, 1, default);
        // Cancelled orders are not counted, so a cancelled EUR order does not make the page mixed.
        var orders = new SalesOrderPage([Order("TRY", 10m, SalesOrderStatus.Open), Order("TRY", 5m, SalesOrderStatus.Fulfilled),
            Order("EUR", 99m, SalesOrderStatus.Cancelled)], 1, 25, 3);
        Assert.Equal((15m, "TRY", false), (orders.PageGrandTotal, orders.PageCurrencyCode, orders.PageMixedCurrencies));

        SalesInvoiceSummary Invoice(string currency, decimal total, SalesInvoiceStatus status) =>
            new(Guid.NewGuid(), "F", null, null, null, null, Guid.NewGuid(), "Müşteri", default, currency, status, total, 1, default);
        var invoices = new SalesInvoicePage([Invoice("TRY", 40m, SalesInvoiceStatus.Posted), Invoice("TRY", 60m, SalesInvoiceStatus.Posted),
            Invoice("USD", 7m, SalesInvoiceStatus.Voided)], 1, 25, 3);
        Assert.Equal((100m, "TRY", false, 2), (invoices.PageGrandTotal, invoices.PageCurrencyCode, invoices.PageMixedCurrencies, invoices.PagePostedCount));
        var json = JsonSerializer.SerializeToElement(invoices, new JsonSerializerOptions(JsonSerializerDefaults.Web));
        Assert.Equal((100m, 2), (json.GetProperty("pageGrandTotal").GetDecimal(), json.GetProperty("pagePostedCount").GetInt32()));
        Assert.False(json.TryGetProperty("counted", out _));
    }

    // ---- Unified delivery list ----

    [Fact]
    public async Task Unified_list_merges_both_kinds_pages_across_them_and_stays_in_the_tenant()
    {
        await using var factory = new ErpOperationCatalogTests.ErpOperationApiFactory();
        await ErpOperationCatalogTests.SeedAsync(factory, _ => { });
        await SeedDeliveriesAsync(factory);
        using var client = factory.CreateClient();
        ErpOperationCatalogTests.SetIdentity(client, ErpOperationCatalogTests.Admin, "TenantAdmin");

        var all = await ListAsync(client, "pageSize=100");
        Assert.Equal(5, all.GetProperty("totalCount").GetInt32());
        // Delivery date ↓: the other tenant's delivery never appears.
        Assert.Equal(new[] { StandalonePosted, OrderDelivery2, StandaloneDraft, InvoiceDelivery, OrderDelivery1 }, Ids(all));
        var byId = all.GetProperty("items").EnumerateArray().ToDictionary(x => x.GetProperty("id").GetGuid());
        Assert.Equal(("Order", false, OrderDelivery1, "SIP-7", "Örnek Müşteri", "Posted", "F-1", "Posted"), Row(byId[OrderDelivery1]));
        Assert.Equal(("Invoice", false, InvoiceDelivery, (string?)null, "Örnek Müşteri", "Posted", "F-3", "Posted"), Row(byId[InvoiceDelivery]));
        Assert.Equal(("Standalone", true, (Guid?)null, (string?)null, "Örnek Müşteri", "Draft", (string?)null, (string?)null),
            Row(byId[StandaloneDraft]));
        Assert.Equal(2, byId[OrderDelivery1].GetProperty("lineCount").GetInt32());

        // Paging across the two sources keeps the merged order.
        var second = await ListAsync(client, "page=2&pageSize=2");
        Assert.Equal((5, 2), (second.GetProperty("totalCount").GetInt32(), second.GetProperty("page").GetInt32()));
        Assert.Equal(new[] { StandaloneDraft, InvoiceDelivery }, Ids(second));
        Assert.Equal(new[] { OrderDelivery1 }, Ids(await ListAsync(client, "page=3&pageSize=2")));

        Assert.Equal(new[] { StandaloneDraft }, Ids(await ListAsync(client, "status=Draft")));
        Assert.Equal(new[] { StandalonePosted, OrderDelivery2 }, Ids(await ListAsync(client, "unbilledOnly=true")));
        Assert.Equal(new[] { StandalonePosted, StandaloneDraft }, Ids(await ListAsync(client, "q=BIRS")));
        Assert.Equal(new[] { OrderDelivery2, OrderDelivery1 }, Ids(await ListAsync(client, "q=SIP-7")));
        using var badStatus = await client.GetAsync(SalesDeliveryListEndpoints.Route + "?status=Deleted");
        Assert.Equal(HttpStatusCode.BadRequest, badStatus.StatusCode);
        using var tooDeep = await client.GetAsync(SalesDeliveryListEndpoints.Route + "?page=60&pageSize=100");
        Assert.Equal(HttpStatusCode.BadRequest, tooDeep.StatusCode);
    }

    [Fact]
    public async Task Unified_list_shows_each_kind_only_as_its_old_list_route_would()
    {
        await using var factory = new ErpOperationCatalogTests.ErpOperationApiFactory();
        await ErpOperationCatalogTests.SeedAsync(factory, platform =>
        {
            AddUser(platform, RowUser);
            AddUser(platform, DenyUser);
            AddUser(platform, NoRuleUser);
            // RowUser: only a row-conditional Allow. The old order-based list (no row filter) denies it; the standalone list
            // accepts it and keeps the matching rows.
            platform.TenantPermissionRules.Add(Rule("erp.sales-deliveries.read", TenantPermissionEffect.Allow, RowUser, "resource.status", "Posted"));
            // DenyUser: an Allow plus a row Deny the standalone list cannot resolve (customer type): the old order-based list
            // ignores the row Deny, the standalone list shows nothing.
            platform.TenantPermissionRules.Add(Rule("erp.sales-deliveries.read", TenantPermissionEffect.Allow, DenyUser, null, null));
            platform.TenantPermissionRules.Add(Rule("erp.sales-deliveries.read", TenantPermissionEffect.Deny, DenyUser, "resource.customerType", "Customer"));
        });
        await SeedDeliveriesAsync(factory);
        using var client = factory.CreateClient();

        ErpOperationCatalogTests.SetIdentity(client, RowUser, "TenantUser");
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/sales/deliveries")).StatusCode);
        var oldStandalone = await client.GetFromJsonAsync<JsonElement>("/api/sales/standalone-deliveries");
        Assert.Equal(1, oldStandalone.GetProperty("totalCount").GetInt32());
        var rowList = await ListAsync(client, "pageSize=100");
        Assert.Equal(new[] { StandalonePosted }, Ids(rowList));
        Assert.Equal(1, rowList.GetProperty("totalCount").GetInt32());
        Assert.True((await OperationsAsync(client))["satis.irsaliye.listele"]);

        ErpOperationCatalogTests.SetIdentity(client, DenyUser, "TenantUser");
        var oldOrderBased = await client.GetFromJsonAsync<JsonElement>("/api/sales/deliveries?pageSize=100");
        Assert.Equal(3, oldOrderBased.GetProperty("totalCount").GetInt32());
        Assert.Equal(0, (await client.GetFromJsonAsync<JsonElement>("/api/sales/standalone-deliveries")).GetProperty("totalCount").GetInt32());
        var denyList = await ListAsync(client, "pageSize=100");
        Assert.Equal(new[] { OrderDelivery2, InvoiceDelivery, OrderDelivery1 }, Ids(denyList));

        ErpOperationCatalogTests.SetIdentity(client, NoRuleUser, "TenantUser");
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync(SalesDeliveryListEndpoints.Route)).StatusCode);
        Assert.False((await OperationsAsync(client))["satis.irsaliye.listele"]);
    }

    [Fact]
    public async Task Quote_read_names_the_salesperson_and_the_order()
    {
        await using var factory = new ErpOperationCatalogTests.ErpOperationApiFactory();
        await ErpOperationCatalogTests.SeedAsync(factory, _ => { });
        var quoteId = Guid.NewGuid();
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            var tenant = ErpOperationCatalogTests.TenantA;
            var customer = new CustomerAccount { Id = CustomerA, TenantId = tenant, Code = "C-1", Name = "Örnek Müşteri", Type = CounterpartyType.Customer, CurrencyCode = "TRY", IsActive = true };
            var employee = new EmployeeRecord { TenantId = tenant, PersonnelCode = "PER001", FullName = "Ayşe Yıldız" };
            db.CustomerAccounts.Add(customer);
            db.EmployeeRecords.Add(employee);
            db.SalesQuotes.Add(new SalesQuote { Id = quoteId, TenantId = tenant, Code = "TKL-1", CustomerId = CustomerA, Customer = customer,
                SalespersonEmployeeId = employee.Id, QuoteDate = new DateOnly(2026, 11, 1), ValidUntil = new DateOnly(2026, 11, 30),
                CurrencyCode = "TRY", Status = SalesQuoteStatus.Accepted, RevisionGroupId = quoteId });
            db.SalesOrders.Add(new SalesOrder { Id = OrderA, TenantId = tenant, QuoteId = quoteId, CustomerId = CustomerA, Customer = customer,
                Code = "S-1", OrderDate = new DateOnly(2026, 11, 2) });
            await db.SaveChangesAsync();
        }
        using var client = factory.CreateClient();
        ErpOperationCatalogTests.SetIdentity(client, ErpOperationCatalogTests.Admin, "TenantAdmin");
        var quote = await client.GetFromJsonAsync<JsonElement>($"/api/sales/quotes/{quoteId:D}");
        Assert.Equal(("PER001 · Ayşe Yıldız", OrderA, "S-1"), (quote.GetProperty("salespersonName").GetString(),
            quote.GetProperty("salesOrderId").GetGuid(), quote.GetProperty("salesOrderCode").GetString()));
    }

    // ---- Standards ----

    [Theory]
    // Aşama B bumps sales-orders (the order card's Yeni / Düzenle params) and sales-invoices (Yeni stays legacy, P3) to version 2;
    // their buttons changed in place, so every item stays since 1.
    [InlineData("sales-quotes", "Satış Teklifleri", 1)]
    [InlineData("sales-orders", "Satış Siparişleri", 3)]
    [InlineData("sales-deliveries", "Satış İrsaliyeleri", 1)]
    [InlineData("sales-invoices", "Satış Faturaları", 2)]
    public void Standard_is_preview_and_uses_catalog_operations(string key, string title, int version)
    {
        var standard = SystemPageStandards.All[key];
        Assert.Equal((version, "preview", title, "Satış & cari"), (standard.Version, standard.Stage, standard.Title, standard.Module));
        Assert.True(TenantCustomPageSchema.Validate(standard.DefinitionJson, out var error), error);
        // sales-orders v3 adds the state chain commands (belge kuralları); everything else is v1.
        Assert.All(standard.Items, x => Assert.True((x.Since == 1 || key == "sales-orders" && x.Since == 3) && x.Label.Length is > 0 and <= 80, x.Key));
        var operations = Definition(key)["queries"]!.AsArray().OfType<JsonObject>().Select(x => (string)x["operation"]!).ToArray();
        Assert.All(operations, name => Assert.True(ErpOperationCatalog.TryGet(name, out var op) && !op.Deprecated
            && (op.Module == "Satış" || name is "depo.listele" or "finans.hesap.listele"), name));
        Assert.Contains(standard.ScreenViews, x => x.Key == key && x.Component == "liste");
    }

    [Fact]
    public void Document_lists_open_their_detail_from_a_page_parameter()
    {
        Assert.Equal(("quoteId", "acDugmesi"), ((string)Props("sales-quotes", "liste")["openParam"]!, (string)Props("sales-quotes", "liste")["rowOpenAction"]!));
        Assert.Equal("orderId", (string)Props("sales-orders", "liste")["openParam"]!);
        Assert.Equal("invoiceId", (string)Props("sales-invoices", "liste")["openParam"]!);
        // The detail reads its record through the getir query bound to the selection (a param-opened record may not be loaded).
        Assert.Equal("{{liste.seciliSatir.id}}", Binding("sales-orders", "siparis", "id"));
        Assert.Equal("{{sayfa.parametre.customerId}}", Binding("sales-invoices", "faturalar", "customerId"));
        // Writes send the selected document's id (never a fetched record that may still belong to the previous selection).
        foreach (var (key, query) in new[] { ("sales-quotes", "teklifSil"), ("sales-quotes", "kabulEt"), ("sales-orders", "siparisSil"),
                     ("sales-orders", "stokAyir"), ("sales-invoices", "faturaIptal"), ("sales-invoices", "tahsilatEkle") })
            Assert.Equal("{{liste.seciliSatir.id}}", Binding(key, query, "id"));
        Assert.Equal("{{liste.seciliSatir.salesDeliveryId}}", Binding("sales-deliveries", "faturalastir", "id"));
        // Delivery reads bind the SalesDeliveries id only, so they never run for a standalone row.
        Assert.Equal("{{liste.seciliSatir.salesDeliveryId}}", Binding("sales-deliveries", "irsaliye", "id"));
        // Legacy-only flows open the built-in screen with the document id.
        Assert.True((bool)Props("sales-orders", "irsaliyeOlusturDugmesi")["legacyScreen"]!);
        Assert.Equal(new[] { "orderId={{liste.seciliSatir.id}}" }, Strings(Props("sales-orders", "irsaliyeOlusturDugmesi")["params"]));
    }

    [Fact]
    public void Delivery_actions_are_gated_on_the_kind_and_the_admin_role()
    {
        Assert.Contains("isStandalone != true", (string)Props("sales-deliveries", "iptalMenu")["visibleWhen"]!);
        Assert.Contains("kullanici.rol == 'TenantAdmin'", (string)Props("sales-deliveries", "iptalMenu")["visibleWhen"]!);
        Assert.Contains("kind == 'Order'", (string)Props("sales-deliveries", "faturalastirMenu")["visibleWhen"]!);
        Assert.Contains("isStandalone == true", (string)Props("sales-deliveries", "eskiEkranDugmesi")["visibleWhen"]!);
        var metric = Props("sales-deliveries", "faturalanmamisGostergesi");
        Assert.Equal(("faturaSecimi", "true"), ((string)metric["filterInput"]!, (string)metric["filterValue"]!));
        Assert.Equal("{{faturaSecimi.value}}", Binding("sales-deliveries", "irsaliyeler", "unbilledOnly"));
        Assert.Contains("isStandalone != true", Strings(Props("sales-deliveries", "komutlar")["commandWhen"]).Single());
    }

    [Fact]
    public void Invoice_detail_writes_collections_and_voids_with_a_page_made_request_id()
    {
        Assert.Equal("{{tahsilatKimligi.value}}", Binding("sales-invoices", "tahsilatEkle", "requestId"));
        Assert.True((bool)Props("sales-invoices", "tahsilatKimligi")["autoId"]!);
        Assert.Equal("{{tahsilatTablosu.seciliSatir.id}}", Binding("sales-invoices", "tahsilatIptal", "id"));
        Assert.Equal("{{iadeTablosu.seciliSatir.id}}", Binding("sales-invoices", "iadeIptal", "id"));
        var cancel = Props("sales-invoices", "faturaIptalDugmesi");
        Assert.Contains("iptal edilecek ve cari hareketi ters kayıtla kapatılacak.", (string)cancel["confirmText"]!);
        Assert.Contains("kullanici.rol == 'TenantAdmin'", (string)cancel["visibleWhen"]!);
        Assert.Contains("status == 'Posted'", (string)cancel["visibleWhen"]!);
    }

    // ---- Schema ----

    [Fact]
    public void Schema_open_param_needs_a_row_open_action_and_a_parameter_name()
    {
        var definition = Definition("sales-orders");
        Props(definition, "liste")["openParam"] = "order Id";
        Assert.False(TenantCustomPageSchema.Validate(definition.ToJsonString(), out var error));
        Assert.Contains("openParam", error);

        definition = Definition("sales-orders");
        Props(definition, "liste")["openParam"] = "{{sayfa.parametre.orderId}}";
        Assert.False(TenantCustomPageSchema.Validate(definition.ToJsonString(), out _));

        definition = Definition("sales-orders");
        Props(definition, "liste").Remove("rowOpenAction");
        Assert.False(TenantCustomPageSchema.Validate(definition.ToJsonString(), out error));
        Assert.Contains("rowOpenAction", error);

        // Only a dataTable takes it.
        definition = Definition("sales-orders");
        Props(definition, "acDugmesi")["openParam"] = "orderId";
        Assert.False(TenantCustomPageSchema.Validate(definition.ToJsonString(), out _));
    }

    [Fact]
    public void Schema_legacy_screen_is_a_flag_of_erp_page_buttons_only()
    {
        var definition = Definition("sales-orders");
        Props(definition, "irsaliyeOlusturDugmesi")["legacyScreen"] = "yes";
        Assert.False(TenantCustomPageSchema.Validate(definition.ToJsonString(), out var error));
        Assert.Contains("legacyScreen", error);

        definition = Definition("sales-orders");
        Props(definition, "acDugmesi")["legacyScreen"] = true;
        Assert.False(TenantCustomPageSchema.Validate(definition.ToJsonString(), out error));
        Assert.Contains("legacyScreen", error);

        definition = Definition("sales-orders");
        Props(definition, "liste")["legacyScreen"] = true;
        Assert.False(TenantCustomPageSchema.Validate(definition.ToJsonString(), out _));

        definition = Definition("sales-orders");
        Props(definition, "irsaliyeOlusturDugmesi")["legacyScreen"] = false;
        Assert.True(TenantCustomPageSchema.Validate(definition.ToJsonString(), out error), error);
    }

    [Theory]
    [InlineData("sales-quotes", "salesQuotesOperations.fixture.json")]
    [InlineData("sales-orders", "salesOrdersOperations.fixture.json")]
    [InlineData("sales-deliveries", "salesDeliveriesOperations.fixture.json")]
    [InlineData("sales-invoices", "salesInvoicesOperations.fixture.json")]
    // Aşama B cards.
    [InlineData("sales-invoice-create", "salesInvoiceCreateOperations.fixture.json")]
    [InlineData("sales-order-create", "salesOrderCreateOperations.fixture.json")]
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

    private static async Task<JsonElement> ListAsync(HttpClient client, string query)
    {
        using var response = await client.GetAsync(SalesDeliveryListEndpoints.Route + "?" + query);
        Assert.True(response.StatusCode == HttpStatusCode.OK, $"{response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
        return await response.Content.ReadFromJsonAsync<JsonElement>();
    }

    private static Guid[] Ids(JsonElement page) => page.GetProperty("items").EnumerateArray().Select(x => x.GetProperty("id").GetGuid()).ToArray();

    private static (string, bool, Guid?, string?, string?, string, string?, string?) Row(JsonElement row) =>
        (row.GetProperty("kind").GetString()!, row.GetProperty("isStandalone").GetBoolean(),
            row.GetProperty("salesDeliveryId").ValueKind == JsonValueKind.Null ? null : row.GetProperty("salesDeliveryId").GetGuid(),
            row.GetProperty("orderCode").GetString(), row.GetProperty("customerName").GetString(), row.GetProperty("status").GetString()!,
            row.GetProperty("invoiceCode").GetString(), row.GetProperty("invoiceStatus").GetString());

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
        var user = new AppUser { Id = id, Email = $"{id:N}@example.invalid", DisplayName = "Sales user", IsActive = true };
        platform.Users.Add(user);
        platform.TenantMemberships.Add(new TenantMembership { TenantId = tenant.Id, UserId = id, Tenant = tenant, User = user, Role = "TenantUser" });
        platform.TenantPermissionRules.Add(Rule("erp.custom-menus.read", TenantPermissionEffect.Allow, id, null, null));
    }

    private static TenantPermissionRule Rule(string code, TenantPermissionEffect effect, Guid user, string? attribute, string? value) => new()
    {
        TenantId = ErpOperationCatalogTests.TenantA, SubjectType = TenantPermissionSubjectType.User, SubjectUserId = user, PermissionCode = code,
        ResourceType = PlatformPermissionCatalog.Definitions.Single(x => x.Code == code).ResourceType, Effect = effect, IsActive = true,
        AttributeName = attribute, AttributeOperator = attribute is null ? null : TenantPermissionConditionOperator.Equals, AttributeValue = value
    };

    /// <summary>
    /// Tenant A: two order-based deliveries (one invoiced), one delivery written by a standalone invoice, a standalone draft and
    /// a posted standalone delivery; tenant B: one delivery that must never appear.
    /// </summary>
    private static async Task SeedDeliveriesAsync(ErpOperationCatalogTests.ErpOperationApiFactory factory)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        var tenant = ErpOperationCatalogTests.TenantA;
        var customer = new CustomerAccount { Id = CustomerA, TenantId = tenant, Code = "C-1", Name = "Örnek Müşteri", Type = CounterpartyType.Customer, CurrencyCode = "TRY", IsActive = true };
        var warehouse = new Warehouse { Id = WarehouseA, TenantId = tenant, Code = "D1", Name = "Merkez depo" };
        var order = new SalesOrder { Id = OrderA, TenantId = tenant, CustomerId = CustomerA, Customer = customer, Code = "SIP-7", OrderDate = new DateOnly(2026, 11, 1) };
        var created = new DateTimeOffset(2026, 11, 1, 8, 0, 0, TimeSpan.Zero);
        // Tenant-scoped relationships are composite (tenant, id): the other tenant's delivery needs its own warehouse.
        var otherWarehouse = new Warehouse { TenantId = ErpOperationCatalogTests.TenantB, Code = "D9", Name = "Başka firma deposu" };
        SalesDelivery Delivery(Guid id, Guid tenantId, string code, int day, SalesOrder? source) => new()
        {
            Id = id, TenantId = tenantId, RequestId = Guid.NewGuid(), OrderId = source?.Id, Order = source,
            Warehouse = tenantId == tenant ? warehouse : otherWarehouse,
            Code = code, DeliveryDate = new DateOnly(2026, 11, day), CreatedAt = created.AddDays(day)
        };
        var delivery1 = Delivery(OrderDelivery1, tenant, "IRS-1", 10, order);
        delivery1.Lines.Add(new SalesDeliveryLine { TenantId = tenant, OrderLineNumber = 1, StockCode = "A", StockName = "A", Quantity = 1m });
        delivery1.Lines.Add(new SalesDeliveryLine { TenantId = tenant, OrderLineNumber = 2, StockCode = "B", StockName = "B", Quantity = 2m });
        var invoiceDelivery = Delivery(InvoiceDelivery, tenant, "IRS-3", 12, null);
        db.CustomerAccounts.Add(customer);
        db.Warehouses.AddRange(warehouse, otherWarehouse);
        db.SalesOrders.Add(order);
        db.SalesDeliveries.AddRange(delivery1, Delivery(OrderDelivery2, tenant, "IRS-2", 15, order), invoiceDelivery,
            Delivery(OtherTenantDelivery, ErpOperationCatalogTests.TenantB, "IRS-X", 20, null));
        db.SalesInvoices.AddRange(
            new SalesInvoice { TenantId = tenant, DeliveryId = OrderDelivery1, OrderId = OrderA, CustomerId = CustomerA, Customer = customer, Code = "F-1", InvoiceDate = new DateOnly(2026, 11, 10) },
            new SalesInvoice { TenantId = tenant, DeliveryId = InvoiceDelivery, CustomerId = CustomerA, Customer = customer, Code = "F-3", InvoiceDate = new DateOnly(2026, 11, 12) });
        db.StandaloneSalesDeliveries.AddRange(
            new StandaloneSalesDelivery { Id = StandaloneDraft, TenantId = tenant, RequestId = Guid.NewGuid(), CustomerId = CustomerA, Customer = customer,
                WarehouseId = WarehouseA, Warehouse = warehouse, Code = "BIRS-1", DeliveryDate = new DateOnly(2026, 11, 14), CreatedAt = created.AddDays(14) },
            new StandaloneSalesDelivery { Id = StandalonePosted, TenantId = tenant, RequestId = Guid.NewGuid(), CustomerId = CustomerA, Customer = customer,
                WarehouseId = WarehouseA, Warehouse = warehouse, Code = "BIRS-2", DeliveryDate = new DateOnly(2026, 11, 18), CreatedAt = created.AddDays(18),
                Status = StandaloneInventoryDocumentStatus.Posted });
        await db.SaveChangesAsync();
    }

    private static JsonObject Definition(string key) => JsonNode.Parse(SystemPageStandards.All[key].DefinitionJson)!.AsObject();

    private static JsonObject Props(JsonObject definition, string id) =>
        definition["components"]!.AsArray().OfType<JsonObject>().Single(x => (string)x["id"]! == id)["props"]!.AsObject();

    private static JsonObject Props(string key, string id) => Props(Definition(key), id);

    private static string? Binding(string key, string queryId, string parameter) =>
        (string?)Definition(key)["queries"]!.AsArray().OfType<JsonObject>().Single(x => (string)x["id"]! == queryId)["parameters"]!.AsArray()
            .OfType<JsonObject>().SingleOrDefault(x => (string)x["name"]! == parameter)?["binding"];

    private static string[] Strings(JsonNode? node) => node!.AsArray().Select(x => (string)x!).ToArray();
}
