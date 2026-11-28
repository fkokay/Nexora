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

    /// <summary>Satınalma Faz 2: line document writes and the reads that prefill their line grids.</summary>
    internal static readonly string[] Faz2Operations =
    [
        "satinalma.talep.olustur", "satinalma.talep.teklifKaydet", "satinalma.talep.siparisOlustur", "satinalma.siparis.olustur",
        "satinalma.malKabul.olustur", "satinalma.malKabul.siparisSatirlari",
        "satinalma.irsaliye.olustur", "satinalma.irsaliye.siparisIrsaliyeleri", "satinalma.irsaliye.siparisSatirlari",
        "satinalma.irsaliye.malKabulBagla", "satinalma.irsaliye.malKabulBaglantisiKaldir",
        "satinalma.iade.olustur", "satinalma.fatura.iadeEdilebilirSatirlar",
        "satinalma.faturaTaslagi.listele", "satinalma.faturaTaslagi.getir", "satinalma.faturaTaslagi.satirlari", "satinalma.faturaTaslagi.olustur",
        "satinalma.faturaTaslagi.guncelle", "satinalma.faturaTaslagi.muhasebelestir", "satinalma.faturaTaslagi.tedarikciler",
        "satinalma.faturaTaslagi.giderHesaplari", "satinalma.faturaTaslagi.malKabulSatirlari"
    ];

    /// <summary>The purchasing system page operations (Faz 1 and Faz 2), whose contract tests live here.</summary>
    internal static bool IsSystemPageOperation(string name) => IsFaz1Operation(name) || Faz2Operations.Contains(name, StringComparer.Ordinal)
        || DocumentOperations.Contains(name, StringComparer.Ordinal);

    /// <summary>Belge sayfası (satınalma sipariş ve fatura belge modelleri): load, fill and calculate operations.</summary>
    internal static readonly string[] DocumentOperations =[
        "satinalma.siparis.belge", "satinalma.siparis.doldur", "satinalma.siparis.hesapla",
        "satinalma.fatura.belge", "satinalma.fatura.kayitBelgesi", "satinalma.fatura.doldur", "satinalma.fatura.hesapla"
    ];

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
        { "satinalma.malKabul.faturala", "POST", "/api/purchasing/receipts/{id}/invoice", "id:route:guid*,code:body:text*,invoiceDate:body:date*,providerInvoiceUuid:body:guid,providerScenario:body:text,providerInvoiceTypeCode:body:text,providerSenderAlias:body:text,accountingProfileCode:body:text,lines:body:list", "record", null, "" },
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
    public void Catalog_declares_the_purchasing_operations_and_nothing_else()
    {
        var purchasing = ErpOperationCatalog.All.Where(x => x.Module == "Satınalma").Select(x => x.Name).Order(StringComparer.Ordinal);
        Assert.Equal(Faz1Operations.Concat(Faz2Operations).Concat(DocumentOperations).Concat(InventoryCostOperations).Order(StringComparer.Ordinal), purchasing);
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
            // Only the receipt invoice takes a list: optional per-line prices (free / unpriced receipt lines need an amount).
            Assert.DoesNotContain(op.Parameters, x => (x.Type is "list" or "map") && !(name == "satinalma.malKabul.faturala" && x.Name == "lines"));
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

    // ---- Faz 2: line documents ----

    // name → method, route, parameters (name:in:type[*]; a list adds [item:type[*]|…]), result shape, rowsPath.
    public static TheoryData<string, string, string, string, string, string?> Faz2Shapes => new()
    {
        { "satinalma.talep.olustur", "POST", "/api/purchasing/requests",
            "code:body:text,requestDate:body:date*,neededByDate:body:date,description:body:text*,lines:body:list[stockItemId:guid*|quantity:decimal*|unitCode:text],customFields:body:map", "record", null },
        { "satinalma.talep.teklifKaydet", "POST", "/api/purchasing/requests/{id}/supplier-quotes",
            "id:route:guid*,code:body:text*,supplierId:body:guid*,quoteDate:body:date*,validUntil:body:date,notes:body:text,lines:body:list[requestLineNumber:int*|unitPrice:decimal*|discountPercent:decimal*|vatPercent:decimal],customFields:body:map", "record", null },
        { "satinalma.talep.siparisOlustur", "POST", "/api/purchasing/requests/{id}/order",
            "id:route:guid*,code:body:text*,supplierId:body:guid*,orderDate:body:date*,notes:body:text,supplierQuoteId:body:guid,expectedReceiptDate:body:date,targetWarehouseId:body:guid,lines:body:list[lineNumber:int*|unitPrice:decimal*|discountPercent:decimal*|vatPercent:decimal],customFields:body:map", "record", null },
        { "satinalma.siparis.olustur", "POST", "/api/purchasing/orders",
            "code:body:text*,supplierId:body:guid*,orderDate:body:date*,currencyCode:body:text*,notes:body:text,expectedReceiptDate:body:date,targetWarehouseId:body:guid,lines:body:list[stockItemId:guid*|quantity:decimal*|unitPrice:decimal*|discountPercent:decimal|vatPercent:decimal|unitCode:text],customFields:body:map", "record", null },
        { "satinalma.malKabul.olustur", "POST", "/api/purchasing/orders/{id}/receipts",
            "id:route:guid*,requestId:body:guid*,warehouseId:body:guid*,receiptDate:body:date*,lines:body:list[orderLineNumber:int*|quantity:decimal*|unitCode:text|storageLocationId:guid|unitPrice:decimal|discountPercent:decimal|vatPercent:decimal|isFreeOfCharge:bool],customFields:body:map", "record", null },
        { "satinalma.malKabul.siparisSatirlari", "GET", "/api/purchasing/orders/{id}", "id:route:guid*", "list", "lines" },
        { "satinalma.irsaliye.olustur", "POST", "/api/purchasing/delivery-notes/orders/{orderId}",
            "orderId:route:guid*,documentNumber:body:text*,documentDate:body:date*,purchaseReceiptId:body:guid,lines:body:list[orderLineNumber:int*|quantity:decimal*|unitCode:text|unitPrice:decimal|discountPercent:decimal|vatPercent:decimal|isFreeOfCharge:bool]", "record", null },
        { "satinalma.irsaliye.siparisIrsaliyeleri", "GET", "/api/purchasing/delivery-notes/orders/{orderId}", "orderId:route:guid*", "list", null },
        { "satinalma.irsaliye.siparisSatirlari", "GET", "/api/purchasing/delivery-notes/orders/{orderId}/lines", "orderId:route:guid*", "list", null },
        { "satinalma.irsaliye.malKabulBagla", "POST", "/api/purchasing/delivery-notes/{id}/link-receipt", "id:route:guid*,purchaseReceiptId:body:guid*", "none", null },
        { "satinalma.irsaliye.malKabulBaglantisiKaldir", "POST", "/api/purchasing/delivery-notes/{id}/unlink-receipt", "id:route:guid*", "none", null },
        { "satinalma.iade.olustur", "POST", "/api/purchasing/invoices/{id}/returns",
            "id:route:guid*,requestId:body:guid*,warehouseId:body:guid*,returnDate:body:date*,lines:body:list[purchaseInvoiceLineId:guid*|quantity:decimal*|unitCode:text|storageLocationId:guid]", "record", null },
        { "satinalma.fatura.iadeEdilebilirSatirlar", "GET", "/api/purchasing/invoices/{id}/returnable-lines", "id:route:guid*", "list", null },
        { "satinalma.faturaTaslagi.listele", "GET", "/api/purchasing/standalone-invoices", "q:query:text,page:query:int*,pageSize:query:int*", "list", "items" },
        { "satinalma.faturaTaslagi.getir", "GET", "/api/purchasing/standalone-invoices/{id}", "id:route:guid*", "record", null },
        { "satinalma.faturaTaslagi.satirlari", "GET", "/api/purchasing/standalone-invoices/{id}", "id:route:guid*", "list", "lines" },
        { "satinalma.faturaTaslagi.olustur", "POST", "/api/purchasing/standalone-invoices",
            "requestId:body:guid*,supplierId:body:guid*,invoiceNumber:body:text*,invoiceDate:body:date*,dueDate:body:date,currencyCode:body:text*,notes:body:text,subtotal:body:decimal*,discountTotal:body:decimal*,taxTotal:body:decimal*,grandTotal:body:decimal*," + DraftLines, "record", null },
        { "satinalma.faturaTaslagi.guncelle", "PUT", "/api/purchasing/standalone-invoices/{id}",
            "id:route:guid*,expectedRowVersion:body:text*,supplierId:body:guid*,invoiceNumber:body:text*,invoiceDate:body:date*,dueDate:body:date,currencyCode:body:text*,notes:body:text,subtotal:body:decimal*,discountTotal:body:decimal*,taxTotal:body:decimal*,grandTotal:body:decimal*," + DraftLines, "record", null },
        { "satinalma.faturaTaslagi.muhasebelestir", "POST", "/api/purchasing/standalone-invoices/{id}/post", "id:route:guid*", "record", null },
        { "satinalma.faturaTaslagi.tedarikciler", "GET", "/api/purchasing/standalone-invoices/suppliers", "q:query:text,page:query:int*,pageSize:query:int*", "list", "items" },
        { "satinalma.faturaTaslagi.giderHesaplari", "GET", "/api/finance/general-ledger/accounts", "", "list", null },
        { "satinalma.faturaTaslagi.malKabulSatirlari", "GET", "/api/purchasing/standalone-invoices/receipts",
            "supplierId:query:guid*,invoiceDate:query:date*,draftId:query:guid", "list", null },
    };

    private const string DraftLines = "lines:body:list[lineNumber:int*|description:text*|quantity:decimal|unitCode:text|unitPrice:decimal|subtotal:decimal*|discountAmount:decimal*|taxAmount:decimal*|total:decimal*|expenseAccountId:guid|vatRate:decimal|standalonePurchaseReceiptLineId:guid]";

    [Theory]
    [MemberData(nameof(Faz2Shapes))]
    public void Faz2_operation_shape_matches_the_endpoint(string name, string method, string route, string parameters, string shape, string? rowsPath)
    {
        var op = Op(name);
        Assert.Equal((method, route, shape, rowsPath), (op.Method, op.Route, op.Result.Shape, op.Result.RowsPath));
        Assert.Equal(parameters, string.Join(",", op.Parameters.Select(x => $"{x.Name}:{x.In}:{x.Type}{(x.Required ? "*" : "")}"
            + (x.Items is { } items ? "[" + string.Join("|", items.Select(i => $"{i.Code}:{i.DataType}{(i.Required ? "*" : "")}")) + "]" : ""))));
        Assert.Equal(op.Kind == "write", method != "GET");
        Assert.Null(ErpOperationCatalog.ParameterShapeError(op));
        // Retired duplicate of satinalma.siparis.satirlari (names are permanent): deprecated, not removed.
        Assert.Equal(name == "satinalma.malKabul.siparisSatirlari", op.Deprecated);
        Assert.Null(op.SourceOperation);
        Assert.Null(op.BodyMap);
        Assert.Empty(op.RouteVariants);
        Assert.Null(op.FixedBody);
        Assert.Equal(name is "satinalma.talep.teklifKaydet" or "satinalma.talep.siparisOlustur", op.RequiresTenantAdmin);
        if (op.Kind == "write")
            Assert.Equal(name is "satinalma.irsaliye.malKabulBagla" or "satinalma.irsaliye.malKabulBaglantisiKaldir" or "satinalma.faturaTaslagi.guncelle"
                or "satinalma.faturaTaslagi.muhasebelestir" ? "update" : "insert", op.PageKind);
        Assert.Equal(name is "satinalma.faturaTaslagi.listele" or "satinalma.faturaTaslagi.tedarikciler" ? "page,pageSize,totalCount" : "",
            string.Join(",", op.Result.MetaPaths));
        Assert.Equal(op.Result.Columns.Count, op.Result.Columns.Select(x => x.Code).Distinct(StringComparer.Ordinal).Count());
    }

    [Fact]
    public void Faz2_writes_declare_request_keys_labels_and_fill_columns()
    {
        Assert.Equal(Faz2Operations.Length, Faz2Shapes.Count);
        // requestId exists (and is required) exactly where the body has one; the other writes rely on 409 checks.
        string[] keyed = ["satinalma.malKabul.olustur", "satinalma.iade.olustur", "satinalma.faturaTaslagi.olustur"];
        foreach (var name in Faz2Operations.Where(x => Op(x).Kind == "write"))
            Assert.Equal(keyed.Contains(name), Op(name).Parameters.Any(x => x is { Name: "requestId", In: "body", Type: "guid", Required: true }));
        // Every column and list item has a label (a missing one fails startup); spot-check the new codes.
        foreach (var name in Faz2Operations)
        {
            var op = Op(name);
            Assert.All(op.Result.Columns, x => Assert.False(string.IsNullOrWhiteSpace(x.Label), $"{name}.{x.Code}"));
            Assert.All(op.Parameters.SelectMany(x => x.Items ?? []), x => Assert.False(string.IsNullOrWhiteSpace(x.Label), $"{name}.{x.Code}"));
        }
        Assert.Equal("Kalan", Label("satinalma.irsaliye.siparisSatirlari", "remainingQuantity"));
        Assert.Equal("İrsaliyelenen", Label("satinalma.irsaliye.siparisSatirlari", "notedQuantity"));
        Assert.Equal("İade edilen", Label("satinalma.fatura.iadeEdilebilirSatirlar", "returnedQuantity"));
        Assert.Equal("Tedarikçi fatura no", Label("satinalma.faturaTaslagi.getir", "invoiceNumber"));
        Assert.Equal("Finansal tablo sınıfı", Label("satinalma.faturaTaslagi.giderHesaplari", "statementSection"));
        Assert.Equal("Sipariş satır no", Op("satinalma.malKabul.olustur").Parameters.Single(x => x.Name == "lines").Items!.Single(x => x.Code == "orderLineNumber").Label);
        // Fill sources carry the remaining quantity under the code each write's line item uses; the receipt grid fills from the
        // order lines read (with the PO line price), the retired duplicate keeps the same columns.
        Assert.Subset(Codes("satinalma.siparis.satirlari"),
            new HashSet<string> { "orderLineNumber:int", "remainingQuantity:decimal", "stockItemId:guid", "unitCode:text", "trackingMode:text",
                "unitPrice:decimal", "discountPercent:decimal", "vatPercent:decimal" });
        Assert.Equal(Codes("satinalma.siparis.satirlari"), Codes("satinalma.malKabul.siparisSatirlari"));
        Assert.Subset(Codes("satinalma.irsaliye.siparisSatirlari"),
            new HashSet<string> { "orderLineNumber:int", "orderedQuantity:decimal", "notedQuantity:decimal", "remainingQuantity:decimal", "unitCode:text" });
        Assert.Subset(Codes("satinalma.fatura.iadeEdilebilirSatirlar"),
            new HashSet<string> { "purchaseInvoiceLineId:guid", "invoicedQuantity:decimal", "returnedQuantity:decimal", "remainingQuantity:decimal", "stockItemId:guid" });
        Assert.Subset(Codes("satinalma.faturaTaslagi.getir"), new HashSet<string> { "rowVersion:text", "grandTotal:decimal", "status:text" });
        // The expense account picker asks the server for active expense accounts.
        var expense = Op("satinalma.faturaTaslagi.giderHesaplari");
        Assert.Equal(("Expense", true), (expense.FixedQuery!["statementSection"], expense.FixedQuery["activeOnly"]));
        Assert.Null(Op("finans.muhasebe.hesap.listele").FixedQuery);
        // The order lines are the sales quote line record: only the six fields of the legacy order form are offered.
        Assert.DoesNotContain(Op("satinalma.siparis.olustur").Parameters.Single(x => x.Name == "lines").Items!,
            x => x.Code is "isVatIncluded" or "exchangeRateToQuoteCurrency" or "warehouseId" or "currencyCode" or "salesRequestLineNumber");
    }

    [Fact]
    public void Faz2_nested_routes_resolve_to_the_permission_their_handlers_are_guarded_by()
    {
        var id = Guid.Empty.ToString("D");
        Assert.Equal("erp.purchase-requests.create", Resolve($"/api/purchasing/requests", "POST", "/api/purchasing/requests/"));
        Assert.Equal("erp.purchase-requests.create", Resolve($"/api/purchasing/requests/{id}/supplier-quotes", "POST", "/api/purchasing/requests/{id:guid}/supplier-quotes"));
        Assert.Equal("erp.purchase-requests.create", Resolve($"/api/purchasing/requests/{id}/order", "POST", "/api/purchasing/requests/{id:guid}/order"));
        Assert.Equal("erp.purchase-orders.create", Resolve($"/api/purchasing/orders/{id}/receipts", "POST", "/api/purchasing/orders/{id:guid}/receipts"));
        Assert.Equal("erp.purchase-delivery-notes.create", Resolve($"/api/purchasing/delivery-notes/orders/{id}", "POST", "/api/purchasing/delivery-notes/orders/{orderId:guid}"));
        Assert.Equal("erp.purchase-delivery-notes.read", Resolve($"/api/purchasing/delivery-notes/orders/{id}/lines", "GET", "/api/purchasing/delivery-notes/orders/{orderId:guid}/lines"));
        Assert.Equal("erp.purchase-delivery-notes.update", Resolve($"/api/purchasing/delivery-notes/{id}/link-receipt", "POST", "/api/purchasing/delivery-notes/{id:guid}/link-receipt"));
        Assert.Equal("erp.purchase-delivery-notes.update", Resolve($"/api/purchasing/delivery-notes/{id}/unlink-receipt", "POST", "/api/purchasing/delivery-notes/{id:guid}/unlink-receipt"));
        Assert.Equal("erp.supplier-returns.create", Resolve($"/api/purchasing/invoices/{id}/returns", "POST", "/api/purchasing/invoices/{id:guid}/returns"));
        Assert.Equal("erp.purchase-invoices.read", Resolve($"/api/purchasing/invoices/{id}/returnable-lines", "GET", "/api/purchasing/invoices/{id:guid}/returnable-lines"));
        Assert.Equal("erp.purchase-invoices.create", Resolve("/api/purchasing/standalone-invoices", "POST", "/api/purchasing/standalone-invoices/"));
        Assert.Equal("erp.purchase-invoices.update", Resolve($"/api/purchasing/standalone-invoices/{id}", "PUT", "/api/purchasing/standalone-invoices/{id:guid}"));
        Assert.Equal("erp.purchase-invoices.execute", Resolve($"/api/purchasing/standalone-invoices/{id}/post", "POST", "/api/purchasing/standalone-invoices/{id:guid}/post"));
        Assert.Equal("erp.purchase-invoices.create", Resolve("/api/purchasing/standalone-invoices/suppliers", "GET", "/api/purchasing/standalone-invoices/suppliers"));
        Assert.Equal("erp.purchase-invoices.read", Resolve("/api/purchasing/standalone-invoices/receipts", "GET", "/api/purchasing/standalone-invoices/receipts"));
        Assert.Equal("erp.general-ledger.read", Resolve("/api/finance/general-ledger/accounts", "GET", "/api/finance/general-ledger/accounts"));
    }

    [Fact]
    public async Task Faz2_allowed_follows_the_parent_permission_of_nested_routes()
    {
        await using var factory = new ErpOperationCatalogTests.ErpOperationApiFactory();
        await SeedPlatformAsync(factory, platform =>
        {
            platform.TenantPermissionRules.Add(Rule("erp.custom-menus.read", TenantPermissionEffect.Allow));
            foreach (var code in new[] { "erp.purchase-orders.create", "erp.purchase-requests.create", "erp.purchase-delivery-notes.read" })
                platform.TenantPermissionRules.Add(Rule(code, TenantPermissionEffect.Allow, UserA));
            foreach (var code in new[] { "erp.purchase-receipts.create", "erp.supplier-returns.create", "erp.purchase-invoices.execute" })
                platform.TenantPermissionRules.Add(Rule(code, TenantPermissionEffect.Allow, UserB));
            // A row-rule invoice read: the returnable lines route is an {id} route with the invoice's record attributes.
            var rowRule = Rule("erp.purchase-invoices.read", TenantPermissionEffect.Allow, UserB);
            (rowRule.AttributeName, rowRule.AttributeOperator, rowRule.AttributeValue) = ("resource.status", TenantPermissionConditionOperator.Equals, "Posted");
            platform.TenantPermissionRules.Add(rowRule);
        });
        using var client = factory.CreateClient();

        ErpOperationCatalogTests.SetIdentity(client, UserA, "TenantUser");
        var a = await AllowedAsync(client);
        // POST orders/{id}/receipts: the order's create permission, not the receipt one.
        Assert.True(a["satinalma.malKabul.olustur"]);
        Assert.True(a["satinalma.siparis.olustur"]);
        Assert.True(a["satinalma.talep.olustur"]);
        // The quote and order-from-request handlers accept TenantAdmin only.
        Assert.False(a["satinalma.talep.teklifKaydet"]);
        Assert.False(a["satinalma.talep.siparisOlustur"]);
        Assert.True(a["satinalma.irsaliye.siparisSatirlari"]);
        Assert.True(a["satinalma.irsaliye.siparisIrsaliyeleri"]);
        Assert.False(a["satinalma.irsaliye.olustur"]);
        Assert.False(a["satinalma.irsaliye.malKabulBagla"]);
        Assert.False(a["satinalma.iade.olustur"]);
        Assert.False(a["satinalma.malKabul.siparisSatirlari"]);

        ErpOperationCatalogTests.SetIdentity(client, UserB, "TenantUser");
        var b = await AllowedAsync(client);
        Assert.False(b["satinalma.malKabul.olustur"]);
        Assert.True(b["satinalma.iade.olustur"]);
        Assert.True(b["satinalma.fatura.iadeEdilebilirSatirlar"]);
        Assert.True(b["satinalma.faturaTaslagi.muhasebelestir"]);
        Assert.False(b["satinalma.faturaTaslagi.olustur"]);
        Assert.False(b["satinalma.faturaTaslagi.giderHesaplari"]);

        ErpOperationCatalogTests.SetIdentity(client, Admin, "TenantAdmin");
        var admin = await AllowedAsync(client);
        Assert.All(Faz2Operations, name => Assert.True(admin[name], name));
    }

    [Fact]
    public async Task Returnable_lines_follow_the_return_rule_and_stay_in_the_tenant()
    {
        await using var factory = new ErpOperationCatalogTests.ErpOperationApiFactory();
        await SeedPlatformAsync(factory, _ => { });
        var seed = await SeedPurchasingAsync(factory);
        var extra = await SeedLineSourcesAsync(factory, seed);
        using var client = factory.CreateClient();
        ErpOperationCatalogTests.SetIdentity(client, Admin, "TenantAdmin");

        var rows = (await GetAsync(client, $"/api/purchasing/invoices/{extra.InvoiceId:D}/returnable-lines")).EnumerateArray().ToArray();
        var line = Assert.Single(rows);
        // 3 invoiced; the posted return took 1, the voided one does not count.
        Assert.Equal((extra.InvoiceLineId, 3m, 1m, 2m), (line.GetProperty("purchaseInvoiceLineId").GetGuid(), line.GetProperty("invoicedQuantity").GetDecimal(),
            line.GetProperty("returnedQuantity").GetDecimal(), line.GetProperty("remainingQuantity").GetDecimal()));
        foreach (var column in Op("satinalma.fatura.iadeEdilebilirSatirlar").Result.Columns) Assert.True(line.TryGetProperty(column.Code, out _), column.Code);

        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/purchasing/invoices/{extra.OtherTenantInvoiceId:D}/returnable-lines")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/purchasing/invoices/{Guid.NewGuid():D}/returnable-lines")).StatusCode);
    }

    [Fact]
    public async Task Delivery_note_order_lines_follow_the_note_rule_and_the_order_read_rules()
    {
        await using var factory = new ErpOperationCatalogTests.ErpOperationApiFactory();
        await SeedPlatformAsync(factory, platform =>
        {
            platform.TenantPermissionRules.Add(Rule("erp.purchase-delivery-notes.read", TenantPermissionEffect.Allow, UserA));
            // UserA may read Open orders only; PO-1 is PartiallyReceived.
            var rowRule = Rule("erp.purchase-orders.read", TenantPermissionEffect.Allow, UserA);
            (rowRule.AttributeName, rowRule.AttributeOperator, rowRule.AttributeValue) = ("resource.status", TenantPermissionConditionOperator.Equals, "Open");
            platform.TenantPermissionRules.Add(rowRule);
        });
        var seed = await SeedPurchasingAsync(factory);
        var extra = await SeedLineSourcesAsync(factory, seed);
        using var client = factory.CreateClient();
        ErpOperationCatalogTests.SetIdentity(client, Admin, "TenantAdmin");

        var line = Assert.Single((await GetAsync(client, $"/api/purchasing/delivery-notes/orders/{seed.OrderId:D}/lines")).EnumerateArray().ToArray());
        // 10 ordered, 4 on a recorded note (whatever the receipts say): 6 left for notes.
        Assert.Equal((1, 10m, 4m, 6m, "EA"), (line.GetProperty("orderLineNumber").GetInt32(), line.GetProperty("orderedQuantity").GetDecimal(),
            line.GetProperty("notedQuantity").GetDecimal(), line.GetProperty("remainingQuantity").GetDecimal(), line.GetProperty("unitCode").GetString()));
        foreach (var column in Op("satinalma.irsaliye.siparisSatirlari").Result.Columns) Assert.True(line.TryGetProperty(column.Code, out _), column.Code);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/purchasing/delivery-notes/orders/{extra.OtherTenantOrderId:D}/lines")).StatusCode);

        ErpOperationCatalogTests.SetIdentity(client, UserA, "TenantUser");
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/purchasing/delivery-notes/orders/{seed.OrderId:D}/lines")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"/api/purchasing/delivery-notes/orders/{extra.OpenOrderId:D}/lines")).StatusCode);
    }

    [Fact]
    public async Task Receipt_fill_source_carries_the_line_number_and_tracking_mode()
    {
        await using var factory = new ErpOperationCatalogTests.ErpOperationApiFactory();
        await SeedPlatformAsync(factory, _ => { });
        var seed = await SeedPurchasingAsync(factory);
        await SeedLineSourcesAsync(factory, seed);
        using var client = factory.CreateClient();
        ErpOperationCatalogTests.SetIdentity(client, Admin, "TenantAdmin");

        var order = await GetAsync(client, $"/api/purchasing/orders/{seed.OrderId:D}");
        var line = Assert.Single(order.GetProperty("lines").EnumerateArray().ToArray());
        // 10 ordered, 3 + 5 posted receipts (the voided 2 do not count).
        Assert.Equal((1, 2m, "Lot"), (line.GetProperty("orderLineNumber").GetInt32(), line.GetProperty("remainingQuantity").GetDecimal(),
            line.GetProperty("trackingMode").GetString()));
        foreach (var name in new[] { "satinalma.siparis.satirlari", "satinalma.malKabul.siparisSatirlari" })
            foreach (var column in Op(name).Result.Columns) Assert.True(line.TryGetProperty(column.Code, out _), $"{name}: {column.Code}");
    }

    [Fact]
    public async Task Expense_accounts_and_supplier_picker_filter_on_the_server()
    {
        await using var factory = new ErpOperationCatalogTests.ErpOperationApiFactory();
        await SeedPlatformAsync(factory, _ => { });
        var seed = await SeedPurchasingAsync(factory);
        await SeedLineSourcesAsync(factory, seed);
        using var client = factory.CreateClient();
        ErpOperationCatalogTests.SetIdentity(client, Admin, "TenantAdmin");

        // Without the filters the chart of accounts list is unchanged (finans.muhasebe.hesap.listele).
        Assert.Equal(3, (await GetAsync(client, "/api/finance/general-ledger/accounts")).GetArrayLength());
        var expense = (await GetAsync(client, "/api/finance/general-ledger/accounts?statementSection=Expense&activeOnly=true")).EnumerateArray().ToArray();
        Assert.Equal("770", Assert.Single(expense).GetProperty("code").GetString());
        Assert.Equal(2, (await GetAsync(client, "/api/finance/general-ledger/accounts?statementSection=expense")).GetArrayLength());
        using (var invalid = await client.GetAsync("/api/finance/general-ledger/accounts?statementSection=Yok"))
            Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);
        foreach (var column in Op("satinalma.faturaTaslagi.giderHesaplari").Result.Columns) Assert.True(expense[0].TryGetProperty(column.Code, out _), column.Code);

        // K6: cari.listele takes several types (Supplier ∪ Both) and the status filter; customers are left out.
        var suppliers = await GetAsync(client, "/api/customers?type=Supplier,Both&status=Active");
        var codes = suppliers.GetProperty("items").EnumerateArray().Select(x => x.GetProperty("code").GetString()).Order(StringComparer.Ordinal).ToArray();
        Assert.Equal(new[] { "BOTH-1", "S-1" }, codes);
        Assert.True(Op("cari.listele").Parameters.Any(x => x is { Name: "type", In: "query", Type: "text" }));
    }

    [Fact]
    public async Task Request_create_accepts_a_body_without_code()
    {
        // satinalma.talep.olustur declares code optional (a blank code is numbered by the server): a body without it binds
        // and reaches the handler's own validation, which names only the invalid field.
        await using var factory = new ErpOperationCatalogTests.ErpOperationApiFactory();
        await SeedPlatformAsync(factory, _ => { });
        using var client = factory.CreateClient();
        ErpOperationCatalogTests.SetIdentity(client, Admin, "TenantAdmin");
        using var response = await client.PostAsJsonAsync("/api/purchasing/requests",
            new { requestDate = "2026-11-22", description = "", lines = new[] { new { stockItemId = Guid.NewGuid(), quantity = 1m } } });
        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == HttpStatusCode.BadRequest, $"{response.StatusCode}: {body}");
        var errors = JsonDocument.Parse(body).RootElement.GetProperty("errors");
        Assert.True(errors.TryGetProperty("description", out _), body);
        Assert.False(errors.TryGetProperty("code", out _), body);
        Assert.False(Op("satinalma.talep.olustur").Parameters.Single(x => x.Name == "code").Required);
    }

    private sealed record LineSourceSeed(Guid InvoiceId, Guid InvoiceLineId, Guid OtherTenantInvoiceId, Guid OtherTenantOrderId, Guid OpenOrderId);

    /// <summary>
    /// On top of <see cref="SeedPurchasingAsync"/>: a lot-tracked stock card for the order lines, a posted (1) and a voided (1)
    /// return on the invoice line, a recorded delivery note (4) on PO-1, an invoice in another tenant, three ledger accounts
    /// (active expense, passive expense, asset) and three counterparties (customer, both, passive supplier).
    /// </summary>
    private static async Task<LineSourceSeed> SeedLineSourcesAsync(ErpOperationCatalogTests.ErpOperationApiFactory factory, Seed seed)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        var order = await db.PurchaseOrders.Include(x => x.Lines).SingleAsync(x => x.Id == seed.OrderId);
        var invoice = await db.PurchaseInvoices.Include(x => x.Lines).SingleAsync(x => x.TenantId == TenantA);
        var invoiceLine = invoice.Lines.Single();
        var warehouse = await db.Warehouses.SingleAsync(x => x.TenantId == TenantA);
        var openOrder = await db.PurchaseOrders.SingleAsync(x => x.TenantId == TenantA && x.Code == "PO-3");
        var otherOrder = await db.PurchaseOrders.SingleAsync(x => x.TenantId == TenantB);
        var otherReceipt = await db.PurchaseReceipts.Include(x => x.Lines).SingleAsync(x => x.Id == seed.OtherTenantReceiptId);
        db.StockItems.Add(new StockItem { Id = order.Lines.Single().StockItemId, TenantId = TenantA, Code = "STK-1", Name = "Koli", UnitCode = "EA",
            TrackingMode = InventoryTrackingMode.Lot });
        SupplierReturn Return(string code, decimal quantity, SupplierReturnStatus status) => new()
        {
            TenantId = TenantA, RequestId = Guid.NewGuid(), PurchaseInvoiceId = invoice.Id, SupplierId = invoice.SupplierId, WarehouseId = warehouse.Id,
            Code = code, ReturnDate = new DateOnly(2026, 10, 8), Status = status,
            Lines = { new SupplierReturnLine { TenantId = TenantA, PurchaseInvoiceId = invoice.Id, PurchaseInvoiceLineId = invoiceLine.Id, OrderLineNumber = 1,
                StockItemId = invoiceLine.StockItemId, StockCode = "STK-1", StockName = "Koli", UnitCode = "EA", Quantity = quantity } }
        };
        db.SupplierReturns.AddRange(Return("RET-1", 1m, SupplierReturnStatus.Posted), Return("RET-V", 1m, SupplierReturnStatus.Voided));
        db.PurchaseDeliveryNotes.Add(new PurchaseDeliveryNote { TenantId = TenantA, PurchaseOrderId = order.Id, DocumentNumber = "IRS-1",
            DocumentDate = new DateOnly(2026, 10, 4),
            Lines = { new PurchaseDeliveryNoteLine { TenantId = TenantA, PurchaseOrderId = order.Id, OrderLineNumber = 1, Quantity = 4m, UnitCode = "EA" } } });
        var otherInvoice = new PurchaseInvoice { TenantId = TenantB, PurchaseReceiptId = otherReceipt.Id, PurchaseOrderId = otherOrder.Id,
            SupplierId = otherOrder.SupplierId, Code = "PINV-B", InvoiceDate = new DateOnly(2026, 10, 6), DueDate = new DateOnly(2026, 11, 6), CurrencyCode = "TRY" };
        otherInvoice.Lines.Add(new PurchaseInvoiceLine { TenantId = TenantB, PurchaseInvoice = otherInvoice, PurchaseReceiptLineId = otherReceipt.Lines.Single().Id,
            PurchaseReceiptId = otherReceipt.Id, OrderLineNumber = 1, StockItemId = invoiceLine.StockItemId, StockCode = "STK-1", StockName = "Koli", UnitCode = "EA",
            Quantity = 1m });
        db.PurchaseInvoices.Add(otherInvoice);
        db.LedgerAccounts.AddRange(
            new LedgerAccount { TenantId = TenantA, Code = "770", Name = "Genel yönetim giderleri", StatementSection = LedgerAccountStatementSection.Expense },
            new LedgerAccount { TenantId = TenantA, Code = "760", Name = "Pazarlama giderleri", StatementSection = LedgerAccountStatementSection.Expense, IsActive = false },
            new LedgerAccount { TenantId = TenantA, Code = "100", Name = "Kasa", StatementSection = LedgerAccountStatementSection.Asset });
        db.CustomerAccounts.AddRange(
            new CustomerAccount { TenantId = TenantA, Code = "C-1", Name = "Müşteri", Type = CounterpartyType.Customer },
            new CustomerAccount { TenantId = TenantA, Code = "BOTH-1", Name = "İkisi", Type = CounterpartyType.Both },
            new CustomerAccount { TenantId = TenantA, Code = "S-P", Name = "Pasif tedarikçi", Type = CounterpartyType.Supplier, IsActive = false });
        await db.SaveChangesAsync();
        return new LineSourceSeed(invoice.Id, invoiceLine.Id, otherInvoice.Id, otherOrder.Id, openOrder.Id);
    }

    private static string Resolve(string path, string method, string pattern)
    {
        var routeValues = new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase);
        Assert.True(PlatformPermissionCatalog.TryResolve(path, method, pattern, routeValues, TenantA, Admin, "TenantUser", out var resolved), path);
        return resolved!.Permission.Code;
    }

    private static string Label(string operation, string code) => Op(operation).Result.Columns.Single(x => x.Code == code).Label;

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
