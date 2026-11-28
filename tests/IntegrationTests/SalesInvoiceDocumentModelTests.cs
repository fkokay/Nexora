using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using AIERP.Platform.Domain;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>The satis.fatura document model (belge modeli, üçüncü model): model, document view, void transition, sample, fill and permission route.</summary>
public sealed class SalesInvoiceDocumentModelTests
{
    private static Task<Guid> SeedInvoiceAsync(SalesOrderApiFactory factory, SalesOrderSeed seed, SalesInvoiceStatus status, string code = "FTR-SEED", bool withLog = false) =>
        factory.WithTenantDbAsync(async db =>
        {
            var item = await db.StockItems.SingleAsync(x => x.Id == seed.StockItemId);
            var invoice = new SalesInvoice
            {
                TenantId = seed.TenantId, CustomerId = seed.CustomerId, Code = code, InvoiceDate = new DateOnly(2026, 11, 2), CurrencyCode = "TRY", Status = status,
                InvoiceType = SalesInvoiceType.Retail, AccountingProfileCode = "TR-STD", Notes = "Fatura notu", EDocumentScenario = "EARSIV",
                Subtotal = 40m, TaxTotal = 8m, GrandTotal = 48m
            };
            invoice.Lines.Add(new SalesInvoiceLine
            {
                TenantId = seed.TenantId, Invoice = invoice, OrderLineNumber = 1, StockItemId = item.Id, StockCode = item.Code, StockName = item.Name,
                UnitCode = item.UnitCode, Quantity = 4m, UnitPrice = 10m, VatPercent = 20m, LineSubtotal = 40m, TaxAmount = 8m, LineTotal = 48m
            });
            db.SalesInvoices.Add(invoice);
            if (withLog) DocumentActivityLog.Add(db, seed.TenantId, DocumentActivityLog.SalesInvoice, invoice.Id, "kes", "Fatura kesildi", "core", "done", null, null);
            await db.SaveChangesAsync();
            return invoice.Id;
        });

    private static async Task AllowOnlyAsync(SalesOrderApiFactory factory, SalesOrderSeed seed, params (string Permission, TenantPermissionEffect Effect)[] rules) =>
        await factory.WithPlatformDbAsync(async platform =>
        {
            foreach (var (code, effect) in rules)
            {
                var permission = await platform.PermissionDefinitions.SingleAsync(x => x.Code == code);
                platform.TenantPermissionRules.Add(new TenantPermissionRule
                {
                    TenantId = seed.TenantId, SubjectType = TenantPermissionSubjectType.Role, SubjectRole = "TenantUser",
                    PermissionCode = permission.Code, Permission = permission, Effect = effect, ResourceType = permission.ResourceType
                });
            }
            await platform.SaveChangesAsync();
        });

    [Fact]
    public async Task Model_lists_states_transition_and_shared_line_columns()
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync();
        using var client = factory.Client(seed);

        var model = await SalesOrderApiFactory.ReadJsonAsync(await client.GetAsync("/api/document-models/satis.fatura"));

