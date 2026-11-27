using System.Net;
using AIERP.Platform.Domain;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>The satis.irsaliye document model (belge modeli, dördüncü model): model, standalone and order-based delivery documents, transitions, sample and permission route.</summary>
public sealed class SalesDeliveryDocumentModelTests
{
    private static Task<Guid> SeedStandaloneAsync(SalesOrderApiFactory factory, SalesOrderSeed seed, StandaloneInventoryDocumentStatus status, string code = "IRS-SEED") =>
        factory.WithTenantDbAsync(async db =>
        {
            var item = await db.StockItems.SingleAsync(x => x.Id == seed.StockItemId);
            var delivery = new StandaloneSalesDelivery
            {
                TenantId = seed.TenantId, RequestId = Guid.NewGuid(), CustomerId = seed.CustomerId, WarehouseId = seed.WarehouseId, Code = code,
                DeliveryDate = new DateOnly(2026, 11, 2), CurrencyCode = "TRY", Status = status
            };
            delivery.Lines.Add(new StandaloneSalesDeliveryLine
            {
                TenantId = seed.TenantId, Delivery = delivery, LineNumber = 1, StockItemId = item.Id, StockCode = item.Code, StockName = item.Name, UnitCode = item.UnitCode,
                Quantity = 4m, EnteredQuantity = 4m, EnteredUnitCode = item.UnitCode, UnitPrice = 10m, DiscountPercent = 0m, VatPercent = 20m, TrackingCode = "LOT-1"
            });
            delivery.Lines.Add(new StandaloneSalesDeliveryLine
            {
                TenantId = seed.TenantId, Delivery = delivery, LineNumber = 2, StockItemId = item.Id, StockCode = item.Code, StockName = item.Name, UnitCode = item.UnitCode,
                Quantity = 1m, EnteredQuantity = 1m, EnteredUnitCode = item.UnitCode, IsFreeOfCharge = true
            });
            db.StandaloneSalesDeliveries.Add(delivery);
            await db.SaveChangesAsync();
            return delivery.Id;
        });

    private static Task<Guid> SeedOrderDeliveryAsync(SalesOrderApiFactory factory, SalesOrderSeed seed, SalesDeliveryStatus status) =>
        factory.WithTenantDbAsync(async db =>
        {
            var item = await db.StockItems.SingleAsync(x => x.Id == seed.StockItemId);
            var order = new SalesOrder { TenantId = seed.TenantId, CustomerId = seed.CustomerId, Code = "SO-D", OrderDate = new DateOnly(2026, 11, 1), CurrencyCode = "TRY", Status = SalesOrderStatus.Open };
            var delivery = new SalesDelivery
            {
                TenantId = seed.TenantId, RequestId = Guid.NewGuid(), Order = order, WarehouseId = seed.WarehouseId, Code = "IRS-ORD", DeliveryDate = new DateOnly(2026, 11, 2),
                CurrencyCode = "TRY", Status = status
            };
            delivery.Lines.Add(new SalesDeliveryLine
            {
                TenantId = seed.TenantId, Delivery = delivery, OrderLineNumber = 1, StockItemId = item.Id, StockCode = item.Code, StockName = item.Name,
                UnitCode = item.UnitCode, Quantity = 2m, UnitPrice = 10m, DiscountPercent = 0m, VatPercent = 20m
            });
            db.SalesOrders.Add(order);
            db.SalesDeliveries.Add(delivery);
            await db.SaveChangesAsync();
            return delivery.Id;
        });

    [Fact]
    public async Task Model_lists_states_transitions_operations_and_an_editable_code()
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync();
        using var client = factory.Client(seed);

        var model = await SalesOrderApiFactory.ReadJsonAsync(await client.GetAsync("/api/document-models/satis.irsaliye"));

