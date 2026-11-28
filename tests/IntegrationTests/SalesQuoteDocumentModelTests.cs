using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using AIERP.Platform.Domain;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>The satis.teklif document model (belge modeli, ikinci model): model, document view, transitions, sample, fill and permission route.</summary>
public sealed class SalesQuoteDocumentModelTests
{
    private static Task<Guid> SeedQuoteAsync(SalesOrderApiFactory factory, SalesOrderSeed seed, SalesQuoteStatus status, string code = "TKL-SEED",
        bool withOrder = false, Guid? customerId = null, string? prospect = null, string? notes = null, string? deliveryTerms = null, int? requestLine = null) =>
        factory.WithTenantDbAsync(async db =>
        {
            var item = await db.StockItems.SingleAsync(x => x.Id == seed.StockItemId);
            var quote = new SalesQuote
            {
                TenantId = seed.TenantId, CustomerId = prospect is null ? customerId ?? seed.CustomerId : null, ProspectCustomerName = prospect, Code = code,
                QuoteDate = new DateOnly(2026, 11, 2), ValidUntil = new DateOnly(2099, 12, 31), CurrencyCode = "TRY", Status = status,
                Notes = notes, DeliveryTerms = deliveryTerms, Subtotal = 40m, TaxTotal = 8m, GrandTotal = 48m
            };
            quote.RevisionGroupId = quote.Id;
            quote.Lines.Add(new SalesQuoteLine
            {
                TenantId = seed.TenantId, Quote = quote, LineNumber = 1, StockItemId = item.Id, StockCode = item.Code, StockName = item.Name,
                UnitCode = item.UnitCode, EnteredUnitCode = item.UnitCode, EnteredCurrencyCode = "TRY", EnteredUnitPrice = 10m, Quantity = 4m, UnitPrice = 10m,
                VatPercent = 20m, LineSubtotal = 40m, TaxAmount = 8m, LineTotal = 48m, SourceSalesRequestLineNumber = requestLine
            });
            db.SalesQuotes.Add(quote);
            if (withOrder)
                db.SalesOrders.Add(new SalesOrder { TenantId = seed.TenantId, QuoteId = quote.Id, CustomerId = seed.CustomerId, Code = "SO-FROM-QUOTE",
                    OrderDate = new DateOnly(2026, 11, 3), CurrencyCode = "TRY", Status = SalesOrderStatus.Draft });
            await db.SaveChangesAsync();
            return quote.Id;
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
    public async Task Model_lists_states_transitions_and_shared_line_columns()
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync();
        using var client = factory.Client(seed);

        var model = await SalesOrderApiFactory.ReadJsonAsync(await client.GetAsync("/api/document-models/satis.teklif"));

        Assert.Equal(["Draft", "Sent", "Accepted", "Rejected", "Expired"],
            model.GetProperty("states").EnumerateArray().Select(x => x.GetProperty("code").GetString()).ToArray());
        Assert.Equal("İletildi", model.GetProperty("states")[1].GetProperty("label").GetString());
        Assert.Equal(["ilet", "kabulEt", "reddet"],
            model.GetProperty("transitions").EnumerateArray().Select(x => x.GetProperty("code").GetString()).ToArray());
        Assert.Equal(["satis.teklif.ilet", "satis.teklif.kabulEt", "satis.teklif.reddet"],
            model.GetProperty("transitions").EnumerateArray().Select(x => x.GetProperty("operation").GetString()).ToArray());
        Assert.Equal("satis.teklif.hesapla", model.GetProperty("calculateOperation").GetString());
        Assert.Equal("satis.teklif.belge", model.GetProperty("loadOperation").GetString());
        Assert.Equal("satis.teklif.doldur", model.GetProperty("fillOperation").GetString());
        Assert.Equal("satis.teklif.olustur", model.GetProperty("createOperation").GetString());
        Assert.Equal("satis.teklif.guncelle", model.GetProperty("updateOperation").GetString());
        Assert.Equal(["code", "customerId", "quoteDate", "validUntil", "salespersonEmployeeId", "deliveryTerms", "notes"],
            model.GetProperty("fields").EnumerateArray().Select(x => x.GetProperty("code").GetString()).ToArray());
        // The line columns are the sales documents' shared ones, without the order's delivered quantity.
        var orderModel = await SalesOrderApiFactory.ReadJsonAsync(await client.GetAsync("/api/document-models/satis.siparis"));
        var quoteColumns = model.GetProperty("lineColumns").EnumerateArray().Select(x => x.GetProperty("code").GetString()).ToArray();
        Assert.Equal(orderModel.GetProperty("lineColumns").EnumerateArray().Select(x => x.GetProperty("code").GetString()).Where(x => x != "deliveredQuantity"), quoteColumns);
        Assert.Equal(orderModel.GetProperty("fills").GetRawText(), model.GetProperty("fills").GetRawText());
    }

    [Theory]
    [InlineData(SalesQuoteStatus.Draft, false, new string[0])]
    [InlineData(SalesQuoteStatus.Accepted, false, new[] { "siparisOlustur" })]
    [InlineData(SalesQuoteStatus.Accepted, true, new string[0])]
    public async Task Belgeden_belge_creation_is_offered_only_for_an_accepted_quote_without_an_order(SalesQuoteStatus status, bool withOrder, string[] expected)
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync();
        var quoteId = await SeedQuoteAsync(factory, seed, status, withOrder: withOrder);
        using var client = factory.Client(seed);

        var model = await SalesOrderApiFactory.ReadJsonAsync(await client.GetAsync("/api/document-models/satis.teklif"));
        var creation = model.GetProperty("creations")[0];
        Assert.Equal(("siparisOlustur", "satis.teklif.siparisOlustur", "satis.siparis"),
            (creation.GetProperty("code").GetString(), creation.GetProperty("operation").GetString(), creation.GetProperty("target").GetString()));
        var document = await SalesOrderApiFactory.ReadJsonAsync(await client.GetAsync($"/api/sales/quotes/{quoteId}/document"));
        Assert.Equal<IEnumerable<string?>>(expected, document.GetProperty("allowedCreations").EnumerateArray().Select(x => x.GetString()).ToArray());
    }

