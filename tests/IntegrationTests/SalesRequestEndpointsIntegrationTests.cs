using System.Net;
using System.Net.Http.Json;
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

public sealed class SalesRequestEndpointsIntegrationTests
{
    private static readonly Guid TenantId = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid OtherTenantId = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid CustomerId = Guid.Parse("a1000000-0000-0000-0000-000000000001");
    private static readonly Guid SupplierId = Guid.Parse("a1000000-0000-0000-0000-000000000002");
    private static readonly Guid InactiveCustomerId = Guid.Parse("a1000000-0000-0000-0000-000000000003");
    private static readonly Guid StockId = Guid.Parse("b1000000-0000-0000-0000-000000000001");
    private static readonly Guid InactiveStockId = Guid.Parse("b1000000-0000-0000-0000-000000000002");
    private static readonly Guid QuotedRequestId = Guid.Parse("c1000000-0000-0000-0000-000000000001");
    private static readonly Guid OtherTenantRequestId = Guid.Parse("c1000000-0000-0000-0000-000000000002");

    [Fact]
    public async Task Create_stores_base_quantities_and_lists_only_own_tenant_requests()
    {
        await using var app = await StartAsync();
        using var client = Client(app);

        var created = await client.PostAsJsonAsync("/api/sales/requests/", new
        {
            code = " st-0001 ", customerId = CustomerId, requestDate = "2026-11-10", neededByDate = "2026-11-20", description = "  Şantiye için  ",
            lines = new object[] { new { stockItemId = StockId, quantity = 2m, unitCode = "pal" }, new { stockItemId = StockId, quantity = 1.5m } }
        });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        using var summary = JsonDocument.Parse(await created.Content.ReadAsStringAsync());
        Assert.Equal("ST-0001", summary.RootElement.GetProperty("code").GetString());
        Assert.Equal("Open", summary.RootElement.GetProperty("status").GetString());
        var id = summary.RootElement.GetProperty("id").GetGuid();

        using var detail = await GetJsonAsync(client, $"/api/sales/requests/{id:D}");
        Assert.Equal("Şantiye için", detail.RootElement.GetProperty("description").GetString());
        Assert.Equal("EUR", detail.RootElement.GetProperty("currencyCode").GetString());
        var lines = detail.RootElement.GetProperty("lines").EnumerateArray().ToList();
        // 2 palet × 40 = 80 temel birim; girilen miktar ve birim ayrıca saklanır.
        Assert.Equal(80m, lines[0].GetProperty("quantity").GetDecimal());
        Assert.Equal("EA", lines[0].GetProperty("unitCode").GetString());
        Assert.Equal(2m, lines[0].GetProperty("enteredQuantity").GetDecimal());
        Assert.Equal("PAL", lines[0].GetProperty("enteredUnitCode").GetString());
        Assert.Equal(1.5m, lines[1].GetProperty("quantity").GetDecimal());
        Assert.Equal(JsonValueKind.Null, lines[1].GetProperty("enteredQuantity").ValueKind);

        using var list = await GetJsonAsync(client, "/api/sales/requests/");
        Assert.Equal(2, list.RootElement.GetProperty("totalCount").GetInt32());
        Assert.DoesNotContain(list.RootElement.GetProperty("items").EnumerateArray(), x => x.GetProperty("code").GetString() == "OTHER-1");
        using var searched = await GetJsonAsync(client, "/api/sales/requests/?q=ST-0001");
        Assert.Equal(2, Assert.Single(searched.RootElement.GetProperty("items").EnumerateArray()).GetProperty("lineCount").GetInt32());

        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        Assert.Single(await db.AuditEvents.Where(x => x.TenantId == TenantId && x.Action == "sales-request.created" && x.Resource == "ST-0001").ToListAsync());
    }

