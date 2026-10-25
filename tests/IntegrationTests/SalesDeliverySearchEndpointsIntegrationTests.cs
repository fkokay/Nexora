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

public sealed class SalesDeliverySearchEndpointsIntegrationTests
{
    [Fact]
    public async Task Search_requires_authentication_is_tenant_scoped_and_returns_only_first_ten_sanitized_rows()
    {
        var tenantAId = Guid.NewGuid();
        var tenantBId = Guid.NewGuid();
        var databaseName = $"sales-delivery-search-{Guid.NewGuid():N}";
        var today = new DateOnly(2026, 10, 25);
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Services.AddDbContext<TenantDbContext>(options => options.UseInMemoryDatabase(databaseName));
        builder.Services.AddAuthentication("delivery-search-test")
            .AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("delivery-search-test", _ => { });
        builder.Services.AddAuthorization();
        await using var app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapSalesDeliverySearchEndpoints();
        await app.StartAsync();

        var tenantA = new Tenant { Id = tenantAId, Name = "Tenant A", Slug = $"tenant-a-{tenantAId:N}" };
        var tenantB = new Tenant { Id = tenantBId, Name = "Tenant B", Slug = $"tenant-b-{tenantBId:N}" };
        var customerA = new CustomerAccount { TenantId = tenantAId, Tenant = tenantA, Code = "C-A", Name = "Customer A", Type = CounterpartyType.Customer, CurrencyCode = "TRY" };
        var customerB = new CustomerAccount { TenantId = tenantBId, Tenant = tenantB, Code = "C-B", Name = "Customer B", Type = CounterpartyType.Customer, CurrencyCode = "TRY" };
        var warehouseA = new Warehouse { TenantId = tenantAId, Tenant = tenantA, Code = "W-A", Name = "Warehouse A" };
        var warehouseB = new Warehouse { TenantId = tenantBId, Tenant = tenantB, Code = "W-B", Name = "Warehouse B" };
        var quoteA = new SalesQuote { TenantId = tenantAId, Tenant = tenantA, CustomerId = customerA.Id, Customer = customerA, Code = "Q-A", QuoteDate = today, ValidUntil = today.AddDays(10) };
        var quoteB = new SalesQuote { TenantId = tenantBId, Tenant = tenantB, CustomerId = customerB.Id, Customer = customerB, Code = "Q-B", QuoteDate = today, ValidUntil = today.AddDays(10) };
        var orderA = new SalesOrder { TenantId = tenantAId, Tenant = tenantA, QuoteId = quoteA.Id, Quote = quoteA, CustomerId = customerA.Id, Customer = customerA, Code = "SO-SEARCH-A", OrderDate = today };
        var orderB = new SalesOrder { TenantId = tenantBId, Tenant = tenantB, QuoteId = quoteB.Id, Quote = quoteB, CustomerId = customerB.Id, Customer = customerB, Code = "SO-SEARCH-B", OrderDate = today };
        var deliveries = Enumerable.Range(1, 12).Select(index => new SalesDelivery
        {
            TenantId = tenantAId, Tenant = tenantA, RequestId = Guid.NewGuid(), OrderId = orderA.Id, Order = orderA,
            WarehouseId = warehouseA.Id, Warehouse = warehouseA, Code = $"DN-SEARCH-{index:000}", DeliveryDate = today,
            CreatedAt = DateTimeOffset.Parse("2026-10-25T10:00:00Z")
        }).ToArray();
        var otherTenantDelivery = new SalesDelivery
        {
            TenantId = tenantBId, Tenant = tenantB, RequestId = Guid.NewGuid(), OrderId = orderB.Id, Order = orderB,
            WarehouseId = warehouseB.Id, Warehouse = warehouseB, Code = "DN-SEARCH-999", DeliveryDate = today
        };

        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            await db.Database.EnsureCreatedAsync();
            db.Tenants.AddRange(tenantA, tenantB);
            db.CustomerAccounts.AddRange(customerA, customerB);
            db.Warehouses.AddRange(warehouseA, warehouseB);
            db.SalesQuotes.AddRange(quoteA, quoteB);
            db.SalesOrders.AddRange(orderA, orderB);
            db.SalesDeliveries.AddRange(deliveries);
            db.SalesDeliveries.Add(otherTenantDelivery);
            await db.SaveChangesAsync();
        }

        using var client = app.GetTestClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/sales/deliveries/search?q=DN-SEARCH")).StatusCode);
        client.DefaultRequestHeaders.Add("X-Test-Tenant", tenantAId.ToString());
        var response = await client.GetAsync("/api/sales/deliveries/search?q=dn-search");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using (var search = JsonDocument.Parse(await response.Content.ReadAsStringAsync()))
        {
            Assert.Equal(12, search.RootElement.GetProperty("totalCount").GetInt32());
            Assert.Equal(10, search.RootElement.GetProperty("returned").GetInt32());
            Assert.True(search.RootElement.GetProperty("hasMore").GetBoolean());
            Assert.Equal(10, search.RootElement.GetProperty("items").GetArrayLength());
            var first = search.RootElement.GetProperty("items")[0];
            Assert.Equal("DN-SEARCH-001", first.GetProperty("code").GetString());
            Assert.False(first.TryGetProperty("id", out _));
            Assert.False(first.TryGetProperty("warehouseId", out _));
            Assert.False(first.TryGetProperty("customerName", out _));
        }

        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", tenantBId.ToString());
        using var otherTenantSearch = JsonDocument.Parse(await (await client.GetAsync("/api/sales/deliveries/search?q=DN-SEARCH")).Content.ReadAsStringAsync());
        Assert.Equal(1, otherTenantSearch.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal("DN-SEARCH-999", otherTenantSearch.RootElement.GetProperty("items")[0].GetProperty("code").GetString());
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/sales/deliveries/search?q=x")).StatusCode);
    }
}