        Assert.Equal(["Draft", "Posted", "Voided"], model.GetProperty("states").EnumerateArray().Select(x => x.GetProperty("code").GetString()).ToArray());
        Assert.Equal(["sevket", "iptal"], model.GetProperty("transitions").EnumerateArray().Select(x => x.GetProperty("code").GetString()).ToArray());
        Assert.Equal(["satis.irsaliye.sevket", "satis.irsaliye.iptal"], model.GetProperty("transitions").EnumerateArray().Select(x => x.GetProperty("operation").GetString()).ToArray());
        Assert.Equal(["code", "customerId", "deliveryDate", "warehouseId"], model.GetProperty("fields").EnumerateArray().Select(x => x.GetProperty("code").GetString()).ToArray());
        Assert.False(model.GetProperty("fields")[0].GetProperty("readOnly").GetBoolean());
        Assert.Equal(("satis.irsaliye.belge", "satis.irsaliye.olustur", "satis.irsaliye.guncelle"), (model.GetProperty("loadOperation").GetString(),
            model.GetProperty("createOperation").GetString(), model.GetProperty("updateOperation").GetString()));
    }

    [Fact]
    public async Task Standalone_draft_document_keeps_free_lines_tracking_and_offers_sevket()
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync();
        var id = await SeedStandaloneAsync(factory, seed, StandaloneInventoryDocumentStatus.Draft);
        using var client = factory.Client(seed);

        var document = await SalesOrderApiFactory.ReadJsonAsync(await client.GetAsync($"/api/sales/deliveries/{id}/document"));

        var delivery = document.GetProperty("delivery");
        Assert.Equal(("Draft", true, "IRS-SEED"), (delivery.GetProperty("status").GetString(), delivery.GetProperty("isStandalone").GetBoolean(), delivery.GetProperty("code").GetString()));
        Assert.Equal("LOT-1", delivery.GetProperty("lines")[0].GetProperty("trackingCode").GetString());
        Assert.True(delivery.GetProperty("lines")[1].GetProperty("isFreeOfCharge").GetBoolean());
        Assert.Equal(JsonValueKindNull, delivery.GetProperty("lines")[1].GetProperty("unitPrice").ValueKind);
        Assert.Equal(48m, document.GetProperty("amounts").GetProperty("grandTotal").GetDecimal());
        Assert.Equal(["sevket"], document.GetProperty("allowedTransitions").EnumerateArray().Select(x => x.GetString()).ToArray());
        Assert.False(document.GetProperty("activityStartedLate").GetBoolean());
    }

    private const System.Text.Json.JsonValueKind JsonValueKindNull = System.Text.Json.JsonValueKind.Null;

    [Theory]
    [InlineData(StandaloneInventoryDocumentStatus.Posted)]
    [InlineData(StandaloneInventoryDocumentStatus.Voided)]
    public async Task Posted_or_voided_standalone_delivery_has_no_transitions_and_is_flagged_without_a_log(StandaloneInventoryDocumentStatus status)
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync();
        var id = await SeedStandaloneAsync(factory, seed, status);
        using var client = factory.Client(seed);

        var document = await SalesOrderApiFactory.ReadJsonAsync(await client.GetAsync($"/api/sales/deliveries/{id}/document"));

        Assert.Empty(document.GetProperty("allowedTransitions").EnumerateArray());
        Assert.True(document.GetProperty("activityStartedLate").GetBoolean());
    }

    [Theory]
    [InlineData(SalesDeliveryStatus.Posted, new[] { "iptal" })]
    [InlineData(SalesDeliveryStatus.Voided, new string[0])]
    public async Task Order_based_delivery_opens_read_only_and_a_posted_one_can_be_voided(SalesDeliveryStatus status, string[] expected)
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync();
        var id = await SeedOrderDeliveryAsync(factory, seed, status);
        using var client = factory.Client(seed);

        var document = await SalesOrderApiFactory.ReadJsonAsync(await client.GetAsync($"/api/sales/deliveries/{id}/document"));

        var delivery = document.GetProperty("delivery");
        Assert.Equal((false, "SO-D"), (delivery.GetProperty("isStandalone").GetBoolean(), delivery.GetProperty("orderCode").GetString()));
        Assert.Equal(seed.CustomerId, delivery.GetProperty("customerId").GetGuid());
        Assert.Equal(expected, document.GetProperty("allowedTransitions").EnumerateArray().Select(x => x.GetString()).ToArray());
    }

    [Fact]
    public async Task Unknown_or_other_tenant_delivery_is_not_found()
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync("own");
        var other = await factory.SeedAsync("other");
        var id = await SeedStandaloneAsync(factory, other, StandaloneInventoryDocumentStatus.Draft);
        using var client = factory.Client(seed);

        using var foreign = await client.GetAsync($"/api/sales/deliveries/{id}/document");
        using var missing = await client.GetAsync($"/api/sales/deliveries/{Guid.NewGuid()}/document");

        Assert.Equal((HttpStatusCode.NotFound, HttpStatusCode.NotFound), (foreign.StatusCode, missing.StatusCode));
    }

    [Theory]
    [InlineData("Draft", new[] { "sevket" })]
    [InlineData("Posted", new[] { "iptal" })]
    [InlineData("Voided", new string[0])]
    public async Task Sample_document_has_requested_state_without_touching_the_database(string state, string[] transitions)
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync();
        using var client = factory.Client(seed);

        using var response = await client.GetAsync($"/api/document-models/satis.irsaliye/sample?state={state}");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var document = await SalesOrderApiFactory.ReadJsonAsync(response);
        Assert.Equal(state, document.GetProperty("delivery").GetProperty("status").GetString());
        Assert.Equal(transitions, document.GetProperty("allowedTransitions").EnumerateArray().Select(x => x.GetString()).ToArray());
        await factory.WithTenantDbAsync(async db => Assert.Equal(0, await db.StandaloneSalesDeliveries.CountAsync() + await db.SalesDeliveries.CountAsync()));
    }

    [Fact]
    public async Task Model_routes_need_the_delivery_read_permission_not_the_order_one()
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync();
        using var client = factory.Client(seed, "TenantUser");

        using var response = await client.GetAsync("/api/document-models/satis.irsaliye/sample");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }
}
