using System.Net;
using System.Text.Json;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>
/// Order-detail reads of the delivery / receipt prices (irsaliye fiyatı ve bedelsiz satır): <c>GET /api/purchasing/orders/{id}</c>
/// <c>receipts[]</c> (satinalma.siparis.malKabulleri, the legacy receipt document) and the sales order's deliveries
/// (satis.siparis.irsaliyeleri) must show the same stored prices, amounts, pricing state and cost-pending flags as the
/// receipt / delivery list and detail routes.
/// </summary>
public sealed class DeliveryLinePricingOrderDetailIntegrationTests
{
    private static readonly Guid TenantA = ErpOperationCatalogTests.TenantA;
    private static readonly Guid Admin = ErpOperationCatalogTests.Admin;

    private static readonly string[] LineFields =
        ["orderLineNumber", "quantity", "unitPrice", "discountPercent", "vatPercent", "isFreeOfCharge", "lineNetAmount", "lineVatAmount", "lineTotal", "orderUnitPrice"];
    private static readonly string[] HeaderFields =
        ["currencyCode", "pricedNetTotal", "pricedVatTotal", "pricedGrandTotal", "freeLineCount", "unpricedLineCount", "pricingState"];

    [Fact]
    public async Task Purchase_order_detail_receipts_carry_the_same_prices_as_the_receipt_routes()
    {
        await using var factory = new ErpOperationCatalogTests.ErpOperationApiFactory();
        await ErpOperationCatalogTests.SeedAsync(factory, _ => { });
        var seed = await SeedPurchaseAsync(factory);
        using var client = factory.CreateClient();
        ErpOperationCatalogTests.SetIdentity(client, Admin, "TenantAdmin");

        var order = await GetAsync(client, $"/api/purchasing/orders/{seed.OrderId:D}");
        var receipts = order.GetProperty("receipts").EnumerateArray().ToDictionary(x => x.GetProperty("code").GetString()!);
        var list = (await GetAsync(client, "/api/purchasing/receipts/")).GetProperty("items").EnumerateArray()
            .ToDictionary(x => x.GetProperty("code").GetString()!);

        // GR-P: one overridden-price line (90 instead of the order's 100) and one free line, not invoiced.
        var open = receipts["GR-P"];
        Assert.Equal("PartlyFree", open.GetProperty("pricingState").GetString());
        Assert.Equal("TRY", open.GetProperty("currencyCode").GetString());
        Assert.Equal(162m, open.GetProperty("pricedNetTotal").GetDecimal());
        Assert.Equal(194.4m, open.GetProperty("pricedGrandTotal").GetDecimal());
        Assert.Equal(1, open.GetProperty("freeLineCount").GetInt32());
        var openLines = open.GetProperty("lines").EnumerateArray().ToArray();
        Assert.Equal((90m, 10m, 20m, false, 162m, 100m), (openLines[0].GetProperty("unitPrice").GetDecimal(), openLines[0].GetProperty("discountPercent").GetDecimal(),
            openLines[0].GetProperty("vatPercent").GetDecimal(), openLines[0].GetProperty("isFreeOfCharge").GetBoolean(),
            openLines[0].GetProperty("lineNetAmount").GetDecimal(), openLines[0].GetProperty("orderUnitPrice").GetDecimal()));
        Assert.False(openLines[0].GetProperty("costPending").GetBoolean());
        Assert.True(openLines[1].GetProperty("isFreeOfCharge").GetBoolean());
        Assert.Equal(JsonValueKind.Null, openLines[1].GetProperty("unitPrice").ValueKind);
        Assert.True(openLines[1].GetProperty("costPending").GetBoolean());
        Assert.Equal(seed.LocationId, openLines[1].GetProperty("storageLocationId").GetGuid());

        // GR-F: free line whose receipt is invoiced, so its provisional cost is no longer pending.
        var invoiced = receipts["GR-F"];
        Assert.Equal("Free", invoiced.GetProperty("pricingState").GetString());
        Assert.False(Assert.Single(invoiced.GetProperty("lines").EnumerateArray().ToArray()).GetProperty("costPending").GetBoolean());

        foreach (var (code, receiptId) in new[] { ("GR-P", seed.OpenReceiptId), ("GR-F", seed.InvoicedReceiptId) })
        {
            var detail = await GetAsync(client, $"/api/purchasing/receipts/{receiptId:D}");
            AssertSame(HeaderFields, detail, receipts[code]);
            AssertSame(HeaderFields, list[code], receipts[code]);
            var detailLines = detail.GetProperty("lines").EnumerateArray().ToArray();
            var orderLines = receipts[code].GetProperty("lines").EnumerateArray().ToArray();
            Assert.Equal(detailLines.Length, orderLines.Length);
            for (var i = 0; i < detailLines.Length; i++) AssertSame([.. LineFields, "costPending"], detailLines[i], orderLines[i]);
        }
    }

