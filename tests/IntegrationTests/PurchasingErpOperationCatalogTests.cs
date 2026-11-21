using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>
/// Satınalma Faz 1 ERP operations (taslak 21): catalog shape and labels, the nested-route permissions behind <c>allowed</c>,
/// the side-effect-free receipt invoice preview, the optional order list filters and the computed display members.
/// </summary>
public sealed class PurchasingErpOperationCatalogTests
{
    private static readonly Guid TenantA = ErpOperationCatalogTests.TenantA;
    private static readonly Guid TenantB = ErpOperationCatalogTests.TenantB;
    private static readonly Guid Admin = ErpOperationCatalogTests.Admin;
    private static readonly Guid UserA = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    private static readonly Guid UserB = Guid.Parse("cccccccc-cccc-cccc-cccc-cccccccccccc");

    /// <summary>The Faz 1 operations added by this change (the four inventory-cost satinalma.malKabul.* names predate it).</summary>
    internal static readonly string[] Faz1Operations =
    [
        "satinalma.talep.listele", "satinalma.talep.getir", "satinalma.talep.kalemleri", "satinalma.talep.teklifleri", "satinalma.talep.onayla",
        "satinalma.talep.reddet", "satinalma.talep.ozelAlanTanimlari", "satinalma.talep.ozelAlanDegerleri",
        "satinalma.teklif.listele", "satinalma.teklif.getir", "satinalma.teklif.kalemleri", "satinalma.teklif.ozelAlanTanimlari",
        "satinalma.siparis.listele", "satinalma.siparis.getir", "satinalma.siparis.satirlari", "satinalma.siparis.malKabulleri",
        "satinalma.siparis.ozelAlanTanimlari", "satinalma.siparis.ozelAlanDegerleri",
        "satinalma.irsaliye.listele", "satinalma.irsaliye.getir", "satinalma.irsaliye.satirlari",
        "satinalma.malKabul.sayfaliListe", "satinalma.malKabul.getir", "satinalma.malKabul.satirlari", "satinalma.malKabul.iptal",
        "satinalma.malKabul.faturala", "satinalma.malKabul.ozelAlanTanimlari",
        "satinalma.faturaGirisi.malKabulleri", "satinalma.faturaGirisi.onizleme", "satinalma.faturaGirisi.onizlemeSatirlari",
        "satinalma.faturaGirisi.mevzuatProfilleri",
        "satinalma.fatura.listele", "satinalma.fatura.getir", "satinalma.fatura.satirlari", "satinalma.fatura.odemeleri", "satinalma.fatura.iadeleri",
        "satinalma.fatura.iptal", "satinalma.fatura.odemeEkle", "satinalma.fatura.odemeIptal", "satinalma.fatura.odemeHesaplari",
        "satinalma.iade.listele", "satinalma.iade.getir", "satinalma.iade.satirlari", "satinalma.iade.iptal"
    ];

    internal static bool IsFaz1Operation(string name) => Faz1Operations.Contains(name, StringComparer.Ordinal);

    private static readonly string[] InventoryCostOperations =
        ["satinalma.malKabul.ekMaliyetDagit", "satinalma.malKabul.ekMaliyetTersKayit", "satinalma.malKabul.ekMaliyetler", "satinalma.malKabul.listele"];