    [Fact]
    public async Task Create_rejects_invalid_input_without_writing_anything()
    {
        await using var app = await StartAsync();
        using var client = Client(app);
        object Body(object? code = null, Guid? customerId = null, string neededBy = "2026-11-20", object[]? lines = null) => new
        {
            code = code ?? "NEW-1", customerId = customerId ?? CustomerId, requestDate = "2026-11-10", neededByDate = neededBy,
            lines = lines ?? [new { stockItemId = StockId, quantity = 1m }]
        };

        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/sales/requests/", Body(code: " "))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/sales/requests/", Body(neededBy: "2026-11-09"))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/sales/requests/", Body(lines: []))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/sales/requests/", Body(lines: [new { stockItemId = StockId, quantity = 0m }]))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/sales/requests/", Body(lines: [new { stockItemId = StockId, quantity = 1.23456m }]))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/sales/requests/", Body(lines: [new { stockItemId = InactiveStockId, quantity = 1m }]))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/sales/requests/", Body(lines: [new { stockItemId = StockId, quantity = 1m, unitCode = "BOX" }]))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/sales/requests/", Body(customerId: SupplierId))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/sales/requests/", Body(customerId: InactiveCustomerId))).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync("/api/sales/requests/", Body(code: "quoted-1"))).StatusCode);

        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        Assert.Equal(1, await db.SalesRequests.CountAsync(x => x.TenantId == TenantId));
        Assert.Empty(await db.AuditEvents.Where(x => x.TenantId == TenantId && x.Action == "sales-request.created").ToListAsync());
    }

    [Fact]
    public async Task Cancel_requires_a_reason_and_only_applies_to_open_requests_of_the_same_tenant()
    {
        await using var app = await StartAsync();
        using var client = Client(app);
        var created = await client.PostAsJsonAsync("/api/sales/requests/", new
        {
            code = "OPEN-1", customerId = CustomerId, requestDate = "2026-11-10", lines = new[] { new { stockItemId = StockId, quantity = 1m } }
        });
        created.EnsureSuccessStatusCode();
        using var summary = JsonDocument.Parse(await created.Content.ReadAsStringAsync());
        var id = summary.RootElement.GetProperty("id").GetGuid();

        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync($"/api/sales/requests/{id:D}/cancel", new { reason = " " })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync($"/api/sales/requests/{QuotedRequestId:D}/cancel", new { reason = "Vazgeçildi" })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsJsonAsync($"/api/sales/requests/{OtherTenantRequestId:D}/cancel", new { reason = "Vazgeçildi" })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/sales/requests/{OtherTenantRequestId:D}")).StatusCode);

        var cancelled = await client.PostAsJsonAsync($"/api/sales/requests/{id:D}/cancel", new { reason = " Müşteri vazgeçti " });
        cancelled.EnsureSuccessStatusCode();
        using var view = JsonDocument.Parse(await cancelled.Content.ReadAsStringAsync());
        Assert.Equal("Cancelled", view.RootElement.GetProperty("status").GetString());
        Assert.Equal("Müşteri vazgeçti", view.RootElement.GetProperty("cancelReason").GetString());
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync($"/api/sales/requests/{id:D}/cancel", new { reason = "Tekrar" })).StatusCode);

        using var quoted = await GetJsonAsync(client, $"/api/sales/requests/{QuotedRequestId:D}");
        Assert.Equal("Quoted", quoted.RootElement.GetProperty("status").GetString());
        var quote = Assert.Single(quoted.RootElement.GetProperty("quotes").EnumerateArray());
        Assert.Equal("Q-1", quote.GetProperty("code").GetString());
        Assert.Equal(250m, quote.GetProperty("grandTotal").GetDecimal());
    }

    private static HttpClient Client(WebApplication app)
    {
        var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantId.ToString());
        return client;
    }

    private static async Task<JsonDocument> GetJsonAsync(HttpClient client, string url)
    {
        var response = await client.GetAsync(url);
        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.IsSuccessStatusCode, $"{url} -> {(int)response.StatusCode}: {body}");
        return JsonDocument.Parse(body);
    }

    private static async Task<WebApplication> StartAsync()
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        var databaseName = $"sales-requests-{Guid.NewGuid():N}";
        builder.Services.AddDbContext<TenantDbContext>(options => options.UseInMemoryDatabase(databaseName));
        builder.Services.ConfigureHttpJsonOptions(options => options.SerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter()));
        builder.Services.AddAuthentication("report-test")
            .AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("report-test", _ => { });
        builder.Services.AddAuthorization();

        var app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapSalesRequestEndpoints();
        await app.StartAsync();

        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        await db.Database.EnsureCreatedAsync();
        var tenant = new Tenant { Id = TenantId, Name = "Tenant", Slug = "tenant" };
        var otherTenant = new Tenant { Id = OtherTenantId, Name = "Other", Slug = "other" };
        var customer = new CustomerAccount { Id = CustomerId, TenantId = TenantId, Tenant = tenant, Code = "C-1", Name = "Customer", Type = CounterpartyType.Customer, CurrencyCode = "EUR" };
        var otherCustomer = new CustomerAccount { TenantId = OtherTenantId, Tenant = otherTenant, Code = "C-X", Name = "Other customer", Type = CounterpartyType.Customer };
        db.CustomerAccounts.AddRange(customer, otherCustomer,
            new CustomerAccount { Id = SupplierId, TenantId = TenantId, Tenant = tenant, Code = "S-1", Name = "Supplier", Type = CounterpartyType.Supplier },
            new CustomerAccount { Id = InactiveCustomerId, TenantId = TenantId, Tenant = tenant, Code = "C-2", Name = "Inactive", Type = CounterpartyType.Customer, IsActive = false });
        db.StockItems.AddRange(
            new StockItem { Id = StockId, TenantId = TenantId, Tenant = tenant, Code = "STK-1", Name = "Stock", UnitCode = "EA" },
            new StockItem { Id = InactiveStockId, TenantId = TenantId, Tenant = tenant, Code = "STK-2", Name = "Inactive stock", UnitCode = "EA", IsActive = false });
        db.StockItemUnitConversions.Add(new StockItemUnitConversion { TenantId = TenantId, StockItemId = StockId, UnitCode = "PAL", FactorToBase = 40m });
        var quotedRequest = new SalesRequest { Id = QuotedRequestId, TenantId = TenantId, Customer = customer, Code = "QUOTED-1", RequestDate = new DateOnly(2026, 11, 1), Status = SalesRequestStatus.Quoted };
        db.SalesRequests.AddRange(quotedRequest,
            new SalesRequest { Id = OtherTenantRequestId, TenantId = OtherTenantId, Customer = otherCustomer, Code = "OTHER-1", RequestDate = new DateOnly(2026, 11, 12) });
        db.SalesQuotes.Add(new SalesQuote
        {
            TenantId = TenantId, Tenant = tenant, Customer = customer, SourceSalesRequest = quotedRequest, Code = "Q-1",
            QuoteDate = new DateOnly(2026, 11, 2), ValidUntil = new DateOnly(2026, 11, 30), CurrencyCode = "EUR", GrandTotal = 250m
        });
        await db.SaveChangesAsync();
        return app;
    }
}
