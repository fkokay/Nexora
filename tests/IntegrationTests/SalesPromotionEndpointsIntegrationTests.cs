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

public sealed class SalesPromotionEndpointsIntegrationTests
{
    [Fact]
    public async Task Campaign_is_admin_managed_tenant_scoped_and_applies_compounded_discount_to_draft_quote_once()
    {
        var tenantA = Guid.NewGuid(); var tenantB = Guid.NewGuid(); var dbName = $"sales-promotions-{Guid.NewGuid():N}";
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var builder = WebApplication.CreateBuilder(); builder.WebHost.UseTestServer();
        builder.Services.AddDbContext<TenantDbContext>(options => options.UseInMemoryDatabase(dbName));
        builder.Services.AddDbContext<PlatformDbContext>(options => options.UseInMemoryDatabase($"{dbName}-platform"));
        builder.Services.AddAuthentication("promotion-test").AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("promotion-test", _ => { });
        builder.Services.AddAuthorization(); builder.Services.ConfigureHttpJsonOptions(options => options.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));
        await using var app = builder.Build(); app.UseAuthentication(); app.UseAuthorization(); app.MapSalesPromotionEndpoints(); await app.StartAsync();

        var tenant = new Tenant { Id = tenantA, Name = "Campaign tenant", Slug = $"campaign-{tenantA:N}" };
        var otherTenant = new Tenant { Id = tenantB, Name = "Other tenant", Slug = $"campaign-{tenantB:N}" };
        var customer = new CustomerAccount { TenantId = tenantA, Tenant = tenant, Code = "CUS-1", Name = "Test customer", Type = CounterpartyType.Customer, CurrencyCode = "TRY" };
        var item = new StockItem { TenantId = tenantA, Tenant = tenant, Code = "ITEM-1", Name = "Test item", UnitCode = "EA", IsActive = true };
        var quote = new SalesQuote { TenantId = tenantA, Tenant = tenant, CustomerId = customer.Id, Customer = customer,
            Code = "Q-1", QuoteDate = today, ValidUntil = today.AddDays(14), Status = SalesQuoteStatus.Draft,
            Subtotal = 200, DiscountTotal = 20, TaxTotal = 36, GrandTotal = 216 };
        quote.Lines.Add(new SalesQuoteLine { TenantId = tenantA, Quote = quote, LineNumber = 1, StockItemId = item.Id, StockItem = item,
            StockCode = item.Code, StockName = item.Name, UnitCode = "EA", Quantity = 2, UnitPrice = 100, DiscountPercent = 10,
            VatPercent = 20, LineSubtotal = 200, DiscountAmount = 20, TaxAmount = 36, LineTotal = 216 });
        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>(); await db.Database.EnsureCreatedAsync();
            db.Tenants.AddRange(tenant, otherTenant); db.CustomerAccounts.Add(customer); db.StockItems.Add(item); db.SalesQuotes.Add(quote); await db.SaveChangesAsync();
        }

        using var client = app.GetTestClient(); client.DefaultRequestHeaders.Add("X-Test-Tenant", tenantA.ToString());
        client.DefaultRequestHeaders.Add("X-Test-Role", "TenantUser");
        var payload = new { code = "spring", name = "Spring promotion", discountPercent = 10m, effectiveFrom = today, effectiveThrough = today.AddDays(30), isActive = true };
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync("/api/sales/promotions/", payload)).StatusCode);
        client.DefaultRequestHeaders.Remove("X-Test-Role");
        using var created = await client.PostAsJsonAsync("/api/sales/promotions/", payload);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        using var body = JsonDocument.Parse(await created.Content.ReadAsStringAsync()); var campaignId = body.RootElement.GetProperty("id").GetGuid();

        using var applied = await client.PostAsJsonAsync($"/api/sales/promotions/{campaignId}/apply", new { quoteId = quote.Id });
        Assert.Equal(HttpStatusCode.OK, applied.StatusCode);
        using var appliedBody = JsonDocument.Parse(await applied.Content.ReadAsStringAsync());
        Assert.Equal(18m, appliedBody.RootElement.GetProperty("discountAmount").GetDecimal());
        Assert.Equal(38m, appliedBody.RootElement.GetProperty("totalDiscountAmount").GetDecimal());
        Assert.Equal(194.4m, appliedBody.RootElement.GetProperty("grandTotal").GetDecimal());
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync($"/api/sales/promotions/{campaignId}/apply", new { quoteId = quote.Id })).StatusCode);

        client.DefaultRequestHeaders.Remove("X-Test-Tenant"); client.DefaultRequestHeaders.Add("X-Test-Tenant", tenantB.ToString());
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsJsonAsync($"/api/sales/promotions/{campaignId}/apply", new { quoteId = quote.Id })).StatusCode);
        Assert.Empty(await client.GetFromJsonAsync<JsonElement[]>("/api/sales/promotions/") ?? Array.Empty<JsonElement>());

        await using var verifyScope = app.Services.CreateAsyncScope(); var verifyDb = verifyScope.ServiceProvider.GetRequiredService<TenantDbContext>();
        var persisted = await verifyDb.SalesQuotes.Include(x => x.Lines).SingleAsync(x => x.TenantId == tenantA && x.Id == quote.Id);
        Assert.Equal(194.4m, persisted.GrandTotal); Assert.Equal(38m, persisted.Lines.Single().DiscountAmount);
        var application = await verifyDb.SalesPromotionApplications.SingleAsync(x => x.TenantId == tenantA && x.QuoteId == quote.Id);
        Assert.Equal(18m, application.DiscountAmount);
    }
}