    // name → method, route, parameters (name:in:type[*]), result shape, rowsPath, metaPaths.
    public static TheoryData<string, string, string, string, string, string?, string> Shapes => new()
    {
        { "satinalma.talep.listele", "GET", "/api/purchasing/requests", "search:query:text,status:query:text,page:query:int,pageSize:query:int", "list", "items", "page,pageSize,totalCount" },
        { "satinalma.talep.getir", "GET", "/api/purchasing/requests/{id}", "id:route:guid*", "record", null, "" },
        { "satinalma.talep.kalemleri", "GET", "/api/purchasing/requests/{id}", "id:route:guid*", "list", "lines", "" },
        { "satinalma.talep.teklifleri", "GET", "/api/purchasing/requests/{id}/supplier-quotes", "id:route:guid*", "list", null, "" },
        { "satinalma.talep.onayla", "POST", "/api/purchasing/requests/{id}/decision", "id:route:guid*,note:body:text", "none", null, "" },
        { "satinalma.talep.reddet", "POST", "/api/purchasing/requests/{id}/decision", "id:route:guid*,note:body:text", "none", null, "" },
        { "satinalma.talep.ozelAlanTanimlari", "GET", "/api/purchasing/requests/custom-fields", "", "list", null, "" },
        { "satinalma.talep.ozelAlanDegerleri", "GET", "/api/purchasing/requests/{id}/custom-fields", "id:route:guid*", "list", null, "" },
        { "satinalma.teklif.listele", "GET", "/api/purchasing/supplier-quotes", "search:query:text,status:query:text,page:query:int,pageSize:query:int", "list", "items", "page,pageSize,totalCount" },
        { "satinalma.teklif.getir", "GET", "/api/purchasing/supplier-quotes/{id}", "id:route:guid*", "record", null, "" },
        { "satinalma.teklif.kalemleri", "GET", "/api/purchasing/supplier-quotes/{id}", "id:route:guid*", "list", "lines", "" },
        { "satinalma.teklif.ozelAlanTanimlari", "GET", "/api/purchasing/supplier-quotes/custom-fields", "", "list", null, "" },
        { "satinalma.siparis.listele", "GET", "/api/purchasing/orders", "q:query:text,status:query:text,overdue:query:bool,page:query:int,pageSize:query:int", "list", "items", "page,pageSize,totalCount" },
        { "satinalma.siparis.getir", "GET", "/api/purchasing/orders/{id}", "id:route:guid*", "record", null, "" },
        { "satinalma.siparis.satirlari", "GET", "/api/purchasing/orders/{id}", "id:route:guid*", "list", "lines", "" },
        { "satinalma.siparis.malKabulleri", "GET", "/api/purchasing/orders/{id}", "id:route:guid*", "list", "receipts", "" },
        { "satinalma.siparis.ozelAlanTanimlari", "GET", "/api/purchasing/orders/custom-fields", "", "list", null, "" },
        { "satinalma.siparis.ozelAlanDegerleri", "GET", "/api/purchasing/orders/{id}/custom-fields", "id:route:guid*", "list", null, "" },
        { "satinalma.irsaliye.listele", "GET", "/api/purchasing/delivery-notes", "q:query:text,page:query:int,pageSize:query:int", "list", "items", "page,pageSize,totalCount" },
        { "satinalma.irsaliye.getir", "GET", "/api/purchasing/delivery-notes/{id}", "id:route:guid*", "record", null, "" },
        { "satinalma.irsaliye.satirlari", "GET", "/api/purchasing/delivery-notes/{id}", "id:route:guid*", "list", "lines", "" },
        { "satinalma.malKabul.sayfaliListe", "GET", "/api/purchasing/receipts", "page:query:int,pageSize:query:int", "list", "items", "page,pageSize,totalCount" },
        { "satinalma.malKabul.getir", "GET", "/api/purchasing/receipts/{id}", "id:route:guid*", "record", null, "" },
        { "satinalma.malKabul.satirlari", "GET", "/api/purchasing/receipts/{id}", "id:route:guid*", "list", "lines", "" },
        { "satinalma.malKabul.iptal", "POST", "/api/purchasing/receipts/{id}/void", "id:route:guid*", "none", null, "" },
        { "satinalma.malKabul.faturala", "POST", "/api/purchasing/receipts/{id}/invoice", "id:route:guid*,code:body:text*,invoiceDate:body:date*,providerInvoiceUuid:body:guid,providerScenario:body:text,providerInvoiceTypeCode:body:text,providerSenderAlias:body:text,accountingProfileCode:body:text", "record", null, "" },
        { "satinalma.malKabul.ozelAlanTanimlari", "GET", "/api/purchasing/receipts/custom-fields", "", "list", null, "" },
        { "satinalma.faturaGirisi.malKabulleri", "GET", "/api/purchasing/invoices/entry/receipts", "q:query:text,page:query:int*,pageSize:query:int*", "list", "items", "page,pageSize,totalCount" },
        { "satinalma.faturaGirisi.onizleme", "GET", "/api/purchasing/receipts/{id}/invoice-preview", "id:route:guid*,invoiceDate:query:date,accountingProfileCode:query:text", "record", null, "" },
        { "satinalma.faturaGirisi.onizlemeSatirlari", "GET", "/api/purchasing/receipts/{id}/invoice-preview", "id:route:guid*,invoiceDate:query:date,accountingProfileCode:query:text", "list", "lines", "" },
        { "satinalma.faturaGirisi.mevzuatProfilleri", "GET", "/api/finance/general-ledger/rule-profiles", "", "list", null, "" },
        { "satinalma.fatura.listele", "GET", "/api/purchasing/invoices", "q:query:text,supplierId:query:guid,page:query:int,pageSize:query:int", "list", "items", "page,pageSize,totalCount" },
        { "satinalma.fatura.getir", "GET", "/api/purchasing/invoices/{id}", "id:route:guid*", "record", null, "" },
        { "satinalma.fatura.satirlari", "GET", "/api/purchasing/invoices/{id}", "id:route:guid*", "list", "lines", "" },
        { "satinalma.fatura.odemeleri", "GET", "/api/purchasing/invoices/{id}", "id:route:guid*", "list", "payments", "" },
        { "satinalma.fatura.iadeleri", "GET", "/api/purchasing/invoices/{id}", "id:route:guid*", "list", "returns", "" },
        { "satinalma.fatura.iptal", "POST", "/api/purchasing/invoices/{id}/void", "id:route:guid*", "none", null, "" },
        { "satinalma.fatura.odemeEkle", "POST", "/api/purchasing/invoices/{id}/payments", "id:route:guid*,requestId:body:guid*,paymentDate:body:date*,amount:body:decimal*,paymentMethod:body:text*,reference:body:text,financialAccountId:body:guid", "record", null, "" },
        { "satinalma.fatura.odemeIptal", "POST", "/api/purchasing/payments/{id}/void", "id:route:guid*", "none", null, "" },
        { "satinalma.fatura.odemeHesaplari", "GET", "/api/finance/accounts", "", "list", null, "" },
        { "satinalma.iade.listele", "GET", "/api/purchasing/returns", "q:query:text,page:query:int,pageSize:query:int", "list", "items", "page,pageSize,totalCount" },
        { "satinalma.iade.getir", "GET", "/api/purchasing/returns/{id}", "id:route:guid*", "record", null, "" },
        { "satinalma.iade.satirlari", "GET", "/api/purchasing/returns/{id}", "id:route:guid*", "list", "lines", "" },
        { "satinalma.iade.iptal", "POST", "/api/purchasing/returns/{id}/void", "id:route:guid*", "none", null, "" },
    };

    // ---- Catalog ----

