using System.Net;
using System.Net.Http.Json;
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

public sealed class Phase2SalesOrderDeliveryGuardAcceptanceTests
{
    private static readonly Guid TenantId = Guid.Parse("11111111-1111-1111-1111-111111111111");

    [Fact]
    public async Task Delivery_date_guard_rejects_pre_order_and_closed_order_changes_without_mutation_or_audit()
    {
        await using var app = await StartAsync();
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantId.ToString());

        var beforeOrderDate = await client.PutAsJsonAsync($"/api/sales/orders/{OpenOrderId:D}/delivery-date", new
        {
            requestedDeliveryDate = "2026-10-14"
        });
        Assert.Equal(HttpStatusCode.BadRequest, beforeOrderDate.StatusCode);

        var fulfilledOrder = await client.PutAsJsonAsync($"/api/sales/orders/{FulfilledOrderId:D}/delivery-date", new
        {
            requestedDeliveryDate = "2026-10-22"
        });
        Assert.Equal(HttpStatusCode.Conflict, fulfilledOrder.StatusCode);

        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        var orders = await db.SalesOrders.AsNoTracking().Where(x => x.TenantId == TenantId).ToDictionaryAsync(x => x.Id);
        Assert.Null(orders[OpenOrderId].RequestedDeliveryDate);
        Assert.Null(orders[FulfilledOrderId].RequestedDeliveryDate);
        Assert.Empty(await db.AuditEvents.Where(x => x.TenantId == TenantId && x.Action == "sales-order.delivery-date-updated").ToListAsync());
    }

    private static readonly Guid OpenOrderId = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    private static readonly Guid FulfilledOrderId = Guid.Parse("cccccccc-cccc-cccc-cccc-cccccccccccc");

    private static async Task<WebApplication> StartAsync()
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        var databaseName = $"phase2-sales-{Guid.NewGuid():N}";
        builder.Services.AddDbContext<TenantDbContext>(options => options.UseInMemoryDatabase(databaseName));
        builder.Services.AddAuthentication("report-test")
            .AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("report-test", _ => { });
        builder.Services.AddAuthorization();

        var app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapSalesOrderEndpoints();
        await app.StartAsync();

        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        await db.Database.EnsureCreatedAsync();
        var tenant = new Tenant { Id = TenantId, Name = "Acceptance tenant", Slug = "phase2-acceptance" };
        var customer = new CustomerAccount { TenantId = TenantId, Tenant = tenant, Code = "C-1", Name = "Customer", Type = CounterpartyType.Customer };
        var quote = new SalesQuote
        {
            TenantId = TenantId, Tenant = tenant, CustomerId = customer.Id, Customer = customer,
            Code = "Q-1", QuoteDate = new DateOnly(2026, 10, 15), ValidUntil = new DateOnly(2026, 11, 15), Status = SalesQuoteStatus.Accepted
        };
        var closedOrderQuote = new SalesQuote
        {
            TenantId = TenantId, Tenant = tenant, CustomerId = customer.Id, Customer = customer,
            Code = "Q-2", QuoteDate = new DateOnly(2026, 10, 15), ValidUntil = new DateOnly(2026, 11, 15), Status = SalesQuoteStatus.Accepted
        };
        db.SalesOrders.AddRange(
            new SalesOrder { Id = OpenOrderId, TenantId = TenantId, Tenant = tenant, QuoteId = quote.Id, Quote = quote,
                CustomerId = customer.Id, Customer = customer, Code = "SO-OPEN", OrderDate = new DateOnly(2026, 10, 15), Status = SalesOrderStatus.Open },
            new SalesOrder { Id = FulfilledOrderId, TenantId = TenantId, Tenant = tenant, QuoteId = closedOrderQuote.Id, Quote = closedOrderQuote,
                CustomerId = customer.Id, Customer = customer, Code = "SO-CLOSED", OrderDate = new DateOnly(2026, 10, 15), Status = SalesOrderStatus.Fulfilled });
        await db.SaveChangesAsync();
        return app;
    }
}
