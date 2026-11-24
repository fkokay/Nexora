using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Encodings.Web;
using System.Text.Json;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>
/// İrsaliye fiyatı ve bedelsiz satır on the in-memory standalone documents (S2 sales delivery, P2 purchase receipt). The order-based
/// documents (S1, P1, P3) lock rows with SQL Server hints and share the same <c>DeliveryLinePricing</c> rules (unit tests).
/// </summary>
public sealed class DeliveryLinePricingIntegrationTests
{
    private sealed record Seed(Guid TenantId, Guid CounterpartyId, Guid WarehouseId, Guid ItemId);

    private static async Task<(WebApplication App, HttpClient Client, Seed Seed)> StartAsync(CounterpartyType counterpartyType,
        decimal? salesListPrice = null, decimal? purchaseListPrice = null, decimal openingStockCost = 10m)
    {
        var tenantId = Guid.NewGuid();
        var tenant = new Tenant { Id = tenantId, Name = "Pricing test", Slug = $"pricing-{tenantId:N}" };
        var counterparty = new CustomerAccount { TenantId = tenantId, Tenant = tenant, Code = "CP-1", Name = "Counterparty", Type = counterpartyType, CurrencyCode = "TRY" };
        var warehouse = new Warehouse { TenantId = tenantId, Tenant = tenant, Code = "MAIN", Name = "Main warehouse" };
        var item = new StockItem { TenantId = tenantId, Tenant = tenant, Code = "MAT-1", Name = "Material", UnitCode = "EA", TrackingMode = InventoryTrackingMode.None,
            SalesListPrice = salesListPrice, SalesDiscountPercent = 5m, SalesVatPercent = 10m, PurchaseListPrice = purchaseListPrice, PriceCurrencyCode = "TRY" };
        var builder = WebApplication.CreateBuilder(); builder.WebHost.UseTestServer();
        builder.Services.AddDbContext<TenantDbContext>(o => o.UseInMemoryDatabase($"delivery-pricing-{tenantId:N}").ConfigureWarnings(w => w.Ignore(InMemoryEventId.TransactionIgnoredWarning)));
        builder.Services.AddAuthentication("pricing-test").AddScheme<AuthenticationSchemeOptions, PricingTestAuthHandler>("pricing-test", _ => { });
        builder.Services.AddAuthorization();
        var app = builder.Build(); app.UseAuthentication(); app.UseAuthorization(); app.MapStandaloneInventoryDocumentEndpoints(); await app.StartAsync();
        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>(); await db.Database.EnsureCreatedAsync();
            db.Tenants.Add(tenant); db.CustomerAccounts.Add(counterparty); db.Warehouses.Add(warehouse); db.StockItems.Add(item);
            db.InventoryTransactions.Add(new InventoryTransaction { TenantId = tenantId, WarehouseId = warehouse.Id, StockItemId = item.Id, EntryDate = new DateOnly(2026, 10, 1),
                Direction = InventoryDirection.Receipt, Quantity = 10m, UnitCostBase = openingStockCost, Description = "Opening test stock" });
            await db.SaveChangesAsync();
        }
        var client = app.GetTestClient(); client.DefaultRequestHeaders.Add("X-Test-Tenant", tenantId.ToString("D"));
        client.DefaultRequestHeaders.Add("X-Test-User", Guid.NewGuid().ToString("D"));
        return (app, client, new Seed(tenantId, counterparty.Id, warehouse.Id, item.Id));
    }

    private static object SalesLine(Guid itemId, decimal quantity, decimal? unitPrice = null, bool? isFreeOfCharge = null, decimal? vatPercent = null) =>
        new { stockItemId = itemId, quantity, unitCode = "EA", trackingCode = (string?)null, expiryDate = (string?)null, unitPrice, vatPercent, isFreeOfCharge };

    private static async Task<Guid> CreateSalesDeliveryAsync(HttpClient client, Seed seed, string code, params object[] lines)
    {
        var create = await client.PostAsJsonAsync("/api/sales/standalone-deliveries", new
        {
            requestId = Guid.NewGuid(), code, customerId = seed.CounterpartyId, warehouseId = seed.WarehouseId, deliveryDate = "2026-11-20", lines
        });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        var id = (await create.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/sales/standalone-deliveries/{id}/post", new { })).StatusCode);
        return id;
    }

    [Fact]
    public async Task Sales_delivery_rejects_a_free_line_with_a_price()
    {
        var (app, client, seed) = await StartAsync(CounterpartyType.Customer);
        await using var _ = app; using var __ = client;
        var response = await client.PostAsJsonAsync("/api/sales/standalone-deliveries", new
        {
            requestId = Guid.NewGuid(), code = "SD-FREE-PRICE", customerId = seed.CounterpartyId, warehouseId = seed.WarehouseId, deliveryDate = "2026-11-20",
            lines = new[] { SalesLine(seed.ItemId, 1m, unitPrice: 5m, isFreeOfCharge: true) }
        });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("Bedelsiz satırda fiyat girilemez.", await response.Content.ReadAsStringAsync());
        var negative = await client.PostAsJsonAsync("/api/sales/standalone-deliveries", new
        {
            requestId = Guid.NewGuid(), code = "SD-NEG", customerId = seed.CounterpartyId, warehouseId = seed.WarehouseId, deliveryDate = "2026-11-20",
            lines = new[] { SalesLine(seed.ItemId, 1m, unitPrice: -1m) }
        });
        Assert.Equal(HttpStatusCode.BadRequest, negative.StatusCode);
    }

    [Fact]
    public async Task Sales_delivery_defaults_to_the_stock_card_list_price_and_shows_partly_free_totals()
    {
        var (app, client, seed) = await StartAsync(CounterpartyType.Customer, salesListPrice: 100m);
        await using var _ = app; using var __ = client;
        var id = await CreateSalesDeliveryAsync(client, seed, "SD-LIST", SalesLine(seed.ItemId, 2m), SalesLine(seed.ItemId, 1m, isFreeOfCharge: true));
        var view = await client.GetFromJsonAsync<JsonElement>($"/api/sales/standalone-deliveries/{id}");
        var lines = view.GetProperty("lines");
        Assert.Equal(100m, lines[0].GetProperty("unitPrice").GetDecimal());
        Assert.Equal(5m, lines[0].GetProperty("discountPercent").GetDecimal());
        Assert.Equal(10m, lines[0].GetProperty("vatPercent").GetDecimal());
        Assert.Equal(190m, lines[0].GetProperty("lineNetAmount").GetDecimal());
        Assert.True(lines[1].GetProperty("isFreeOfCharge").GetBoolean());
        Assert.Equal(JsonValueKind.Null, lines[1].GetProperty("unitPrice").ValueKind);
        Assert.Equal(JsonValueKind.Null, lines[1].GetProperty("lineNetAmount").ValueKind);
        var pricing = view.GetProperty("pricing");
        Assert.Equal("PartlyFree", pricing.GetProperty("pricingState").GetString());
        Assert.Equal(190m, pricing.GetProperty("pricedNetTotal").GetDecimal());
        Assert.Equal(209m, pricing.GetProperty("pricedGrandTotal").GetDecimal());
        Assert.Equal(1, pricing.GetProperty("freeLineCount").GetInt32());
        Assert.Equal("TRY", view.GetProperty("currencyCode").GetString());
    }

    [Fact]
    public async Task Sales_invoice_takes_delivery_prices_requires_free_line_amount_and_allows_zero()
    {
        var (app, client, seed) = await StartAsync(CounterpartyType.Customer);
        await using var _ = app; using var __ = client;
        var id = await CreateSalesDeliveryAsync(client, seed, "SD-INV", SalesLine(seed.ItemId, 2m, unitPrice: 50m, vatPercent: 20m), SalesLine(seed.ItemId, 1m, isFreeOfCharge: true));

        var missing = await client.PostAsJsonAsync($"/api/sales/standalone-deliveries/{id}/invoice", new { invoiceDate = "2026-11-21" });
        Assert.Equal(HttpStatusCode.Conflict, missing.StatusCode);
        var missingBody = await missing.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Bedelsiz/fiyatsız satırların tutarını girin.", missingBody.GetProperty("error").GetString());
        Assert.Equal(2, missingBody.GetProperty("lines")[0].GetInt32());

        var invoiced = await client.PostAsJsonAsync($"/api/sales/standalone-deliveries/{id}/invoice", new
        {
            invoiceDate = "2026-11-21", lines = new[] { new { lineNumber = 2, unitPrice = 0m } }
        });
        Assert.Equal(HttpStatusCode.Created, invoiced.StatusCode);
        var invoiceId = (await invoiced.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        var invoice = await db.SalesInvoices.Include(x => x.Lines).SingleAsync(x => x.TenantId == seed.TenantId && x.Id == invoiceId);
        Assert.Equal(120m, invoice.GrandTotal);
        Assert.Equal(50m, invoice.Lines.Single(x => x.OrderLineNumber == 1).UnitPrice);
        Assert.Equal(0m, invoice.Lines.Single(x => x.OrderLineNumber == 2).LineTotal);
        // The delivery keeps its own prices; the invoice override does not change it.
        Assert.True(await db.StandaloneSalesDeliveryLines.Where(x => x.DeliveryId == id && x.LineNumber == 2).Select(x => x.IsFreeOfCharge).SingleAsync());
    }

    [Fact]
    public async Task Sales_invoice_override_changes_the_price_and_a_zero_total_is_still_refused()
    {
        var (app, client, seed) = await StartAsync(CounterpartyType.Customer);
        await using var _ = app; using var __ = client;
        var freeOnly = await CreateSalesDeliveryAsync(client, seed, "SD-ZERO", SalesLine(seed.ItemId, 1m, isFreeOfCharge: true));
        var zero = await client.PostAsJsonAsync($"/api/sales/standalone-deliveries/{freeOnly}/invoice", new
        {
            invoiceDate = "2026-11-21", lines = new[] { new { lineNumber = 1, unitPrice = 0m } }
        });
        Assert.Equal(HttpStatusCode.Conflict, zero.StatusCode);
        Assert.Contains("sıfırdan büyük", await zero.Content.ReadAsStringAsync());

        var priced = await CreateSalesDeliveryAsync(client, seed, "SD-OVR", SalesLine(seed.ItemId, 1m, unitPrice: 10m, vatPercent: 0m));
        var overridden = await client.PostAsJsonAsync($"/api/sales/standalone-deliveries/{priced}/invoice", new
        {
            invoiceDate = "2026-11-21", lines = new[] { new { lineNumber = 1, unitPrice = 12m } }
        });
        Assert.Equal(HttpStatusCode.Created, overridden.StatusCode);
        Assert.Equal(12m, (await overridden.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("grandTotal").GetDecimal());
    }

    private static object PurchaseLine(Guid itemId, decimal quantity, decimal? unitCostBase = null, decimal? unitPrice = null, bool? isFreeOfCharge = null, decimal? discountPercent = null) =>
        new { stockItemId = itemId, quantity, unitCode = "EA", unitCostBase, trackingCode = (string?)null, expiryDate = (string?)null, unitPrice, discountPercent, isFreeOfCharge };

    [Fact]
    public async Task Purchase_receipt_values_priced_lines_from_price_and_free_lines_at_a_pending_provisional_cost()
    {
        var (app, client, seed) = await StartAsync(CounterpartyType.Supplier, openingStockCost: 12m);
        await using var _ = app; using var __ = client;
        var freeWithPrice = await client.PostAsJsonAsync("/api/purchasing/standalone-receipts", new
        {
            requestId = Guid.NewGuid(), code = "GR-BAD", supplierId = seed.CounterpartyId, warehouseId = seed.WarehouseId, receiptDate = "2026-11-20",
            lines = new[] { PurchaseLine(seed.ItemId, 1m, unitPrice: 3m, isFreeOfCharge: true) }
        });
        Assert.Equal(HttpStatusCode.BadRequest, freeWithPrice.StatusCode);

        var create = await client.PostAsJsonAsync("/api/purchasing/standalone-receipts", new
        {
            requestId = Guid.NewGuid(), code = "GR-PRICED", supplierId = seed.CounterpartyId, warehouseId = seed.WarehouseId, receiptDate = "2026-11-20",
            lines = new[] { PurchaseLine(seed.ItemId, 2m, unitPrice: 20m, discountPercent: 10m), PurchaseLine(seed.ItemId, 3m, isFreeOfCharge: true) }
        });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        var id = (await create.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/purchasing/standalone-receipts/{id}/post", new { })).StatusCode);

        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            var movements = await db.InventoryTransactions.Where(x => x.TenantId == seed.TenantId && x.StandalonePurchaseReceiptLineId != null).ToListAsync();
            var lines = await db.StandalonePurchaseReceiptLines.Where(x => x.ReceiptId == id).ToDictionaryAsync(x => x.LineNumber);
            var priced = movements.Single(x => x.StandalonePurchaseReceiptLineId == lines[1].Id);
            Assert.Equal(18m, priced.UnitCostBase);
            Assert.False(priced.CostPending);
            var free = movements.Single(x => x.StandalonePurchaseReceiptLineId == lines[2].Id);
            // Provisional cost = the weighted average before the receipt (opening stock at 12), never 0 or null.
            Assert.Equal(12m, free.UnitCostBase);
            Assert.True(free.CostPending);
            Assert.True(lines[2].IsFreeOfCharge);
            Assert.Null(lines[2].UnitPrice);
        }
        var view = await client.GetFromJsonAsync<JsonElement>($"/api/purchasing/standalone-receipts/{id}");
        Assert.Equal("PartlyFree", view.GetProperty("pricing").GetProperty("pricingState").GetString());
        Assert.True(view.GetProperty("lines")[1].GetProperty("costPending").GetBoolean());
        Assert.False(view.GetProperty("lines")[0].GetProperty("costPending").GetBoolean());
    }

    [Fact]
    public async Task Purchase_receipt_without_stock_uses_the_list_price_as_provisional_cost()
    {
        var (app, client, seed) = await StartAsync(CounterpartyType.Supplier, purchaseListPrice: 7m, openingStockCost: 10m);
        await using var _ = app; using var __ = client;
        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            db.InventoryTransactions.RemoveRange(db.InventoryTransactions.Where(x => x.TenantId == seed.TenantId));
            await db.SaveChangesAsync();
        }
        var create = await client.PostAsJsonAsync("/api/purchasing/standalone-receipts", new
        {
            requestId = Guid.NewGuid(), code = "GR-FIRST", supplierId = seed.CounterpartyId, warehouseId = seed.WarehouseId, receiptDate = "2026-11-20",
            lines = new[] { PurchaseLine(seed.ItemId, 4m, isFreeOfCharge: true) }
        });
        var id = (await create.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/purchasing/standalone-receipts/{id}/post", new { })).StatusCode);
        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            var movement = await db.InventoryTransactions.SingleAsync(x => x.TenantId == seed.TenantId);
            Assert.Equal(7m, movement.UnitCostBase);
            Assert.True(movement.CostPending);
        }
    }

    private static PurchaseReceiptLine ReceiptLine(decimal quantity, decimal? unitPrice, bool free = false) => new()
    {
        OrderLineNumber = 1, StockItemId = Guid.Empty, Quantity = quantity, EnteredQuantity = quantity, UnitCode = "EA",
        UnitPrice = unitPrice, DiscountPercent = unitPrice is null ? null : 0m, VatPercent = unitPrice is null ? null : 20m, IsFreeOfCharge = free,
        OrderLine = new PurchaseOrderLine { LineNumber = 1, Quantity = 10m, UnitPrice = 100m, DiscountPercent = 0m, VatPercent = 20m }
    };

    private static readonly IReadOnlyDictionary<int, (decimal Quantity, AIERP.Platform.Application.SalesQuoteLineAmounts Amounts)> NothingInvoiced =
        new Dictionary<int, (decimal Quantity, AIERP.Platform.Application.SalesQuoteLineAmounts Amounts)>();

    [Fact]
    public void Receipt_invoice_uses_receipt_price_override_and_flags_free_lines()
    {
        var date = new DateOnly(2026, 11, 24);
        // Unchanged PO price: incremental path, 5 × 100.
        Assert.Equal(500m, Assert.Single(PurchaseInvoiceCalculation.CalculateLines([ReceiptLine(5m, 100m)], NothingInvoiced, null, date)).Amounts.LineSubtotal);
        // Receipt price differs from the PO: charged directly.
        Assert.Equal(400m, Assert.Single(PurchaseInvoiceCalculation.CalculateLines([ReceiptLine(5m, 80m)], NothingInvoiced, null, date)).Amounts.LineSubtotal);
        // Free line without an amount needs one; with an override (0 allowed) it is charged at that price.
        var free = Assert.Single(PurchaseInvoiceCalculation.CalculateLines([ReceiptLine(5m, null, free: true)], NothingInvoiced, null, date));
        Assert.True(free.RequiresAmount);
        var overridden = Assert.Single(PurchaseInvoiceCalculation.CalculateLines([ReceiptLine(5m, null, free: true)], NothingInvoiced, null, date,
            new Dictionary<int, AIERP.Platform.Application.DeliveryLinePriceInput> { [1] = new(0m) }));
        Assert.False(overridden.RequiresAmount);
        Assert.Equal((0m, 0m), (overridden.UnitPrice, overridden.Amounts.LineTotal));
        // Old receipt line without a stored price falls back to the PO line.
        Assert.Equal(100m, Assert.Single(PurchaseInvoiceCalculation.CalculateLines([ReceiptLine(5m, null)], NothingInvoiced, null, date)).UnitPrice);
    }

    [Fact]
    public void Migrations_are_expand_only_and_backfill_order_based_lines_from_their_order_lines()
    {
        foreach (var migration in new Microsoft.EntityFrameworkCore.Migrations.Migration[]
            {
                new AIERP.Platform.Infrastructure.Migrations.Platform.AddDeliveryLinePricing(),
                new AIERP.Platform.Infrastructure.Migrations.Tenant.AddTenantDeliveryLinePricing()
            })
        {
            var operations = migration.UpOperations;
            // Expand only: nothing dropped or renamed; every new price column is nullable, the free flag defaults to false.
            Assert.DoesNotContain(operations, x => x is Microsoft.EntityFrameworkCore.Migrations.Operations.DropColumnOperation
                or Microsoft.EntityFrameworkCore.Migrations.Operations.DropTableOperation
                or Microsoft.EntityFrameworkCore.Migrations.Operations.RenameColumnOperation);
            var columns = operations.OfType<Microsoft.EntityFrameworkCore.Migrations.Operations.AddColumnOperation>().ToList();
            Assert.All(columns.Where(x => x.Name is "UnitPrice" or "DiscountPercent" or "VatPercent" or "CurrencyCode"), x => Assert.True(x.IsNullable));
            Assert.All(columns.Where(x => x.Name is "IsFreeOfCharge" or "CostPending"), x => Assert.Equal(false, x.DefaultValue));
            var sql = string.Join("\n", operations.OfType<Microsoft.EntityFrameworkCore.Migrations.Operations.SqlOperation>().Select(x => x.Sql));
            // S1: order lines by tenant + order + line number, P1: PO lines likewise; headers take the order currency.
            Assert.Contains("FROM [dbo].[SalesDeliveryLines] AS l\nINNER JOIN [dbo].[SalesOrderLines] AS o", sql.Replace("\r\n", "\n"));
            Assert.Contains("o.[TenantId] = l.[TenantId] AND o.[OrderId] = l.[OrderId] AND o.[LineNumber] = l.[OrderLineNumber]", sql);
            Assert.Contains("FROM [dbo].[PurchaseReceiptLines] AS l\nINNER JOIN [dbo].[PurchaseOrderLines] AS o", sql.Replace("\r\n", "\n"));
            Assert.Contains("l.[UnitPrice] IS NULL AND l.[IsFreeOfCharge] = 0", sql);
            Assert.Contains("UPDATE d SET d.[CurrencyCode] = o.[CurrencyCode]", sql);
            // Orderless and standalone lines are never priced or marked free by the backfill.
            Assert.DoesNotContain("StandaloneSalesDeliveryLines", sql);
            Assert.DoesNotContain("StandalonePurchaseReceiptLines", sql);
            Assert.DoesNotContain("[IsFreeOfCharge] = 1", sql);
        }
    }

    private sealed class PricingTestAuthHandler(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder)
        : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
    {
        protected override Task<AuthenticateResult> HandleAuthenticateAsync()
        {
            if (!Guid.TryParse(Request.Headers["X-Test-Tenant"], out var tenantId)) return Task.FromResult(AuthenticateResult.NoResult());
            var userId = Request.Headers.TryGetValue("X-Test-User", out var value) && Guid.TryParse(value, out var parsed) ? parsed : Guid.Empty;
            var identity = new ClaimsIdentity([new Claim("tenant_id", tenantId.ToString()), new Claim("sub", userId.ToString()), new Claim("role", "TenantAdmin")], Scheme.Name);
            return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), Scheme.Name)));
        }
    }
}