    [Fact]
    public void Catalog_declares_the_faz1_purchasing_operations_and_nothing_else()
    {
        var purchasing = ErpOperationCatalog.All.Where(x => x.Module == "Satınalma").Select(x => x.Name).Order(StringComparer.Ordinal);
        Assert.Equal(Faz1Operations.Concat(InventoryCostOperations).Order(StringComparer.Ordinal), purchasing);
        Assert.All(ErpOperationCatalog.All.Where(x => x.Name.StartsWith("satinalma.", StringComparison.Ordinal)), x => Assert.Equal("Satınalma", x.Module));
        Assert.Equal(Faz1Operations.Length, Shapes.Count);
        foreach (var name in Faz1Operations)
        {
            var op = Op(name);
            Assert.False(op.Deprecated, name);
            Assert.Null(ErpOperationCatalog.ParameterShapeError(op));
            Assert.Empty(op.RouteVariants);
            Assert.Null(op.BodyMap);
            Assert.Null(op.SourceOperation);
            Assert.DoesNotContain(op.Parameters, x => x.Type is "list" or "map");
            Assert.Equal(name is "satinalma.talep.onayla" or "satinalma.talep.reddet", op.RequiresTenantAdmin);
            // Every column has a label; a missing one would already have failed startup.
            Assert.All(op.Result.Columns, x => Assert.False(string.IsNullOrWhiteSpace(x.Label), $"{name}.{x.Code}"));
            Assert.Equal(op.Result.Columns.Count, op.Result.Columns.Select(x => x.Code).Distinct(StringComparer.Ordinal).Count());
        }
    }

    [Theory]
    [MemberData(nameof(Shapes))]
    public void Operation_shape_matches_the_endpoint(string name, string method, string route, string parameters, string shape, string? rowsPath, string meta)
    {
        var op = Op(name);
        Assert.Equal((method, route, shape, rowsPath), (op.Method, op.Route, op.Result.Shape, op.Result.RowsPath));
        Assert.Equal(parameters, string.Join(",", op.Parameters.Select(x => $"{x.Name}:{x.In}:{x.Type}{(x.Required ? "*" : "")}")));
        Assert.Equal(meta, string.Join(",", op.Result.MetaPaths));
        Assert.Equal(op.Kind == "write", method == "POST");
        if (op.Kind == "write") Assert.Equal(name is "satinalma.malKabul.faturala" or "satinalma.fatura.odemeEkle" ? "insert" : "update", op.PageKind);
    }

    [Fact]
    public void Decisions_fix_the_direction_and_inventory_cost_operations_keep_their_contract()
    {
        Assert.Equal(true, Op("satinalma.talep.onayla").FixedBody!["approved"]);
        Assert.Equal(false, Op("satinalma.talep.reddet").FixedBody!["approved"]);
        Assert.All(Faz1Operations.Where(x => x is not ("satinalma.talep.onayla" or "satinalma.talep.reddet")), x => Assert.Null(Op(x).FixedBody));
        // satinalma.malKabul.listele is used by inventory-cost.json: no meta, same columns as the paged twin's base columns.
        var listele = Op("satinalma.malKabul.listele");
        Assert.Empty(listele.Result.MetaPaths);
        Assert.Equal(listele.Result.Columns.Select(x => x.Code), Op("satinalma.malKabul.sayfaliListe").Result.Columns.Select(x => x.Code));
        Assert.Equal(listele.Route, Op("satinalma.malKabul.sayfaliListe").Route);
    }

    [Fact]
    public void Computed_display_members_and_flattened_invoice_columns_are_declared()
    {
        string[] payment = ["paymentState:text", "overdueDays:int", "displayOutstanding:decimal"];
        Assert.Subset(Codes("satinalma.fatura.listele"), payment.ToHashSet());
        Assert.Subset(Codes("satinalma.fatura.getir"), payment.ToHashSet());
        Assert.Subset(Codes("satinalma.malKabul.faturala"), payment.ToHashSet());
        Assert.Subset(Codes("satinalma.siparis.listele"),
            new HashSet<string> { "orderedQuantity:decimal", "receivedQuantity:decimal", "receivedPercent:decimal", "isOverdue:bool", "delayDays:int" });
        Assert.Subset(Codes("satinalma.siparis.getir"),
            new HashSet<string> { "receivedPercent:decimal", "isOverdue:bool", "delayDays:int", "postedReceiptCount:int", "invoicedReceiptCount:int" });
        Assert.Subset(Codes("satinalma.talep.listele"), new HashSet<string> { "quoteCount:int", "neededByDays:int" });
        Assert.Subset(Codes("satinalma.talep.getir"), new HashSet<string> { "neededByDays:int" });
        Assert.Subset(Codes("satinalma.faturaGirisi.mevzuatProfilleri"), new HashSet<string> { "hasTaxRules:bool", "isDefaultForDocuments:bool" });
        Assert.DoesNotContain("parametersJson:text", Codes("satinalma.faturaGirisi.mevzuatProfilleri"));
        foreach (var name in new[] { "satinalma.siparis.malKabulleri", "satinalma.malKabul.getir" })
        {
            var op = Op(name);
            Assert.Equal(new[] { "invoice" }, op.Result.Flatten);
            Assert.Subset(Codes(name), new HashSet<string> { "invoice.id:guid", "invoice.code:text", "invoice.status:text", "invoice.paymentState:text" });
            // A prefixed column keeps its inner code's label.
            Assert.Equal("Ödeme durumu", op.Result.Columns.Single(x => x.Code == "invoice.paymentState").Label);
        }
        // "type" is the cari type in the shared labels; the account list declares its own.
        Assert.Equal("Hesap türü", Op("satinalma.fatura.odemeHesaplari").Result.Columns.Single(x => x.Code == "type").Label);
        Assert.Equal("Cari türü", Op("cari.listele").Result.Columns.Single(x => x.Code == "type").Label);
        // Older operations keep their frozen columns (members outside the constructors are declared only by satinalma.*).
        Assert.DoesNotContain(ErpOperationCatalog.All.Where(x => !x.Name.StartsWith("satinalma.", StringComparison.Ordinal)).SelectMany(x => x.Result.Columns),
            x => x.Code is "paymentState" or "receivedPercent" or "neededByDays");
    }