    [Fact]
    public async Task Sales_order_deliveries_carry_the_same_prices_as_the_delivery_detail()
    {
        await using var factory = new ErpOperationCatalogTests.ErpOperationApiFactory();
        await ErpOperationCatalogTests.SeedAsync(factory, _ => { });
        var (orderId, deliveryId) = await SeedSalesAsync(factory);
        using var client = factory.CreateClient();
        ErpOperationCatalogTests.SetIdentity(client, Admin, "TenantAdmin");

        // satis.siparis.irsaliyeleri reads the order-filtered delivery list.
        var row = Assert.Single((await GetAsync(client, $"/api/sales/deliveries?orderId={orderId:D}")).GetProperty("items").EnumerateArray().ToArray());
        Assert.Equal("PartlyFree", row.GetProperty("pricingState").GetString());
        Assert.Equal(54m, row.GetProperty("pricedNetTotal").GetDecimal());
        var detail = await GetAsync(client, $"/api/sales/deliveries/{deliveryId:D}");
        AssertSame(HeaderFields, detail, row);
        var lines = detail.GetProperty("lines").EnumerateArray().ToArray();
        Assert.Equal((60m, false, 54m, 50m), (lines[0].GetProperty("unitPrice").GetDecimal(), lines[0].GetProperty("isFreeOfCharge").GetBoolean(),
            lines[0].GetProperty("lineNetAmount").GetDecimal(), lines[0].GetProperty("orderUnitPrice").GetDecimal()));
        Assert.True(lines[1].GetProperty("isFreeOfCharge").GetBoolean());
        Assert.Equal(JsonValueKind.Null, lines[1].GetProperty("lineNetAmount").ValueKind);
    }

    private static void AssertSame(IEnumerable<string> fields, JsonElement expected, JsonElement actual)
    {
        foreach (var field in fields)
            Assert.True(expected.GetProperty(field).GetRawText() == actual.GetProperty(field).GetRawText(),
                $"{field}: expected {expected.GetProperty(field).GetRawText()}, actual {actual.GetProperty(field).GetRawText()}");
    }

    private sealed record PurchaseSeed(Guid OrderId, Guid OpenReceiptId, Guid InvoicedReceiptId, Guid LocationId);

