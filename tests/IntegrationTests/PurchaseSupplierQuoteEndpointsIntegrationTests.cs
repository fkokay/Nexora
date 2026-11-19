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

/// <summary>Talep olmadan doğrudan girilen tedarikçi teklifi (POST /api/purchasing/supplier-quotes/).</summary>
public sealed class PurchaseSupplierQuoteEndpointsIntegrationTests
{
    private static readonly Guid TenantId = Guid.Parse("31111111-1111-1111-1111-111111111111");
    private static readonly Guid OtherTenantId = Guid.Parse("32222222-2222-2222-2222-222222222222");
    private static readonly Guid SupplierId = Guid.Parse("e0000000-0000-0000-0000-000000000001");
    private static readonly Guid CustomerId = Guid.Parse("e0000000-0000-0000-0000-000000000002");
    private static readonly Guid StockId = Guid.Parse("f0000000-0000-0000-0000-000000000001");
    private static readonly Guid PassiveStockId = Guid.Parse("f0000000-0000-0000-0000-000000000002");
    private static readonly Guid OtherTenantStockId = Guid.Parse("f0000000-0000-0000-0000-000000000003");

    [Fact]
    public async Task Requestless_quote_is_saved_with_stock_snapshots_totals_and_readable_detail()
    {
        await using var app = await StartAsync();
        using var client = Client(app);

        var response = await client.PostAsJsonAsync("/api/purchasing/supplier-quotes/", new
        {
            code = " TKL-1 ", supplierId = SupplierId, quoteDate = "2026-11-18", validUntil = "2026-11-30", notes = "Doğrudan teklif",
            lines = new object[]
            {
                new { stockItemId = StockId, quantity = 2m, unitPrice = 50m, discountPercent = 0m, vatPercent = 20m },
                new { stockItemId = StockId, quantity = 1.5m, unitPrice = 10m }
            }
        });
        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == HttpStatusCode.Created, body);
        using var created = JsonDocument.Parse(body);
        var root = created.RootElement;
        var id = root.GetProperty("id").GetGuid();
        Assert.Equal(JsonValueKind.Null, root.GetProperty("purchaseRequestId").ValueKind);
        Assert.Equal(JsonValueKind.Null, root.GetProperty("requestCode").ValueKind);
        Assert.Equal("TKL-1", root.GetProperty("code").GetString());
        Assert.Equal("USD", root.GetProperty("currencyCode").GetString());
        // 2 × 50 + 1,5 × 10 = 115; KDV %20 (ikinci satırda varsayılan) = 23.
        Assert.Equal(115m, root.GetProperty("subtotal").GetDecimal());
        Assert.Equal(23m, root.GetProperty("taxTotal").GetDecimal());
        Assert.Equal(138m, root.GetProperty("grandTotal").GetDecimal());
        var lines = root.GetProperty("lines").EnumerateArray().ToArray();
        Assert.Equal([1, 2], lines.Select(x => x.GetProperty("requestLineNumber").GetInt32()));
        Assert.All(lines, x => Assert.Equal("STK-1", x.GetProperty("stockCode").GetString()));
        Assert.All(lines, x => Assert.Equal("KG", x.GetProperty("unitCode").GetString()));

        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            var saved = await db.PurchaseSupplierQuotes.Include(x => x.Lines).SingleAsync(x => x.Id == id);
            Assert.Null(saved.PurchaseRequestId);
            Assert.All(saved.Lines, x => { Assert.Null(x.PurchaseRequestId); Assert.Equal(StockId, x.StockItemId); });
            Assert.Equal(PurchaseSupplierQuoteStatus.Submitted, saved.Status);
            Assert.Single(await db.AuditEvents.Where(x => x.TenantId == TenantId && x.Action == "purchase-supplier-quote.created").ToListAsync());
        }

        using var detail = await GetJsonAsync(client, $"/api/purchasing/supplier-quotes/{id:D}");
        Assert.Equal(JsonValueKind.Null, detail.RootElement.GetProperty("requestCode").ValueKind);
        Assert.Equal(JsonValueKind.Null, detail.RootElement.GetProperty("requestStatus").ValueKind);
        Assert.Equal(2, detail.RootElement.GetProperty("lines").GetArrayLength());
    }

    [Fact]
    public async Task Requestless_quote_rejects_invalid_supplier_stock_lines_and_non_admins()
    {
        await using var app = await StartAsync();
        using var client = Client(app);
        object Body(Guid supplierId, Guid stockId, decimal quantity = 1m) => new
        {
            code = "TKL-X", supplierId, quoteDate = "2026-11-18", lines = new[] { new { stockItemId = stockId, quantity, unitPrice = 5m } }
        };

        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync("/api/purchasing/supplier-quotes/", Body(CustomerId, StockId))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsJsonAsync("/api/purchasing/supplier-quotes/", Body(Guid.NewGuid(), StockId))).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync("/api/purchasing/supplier-quotes/", Body(SupplierId, PassiveStockId))).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync("/api/purchasing/supplier-quotes/", Body(SupplierId, OtherTenantStockId))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/purchasing/supplier-quotes/", Body(SupplierId, StockId, 0m))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/purchasing/supplier-quotes/",
            new { code = "TKL-X", supplierId = SupplierId, quoteDate = "2026-11-18", lines = Array.Empty<object>() })).StatusCode);

        using var user = Client(app);
        user.DefaultRequestHeaders.Add("X-Test-Role", "TenantUser");
        Assert.Equal(HttpStatusCode.Forbidden, (await user.PostAsJsonAsync("/api/purchasing/supplier-quotes/", Body(SupplierId, StockId))).StatusCode);

        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        Assert.Empty(await db.PurchaseSupplierQuotes.ToListAsync());
    }

    [Fact]
    public async Task Requestless_quote_enforces_required_custom_fields()
    {
        await using var app = await StartAsync();
        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            db.PurchaseSupplierQuoteCustomFieldDefinitions.Add(new PurchaseSupplierQuoteCustomFieldDefinition
            { TenantId = TenantId, Code = "TESLIM", Label = "Teslim şekli", DataType = CustomFieldDataType.Text, MaxLength = 50, IsRequired = true });
            await db.SaveChangesAsync();
        }
        using var client = Client(app);
        object Body(string? value) => new
        {
            code = "TKL-CF", supplierId = SupplierId, quoteDate = "2026-11-18",
            lines = new[] { new { stockItemId = StockId, quantity = 1m, unitPrice = 5m } },
            customFields = new Dictionary<string, string?> { ["TESLIM"] = value }
        };

        var missing = await client.PostAsJsonAsync("/api/purchasing/supplier-quotes/", Body(""));
        Assert.Equal(HttpStatusCode.BadRequest, missing.StatusCode);
        Assert.Contains("customFields.TESLIM", await missing.Content.ReadAsStringAsync());

        var saved = await client.PostAsJsonAsync("/api/purchasing/supplier-quotes/", Body("Kapıda"));
        Assert.Equal(HttpStatusCode.Created, saved.StatusCode);
        using var json = JsonDocument.Parse(await saved.Content.ReadAsStringAsync());
        Assert.Equal("Kapıda", Assert.Single(json.RootElement.GetProperty("customFields").EnumerateArray()).GetProperty("value").GetString());
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
        var databaseName = $"supplier-quotes-{Guid.NewGuid():N}";
        builder.Services.AddDbContext<TenantDbContext>(options => options.UseInMemoryDatabase(databaseName));
        builder.Services.ConfigureHttpJsonOptions(options => options.SerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter()));
        builder.Services.AddAuthentication("report-test")
            .AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("report-test", _ => { });
        builder.Services.AddAuthorization();

        var app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapDocumentListEndpoints();
        app.MapPurchaseSupplierQuoteEndpoints();
        await app.StartAsync();
        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        await db.Database.EnsureCreatedAsync();
        var tenant = new Tenant { Id = TenantId, Name = "Tenant", Slug = "tenant", BaseCurrencyCode = "TRY" };
        var otherTenant = new Tenant { Id = OtherTenantId, Name = "Other", Slug = "other" };
        db.Tenants.AddRange(tenant, otherTenant);
        db.CustomerAccounts.AddRange(
            new CustomerAccount { Id = SupplierId, TenantId = TenantId, Tenant = tenant, Code = "S-1", Name = "Supplier", Type = CounterpartyType.Supplier, CurrencyCode = "USD" },
            new CustomerAccount { Id = CustomerId, TenantId = TenantId, Tenant = tenant, Code = "C-1", Name = "Customer", Type = CounterpartyType.Customer });
        db.StockItems.AddRange(
            new StockItem { Id = StockId, TenantId = TenantId, Tenant = tenant, Code = "STK-1", Name = "Stock", UnitCode = "KG" },
            new StockItem { Id = PassiveStockId, TenantId = TenantId, Tenant = tenant, Code = "STK-P", Name = "Passive", IsActive = false },
            new StockItem { Id = OtherTenantStockId, TenantId = OtherTenantId, Tenant = otherTenant, Code = "STK-X", Name = "Other" });
        await db.SaveChangesAsync();
        return app;
    }
}