    [Fact]
    public void Purchasing_display_rules()
    {
        var today = new DateOnly(2026, 11, 21);
        var due = new DateOnly(2026, 11, 10);
        Assert.Equal("Voided", PurchasingDisplay.PaymentState(PurchaseInvoiceStatus.Voided, due, 0, 100, today));
        Assert.Equal("Paid", PurchasingDisplay.PaymentState(PurchaseInvoiceStatus.Posted, due, 100, 0, today));
        Assert.Equal("Posted", PurchasingDisplay.PaymentState(PurchaseInvoiceStatus.Posted, due, 0, 0, today));
        Assert.Equal("Overdue", PurchasingDisplay.PaymentState(PurchaseInvoiceStatus.Posted, due, 40, 60, today));
        Assert.Equal("Partial", PurchasingDisplay.PaymentState(PurchaseInvoiceStatus.Posted, today.AddDays(5), 40, 60, today));
        Assert.Equal("Posted", PurchasingDisplay.PaymentState(PurchaseInvoiceStatus.Posted, today, 0, 60, today));
        Assert.Equal(11, PurchasingDisplay.OverdueDays(PurchaseInvoiceStatus.Posted, due, 60, today));
        Assert.Equal(0, PurchasingDisplay.OverdueDays(PurchaseInvoiceStatus.Voided, due, 60, today));
        Assert.Null(PurchasingDisplay.DisplayOutstanding(PurchaseInvoiceStatus.Voided, 60));
        Assert.True(PurchasingDisplay.IsOrderOverdue(PurchaseOrderStatus.PartiallyReceived, today.AddDays(-16), today));
        Assert.False(PurchasingDisplay.IsOrderOverdue(PurchaseOrderStatus.Received, today.AddDays(-16), today));
        Assert.False(PurchasingDisplay.IsOrderOverdue(PurchaseOrderStatus.Open, null, today));
        Assert.Equal(16, PurchasingDisplay.OrderDelayDays(PurchaseOrderStatus.Open, today.AddDays(-16), today));
        Assert.Equal(30m, PurchasingDisplay.ReceivedPercent(40, 12));
        Assert.Null(PurchasingDisplay.ReceivedPercent(0, 0));
        Assert.Equal(-6, PurchasingDisplay.NeededByDays(PurchaseRequestStatus.Approved, today.AddDays(-6), today));
        Assert.Null(PurchasingDisplay.NeededByDays(PurchaseRequestStatus.Ordered, today.AddDays(-6), today));
        Assert.True(PurchasingDisplay.HasTaxRules("""{"taxRules":[{"code":"TEV"}]}"""));
        Assert.False(PurchasingDisplay.HasTaxRules("""{"taxRules":[]}"""));
        Assert.False(PurchasingDisplay.HasTaxRules("not json"));
        Assert.True(PurchasingDisplay.IsDefaultForDocuments("""{"defaultForDocuments":true}"""));
    }

    // ---- allowed: nested routes resolve to the parent resource ----

    [Fact]
    public async Task Allowed_follows_the_permission_each_route_really_resolves_to()
    {
        await using var factory = new ErpOperationCatalogTests.ErpOperationApiFactory();
        await SeedPlatformAsync(factory, platform =>
        {
            platform.TenantPermissionRules.Add(Rule("erp.custom-menus.read", TenantPermissionEffect.Allow));
            foreach (var code in new[] { "erp.purchase-receipts.create", "erp.purchase-requests.execute", "erp.supplier-payments.execute" })
                platform.TenantPermissionRules.Add(Rule(code, TenantPermissionEffect.Allow, UserA));
            foreach (var code in new[] { "erp.purchase-invoices.create", "erp.supplier-payments.create", "erp.purchase-receipts.execute" })
                platform.TenantPermissionRules.Add(Rule(code, TenantPermissionEffect.Allow, UserB));
        });
        using var client = factory.CreateClient();

        ErpOperationCatalogTests.SetIdentity(client, UserA, "TenantUser");
        var a = await AllowedAsync(client);
        // POST receipts/{id}/invoice and its preview: erp.purchase-receipts.create (not the invoice permission).
        Assert.True(a["satinalma.malKabul.faturala"]);
        Assert.True(a["satinalma.faturaGirisi.onizleme"]);
        Assert.True(a["satinalma.faturaGirisi.onizlemeSatirlari"]);
        Assert.False(a["satinalma.malKabul.getir"]);
        Assert.False(a["satinalma.faturaGirisi.malKabulleri"]);
        // The decision resolves to execute, but its handler only accepts TenantAdmin.
        Assert.False(a["satinalma.talep.onayla"]);
        Assert.False(a["satinalma.talep.reddet"]);
        Assert.True(a["satinalma.fatura.odemeIptal"]);
        Assert.False(a["satinalma.fatura.odemeEkle"]);
        Assert.False(a["satinalma.malKabul.iptal"]);

        ErpOperationCatalogTests.SetIdentity(client, UserB, "TenantUser");
        var b = await AllowedAsync(client);
        // GET invoices/entry/receipts: erp.purchase-invoices.create; POST invoices/{id}/payments: erp.supplier-payments.create.
        Assert.True(b["satinalma.faturaGirisi.malKabulleri"]);
        Assert.True(b["satinalma.fatura.odemeEkle"]);
        Assert.True(b["satinalma.malKabul.iptal"]);
        Assert.False(b["satinalma.malKabul.faturala"]);
        Assert.False(b["satinalma.faturaGirisi.onizleme"]);
        Assert.False(b["satinalma.fatura.listele"]);
        Assert.False(b["satinalma.fatura.odemeIptal"]);

        ErpOperationCatalogTests.SetIdentity(client, Admin, "TenantAdmin");
        var admin = await AllowedAsync(client);
        Assert.All(Faz1Operations, name => Assert.True(admin[name], name));
    }

