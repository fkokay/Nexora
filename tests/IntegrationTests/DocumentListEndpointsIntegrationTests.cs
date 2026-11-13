using System.Net;
using System.Text.Json;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace AIERP.Api.IntegrationTests;

public sealed class DocumentListEndpointsIntegrationTests
{
    private static readonly Guid TenantId = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid OtherTenantId = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid SalesReturnId = Guid.Parse("a0000000-0000-0000-0000-000000000001");
    private static readonly Guid OtherTenantSalesReturnId = Guid.Parse("a0000000-0000-0000-0000-000000000002");
    private static readonly Guid SupplierReturnId = Guid.Parse("b0000000-0000-0000-0000-000000000001");
    private static readonly Guid OrderedQuoteId = Guid.Parse("c0000000-0000-0000-0000-000000000001");
    private static readonly Guid ReceiptId = Guid.Parse("d0000000-0000-0000-0000-000000000001");

    [Fact]
    public async Task Sales_returns_are_listed_per_tenant_with_search_paging_and_detail()
    {
        await using var app = await StartAsync();
        using var client = Client(app);

        using var all = await GetJsonAsync(client, "/api/sales/returns/?page=1&pageSize=1");
        Assert.Equal(2, all.RootElement.GetProperty("totalCount").GetInt32());
        var first = Assert.Single(all.RootElement.GetProperty("items").EnumerateArray());
        Assert.Equal("SR-NEW", first.GetProperty("code").GetString());
        Assert.Equal("Customer", first.GetProperty("customerName").GetString());
        Assert.Equal("INV-1", first.GetProperty("invoiceCode").GetString());
        Assert.Equal("EUR", first.GetProperty("currencyCode").GetString());
        Assert.Equal(120m, first.GetProperty("grandTotal").GetDecimal());
        Assert.Equal(1, first.GetProperty("lineCount").GetInt32());

        using var searched = await GetJsonAsync(client, "/api/sales/returns/?q=SR-OLD");
        Assert.Equal("SR-OLD", Assert.Single(searched.RootElement.GetProperty("items").EnumerateArray()).GetProperty("code").GetString());
        using var clamped = await GetJsonAsync(client, "/api/sales/returns/?page=0&pageSize=5000");
        Assert.Equal(1, clamped.RootElement.GetProperty("page").GetInt32());
        Assert.Equal(100, clamped.RootElement.GetProperty("pageSize").GetInt32());

        using var detail = await GetJsonAsync(client, $"/api/sales/returns/{SalesReturnId:D}");
        Assert.Equal("Posted", detail.RootElement.GetProperty("status").GetString());
        Assert.Equal("Main", detail.RootElement.GetProperty("warehouseName").GetString());
        var line = Assert.Single(detail.RootElement.GetProperty("lines").EnumerateArray());
        Assert.Equal("STK-1", line.GetProperty("stockCode").GetString());
        Assert.Equal(2m, line.GetProperty("quantity").GetDecimal());

        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/sales/returns/{OtherTenantSalesReturnId:D}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/sales/returns/{Guid.NewGuid():D}")).StatusCode);
        using var anonymous = app.GetTestClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/api/sales/returns/")).StatusCode);
    }

    [Fact]
    public async Task Supplier_returns_are_listed_with_supplier_and_order_links()
    {
        await using var app = await StartAsync();
        using var client = Client(app);

        using var list = await GetJsonAsync(client, "/api/purchasing/returns/?q=Supplier");
        var item = Assert.Single(list.RootElement.GetProperty("items").EnumerateArray());
        Assert.Equal("PR-1", item.GetProperty("code").GetString());
        Assert.Equal("PINV-1", item.GetProperty("invoiceCode").GetString());
        Assert.Equal("Supplier", item.GetProperty("supplierName").GetString());

        using var detail = await GetJsonAsync(client, $"/api/purchasing/returns/{SupplierReturnId:D}");
        Assert.Equal(60m, detail.RootElement.GetProperty("grandTotal").GetDecimal());
        Assert.NotEqual(Guid.Empty, detail.RootElement.GetProperty("purchaseOrderId").GetGuid());
        Assert.Single(detail.RootElement.GetProperty("lines").EnumerateArray());
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/purchasing/returns/{Guid.NewGuid():D}")).StatusCode);
    }

