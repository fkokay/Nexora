using System.Text.Json;
using System.Net;
using System.Net.Http.Json;
using AIERP.Platform.Domain;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>Belge kuralları PR 1, task 6: the satis.siparis document model and the order's document view.</summary>
public sealed class SalesOrderDocumentModelTests
{
    [Fact]
    public async Task Model_lists_states_and_transitions_in_order()
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync();
        using var client = factory.Client(seed);

        using var response = await client.GetAsync("/api/document-models/satis.siparis");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var model = await SalesOrderApiFactory.ReadJsonAsync(response);
        Assert.Equal<IEnumerable<string?>>(["Draft", "PendingApproval", "Open", "Fulfilled", "Invoiced", "Cancelled"],
            model.GetProperty("states").EnumerateArray().Select(x => x.GetProperty("code").GetString()).ToArray());
        Assert.Equal("Onaylı", model.GetProperty("states")[2].GetProperty("label").GetString());
        Assert.True(model.GetProperty("states")[5].GetProperty("terminal").GetBoolean());
        Assert.Equal<IEnumerable<string?>>(["onayla", "onayiGeriAl", "iptal"],
            model.GetProperty("transitions").EnumerateArray().Select(x => x.GetProperty("code").GetString()).ToArray());
        Assert.Equal("satis.siparis.hesapla", model.GetProperty("calculateOperation").GetString());
        var columns = model.GetProperty("lineColumns").EnumerateArray().ToDictionary(x => x.GetProperty("code").GetString()!, x => x.GetProperty("calculated").GetBoolean());
        Assert.False(columns["stockItemId"]);
        Assert.True(columns["lineTotal"]);
        Assert.True(columns["availableQuantity"]);
    }

    [Fact]
    public async Task Unknown_model_is_not_found()
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync();
        using var client = factory.Client(seed);

        using var response = await client.GetAsync("/api/document-models/satis.yok");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Document_returns_lines_with_entered_values_amounts_and_vat()
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync();
        var orderId = await factory.SeedOrderAsync(seed, SalesOrderStatus.Draft, quantity: 4m);
        using var client = factory.Client(seed);

        using var response = await client.GetAsync($"/api/sales/orders/{orderId}/document");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var document = await SalesOrderApiFactory.ReadJsonAsync(response);
        var line = document.GetProperty("order").GetProperty("lines")[0];
        Assert.Equal(10m, line.GetProperty("enteredUnitPrice").GetDecimal());
        Assert.Equal("KG", line.GetProperty("enteredUnitCode").GetString());
        Assert.Equal(48m, document.GetProperty("amounts").GetProperty("grandTotal").GetDecimal());
        var vat = document.GetProperty("amounts").GetProperty("vat")[0];
        Assert.Equal(20m, vat.GetProperty("rate").GetDecimal());
        Assert.Equal(40m, vat.GetProperty("taxableAmount").GetDecimal());
        Assert.Equal(8m, vat.GetProperty("amount").GetDecimal());
    }

    [Theory]
    [InlineData(SalesOrderStatus.Draft, new[] { "onayla", "iptal" })]
    [InlineData(SalesOrderStatus.Open, new[] { "onayiGeriAl", "iptal" })]
    [InlineData(SalesOrderStatus.Fulfilled, new string[0])]
    public async Task Allowed_transitions_follow_state(SalesOrderStatus status, string[] expected)
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync();
        var orderId = await factory.SeedOrderAsync(seed, status);
        using var client = factory.Client(seed);

        using var response = await client.GetAsync($"/api/sales/orders/{orderId}/document");

        var document = await SalesOrderApiFactory.ReadJsonAsync(response);
        Assert.Equal<IEnumerable<string?>>(expected, document.GetProperty("allowedTransitions").EnumerateArray()
            .Select(x => x.GetString()).ToArray());
    }

    [Fact]
    public async Task Allowed_transitions_are_empty_without_execute_permission()
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync();
        var orderId = await factory.SeedOrderAsync(seed, SalesOrderStatus.Draft);
        await factory.WithPlatformDbAsync(async platform =>
        {
            var permission = await platform.PermissionDefinitions.SingleAsync(x => x.Code == "erp.sales-orders.execute");
            var read = await platform.PermissionDefinitions.SingleAsync(x => x.Code == "erp.sales-orders.read");
            platform.TenantPermissionRules.AddRange(
                new TenantPermissionRule
                {
                    TenantId = seed.TenantId, SubjectType = TenantPermissionSubjectType.Role, SubjectRole = "TenantUser",
                    PermissionCode = read.Code, Permission = read, Effect = TenantPermissionEffect.Allow, ResourceType = "erp.sales-orders"
                },
                new TenantPermissionRule
                {
                    TenantId = seed.TenantId, SubjectType = TenantPermissionSubjectType.Role, SubjectRole = "TenantUser",
                    PermissionCode = permission.Code, Permission = permission, Effect = TenantPermissionEffect.Deny, ResourceType = "erp.sales-orders"
                });
            await platform.SaveChangesAsync();
        });
        using var client = factory.Client(seed, "TenantUser");

        using var response = await client.GetAsync($"/api/sales/orders/{orderId}/document");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Empty((await SalesOrderApiFactory.ReadJsonAsync(response)).GetProperty("allowedTransitions").EnumerateArray());
    }

    [Fact]
    public async Task Document_shows_activity_and_flags_legacy_orders()
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync();
        var legacy = await factory.SeedOrderAsync(seed, SalesOrderStatus.Open, code: "SO-OLD");
        var draft = await factory.SeedOrderAsync(seed, SalesOrderStatus.Draft, code: "SO-NEW");
        using var client = factory.Client(seed);
        using (var approve = await client.PostAsJsonAsync($"/api/sales/orders/{draft}/approve", new { }))
            Assert.Equal(HttpStatusCode.OK, approve.StatusCode);

        var legacyDocument = await SalesOrderApiFactory.ReadJsonAsync(await client.GetAsync($"/api/sales/orders/{legacy}/document"));
        var newDocument = await SalesOrderApiFactory.ReadJsonAsync(await client.GetAsync($"/api/sales/orders/{draft}/document"));

        Assert.True(legacyDocument.GetProperty("activityStartedLate").GetBoolean());
        Assert.False(newDocument.GetProperty("activityStartedLate").GetBoolean());
        Assert.Contains(newDocument.GetProperty("activity").EnumerateArray(), x => x.GetProperty("step").GetString() == "Onaylandı");
    }

    [Fact]
    public async Task Fill_stock_returns_price_vat_discount_currency_unit_and_available()
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync();
        var orderId = await factory.SeedOrderAsync(seed, SalesOrderStatus.Open);
        await factory.WithTenantDbAsync(async db =>
        {
            db.SalesOrderReservations.Add(new SalesOrderReservation { TenantId = seed.TenantId, RequestId = Guid.NewGuid(), OrderId = orderId,
                OrderLineNumber = 1, WarehouseId = seed.WarehouseId, Quantity = 30m, FulfilledQuantity = 0m });
            await db.SaveChangesAsync();
        });
        using var client = factory.Client(seed);

        using var response = await client.PostAsJsonAsync("/api/document-models/satis.siparis/fill",
            new { field = "stockItemId", value = seed.StockItemId.ToString("D") });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var values = (await SalesOrderApiFactory.ReadJsonAsync(response)).GetProperty("values");
        Assert.Equal("KG", values.GetProperty("unitCode").GetString());
        Assert.Equal(12.5m, values.GetProperty("unitPrice").GetDecimal());
        Assert.Equal(10m, values.GetProperty("vatPercent").GetDecimal());
        Assert.Equal(5m, values.GetProperty("discountPercent").GetDecimal());
        Assert.Equal("TRY", values.GetProperty("currencyCode").GetString());
        Assert.Equal(70m, values.GetProperty("availableQuantity").GetDecimal());
    }

    [Fact]
    public async Task Fill_other_tenant_stock_is_not_found()
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync("own");
        var other = await factory.SeedAsync("other");
        using var client = factory.Client(seed);

        using var response = await client.PostAsJsonAsync("/api/document-models/satis.siparis/fill",
            new { field = "stockItemId", value = other.StockItemId.ToString("D") });

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Document_of_other_tenant_order_is_not_found()
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync("own");
        var other = await factory.SeedAsync("other");
        var orderId = await factory.SeedOrderAsync(other, SalesOrderStatus.Draft);
        using var client = factory.Client(seed);

        using var response = await client.GetAsync($"/api/sales/orders/{orderId}/document");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Model_carries_fills_readonly_and_visible_from()
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync();
        using var client = factory.Client(seed);

        var model = await SalesOrderApiFactory.ReadJsonAsync(await client.GetAsync("/api/document-models/satis.siparis"));

        Assert.Equal<IEnumerable<string?>>(["unitCode", "unitPrice", "vatPercent", "discountPercent", "currencyCode", "availableQuantity"],
            model.GetProperty("fills").GetProperty("stockItemId").EnumerateArray().Select(x => x.GetString()).ToArray());
        var fields = model.GetProperty("fields").EnumerateArray().ToDictionary(x => x.GetProperty("code").GetString()!, x => x.GetProperty("readOnly").GetBoolean());
        Assert.True(fields["code"]);
        Assert.False(fields["customerId"]);
        var columns = model.GetProperty("lineColumns").EnumerateArray().ToDictionary(x => x.GetProperty("code").GetString()!);
        Assert.Equal("Open", columns["deliveredQuantity"].GetProperty("visibleFrom").GetString());
        Assert.Equal(JsonValueKind.Null, columns["quantity"].GetProperty("visibleFrom").ValueKind);
        Assert.Equal("satis.siparis.olustur", model.GetProperty("createOperation").GetString());
        Assert.Equal("satis.siparis.guncelle", model.GetProperty("updateOperation").GetString());
    }

    [Theory]
    [InlineData("Draft", new[] { "onayla", "iptal" })]
    [InlineData("Open", new[] { "onayiGeriAl", "iptal" })]
    [InlineData("Fulfilled", new string[0])]
    public async Task Sample_document_has_requested_state_without_touching_the_database(string state, string[] transitions)
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync();
        using var client = factory.Client(seed);

        using var response = await client.GetAsync($"/api/document-models/satis.siparis/sample?state={state}");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var document = await SalesOrderApiFactory.ReadJsonAsync(response);
        Assert.Equal(state, document.GetProperty("order").GetProperty("status").GetString());
        Assert.True(document.GetProperty("order").GetProperty("lines").GetArrayLength() >= 2);
        Assert.Equal<IEnumerable<string?>>(transitions, document.GetProperty("allowedTransitions").EnumerateArray().Select(x => x.GetString()).ToArray());
        var amounts = document.GetProperty("amounts");
        Assert.Equal(2, amounts.GetProperty("vat").GetArrayLength());
        Assert.Equal(amounts.GetProperty("grandTotal").GetDecimal(),
            amounts.GetProperty("subtotal").GetDecimal() - amounts.GetProperty("discountTotal").GetDecimal() + amounts.GetProperty("taxTotal").GetDecimal());
        await factory.WithTenantDbAsync(async db => Assert.Equal(0, await db.SalesOrders.CountAsync()));
    }

    [Fact]
    public async Task Sample_without_state_is_a_draft_and_unknown_state_is_bad_request()
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync();
        using var client = factory.Client(seed);

        var draft = await SalesOrderApiFactory.ReadJsonAsync(await client.GetAsync("/api/document-models/satis.siparis/sample"));
        using var unknown = await client.GetAsync("/api/document-models/satis.siparis/sample?state=Kayip");

        Assert.Equal("Draft", draft.GetProperty("order").GetProperty("status").GetString());
        Assert.Equal(HttpStatusCode.BadRequest, unknown.StatusCode);
    }

    [Fact]
    public async Task Sample_needs_sales_order_read()
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync();
        using var client = factory.Client(seed, "TenantUser");

        using var response = await client.GetAsync("/api/document-models/satis.siparis/sample");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }
}