    [Fact]
    public async Task Row_rule_reads_are_allowed_where_the_server_filters_rows()
    {
        await using var factory = new ErpOperationCatalogTests.ErpOperationApiFactory();
        await SeedPlatformAsync(factory, platform =>
        {
            platform.TenantPermissionRules.Add(Rule("erp.custom-menus.read", TenantPermissionEffect.Allow));
            foreach (var code in new[] { "erp.purchase-orders.read", "erp.purchase-invoices.read", "erp.supplier-quotes.read" })
            {
                var rule = Rule(code, TenantPermissionEffect.Allow, UserA);
                (rule.AttributeName, rule.AttributeOperator, rule.AttributeValue) = ("resource.status", TenantPermissionConditionOperator.Equals, "Open");
                platform.TenantPermissionRules.Add(rule);
            }
        });
        using var client = factory.CreateClient();
        ErpOperationCatalogTests.SetIdentity(client, UserA, "TenantUser");
        var allowed = await AllowedAsync(client);
        // Filtered collections and record-attribute {id} routes decide row rules per record on the server.
        Assert.True(allowed["satinalma.siparis.listele"]);
        Assert.True(allowed["satinalma.siparis.getir"]);
        Assert.True(allowed["satinalma.fatura.listele"]);
        Assert.True(allowed["satinalma.fatura.getir"]);
        // The quote list is not row filtered (today's server): a row rule never matches it (G-C3 / K5).
        Assert.False(allowed["satinalma.teklif.listele"]);
    }

    // ---- Invoice preview ----