    [Fact]
    public async Task Supplier_quotes_are_listed_across_requests_and_detail_converts_to_base_currency()
    {
        await using var app = await StartAsync();
        using var client = Client(app);

        using var list = await GetJsonAsync(client, "/api/purchasing/supplier-quotes/");
        Assert.Equal(2, list.RootElement.GetProperty("totalCount").GetInt32());
        var ordered = list.RootElement.GetProperty("items").EnumerateArray().Single(x => x.GetProperty("code").GetString() == "SQ-EUR");
        Assert.Equal("REQ-1", ordered.GetProperty("requestCode").GetString());
        Assert.Equal("PO-1", ordered.GetProperty("purchaseOrderCode").GetString());
        var open = list.RootElement.GetProperty("items").EnumerateArray().Single(x => x.GetProperty("code").GetString() == "SQ-TRY");
        Assert.Equal(JsonValueKind.Null, open.GetProperty("purchaseOrderId").ValueKind);

        using var detail = await GetJsonAsync(client, $"/api/purchasing/supplier-quotes/{OrderedQuoteId:D}");
        Assert.Equal("TRY", detail.RootElement.GetProperty("baseCurrencyCode").GetString());
        // 100 EUR, teklif tarihindeki en güncel kur (revizyon 2) 40 → 4000 TRY; sonraki tarihli kur dikkate alınmaz.
        Assert.Equal(40m, detail.RootElement.GetProperty("appliedExchangeRate").GetDecimal());
        Assert.Equal(4000m, detail.RootElement.GetProperty("comparableGrandTotal").GetDecimal());
        Assert.Single(detail.RootElement.GetProperty("lines").EnumerateArray());
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/purchasing/supplier-quotes/{Guid.NewGuid():D}")).StatusCode);
    }

    [Fact]
    public async Task Purchase_receipt_detail_returns_lines_supplier_and_active_invoice()
    {
        await using var app = await StartAsync();
        using var client = Client(app);

        using var detail = await GetJsonAsync(client, $"/api/purchasing/receipts/{ReceiptId:D}");
        Assert.Equal("GR-1", detail.RootElement.GetProperty("code").GetString());
        Assert.Equal("PO-1", detail.RootElement.GetProperty("purchaseOrderCode").GetString());
        Assert.Equal("Supplier", detail.RootElement.GetProperty("supplierName").GetString());
        Assert.Equal(5m, Assert.Single(detail.RootElement.GetProperty("lines").EnumerateArray()).GetProperty("quantity").GetDecimal());
        var invoice = detail.RootElement.GetProperty("invoice");
        Assert.Equal("PINV-1", invoice.GetProperty("code").GetString());
        // 300 tutarlı faturadan 60'lık iade düşülür.
        Assert.Equal(240m, invoice.GetProperty("outstandingAmount").GetDecimal());
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/purchasing/receipts/{Guid.NewGuid():D}")).StatusCode);
    }

