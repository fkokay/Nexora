using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
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

public sealed class SalesPlanningInquiryEndpointsIntegrationTests
{
    [Fact]
    public async Task Distribution_and_campaign_performance_are_read_only_and_tenant_scoped()
    {
        var tenantId = Guid.NewGuid(); var otherTenantId = Guid.NewGuid(); var dbName = $"sales-inquiry-{Guid.NewGuid():N}";
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var builder = WebApplication.CreateBuilder(); builder.WebHost.UseTestServer();
        builder.Services.AddDbContext<TenantDbContext>(options => options.UseInMemoryDatabase(dbName));
        builder.Services.AddDbContext<PlatformDbContext>(options => options.UseInMemoryDatabase($"{dbName}-platform"));
        builder.Services.AddScoped<AIERP.Platform.Application.IPlatformPermissionAuthorizer, PlatformPermissionAuthorizer>();
        builder.Services.AddAuthentication("promotion-test").AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("promotion-test", _ => { });
        builder.Services.AddAuthorization(); builder.Services.ConfigureHttpJsonOptions(options => options.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));
        await using var app = builder.Build(); app.UseAuthentication(); app.UseAuthorization(); app.MapSalesPlanningInquiryEndpoints(); await app.StartAsync();

        var tenant = new Tenant { Id = tenantId, Name = "Sales tenant", Slug = $"sales-{tenantId:N}" };
        var otherTenant = new Tenant { Id = otherTenantId, Name = "Other tenant", Slug = $"sales-{otherTenantId:N}" };
        var customer = new CustomerAccount { TenantId = tenantId, Tenant = tenant, Code = "CUS-1", Name = "Customer", Type = CounterpartyType.Customer, CurrencyCode = "TRY" };
        var item = new StockItem { TenantId = tenantId, Tenant = tenant, Code = "SKU-1", Name = "Product", UnitCode = "EA", IsActive = true };
        var warehouse = new Warehouse { TenantId = tenantId, Tenant = tenant, Code = "WH-1", Name = "Main warehouse", IsActive = true };
        var quote = new SalesQuote { TenantId = tenantId, Tenant = tenant, CustomerId = customer.Id, Customer = customer, Code = "Q-1", QuoteDate = today, ValidUntil = today.AddDays(7), Status = SalesQuoteStatus.Accepted };
        var order = new SalesOrder { TenantId = tenantId, Tenant = tenant, QuoteId = quote.Id, Quote = quote, CustomerId = customer.Id, Customer = customer,
            Code = "SO-1", OrderDate = today, Status = SalesOrderStatus.Open, GrandTotal = 125m };
        order.Lines.Add(new SalesOrderLine { TenantId = tenantId, Order = order, LineNumber = 1, StockItemId = item.Id, StockItem = item,
            StockCode = item.Code, StockName = item.Name, UnitCode = "EA", Quantity = 10m, UnitPrice = 12.5m });
        var campaign = new SalesPromotionCampaign { TenantId = tenantId, Code = "C-1", Name = "Campaign", DiscountPercent = 10m, EffectiveFrom = today, EffectiveThrough = today.AddDays(7) };
        var application = new SalesPromotionApplication { TenantId = tenantId, CampaignId = campaign.Id, QuoteId = quote.Id,
            DiscountPercent = 10m, DiscountAmount = 5m, AppliedOn = today };
        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>(); await db.Database.EnsureCreatedAsync();
            db.Tenants.AddRange(tenant, otherTenant); db.CustomerAccounts.Add(customer); db.StockItems.Add(item); db.Warehouses.Add(warehouse);
            db.SalesQuotes.Add(quote); db.SalesOrders.Add(order); db.SalesPromotionCampaigns.Add(campaign); db.SalesPromotionApplications.Add(application);
            db.InventoryTransactions.Add(new InventoryTransaction { TenantId = tenantId, WarehouseId = warehouse.Id, Warehouse = warehouse, StockItemId = item.Id,
                StockItem = item, EntryDate = today, Direction = InventoryDirection.Receipt, Quantity = 8m });
            await db.SaveChangesAsync();
        }

        using var client = app.GetTestClient(); client.DefaultRequestHeaders.Add("X-Test-Tenant", tenantId.ToString()); client.DefaultRequestHeaders.Add("X-Test-Role", "TenantAdmin");
        using var distribution = await client.GetAsync($"/api/sales/orders/distribution-plan?warehouseId={warehouse.Id}");
        Assert.Equal(HttpStatusCode.OK, distribution.StatusCode);
        using var distributionBody = JsonDocument.Parse(await distribution.Content.ReadAsStringAsync());
        var need = distributionBody.RootElement.GetProperty("items")[0];
        Assert.Equal(10m, need.GetProperty("openDemand").GetDecimal()); Assert.Equal(8m, need.GetProperty("onHand").GetDecimal());
        Assert.Equal(2m, need.GetProperty("uncovered").GetDecimal());
        using var performance = await client.GetAsync("/api/sales/quotes/campaign-performance");
        Assert.Equal(HttpStatusCode.OK, performance.StatusCode);
        using var performanceBody = JsonDocument.Parse(await performance.Content.ReadAsStringAsync());
        var result = performanceBody.RootElement.GetProperty("items")[0];
        Assert.Equal(1, result.GetProperty("applications").GetInt32());
        var discountByCurrency = result.GetProperty("discountTotals")[0]; Assert.Equal("TRY", discountByCurrency.GetProperty("currencyCode").GetString());
        Assert.Equal(5m, discountByCurrency.GetProperty("amount").GetDecimal());
        Assert.Equal(1, result.GetProperty("linkedOrders").GetInt32());
        var totalByCurrency = result.GetProperty("linkedOrderTotals")[0]; Assert.Equal("TRY", totalByCurrency.GetProperty("currencyCode").GetString());
        Assert.Equal(125m, totalByCurrency.GetProperty("amount").GetDecimal());

        client.DefaultRequestHeaders.Remove("X-Test-Tenant"); client.DefaultRequestHeaders.Add("X-Test-Tenant", otherTenantId.ToString());
        using var otherTenantPerformance = await client.GetAsync("/api/sales/quotes/campaign-performance");
        using var otherBody = JsonDocument.Parse(await otherTenantPerformance.Content.ReadAsStringAsync());
        Assert.Empty(otherBody.RootElement.GetProperty("items").EnumerateArray());
        using var foreignWarehouse = await client.GetAsync($"/api/sales/orders/distribution-plan?warehouseId={warehouse.Id}");
        Assert.Equal(HttpStatusCode.NotFound, foreignWarehouse.StatusCode);
        await using var verifyScope = app.Services.CreateAsyncScope(); var verifyDb = verifyScope.ServiceProvider.GetRequiredService<TenantDbContext>();
        Assert.Equal(1, await verifyDb.SalesPromotionApplications.CountAsync());
        Assert.Equal(1, await verifyDb.InventoryTransactions.CountAsync());
    }
}