    private static async Task<PurchaseSeed> SeedPurchaseAsync(ErpOperationCatalogTests.ErpOperationApiFactory factory)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        var tenant = new Tenant { Id = TenantA, Name = "A", Slug = "tenant-a", BaseCurrencyCode = "TRY" };
        var supplier = new CustomerAccount { TenantId = TenantA, Tenant = tenant, Code = "S-1", Name = "Tedarikçi", Type = CounterpartyType.Supplier };
        var warehouse = new Warehouse { TenantId = TenantA, Tenant = tenant, Code = "MAIN", Name = "Ana depo" };
        var itemId = Guid.NewGuid(); var locationId = Guid.NewGuid();
        var order = new PurchaseOrder
        {
            TenantId = TenantA, Supplier = supplier, Code = "PO-1", OrderDate = new DateOnly(2026, 11, 1), CurrencyCode = "TRY",
            Status = PurchaseOrderStatus.PartiallyReceived, GrandTotal = 1620m,
            Lines =
            {
                new PurchaseOrderLine { TenantId = TenantA, LineNumber = 1, StockItemId = itemId, StockCode = "STK-1", StockName = "Koli", UnitCode = "EA",
                    Quantity = 10m, UnitPrice = 100m, DiscountPercent = 10m, VatPercent = 20m, LineSubtotal = 1000m, DiscountAmount = 100m, TaxAmount = 180m, LineTotal = 1080m },
                new PurchaseOrderLine { TenantId = TenantA, LineNumber = 2, StockItemId = itemId, StockCode = "STK-1", StockName = "Koli", UnitCode = "EA",
                    Quantity = 5m, UnitPrice = 100m, DiscountPercent = 10m, VatPercent = 20m, LineSubtotal = 500m, DiscountAmount = 50m, TaxAmount = 90m, LineTotal = 540m }
            }
        };
        PurchaseReceiptLine Line(int number, decimal quantity, decimal? price, bool free) => new()
        {
            TenantId = TenantA, PurchaseOrderId = order.Id, OrderLineNumber = number, StockItemId = itemId, StockCode = "STK-1", StockName = "Koli",
            UnitCode = "EA", Quantity = quantity, EnteredQuantity = quantity, EnteredUnitCode = "EA",
            UnitPrice = price, DiscountPercent = price is null ? null : 10m, VatPercent = price is null ? null : 20m, IsFreeOfCharge = free
        };
        var pricedLine = Line(1, 2m, 90m, false); var freeLine = Line(2, 3m, null, true); var invoicedFreeLine = Line(2, 1m, null, true);
        var open = new PurchaseReceipt { TenantId = TenantA, PurchaseOrder = order, Warehouse = warehouse, Code = "GR-P", ReceiptDate = new DateOnly(2026, 11, 5),
            CurrencyCode = "TRY", Lines = { pricedLine, freeLine } };
        var invoicedReceipt = new PurchaseReceipt { TenantId = TenantA, PurchaseOrder = order, Warehouse = warehouse, Code = "GR-F", ReceiptDate = new DateOnly(2026, 11, 4),
            CurrencyCode = "TRY", Lines = { invoicedFreeLine } };
        var invoice = new PurchaseInvoice { TenantId = TenantA, PurchaseReceipt = invoicedReceipt, PurchaseOrder = order, Supplier = supplier, Code = "PINV-1",
            InvoiceDate = new DateOnly(2026, 11, 6), DueDate = new DateOnly(2026, 12, 6), CurrencyCode = "TRY", Subtotal = 0m, GrandTotal = 0m };
        InventoryTransaction Movement(PurchaseReceiptLine line, bool pending, Guid? location = null) => new()
        {
            TenantId = TenantA, WarehouseId = warehouse.Id, StockItemId = itemId, EntryDate = new DateOnly(2026, 11, 5), Direction = InventoryDirection.Receipt,
            Quantity = line.Quantity, UnitCostBase = 12m, CostPending = pending, PurchaseReceiptLine = line, StorageLocationId = location, Description = "test"
        };
        db.AddRange(tenant, supplier, warehouse, order, open, invoicedReceipt, invoice,
            Movement(pricedLine, false), Movement(freeLine, true, locationId), Movement(invoicedFreeLine, true));
        await db.SaveChangesAsync();
        return new PurchaseSeed(order.Id, open.Id, invoicedReceipt.Id, locationId);
    }

    private static async Task<(Guid OrderId, Guid DeliveryId)> SeedSalesAsync(ErpOperationCatalogTests.ErpOperationApiFactory factory)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        var tenant = new Tenant { Id = TenantA, Name = "A", Slug = "tenant-a", BaseCurrencyCode = "TRY" };
        var customer = new CustomerAccount { TenantId = TenantA, Tenant = tenant, Code = "C-1", Name = "Müşteri", Type = CounterpartyType.Customer };
        var warehouse = new Warehouse { TenantId = TenantA, Tenant = tenant, Code = "MAIN", Name = "Ana depo" };
        var itemId = Guid.NewGuid();
        SalesOrderLine OrderLine(int number) => new()
        {
            TenantId = TenantA, LineNumber = number, StockItemId = itemId, StockCode = "STK-1", StockName = "Koli", UnitCode = "EA",
            Quantity = 5m, UnitPrice = 50m, EnteredUnitPrice = 50m, DiscountPercent = 10m, VatPercent = 20m, LineSubtotal = 250m
        };
        var order = new SalesOrder { TenantId = TenantA, Tenant = tenant, Customer = customer, Code = "SO-1", OrderDate = new DateOnly(2026, 11, 1), CurrencyCode = "TRY",
            Lines = { OrderLine(1), OrderLine(2) } };
        var orderLines = order.Lines.ToArray();
        SalesDeliveryLine Line(SalesOrderLine orderLine, decimal quantity, decimal? price, bool free) => new()
        {
            TenantId = TenantA, OrderId = order.Id, OrderLineNumber = orderLine.LineNumber, OrderLine = orderLine, StockItemId = itemId, StockCode = "STK-1",
            StockName = "Koli", UnitCode = "EA", Quantity = quantity, EnteredQuantity = quantity, EnteredUnitCode = "EA",
            UnitPrice = price, DiscountPercent = price is null ? null : 10m, VatPercent = price is null ? null : 20m, IsFreeOfCharge = free
        };
        var delivery = new SalesDelivery { TenantId = TenantA, Tenant = tenant, Order = order, Warehouse = warehouse, Code = "DLV-1", DeliveryDate = new DateOnly(2026, 11, 5),
            CurrencyCode = "TRY", RequestId = Guid.NewGuid(), Lines = { Line(orderLines[0], 1m, 60m, false), Line(orderLines[1], 2m, null, true) } };
        db.AddRange(tenant, customer, warehouse, order, delivery);
        await db.SaveChangesAsync();
        return (order.Id, delivery.Id);
    }

    private static async Task<JsonElement> GetAsync(HttpClient client, string url)
    {
        using var response = await client.GetAsync(url);
        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == HttpStatusCode.OK, $"{url} -> {response.StatusCode}: {body}");
        return JsonDocument.Parse(body).RootElement.Clone();
    }
}