    private static HttpClient Client(WebApplication app)
    {
        var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantId.ToString());
        return client;
    }

    private static async Task<JsonDocument> GetJsonAsync(HttpClient client, string url)
    {
        var response = await client.GetAsync(url);
        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.IsSuccessStatusCode, $"{url} -> {(int)response.StatusCode}: {body}");
        return JsonDocument.Parse(body);
    }

    private static async Task<WebApplication> StartAsync()
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        var databaseName = $"document-lists-{Guid.NewGuid():N}";
        builder.Services.AddDbContext<TenantDbContext>(options => options.UseInMemoryDatabase(databaseName));
        builder.Services.ConfigureHttpJsonOptions(options => options.SerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter()));
        builder.Services.AddAuthentication("report-test")
            .AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("report-test", _ => { });
        builder.Services.AddAuthorization();

        var app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapDocumentListEndpoints();
        await app.StartAsync();

        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        await db.Database.EnsureCreatedAsync();
        var tenant = new Tenant { Id = TenantId, Name = "Tenant", Slug = "tenant", BaseCurrencyCode = "TRY" };
        var otherTenant = new Tenant { Id = OtherTenantId, Name = "Other", Slug = "other" };
        var customer = new CustomerAccount { TenantId = TenantId, Tenant = tenant, Code = "C-1", Name = "Customer", Type = CounterpartyType.Customer };
        var supplier = new CustomerAccount { TenantId = TenantId, Tenant = tenant, Code = "S-1", Name = "Supplier", Type = CounterpartyType.Supplier };
        var otherCustomer = new CustomerAccount { TenantId = OtherTenantId, Tenant = otherTenant, Code = "C-X", Name = "Customer", Type = CounterpartyType.Customer };
        var warehouse = new Warehouse { TenantId = TenantId, Tenant = tenant, Code = "MAIN", Name = "Main" };
        var otherWarehouse = new Warehouse { TenantId = OtherTenantId, Tenant = otherTenant, Code = "X", Name = "Other" };

        var salesInvoice = new SalesInvoice { TenantId = TenantId, Tenant = tenant, CustomerId = customer.Id, Customer = customer, Code = "INV-1", InvoiceDate = new DateOnly(2026, 11, 1), CurrencyCode = "EUR", GrandTotal = 500m };
        var otherInvoice = new SalesInvoice { TenantId = OtherTenantId, Tenant = otherTenant, CustomerId = otherCustomer.Id, Customer = otherCustomer, Code = "INV-X", InvoiceDate = new DateOnly(2026, 11, 1) };
        db.SalesReturns.AddRange(
            new SalesReturn
            {
                Id = SalesReturnId, TenantId = TenantId, Tenant = tenant, SalesInvoice = salesInvoice, Customer = customer, Warehouse = warehouse,
                Code = "SR-NEW", ReturnDate = new DateOnly(2026, 11, 10), Subtotal = 100m, TaxTotal = 20m, GrandTotal = 120m,
                Lines = { new SalesReturnLine { TenantId = TenantId, OrderLineNumber = 1, StockCode = "STK-1", StockName = "Stock", UnitCode = "EA", Quantity = 2m, UnitPrice = 50m, VatPercent = 20m, LineSubtotal = 100m, TaxAmount = 20m, LineTotal = 120m } }
            },
            new SalesReturn { TenantId = TenantId, Tenant = tenant, SalesInvoice = salesInvoice, Customer = customer, Warehouse = warehouse, Code = "SR-OLD", ReturnDate = new DateOnly(2026, 11, 2), Status = SalesReturnStatus.Voided, GrandTotal = 10m },
            new SalesReturn { Id = OtherTenantSalesReturnId, TenantId = OtherTenantId, Tenant = otherTenant, SalesInvoice = otherInvoice, Customer = otherCustomer, Warehouse = otherWarehouse, Code = "SR-NEW", ReturnDate = new DateOnly(2026, 11, 12), GrandTotal = 999m });

        var request = new PurchaseRequest { TenantId = TenantId, Tenant = tenant, Code = "REQ-1", RequestDate = new DateOnly(2026, 10, 20), Description = "Need", Status = PurchaseRequestStatus.Ordered };
        var orderedQuote = new PurchaseSupplierQuote
        {
            Id = OrderedQuoteId, TenantId = TenantId, PurchaseRequest = request, Supplier = supplier, Code = "SQ-EUR", QuoteDate = new DateOnly(2026, 10, 25),
            CurrencyCode = "EUR", Status = PurchaseSupplierQuoteStatus.Selected, Subtotal = 100m, GrandTotal = 100m,
            Lines = { new PurchaseSupplierQuoteLine { TenantId = TenantId, RequestLineNumber = 1, StockCode = "STK-1", StockName = "Stock", Quantity = 5m, UnitPrice = 20m, LineSubtotal = 100m, LineTotal = 100m } }
        };
        db.PurchaseSupplierQuotes.AddRange(orderedQuote,
            new PurchaseSupplierQuote { TenantId = TenantId, PurchaseRequest = request, Supplier = supplier, Code = "SQ-TRY", QuoteDate = new DateOnly(2026, 10, 24), CurrencyCode = "TRY", Status = PurchaseSupplierQuoteStatus.NotSelected, GrandTotal = 4500m });
        db.TenantExchangeRates.AddRange(
            new TenantExchangeRate { TenantId = TenantId, CurrencyCode = "EUR", RateDate = new DateOnly(2026, 10, 20), Revision = 1, Rate = 38m },
            new TenantExchangeRate { TenantId = TenantId, CurrencyCode = "EUR", RateDate = new DateOnly(2026, 10, 25), Revision = 1, Rate = 39m },
            new TenantExchangeRate { TenantId = TenantId, CurrencyCode = "EUR", RateDate = new DateOnly(2026, 10, 25), Revision = 2, Rate = 40m },
            new TenantExchangeRate { TenantId = TenantId, CurrencyCode = "EUR", RateDate = new DateOnly(2026, 10, 26), Revision = 1, Rate = 99m });

        var order = new PurchaseOrder { TenantId = TenantId, Tenant = tenant, Supplier = supplier, SourcePurchaseRequestId = request.Id, SourceSupplierQuote = orderedQuote, Code = "PO-1", OrderDate = new DateOnly(2026, 10, 26), CurrencyCode = "EUR" };
        var receipt = new PurchaseReceipt
        {
            Id = ReceiptId, TenantId = TenantId, Tenant = tenant, PurchaseOrder = order, Warehouse = warehouse, Code = "GR-1", ReceiptDate = new DateOnly(2026, 11, 3),
            Lines = { new PurchaseReceiptLine { TenantId = TenantId, PurchaseOrderId = order.Id, OrderLineNumber = 1, StockCode = "STK-1", StockName = "Stock", Quantity = 5m } }
        };
        var purchaseInvoice = new PurchaseInvoice { TenantId = TenantId, Tenant = tenant, PurchaseReceipt = receipt, PurchaseOrderId = order.Id, Supplier = supplier, Code = "PINV-1", InvoiceDate = new DateOnly(2026, 11, 4), DueDate = new DateOnly(2026, 12, 4), CurrencyCode = "EUR", GrandTotal = 300m };
        db.SupplierReturns.Add(new SupplierReturn
        {
            Id = SupplierReturnId, TenantId = TenantId, Tenant = tenant, PurchaseInvoice = purchaseInvoice, Supplier = supplier, Warehouse = warehouse,
            Code = "PR-1", ReturnDate = new DateOnly(2026, 11, 8), Subtotal = 60m, GrandTotal = 60m,
            Lines = { new SupplierReturnLine { TenantId = TenantId, OrderLineNumber = 1, StockCode = "STK-1", StockName = "Stock", Quantity = 1m, UnitPrice = 60m, LineSubtotal = 60m, LineTotal = 60m } }
        });
        await db.SaveChangesAsync();
        return app;
    }
}
