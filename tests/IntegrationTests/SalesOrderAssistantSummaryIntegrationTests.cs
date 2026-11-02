using System.Net;
using System.Text.Json;
using AIERP.Api;
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

public sealed class SalesOrderAssistantSummaryIntegrationTests
{
    [Fact]
    public async Task Exact_order_summary_requires_auth_scopes_tenant_caps_lines_and_returns_only_safe_fulfillment_fields()
    {
        var tenantAId = Guid.NewGuid();
        var tenantBId = Guid.NewGuid();
        var databaseName = $"sales-order-assistant-summary-{Guid.NewGuid():N}";
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Services.AddDbContext<TenantDbContext>(options => options.UseInMemoryDatabase(databaseName));
        builder.Services.AddDbContext<PlatformDbContext>(options => options.UseInMemoryDatabase($"platform-{databaseName}"));
        builder.Services.AddAuthentication("sales-order-summary-test")
            .AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("sales-order-summary-test", _ => { });
        builder.Services.AddAuthorization();
        await using var app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapGroup("/api/sales/orders").MapSalesOrderAssistantSummaryEndpoint();
        await app.StartAsync();

        var tenantA = new Tenant { Id = tenantAId, Name = "Tenant A", Slug = $"so-a-{tenantAId:N}" };
        var tenantB = new Tenant { Id = tenantBId, Name = "Tenant B", Slug = $"so-b-{tenantBId:N}" };
        var customerA = new CustomerAccount { TenantId = tenantAId, Tenant = tenantA, Code = "C-A", Name = "Private customer A", Type = CounterpartyType.Customer };
        var customerB = new CustomerAccount { TenantId = tenantBId, Tenant = tenantB, Code = "C-B", Name = "Private customer B", Type = CounterpartyType.Customer };
        var quoteA = new SalesQuote { TenantId = tenantAId, Tenant = tenantA, CustomerId = customerA.Id, Customer = customerA, Code = "SQ-A", QuoteDate = today, ValidUntil = today.AddDays(7) };
        var quoteB = new SalesQuote { TenantId = tenantBId, Tenant = tenantB, CustomerId = customerB.Id, Customer = customerB, Code = "SQ-B", QuoteDate = today, ValidUntil = today.AddDays(7) };
        var orderA = new SalesOrder { TenantId = tenantAId, Tenant = tenantA, CustomerId = customerA.Id, Customer = customerA, QuoteId = quoteA.Id, Quote = quoteA, Code = "SO-ASSIST-01", OrderDate = today, GrandTotal = 1200m };
        var orderB = new SalesOrder { TenantId = tenantBId, Tenant = tenantB, CustomerId = customerB.Id, Customer = customerB, QuoteId = quoteB.Id, Quote = quoteB, Code = "SO-ASSIST-01", OrderDate = today, GrandTotal = 9999m };
        var linesA = Enumerable.Range(1, 51).Select(index => new SalesOrderLine
        {
            TenantId = tenantAId, OrderId = orderA.Id, Order = orderA, LineNumber = index, StockItemId = Guid.NewGuid(),
            StockCode = $"ITEM-{index:000}", StockName = "Synthetic item", UnitCode = "EA", Quantity = 10m,
            UnitPrice = 100m, VatPercent = 20m, LineSubtotal = 1000m, TaxAmount = 200m, LineTotal = 1200m
        }).ToArray();
        var linesB = new[]
        {
            new SalesOrderLine { TenantId = tenantBId, OrderId = orderB.Id, Order = orderB, LineNumber = 1, StockItemId = Guid.NewGuid(),
                StockCode = "TENANT-B-ITEM", StockName = "Tenant B item", UnitCode = "EA", Quantity = 1m, UnitPrice = 9999m,
                LineSubtotal = 9999m, LineTotal = 9999m }
        };
        var warehouse = new Warehouse { TenantId = tenantAId, Tenant = tenantA, Code = "W-A", Name = "Private warehouse" };
        var delivery = new SalesDelivery { TenantId = tenantAId, Tenant = tenantA, OrderId = orderA.Id, Order = orderA,
            WarehouseId = warehouse.Id, Warehouse = warehouse, RequestId = Guid.NewGuid(), Code = "SD-PRIVATE", DeliveryDate = today, Status = SalesDeliveryStatus.Posted };
        var deliveredLine = new SalesDeliveryLine { TenantId = tenantAId, DeliveryId = delivery.Id, Delivery = delivery,
            OrderId = orderA.Id, OrderLineNumber = 1, OrderLine = linesA[0], StockItemId = linesA[0].StockItemId,
            StockCode = linesA[0].StockCode, StockName = linesA[0].StockName, UnitCode = "EA", Quantity = 3m };

        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            await db.Database.EnsureCreatedAsync();
            db.Tenants.AddRange(tenantA, tenantB);
            db.CustomerAccounts.AddRange(customerA, customerB);
            db.SalesQuotes.AddRange(quoteA, quoteB);
            db.SalesOrders.AddRange(orderA, orderB);
            db.SalesOrderLines.AddRange(linesA);
            db.SalesOrderLines.AddRange(linesB);
            db.Warehouses.Add(warehouse);
            db.SalesDeliveries.Add(delivery);
            db.SalesDeliveryLines.Add(deliveredLine);
            await db.SaveChangesAsync();
        }

        using var client = app.GetTestClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/sales/orders/assistant-summary?code=SO-ASSIST-01")).StatusCode);
        client.DefaultRequestHeaders.Add("X-Test-Tenant", tenantAId.ToString("D"));
        using var response = JsonDocument.Parse(await (await client.GetAsync("/api/sales/orders/assistant-summary?code=SO-ASSIST-01")).Content.ReadAsStringAsync());
        var summary = response.RootElement;
        Assert.Equal(1200m, summary.GetProperty("grandTotal").GetDecimal());
        Assert.Equal(51, summary.GetProperty("lineCount").GetInt32());
        Assert.Equal(50, summary.GetProperty("returnedLines").GetInt32());
        Assert.True(summary.GetProperty("hasMoreLines").GetBoolean());
        Assert.Equal("ITEM-001", summary.GetProperty("lines")[0].GetProperty("stockCode").GetString());
        Assert.Equal(3m, summary.GetProperty("lines")[0].GetProperty("deliveredQuantity").GetDecimal());
        Assert.Equal(7m, summary.GetProperty("lines")[0].GetProperty("outstandingQuantity").GetDecimal());
        var json = response.RootElement.GetRawText();
        Assert.DoesNotContain("customer", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("quote", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("warehouse", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("reservation", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("stockItemId", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("deliveryId", json, StringComparison.OrdinalIgnoreCase);
        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", tenantBId.ToString("D"));
        using var otherTenant = JsonDocument.Parse(await (await client.GetAsync("/api/sales/orders/assistant-summary?code=SO-ASSIST-01")).Content.ReadAsStringAsync());
        Assert.Equal(9999m, otherTenant.RootElement.GetProperty("grandTotal").GetDecimal());
        Assert.Equal("TENANT-B-ITEM", otherTenant.RootElement.GetProperty("lines")[0].GetProperty("stockCode").GetString());
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/api/sales/orders/assistant-summary?code=SO-NOT-FOUND")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/sales/orders/assistant-summary?code=x")).StatusCode);
    }
}