        Assert.Equal(["Draft", "Posted", "Voided"], model.GetProperty("states").EnumerateArray().Select(x => x.GetProperty("code").GetString()).ToArray());
        Assert.Equal("Kesildi", model.GetProperty("states")[1].GetProperty("label").GetString());
        var transition = model.GetProperty("transitions")[0];
        Assert.Equal(("iptal", "satis.fatura.iptal", true), (transition.GetProperty("code").GetString(), transition.GetProperty("operation").GetString(), transition.GetProperty("requiresReason").GetBoolean()));
        Assert.Equal(("satis.fatura.onizle", "satis.fatura.belge", "satis.fatura.doldur", "satis.fatura.olustur"),
            (model.GetProperty("calculateOperation").GetString(), model.GetProperty("loadOperation").GetString(), model.GetProperty("fillOperation").GetString(),
                model.GetProperty("createOperation").GetString()));
        Assert.Equal(["code", "customerId", "invoiceDate", "warehouseId", "invoiceType", "accountingProfileCode", "eDocumentScenario", "eDocumentTypeCode",
            "eDocumentRecipientAlias", "notes"], model.GetProperty("fields").EnumerateArray().Select(x => x.GetProperty("code").GetString()).ToArray());
        var type = model.GetProperty("fields").EnumerateArray().Single(x => x.GetProperty("code").GetString() == "invoiceType");
        Assert.Equal("select", type.GetProperty("type").GetString());
        Assert.Equal(["Wholesale", "Retail"], type.GetProperty("options").EnumerateArray().Select(x => x.GetProperty("value").GetString()).ToArray());
        var orderModel = await SalesOrderApiFactory.ReadJsonAsync(await client.GetAsync("/api/document-models/satis.siparis"));
        Assert.Equal(orderModel.GetProperty("lineColumns").EnumerateArray().Select(x => x.GetProperty("code").GetString()).Where(x => x != "deliveredQuantity"),
            model.GetProperty("lineColumns").EnumerateArray().Select(x => x.GetProperty("code").GetString()));
    }

    [Fact]
    public async Task Document_returns_header_lines_amounts_and_vat()
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync();
        var id = await SeedInvoiceAsync(factory, seed, SalesInvoiceStatus.Posted);
        using var client = factory.Client(seed);

        var document = await SalesOrderApiFactory.ReadJsonAsync(await client.GetAsync($"/api/sales/invoices/{id}/document"));

        var invoice = document.GetProperty("invoice");
        Assert.Equal(("Posted", "Retail", "TR-STD", "EARSIV", "Fatura notu"), (invoice.GetProperty("status").GetString(), invoice.GetProperty("invoiceType").GetString(),
            invoice.GetProperty("accountingProfileCode").GetString(), invoice.GetProperty("eDocumentScenario").GetString(), invoice.GetProperty("notes").GetString()));
        Assert.Equal(1, invoice.GetProperty("lines")[0].GetProperty("lineNumber").GetInt32());
        Assert.Equal(48m, document.GetProperty("amounts").GetProperty("grandTotal").GetDecimal());
        var vat = document.GetProperty("amounts").GetProperty("vat")[0];
        Assert.Equal((20m, 40m, 8m), (vat.GetProperty("rate").GetDecimal(), vat.GetProperty("taxableAmount").GetDecimal(), vat.GetProperty("amount").GetDecimal()));
    }

    [Theory]
    [InlineData(SalesInvoiceStatus.Posted, new[] { "iptal" })]
    [InlineData(SalesInvoiceStatus.Voided, new string[0])]
    public async Task Allowed_transitions_follow_state(SalesInvoiceStatus status, string[] expected)
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync();
        var id = await SeedInvoiceAsync(factory, seed, status);
        using var client = factory.Client(seed);

        var document = await SalesOrderApiFactory.ReadJsonAsync(await client.GetAsync($"/api/sales/invoices/{id}/document"));

        Assert.Equal(expected, document.GetProperty("allowedTransitions").EnumerateArray().Select(x => x.GetString()).ToArray());
        Assert.Equal(status.ToString(), document.GetProperty("invoice").GetProperty("status").GetString());
    }

    [Fact]
    public async Task Allowed_transitions_are_empty_without_invoice_execute_permission()
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync();
        var id = await SeedInvoiceAsync(factory, seed, SalesInvoiceStatus.Posted);
        await AllowOnlyAsync(factory, seed, ("erp.sales-invoices.read", TenantPermissionEffect.Allow), ("erp.sales-invoices.execute", TenantPermissionEffect.Deny));
        using var client = factory.Client(seed, "TenantUser");

        using var response = await client.GetAsync($"/api/sales/invoices/{id}/document");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Empty((await SalesOrderApiFactory.ReadJsonAsync(response)).GetProperty("allowedTransitions").EnumerateArray());
    }

    [Fact]
    public async Task Invoices_without_an_activity_log_are_flagged_and_logged_ones_are_not()
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync();
        var legacy = await SeedInvoiceAsync(factory, seed, SalesInvoiceStatus.Posted, code: "FTR-OLD");
        var logged = await SeedInvoiceAsync(factory, seed, SalesInvoiceStatus.Posted, code: "FTR-NEW", withLog: true);
        using var client = factory.Client(seed);

        var legacyDocument = await SalesOrderApiFactory.ReadJsonAsync(await client.GetAsync($"/api/sales/invoices/{legacy}/document"));
        var loggedDocument = await SalesOrderApiFactory.ReadJsonAsync(await client.GetAsync($"/api/sales/invoices/{logged}/document"));

        Assert.True(legacyDocument.GetProperty("activityStartedLate").GetBoolean());
        Assert.False(loggedDocument.GetProperty("activityStartedLate").GetBoolean());
        Assert.Equal(["Fatura kesildi"], loggedDocument.GetProperty("activity").EnumerateArray().Select(x => x.GetProperty("step").GetString()).ToArray());
    }

    [Fact]
    public async Task Fill_stock_returns_price_unit_and_available()
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync();
        using var client = factory.Client(seed);

        using var response = await client.PostAsJsonAsync("/api/document-models/satis.fatura/fill", new { field = "stockItemId", value = seed.StockItemId.ToString("D") });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var values = (await SalesOrderApiFactory.ReadJsonAsync(response)).GetProperty("values");
        Assert.Equal(("KG", 12.5m, 100m), (values.GetProperty("unitCode").GetString(), values.GetProperty("unitPrice").GetDecimal(), values.GetProperty("availableQuantity").GetDecimal()));
    }

    [Fact]
    public async Task Document_of_other_tenant_invoice_is_not_found()
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync("own");
        var other = await factory.SeedAsync("other");
        var id = await SeedInvoiceAsync(factory, other, SalesInvoiceStatus.Posted);
        using var client = factory.Client(seed);

        using var response = await client.GetAsync($"/api/sales/invoices/{id}/document");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Theory]
    [InlineData("Draft", new string[0], "")]
    [InlineData("Posted", new[] { "iptal" }, "FTR-ORNEK-0001")]
    [InlineData("Voided", new string[0], "FTR-ORNEK-0001")]
    public async Task Sample_document_has_requested_state_without_touching_the_database(string state, string[] transitions, string code)
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync();
        using var client = factory.Client(seed);

        using var response = await client.GetAsync($"/api/document-models/satis.fatura/sample?state={state}");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var document = await SalesOrderApiFactory.ReadJsonAsync(response);
        Assert.Equal((state, code), (document.GetProperty("invoice").GetProperty("status").GetString(), document.GetProperty("invoice").GetProperty("code").GetString()));
        Assert.Equal(transitions, document.GetProperty("allowedTransitions").EnumerateArray().Select(x => x.GetString()).ToArray());
        Assert.Equal(2, document.GetProperty("amounts").GetProperty("vat").GetArrayLength());
        await factory.WithTenantDbAsync(async db => Assert.Equal(0, await db.SalesInvoices.CountAsync()));
    }

    [Fact]
    public async Task Sample_without_state_is_a_draft_and_unknown_or_numeric_state_is_bad_request()
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync();
        using var client = factory.Client(seed);

        var draft = await SalesOrderApiFactory.ReadJsonAsync(await client.GetAsync("/api/document-models/satis.fatura/sample"));
        using var unknown = await client.GetAsync("/api/document-models/satis.fatura/sample?state=Kayip");
        using var numeric = await client.GetAsync("/api/document-models/satis.fatura/sample?state=1");

        Assert.Equal("Draft", draft.GetProperty("invoice").GetProperty("status").GetString());
        Assert.Equal((HttpStatusCode.BadRequest, HttpStatusCode.BadRequest), (unknown.StatusCode, numeric.StatusCode));
    }

    [Fact]
    public async Task Model_routes_resolve_as_the_invoice_document_permission()
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync();
        await AllowOnlyAsync(factory, seed, ("erp.sales-invoices.read", TenantPermissionEffect.Allow));
        using var client = factory.Client(seed, "TenantUser");

        using var invoiceModel = await client.GetAsync("/api/document-models/satis.fatura");
        using var invoiceSample = await client.GetAsync("/api/document-models/satis.fatura/sample");
        using var orderModel = await client.GetAsync("/api/document-models/satis.siparis");

        Assert.Equal((HttpStatusCode.OK, HttpStatusCode.OK, HttpStatusCode.Forbidden), (invoiceModel.StatusCode, invoiceSample.StatusCode, orderModel.StatusCode));
    }
}
