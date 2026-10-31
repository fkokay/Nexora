using System.Net;
using System.Net.Http.Json;
using AIERP.Platform.Application;
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

public sealed class Phase2SalesOrderDeliveryDateClearAcceptanceTests
{
    private static readonly Guid TenantId = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid OtherTenantId = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid OrderId = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");

    [Fact]
    public async Task Clearing_requested_delivery_date_persists_and_audits_only_within_the_order_tenant()
    {
        await using var app = await StartAsync();
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantId.ToString("D"));

        var response = await client.PutAsJsonAsync($"/api/sales/orders/{OrderId:D}/delivery-date", new
        {
            requestedDeliveryDate = (DateOnly?)null
        });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var summary = await response.Content.ReadFromJsonAsync<SalesOrderSummary>();
        Assert.NotNull(summary);
        Assert.Null(summary.RequestedDeliveryDate);

        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", OtherTenantId.ToString("D"));
        Assert.Equal(HttpStatusCode.NotFound,
            (await client.PutAsJsonAsync($"/api/sales/orders/{OrderId:D}/delivery-date", new { requestedDeliveryDate = (DateOnly?)null })).StatusCode);

        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        var order = await db.SalesOrders.AsNoTracking().SingleAsync(x => x.TenantId == TenantId && x.Id == OrderId);
        Assert.Null(order.RequestedDeliveryDate);
        var audit = Assert.Single(await db.AuditEvents.AsNoTracking()
            .Where(x => x.TenantId == TenantId && x.Action == "sales-order.delivery-date-updated").ToListAsync());
        Assert.Equal("SO-CLEAR:2026-10-22->unspecified", audit.Resource);
        Assert.Empty(await db.AuditEvents.AsNoTracking()
            .Where(x => x.TenantId == OtherTenantId && x.Action == "sales-order.delivery-date-updated").ToListAsync());
    }

    private static async Task<WebApplication> StartAsync()
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        var databaseName = $"phase2-date-clear-{Guid.NewGuid():N}";
        builder.Services.AddDbContext<TenantDbContext>(options => options.UseInMemoryDatabase(databaseName));
        builder.Services.AddAuthentication("delivery-date-test")
            .AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("delivery-date-test", _ => { });
        builder.Services.AddAuthorization();

        var app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapSalesOrderEndpoints();
        await app.StartAsync();

        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        await db.Database.EnsureCreatedAsync();
        var tenant = new Tenant { Id = TenantId, Name = "Acceptance tenant", Slug = "phase2-date-clear" };
        var customer = new CustomerAccount
        {
            TenantId = TenantId, Tenant = tenant, Code = "C-CLEAR", Name = "Customer", Type = CounterpartyType.Customer
        };
        var quote = new SalesQuote
        {
            TenantId = TenantId, Tenant = tenant, CustomerId = customer.Id, Customer = customer,
            Code = "Q-CLEAR", QuoteDate = new DateOnly(2026, 10, 15), ValidUntil = new DateOnly(2026, 11, 15),
            Status = SalesQuoteStatus.Accepted
        };
        db.SalesOrders.Add(new SalesOrder
        {
            Id = OrderId, TenantId = TenantId, Tenant = tenant, QuoteId = quote.Id, Quote = quote,
            CustomerId = customer.Id, Customer = customer, Code = "SO-CLEAR", OrderDate = new DateOnly(2026, 10, 15),
            RequestedDeliveryDate = new DateOnly(2026, 10, 22), Status = SalesOrderStatus.Open
        });
        db.Tenants.Add(new Tenant { Id = OtherTenantId, Name = "Other tenant", Slug = "phase2-date-clear-other" });
        await db.SaveChangesAsync();
        return app;
    }
}