    [Fact]
    public async Task Invoice_preview_uses_the_invoice_calculation_and_writes_nothing()
    {
        await using var factory = new ErpOperationCatalogTests.ErpOperationApiFactory();
        await SeedPlatformAsync(factory, _ => { });
        var seed = await SeedPurchasingAsync(factory);
        using var client = factory.CreateClient();
        ErpOperationCatalogTests.SetIdentity(client, Admin, "TenantAdmin");
        var before = await CountsAsync(factory);

        using var response = await client.GetAsync($"/api/purchasing/receipts/{seed.ReceiptId:D}/invoice-preview?invoiceDate=2026-11-21");
        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == HttpStatusCode.OK, body);
        var preview = JsonDocument.Parse(body).RootElement;
        // Line 1: 5 × 100 with 10 % discount on top of 3 already invoiced (cumulative minus earlier), VAT 20 %.
        var line = Assert.Single(preview.GetProperty("lines").EnumerateArray());
        Assert.Equal((500m, 50m, 90m, 540m), (line.GetProperty("lineSubtotal").GetDecimal(), line.GetProperty("discountAmount").GetDecimal(),
            line.GetProperty("taxAmount").GetDecimal(), line.GetProperty("lineTotal").GetDecimal()));
        Assert.Equal((500m, 50m, 90m, 540m), (preview.GetProperty("subtotal").GetDecimal(), preview.GetProperty("discountTotal").GetDecimal(),
            preview.GetProperty("taxTotal").GetDecimal(), preview.GetProperty("grandTotal").GetDecimal()));
        Assert.Equal(("2026-12-21", 30, "TRY", "GR-2", "PO-1", "Tedarikçi"), (preview.GetProperty("dueDate").GetString(), preview.GetProperty("paymentTermDays").GetInt32(),
            preview.GetProperty("currencyCode").GetString(), preview.GetProperty("receiptCode").GetString(), preview.GetProperty("purchaseOrderCode").GetString(),
            preview.GetProperty("supplierName").GetString()));
        // The same numbers as the shared calculation the save runs.
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            var receiptLines = await db.PurchaseReceiptLines.Include(x => x.OrderLine).Where(x => x.TenantId == TenantA && x.ReceiptId == seed.ReceiptId).ToListAsync();
            var invoiced = await PurchaseInvoiceCalculation.LoadInvoicedAsync(db, TenantA, seed.OrderId);
            var expected = Assert.Single(PurchaseInvoiceCalculation.CalculateLines(receiptLines, invoiced, null, new DateOnly(2026, 11, 21)));
            Assert.Equal(expected.Amounts.LineTotal, line.GetProperty("lineTotal").GetDecimal());
            Assert.Equal(3m, invoiced[1].Quantity);
        }
        // Every catalog column is present in the response.
        foreach (var column in Op("satinalma.faturaGirisi.onizleme").Result.Columns) Assert.True(preview.TryGetProperty(column.Code, out _), column.Code);
        foreach (var column in Op("satinalma.faturaGirisi.onizlemeSatirlari").Result.Columns) Assert.True(line.TryGetProperty(column.Code, out _), column.Code);
        Assert.Equal(before, await CountsAsync(factory));
    }

    [Fact]
    public async Task Invoice_preview_keeps_tenant_scope_the_save_conflicts_and_the_save_permission()
    {
        await using var factory = new ErpOperationCatalogTests.ErpOperationApiFactory();
        await SeedPlatformAsync(factory, platform =>
        {
            platform.TenantPermissionRules.Add(Rule("erp.purchase-receipts.read", TenantPermissionEffect.Allow, UserA));
            platform.TenantPermissionRules.Add(Rule("erp.purchase-receipts.create", TenantPermissionEffect.Allow, UserB));
        });
        var seed = await SeedPurchasingAsync(factory);
        using var client = factory.CreateClient();

        ErpOperationCatalogTests.SetIdentity(client, Admin, "TenantAdmin");
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/purchasing/receipts/{seed.OtherTenantReceiptId:D}/invoice-preview")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/purchasing/receipts/{Guid.NewGuid():D}/invoice-preview")).StatusCode);
        await AssertConflictAsync(client, seed.VoidedReceiptId, "İptal edilmiş mal kabul için alış faturası oluşturulamaz.");
        await AssertConflictAsync(client, seed.InvoicedReceiptId, "Bu mal kabul için aktif alış faturası zaten var.");
        using (var invalid = await client.GetAsync($"/api/purchasing/receipts/{seed.ReceiptId:D}/invoice-preview?accountingProfileCode={new string('X', 40)}"))
            Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);
        // An unknown profile: the same message as the save.
        await AssertConflictAsync(client, seed.ReceiptId, "İstenen mevzuat profili bu belge tarihinde etkin değil.", "&accountingProfileCode=YOK");

        ErpOperationCatalogTests.SetIdentity(client, UserA, "TenantUser");
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"/api/purchasing/receipts/{seed.ReceiptId:D}/invoice-preview")).StatusCode);
        ErpOperationCatalogTests.SetIdentity(client, UserB, "TenantUser");
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"/api/purchasing/receipts/{seed.ReceiptId:D}/invoice-preview")).StatusCode);
    }

    [Fact]
    public void Invoice_preview_route_resolves_to_receipt_create()
    {
        Assert.True(PlatformPermissionCatalog.TryResolve($"/api/purchasing/receipts/{Guid.Empty:D}/invoice-preview", "GET",
            "/api/purchasing/receipts/{id:guid}/invoice-preview", new Dictionary<string, string?>(), TenantA, Admin, "TenantUser", out var preview));
        Assert.Equal("erp.purchase-receipts.create", preview!.Permission.Code);
        Assert.True(PlatformPermissionCatalog.TryResolve($"/api/purchasing/receipts/{Guid.Empty:D}", "GET",
            "/api/purchasing/receipts/{id:guid}", new Dictionary<string, string?>(), TenantA, Admin, "TenantUser", out var read));
        Assert.Equal("erp.purchase-receipts.read", read!.Permission.Code);
    }

    // ---- Lists: optional filters, display members, paging meta ----

    [Fact]
    public async Task Order_list_filters_are_optional_and_rows_carry_receiving_progress()
    {
        await using var factory = new ErpOperationCatalogTests.ErpOperationApiFactory();
        await SeedPlatformAsync(factory, _ => { });
        var seed = await SeedPurchasingAsync(factory);
        using var client = factory.CreateClient();
        ErpOperationCatalogTests.SetIdentity(client, Admin, "TenantAdmin");

        var all = await GetAsync(client, "/api/purchasing/orders");
        Assert.Equal(3, all.GetProperty("totalCount").GetInt32());
        var late = all.GetProperty("items").EnumerateArray().Single(x => x.GetProperty("id").GetGuid() == seed.OrderId);
        // 10 ordered; 3 (invoiced receipt) + 5 (open receipt) posted, the voided receipt's 2 do not count.
        Assert.Equal((10m, 8m, 80m, true), (late.GetProperty("orderedQuantity").GetDecimal(), late.GetProperty("receivedQuantity").GetDecimal(),
            late.GetProperty("receivedPercent").GetDecimal(), late.GetProperty("isOverdue").GetBoolean()));
        Assert.True(late.GetProperty("delayDays").GetInt32() >= 10);
        foreach (var column in Op("satinalma.siparis.listele").Result.Columns) Assert.True(late.TryGetProperty(column.Code, out _), column.Code);

        Assert.Equal(1, (await GetAsync(client, "/api/purchasing/orders?status=Received")).GetProperty("totalCount").GetInt32());
        var overdue = await GetAsync(client, "/api/purchasing/orders?overdue=true");
        Assert.Equal(seed.OrderId, Assert.Single(overdue.GetProperty("items").EnumerateArray()).GetProperty("id").GetGuid());
        Assert.Equal(3, (await GetAsync(client, "/api/purchasing/orders?overdue=false")).GetProperty("totalCount").GetInt32());
        using var invalid = await client.GetAsync("/api/purchasing/orders?status=Yok");
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);
        Assert.Contains("Satınalma siparişi durumu geçersiz.", await invalid.Content.ReadAsStringAsync());

        var order = await GetAsync(client, $"/api/purchasing/orders/{seed.OrderId:D}");
        Assert.Equal((2, 1, 80m), (order.GetProperty("postedReceiptCount").GetInt32(), order.GetProperty("invoicedReceiptCount").GetInt32(),
            order.GetProperty("receivedPercent").GetDecimal()));
        var receipt = order.GetProperty("receipts").EnumerateArray().Single(x => x.GetProperty("code").GetString() == "GR-1");
        Assert.Equal("Overdue", receipt.GetProperty("invoice").GetProperty("paymentState").GetString());
    }

    [Fact]
    public async Task Invoice_and_request_lists_carry_their_display_members()
    {
        await using var factory = new ErpOperationCatalogTests.ErpOperationApiFactory();
        await SeedPlatformAsync(factory, _ => { });
        await SeedPurchasingAsync(factory);
        using var client = factory.CreateClient();
        ErpOperationCatalogTests.SetIdentity(client, Admin, "TenantAdmin");

        var invoices = await GetAsync(client, "/api/purchasing/invoices");
        var invoice = Assert.Single(invoices.GetProperty("items").EnumerateArray());
        // 360 total, 100 paid, due long ago.
        Assert.Equal(("Overdue", 260m), (invoice.GetProperty("paymentState").GetString(), invoice.GetProperty("displayOutstanding").GetDecimal()));
        Assert.True(invoice.GetProperty("overdueDays").GetInt32() > 0);
        foreach (var column in Op("satinalma.fatura.listele").Result.Columns) Assert.True(invoice.TryGetProperty(column.Code, out _), column.Code);

        var requests = await GetAsync(client, "/api/purchasing/requests");
        var request = Assert.Single(requests.GetProperty("items").EnumerateArray());
        Assert.Equal(2, request.GetProperty("quoteCount").GetInt32());
        Assert.True(request.GetProperty("neededByDays").GetInt32() < 0);
        foreach (var column in Op("satinalma.talep.listele").Result.Columns) Assert.True(request.TryGetProperty(column.Code, out _), column.Code);

        var receipts = await GetAsync(client, "/api/purchasing/receipts?page=1&pageSize=2");
        foreach (var meta in Op("satinalma.malKabul.sayfaliListe").Result.MetaPaths) Assert.True(receipts.TryGetProperty(meta, out _), meta);
        Assert.Equal(3, receipts.GetProperty("totalCount").GetInt32());
        Assert.Equal(2, receipts.GetProperty("items").GetArrayLength());
    }

    // ---- Helpers ----

    private sealed record Seed(Guid OrderId, Guid ReceiptId, Guid InvoicedReceiptId, Guid VoidedReceiptId, Guid OtherTenantReceiptId);

    /// <summary>
    /// One supplier order (10 × 100, 10 % discount, VAT 20 %, expected long ago) with three receipts: GR-1 (3, invoiced, partly
    /// paid), GR-2 (5, not invoiced) and GR-V (2, voided); two more orders (received, future); one request with two quotes;
    /// one receipt in another tenant.
    /// </summary>
    private static async Task<Seed> SeedPurchasingAsync(ErpOperationCatalogTests.ErpOperationApiFactory factory)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        var tenant = new Tenant { Id = TenantA, Name = "A", Slug = "tenant-a", BaseCurrencyCode = "TRY" };
        var other = new Tenant { Id = TenantB, Name = "B", Slug = "tenant-b" };
        var supplier = new CustomerAccount { TenantId = TenantA, Tenant = tenant, Code = "S-1", Name = "Tedarikçi", Type = CounterpartyType.Supplier, PaymentTermDays = 30 };
        var otherSupplier = new CustomerAccount { TenantId = TenantB, Tenant = other, Code = "S-B", Name = "Başka", Type = CounterpartyType.Supplier };
        var warehouse = new Warehouse { TenantId = TenantA, Tenant = tenant, Code = "MAIN", Name = "Ana depo" };
        var otherWarehouse = new Warehouse { TenantId = TenantB, Tenant = other, Code = "X", Name = "Başka depo" };
        var stockItemId = Guid.NewGuid();
        PurchaseOrder Order(string code, PurchaseOrderStatus status, DateOnly expected, Guid tenantId, CustomerAccount orderSupplier) => new()
        {
            TenantId = tenantId, Supplier = orderSupplier, Code = code, OrderDate = new DateOnly(2026, 10, 1), CurrencyCode = "TRY", Status = status,
            ExpectedReceiptDate = expected, GrandTotal = 1080m,
            Lines = { new PurchaseOrderLine { TenantId = tenantId, LineNumber = 1, StockItemId = stockItemId, StockCode = "STK-1", StockName = "Koli", UnitCode = "EA",
                Quantity = 10m, UnitPrice = 100m, DiscountPercent = 10m, VatPercent = 20m, LineSubtotal = 1000m, DiscountAmount = 100m, TaxAmount = 180m, LineTotal = 1080m } }
        };
        var order = Order("PO-1", PurchaseOrderStatus.PartiallyReceived, new DateOnly(2026, 1, 5), TenantA, supplier);
        var otherOrder = Order("PO-B", PurchaseOrderStatus.Open, new DateOnly(2026, 1, 5), TenantB, otherSupplier);
        PurchaseReceipt Receipt(string code, PurchaseOrder receiptOrder, Warehouse receiptWarehouse, decimal quantity, PurchaseReceiptStatus status = PurchaseReceiptStatus.Posted) => new()
        {
            TenantId = receiptOrder.TenantId, PurchaseOrder = receiptOrder, Warehouse = receiptWarehouse, Code = code, ReceiptDate = new DateOnly(2026, 10, 5), Status = status,
            Lines = { new PurchaseReceiptLine { TenantId = receiptOrder.TenantId, PurchaseOrderId = receiptOrder.Id, OrderLineNumber = 1, StockItemId = stockItemId,
                StockCode = "STK-1", StockName = "Koli", UnitCode = "EA", Quantity = quantity } }
        };
        var invoicedReceipt = Receipt("GR-1", order, warehouse, 3m);
        var openReceipt = Receipt("GR-2", order, warehouse, 5m);
        var voidedReceipt = Receipt("GR-V", order, warehouse, 2m, PurchaseReceiptStatus.Voided);
        var otherReceipt = Receipt("GR-B", otherOrder, otherWarehouse, 1m);
        var invoice = new PurchaseInvoice
        {
            TenantId = TenantA, PurchaseReceipt = invoicedReceipt, PurchaseOrder = order, Supplier = supplier, Code = "PINV-1", InvoiceDate = new DateOnly(2026, 10, 6),
            DueDate = new DateOnly(2026, 1, 5), CurrencyCode = "TRY", Subtotal = 300m, DiscountTotal = 30m, TaxTotal = 54m, GrandTotal = 360m
        };
        invoice.Lines.Add(new PurchaseInvoiceLine { TenantId = TenantA, PurchaseInvoice = invoice, PurchaseReceiptLineId = invoicedReceipt.Lines.Single().Id,
            PurchaseReceiptId = invoicedReceipt.Id, OrderLineNumber = 1, StockItemId = stockItemId, StockCode = "STK-1", StockName = "Koli", UnitCode = "EA",
            Quantity = 3m, UnitPrice = 100m, DiscountPercent = 10m, VatPercent = 20m, LineSubtotal = 300m, DiscountAmount = 30m, TaxAmount = 54m, LineTotal = 324m });
        var request = new PurchaseRequest { TenantId = TenantA, Tenant = tenant, Code = "REQ-1", RequestDate = new DateOnly(2026, 1, 1),
            NeededByDate = new DateOnly(2026, 1, 10), Description = "Koli", Status = PurchaseRequestStatus.Approved, RequestedByUserId = UserA };
        db.AddRange(tenant, other, supplier, otherSupplier, warehouse, otherWarehouse, order, otherOrder, invoicedReceipt, openReceipt, voidedReceipt, otherReceipt, invoice,
            Order("PO-2", PurchaseOrderStatus.Received, new DateOnly(2026, 1, 5), TenantA, supplier),
            Order("PO-3", PurchaseOrderStatus.Open, new DateOnly(2099, 1, 5), TenantA, supplier),
            new SupplierPayment { TenantId = TenantA, Tenant = tenant, PurchaseInvoice = invoice, Supplier = supplier, Code = "PAY-1", PaymentDate = new DateOnly(2026, 10, 7),
                Amount = 100m, RequestId = Guid.NewGuid() },
            request,
            new PurchaseSupplierQuote { TenantId = TenantA, PurchaseRequest = request, Supplier = supplier, Code = "SQ-1", QuoteDate = new DateOnly(2026, 1, 2), CurrencyCode = "TRY", GrandTotal = 900m },
            new PurchaseSupplierQuote { TenantId = TenantA, PurchaseRequest = request, Supplier = supplier, Code = "SQ-2", QuoteDate = new DateOnly(2026, 1, 3), CurrencyCode = "TRY", GrandTotal = 950m });
        await db.SaveChangesAsync();
        return new Seed(order.Id, openReceipt.Id, invoicedReceipt.Id, voidedReceipt.Id, otherReceipt.Id);
    }

    private static Task SeedPlatformAsync(ErpOperationCatalogTests.ErpOperationApiFactory factory, Action<PlatformDbContext> rules) =>
        ErpOperationCatalogTests.SeedAsync(factory, rules);

    private static async Task<(int Invoices, int Ledger, int Audit, int InvoiceLines)> CountsAsync(ErpOperationCatalogTests.ErpOperationApiFactory factory)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        return (await db.PurchaseInvoices.CountAsync(), await db.CustomerLedgerEntries.CountAsync(), await db.AuditEvents.CountAsync(), await db.PurchaseInvoiceLines.CountAsync());
    }

    private static async Task AssertConflictAsync(HttpClient client, Guid receiptId, string message, string query = "")
    {
        using var response = await client.GetAsync($"/api/purchasing/receipts/{receiptId:D}/invoice-preview?invoiceDate=2026-11-21{query}");
        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == HttpStatusCode.Conflict, $"{response.StatusCode}: {body}");
        Assert.Equal(message, JsonDocument.Parse(body).RootElement.GetProperty("error").GetString());
    }

    private static async Task<JsonElement> GetAsync(HttpClient client, string url)
    {
        using var response = await client.GetAsync(url);
        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == HttpStatusCode.OK, $"{url} -> {response.StatusCode}: {body}");
        return JsonDocument.Parse(body).RootElement.Clone();
    }

    private static async Task<Dictionary<string, bool>> AllowedAsync(HttpClient client)
    {
        using var response = await client.GetAsync("/api/custom-pages/erp-operations");
        Assert.True(response.StatusCode == HttpStatusCode.OK, await response.Content.ReadAsStringAsync());
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        return body.GetProperty("operations").EnumerateArray().ToDictionary(x => x.GetProperty("name").GetString()!, x => x.GetProperty("allowed").GetBoolean());
    }

    private static TenantPermissionRule Rule(string code, TenantPermissionEffect effect, Guid? user = null) => new()
    {
        TenantId = TenantA, SubjectType = user is null ? TenantPermissionSubjectType.Role : TenantPermissionSubjectType.User,
        SubjectRole = user is null ? "TenantUser" : null, SubjectUserId = user, PermissionCode = code,
        ResourceType = PlatformPermissionCatalog.Definitions.Single(x => x.Code == code).ResourceType, Effect = effect, IsActive = true
    };

    private static ErpOperation Op(string name) =>
        ErpOperationCatalog.TryGet(name, out var op) ? op : throw new Xunit.Sdk.XunitException($"İşlem yok: {name}");

    private static HashSet<string> Codes(string name) => Op(name).Result.Columns.Select(x => $"{x.Code}:{x.DataType}").ToHashSet(StringComparer.Ordinal);
}