    [Fact]
    public async Task Document_returns_lines_amounts_vat_and_what_the_write_would_otherwise_erase()
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync();
        var quoteId = await SeedQuoteAsync(factory, seed, SalesQuoteStatus.Draft, notes: "Not metni", deliveryTerms: "Depoda teslim", requestLine: 3);
        var prospectId = await SeedQuoteAsync(factory, seed, SalesQuoteStatus.Draft, code: "TKL-P", prospect: "Kayıtsız Alıcı");
        using var client = factory.Client(seed);

        var document = await SalesOrderApiFactory.ReadJsonAsync(await client.GetAsync($"/api/sales/quotes/{quoteId}/document"));
        var prospect = await SalesOrderApiFactory.ReadJsonAsync(await client.GetAsync($"/api/sales/quotes/{prospectId}/document"));

        var quote = document.GetProperty("quote");
        Assert.Equal("Not metni", quote.GetProperty("notes").GetString());
        Assert.Equal("Depoda teslim", quote.GetProperty("deliveryTerms").GetString());
        Assert.Equal(3, quote.GetProperty("lines")[0].GetProperty("salesRequestLineNumber").GetInt32());
        Assert.Equal(10m, quote.GetProperty("lines")[0].GetProperty("enteredUnitPrice").GetDecimal());
        Assert.Equal(48m, document.GetProperty("amounts").GetProperty("grandTotal").GetDecimal());
        var vat = document.GetProperty("amounts").GetProperty("vat")[0];
        Assert.Equal((20m, 40m, 8m), (vat.GetProperty("rate").GetDecimal(), vat.GetProperty("taxableAmount").GetDecimal(), vat.GetProperty("amount").GetDecimal()));
        Assert.Equal("Kayıtsız Alıcı", prospect.GetProperty("quote").GetProperty("prospectCustomerName").GetString());
        Assert.Equal(JsonValueKind.Null, prospect.GetProperty("quote").GetProperty("customerId").ValueKind);
    }

    [Theory]
    [InlineData(SalesQuoteStatus.Draft, false, new[] { "ilet" })]
    [InlineData(SalesQuoteStatus.Sent, false, new[] { "kabulEt", "reddet" })]
    [InlineData(SalesQuoteStatus.Rejected, false, new[] { "kabulEt" })]
    [InlineData(SalesQuoteStatus.Accepted, false, new string[0])]
    [InlineData(SalesQuoteStatus.Accepted, true, new string[0])]
    public async Task Allowed_transitions_follow_state(SalesQuoteStatus status, bool withOrder, string[] expected)
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync();
        var quoteId = await SeedQuoteAsync(factory, seed, status, withOrder: withOrder);
        using var client = factory.Client(seed);

        var document = await SalesOrderApiFactory.ReadJsonAsync(await client.GetAsync($"/api/sales/quotes/{quoteId}/document"));

        Assert.Equal(expected, document.GetProperty("allowedTransitions").EnumerateArray().Select(x => x.GetString()).ToArray());
    }

    [Fact]
    public async Task Allowed_transitions_are_empty_without_quote_execute_permission()
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync();
        var quoteId = await SeedQuoteAsync(factory, seed, SalesQuoteStatus.Draft);
        await AllowOnlyAsync(factory, seed, ("erp.sales-quotes.read", TenantPermissionEffect.Allow), ("erp.sales-quotes.execute", TenantPermissionEffect.Deny));
        using var client = factory.Client(seed, "TenantUser");

        using var response = await client.GetAsync($"/api/sales/quotes/{quoteId}/document");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Empty((await SalesOrderApiFactory.ReadJsonAsync(response)).GetProperty("allowedTransitions").EnumerateArray());
    }

    [Fact]
    public async Task Transitions_write_the_activity_log_and_legacy_quotes_are_flagged()
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync();
        var legacy = await SeedQuoteAsync(factory, seed, SalesQuoteStatus.Sent, code: "TKL-OLD");
        var draft = await SeedQuoteAsync(factory, seed, SalesQuoteStatus.Draft, code: "TKL-NEW");
        using var client = factory.Client(seed);
        using (var send = await client.PostAsync($"/api/sales/quotes/{draft}/send", null)) Assert.Equal(HttpStatusCode.OK, send.StatusCode);
        using (var reject = await client.PostAsync($"/api/sales/quotes/{draft}/reject", null)) Assert.Equal(HttpStatusCode.OK, reject.StatusCode);

        var legacyDocument = await SalesOrderApiFactory.ReadJsonAsync(await client.GetAsync($"/api/sales/quotes/{legacy}/document"));
        var newDocument = await SalesOrderApiFactory.ReadJsonAsync(await client.GetAsync($"/api/sales/quotes/{draft}/document"));

        Assert.True(legacyDocument.GetProperty("activityStartedLate").GetBoolean());
        Assert.False(newDocument.GetProperty("activityStartedLate").GetBoolean());
        Assert.Equal(["Müşteriye iletildi", "Reddedildi"],
            newDocument.GetProperty("activity").EnumerateArray().Select(x => x.GetProperty("step").GetString()).ToArray());
        Assert.Equal("Rejected", newDocument.GetProperty("quote").GetProperty("status").GetString());
        Assert.Equal(["kabulEt"], newDocument.GetProperty("allowedTransitions").EnumerateArray().Select(x => x.GetString()).ToArray());
    }

    [Fact]
    public async Task Fill_stock_returns_price_vat_discount_currency_unit_and_available()
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync();
        using var client = factory.Client(seed);

        using var response = await client.PostAsJsonAsync("/api/document-models/satis.teklif/fill",
            new { field = "stockItemId", value = seed.StockItemId.ToString("D") });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var values = (await SalesOrderApiFactory.ReadJsonAsync(response)).GetProperty("values");
        Assert.Equal(("KG", 12.5m, 10m, 5m, "TRY", 100m), (values.GetProperty("unitCode").GetString(), values.GetProperty("unitPrice").GetDecimal(),
            values.GetProperty("vatPercent").GetDecimal(), values.GetProperty("discountPercent").GetDecimal(), values.GetProperty("currencyCode").GetString(),
            values.GetProperty("availableQuantity").GetDecimal()));
    }

    [Fact]
    public async Task Document_of_other_tenant_quote_is_not_found()
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync("own");
        var other = await factory.SeedAsync("other");
        var quoteId = await SeedQuoteAsync(factory, other, SalesQuoteStatus.Draft);
        using var client = factory.Client(seed);

        using var response = await client.GetAsync($"/api/sales/quotes/{quoteId}/document");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Theory]
    [InlineData("Draft", new[] { "ilet" })]
    [InlineData("Sent", new[] { "kabulEt", "reddet" })]
    [InlineData("Accepted", new string[0])]
    public async Task Sample_document_has_requested_state_without_touching_the_database(string state, string[] transitions)
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync();
        using var client = factory.Client(seed);

        using var response = await client.GetAsync($"/api/document-models/satis.teklif/sample?state={state}");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var document = await SalesOrderApiFactory.ReadJsonAsync(response);
        Assert.Equal(state, document.GetProperty("quote").GetProperty("status").GetString());
        Assert.True(document.GetProperty("quote").GetProperty("lines").GetArrayLength() >= 2);
        Assert.Equal(transitions, document.GetProperty("allowedTransitions").EnumerateArray().Select(x => x.GetString()).ToArray());
        var amounts = document.GetProperty("amounts");
        Assert.Equal(2, amounts.GetProperty("vat").GetArrayLength());
        Assert.Equal(amounts.GetProperty("grandTotal").GetDecimal(),
            amounts.GetProperty("subtotal").GetDecimal() - amounts.GetProperty("discountTotal").GetDecimal() + amounts.GetProperty("taxTotal").GetDecimal());
        await factory.WithTenantDbAsync(async db => Assert.Equal(0, await db.SalesQuotes.CountAsync()));
    }

    [Fact]
    public async Task Sample_without_state_is_a_draft_and_unknown_or_numeric_state_is_bad_request()
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync();
        using var client = factory.Client(seed);

        var draft = await SalesOrderApiFactory.ReadJsonAsync(await client.GetAsync("/api/document-models/satis.teklif/sample"));
        using var unknown = await client.GetAsync("/api/document-models/satis.teklif/sample?state=Kayip");
        using var numeric = await client.GetAsync("/api/document-models/satis.teklif/sample?state=1");

        Assert.Equal("Draft", draft.GetProperty("quote").GetProperty("status").GetString());
        Assert.Equal(HttpStatusCode.BadRequest, unknown.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, numeric.StatusCode);
    }

    [Fact]
    public async Task Model_routes_resolve_as_the_models_own_document_permission()
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync();
        await AllowOnlyAsync(factory, seed, ("erp.sales-quotes.read", TenantPermissionEffect.Allow));
        using var client = factory.Client(seed, "TenantUser");

        using var quoteModel = await client.GetAsync("/api/document-models/satis.teklif");
        using var quoteSample = await client.GetAsync("/api/document-models/satis.teklif/sample");
        using var orderModel = await client.GetAsync("/api/document-models/satis.siparis");
        using var orderSample = await client.GetAsync("/api/document-models/satis.siparis/sample");

        // A user with quote access but no order access reads the quote model only; orders keep their own permission.
        Assert.Equal((HttpStatusCode.OK, HttpStatusCode.OK, HttpStatusCode.Forbidden, HttpStatusCode.Forbidden),
            (quoteModel.StatusCode, quoteSample.StatusCode, orderModel.StatusCode, orderSample.StatusCode));
    }

    [Fact]
    public async Task Quote_model_needs_quote_read()
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync();
        using var client = factory.Client(seed, "TenantUser");

        using var response = await client.GetAsync("/api/document-models/satis.teklif/sample");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }
}
