using System.Net;
using System.Net.Http.Json;
using AIERP.Platform.Domain;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>Belge kuralları PR 1, task 3: new orders are drafts; editing, deleting and dates follow the state chain.</summary>
public sealed class SalesOrderLifecycleIntegrationTests
{
    [Fact]
    public async Task Create_writes_draft()
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync();
        using var client = factory.Client(seed);

        using var response = await client.PostAsJsonAsync("/api/sales/orders", SalesOrderApiFactory.OrderBody(seed));

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal("Draft", (await SalesOrderApiFactory.ReadJsonAsync(response)).GetProperty("status").GetString());
    }

    [Fact]
    public async Task Put_on_open_order_conflicts()
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync();
        var orderId = await factory.SeedOrderAsync(seed, SalesOrderStatus.Open);
        using var client = factory.Client(seed);

        using var response = await client.PutAsJsonAsync($"/api/sales/orders/{orderId}", SalesOrderApiFactory.OrderBody(seed, code: "SO-SEED"));

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Contains("Yalnızca taslak siparişler düzenlenebilir", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Put_on_draft_succeeds()
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync();
        var orderId = await factory.SeedOrderAsync(seed, SalesOrderStatus.Draft);
        using var client = factory.Client(seed);

        using var response = await client.PutAsJsonAsync($"/api/sales/orders/{orderId}", SalesOrderApiFactory.OrderBody(seed, 6m, "SO-SEED"));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("Draft", (await SalesOrderApiFactory.ReadJsonAsync(response)).GetProperty("status").GetString());
    }

    [Fact]
    public async Task Delete_on_open_order_conflicts()
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync();
        var orderId = await factory.SeedOrderAsync(seed, SalesOrderStatus.Open);
        using var client = factory.Client(seed);

        using var response = await client.DeleteAsync($"/api/sales/orders/{orderId}");

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Contains("Yalnızca taslak siparişler silinebilir", await response.Content.ReadAsStringAsync());
    }

    [Theory]
    [InlineData(SalesOrderStatus.Draft, HttpStatusCode.OK)]
    [InlineData(SalesOrderStatus.Open, HttpStatusCode.OK)]
    [InlineData(SalesOrderStatus.Fulfilled, HttpStatusCode.Conflict)]
    [InlineData(SalesOrderStatus.PendingApproval, HttpStatusCode.Conflict)]
    public async Task Delivery_date_follows_state(SalesOrderStatus status, HttpStatusCode expected)
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync();
        var orderId = await factory.SeedOrderAsync(seed, status);
        using var client = factory.Client(seed);

        using var response = await client.PutAsJsonAsync($"/api/sales/orders/{orderId}/delivery-date",
            new { requestedDeliveryDate = "2026-12-01" });

        Assert.Equal(expected, response.StatusCode);
    }

    [Fact]
    public async Task Status_rule_on_open_still_lists_approved_orders_and_hides_drafts()
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync();
        await factory.SeedOrderAsync(seed, SalesOrderStatus.Open, code: "SO-OPEN");
        await factory.SeedOrderAsync(seed, SalesOrderStatus.Draft, code: "SO-DRAFT");
        await factory.WithPlatformDbAsync(async platform =>
        {
            var permission = await platform.PermissionDefinitions.SingleAsync(x => x.Code == "erp.sales-orders.read");
            platform.TenantPermissionRules.Add(new TenantPermissionRule
            {
                TenantId = seed.TenantId, SubjectType = TenantPermissionSubjectType.Role, SubjectRole = "TenantUser",
                PermissionCode = permission.Code, Permission = permission, Effect = TenantPermissionEffect.Allow,
                ResourceType = "erp.sales-orders", AttributeName = "resource.status",
                AttributeOperator = TenantPermissionConditionOperator.Equals, AttributeValue = "Open"
            });
            await platform.SaveChangesAsync();
        });
        using var client = factory.Client(seed, "TenantUser");

        using var response = await client.GetAsync("/api/sales/orders");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var codes = (await SalesOrderApiFactory.ReadJsonAsync(response)).GetProperty("items").EnumerateArray()
            .Select(x => x.GetProperty("code").GetString()).ToArray();
        Assert.Equal<IEnumerable<string?>>(["SO-OPEN"], codes);
    }
}
