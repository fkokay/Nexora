using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using AIERP.Platform.Domain;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>
/// Belge kuralları PR 1 on SQL Server: the routes that take UPDLOCK reads (quote conversion, deliveries, invoices and their voids)
/// follow the sales order state chain end to end. Skipped without a disposable SQL Server.
/// </summary>
[Collection("SQL Server acceptance")]
public sealed class SalesOrderStateChainSqlAcceptanceTests
{
    [SqlServerAcceptanceFact]
    public async Task Order_walks_draft_approved_shipped_invoiced_and_back()
    {
        await using var harness = await FiscalCloseRouteSqlAcceptanceHarness.CreateAsync("SalesChain");
        var tenantId = harness.TenantId;
        var customer = new CustomerAccount { TenantId = tenantId, Code = "C-CHN", Name = "Synthetic customer", Type = CounterpartyType.Customer, CurrencyCode = "TRY", IsActive = true };
        var warehouse = new Warehouse { TenantId = tenantId, Code = "WH-CHN", Name = "Synthetic warehouse" };
        var item = new StockItem { TenantId = tenantId, Code = "S-CHN", Name = "Synthetic stock", UnitCode = "KG", TrackingMode = InventoryTrackingMode.None };
        var quote = new SalesQuote { TenantId = tenantId, Code = "TKL-CHN", CustomerId = customer.Id, QuoteDate = new DateOnly(2026, 11, 20),
            ValidUntil = new DateOnly(2026, 12, 20), CurrencyCode = "TRY", Status = SalesQuoteStatus.Accepted, Subtotal = 20m, TaxTotal = 4m, GrandTotal = 24m };
        await using (var seedDb = harness.NewTenantDb())
        {
            seedDb.Tenants.Add(harness.Tenant);
            seedDb.CustomerAccounts.Add(customer);
            seedDb.Warehouses.Add(warehouse);
            seedDb.StockItems.Add(item);
            seedDb.InventoryTransactions.Add(new InventoryTransaction { TenantId = tenantId, Warehouse = warehouse, StockItem = item, EntryDate = new DateOnly(2026, 11, 1),
                Direction = InventoryDirection.Receipt, Quantity = 1000m, UnitCostBase = 1m, Description = "Synthetic opening stock" });
            quote.RevisionGroupId = quote.Id;
            seedDb.SalesQuotes.Add(quote);
            seedDb.SalesQuoteLines.Add(new SalesQuoteLine { TenantId = tenantId, Quote = quote, LineNumber = 1, StockItemId = item.Id, StockCode = item.Code,
                StockName = item.Name, UnitCode = "KG", EnteredUnitCode = "KG", Quantity = 2m, UnitPrice = 10m, EnteredUnitPrice = 10m, VatPercent = 20m,
                LineSubtotal = 20m, TaxAmount = 4m, LineTotal = 24m });
            await seedDb.SaveChangesAsync();
        }
        harness.StartApi();

        async Task<JsonElement> Send(HttpMethod method, string url, object? body, HttpStatusCode expected)
        {
            using var request = new HttpRequestMessage(method, url) { Content = body is null ? null : JsonContent.Create(body) };
            using var response = await harness.Client.SendAsync(request);
            var text = await response.Content.ReadAsStringAsync();
            Assert.True(response.StatusCode == expected, $"{url} {response.StatusCode}: {text}");
            return text.Length == 0 ? default : JsonDocument.Parse(text).RootElement.Clone();
        }
        async Task<SalesOrderStatus> StatusAsync(Guid orderId)
        {
            await using var db = harness.NewTenantDb();
            return (await db.SalesOrders.AsNoTracking().SingleAsync(x => x.Id == orderId)).Status;
        }
        object Delivery(decimal quantity) => new { requestId = Guid.NewGuid(), warehouseId = warehouse.Id, deliveryDate = "2026-11-21",
            lines = new object[] { new { orderLineNumber = 1, quantity } } };

        // Quote conversion writes a draft; a draft cannot be shipped.
        var converted = await Send(HttpMethod.Post, $"/api/sales/quotes/{quote.Id}/convert-to-order", null, HttpStatusCode.Created);
        Assert.Equal("Draft", converted.GetProperty("status").GetString());
        var fromQuote = converted.GetProperty("id").GetGuid();
        await Send(HttpMethod.Post, $"/api/sales/orders/{fromQuote}/deliveries", Delivery(1m), HttpStatusCode.Conflict);

        // A cancelled converted order keeps the quote link: the quote cannot be converted again.
        await Send(HttpMethod.Post, $"/api/sales/orders/{fromQuote}/cancel", new { reason = "Müşteri vazgeçti" }, HttpStatusCode.OK);
        await Send(HttpMethod.Post, $"/api/sales/quotes/{quote.Id}/convert-to-order", null, HttpStatusCode.Conflict);

        // Direct order: draft → approve (UPDLOCK path) → partial and full delivery.
        var created = await Send(HttpMethod.Post, "/api/sales/orders", new { code = "", customerId = customer.Id, orderDate = "2026-11-20", currencyCode = "TRY",
            lines = new object[] { new { stockItemId = item.Id, quantity = 4m, unitPrice = 10m, vatPercent = 20m } } }, HttpStatusCode.Created);
        var orderId = created.GetProperty("id").GetGuid();
        Assert.Equal("Draft", created.GetProperty("status").GetString());
        await Send(HttpMethod.Post, $"/api/sales/orders/{orderId}/approve", new { requestId = Guid.NewGuid() }, HttpStatusCode.OK);
        var first = (await Send(HttpMethod.Post, $"/api/sales/orders/{orderId}/deliveries", Delivery(1m), HttpStatusCode.Created)).GetProperty("id").GetGuid();
        Assert.Equal(SalesOrderStatus.Open, await StatusAsync(orderId));
        var second = (await Send(HttpMethod.Post, $"/api/sales/orders/{orderId}/deliveries", Delivery(3m), HttpStatusCode.Created)).GetProperty("id").GetGuid();
        Assert.Equal(SalesOrderStatus.Fulfilled, await StatusAsync(orderId));

        // Invoices: one of two deliveries keeps "Sevk edildi"; both make "Faturalandı".
        await Send(HttpMethod.Post, $"/api/sales/deliveries/{first}/invoice", null, HttpStatusCode.Created);
        Assert.Equal(SalesOrderStatus.Fulfilled, await StatusAsync(orderId));
        var secondInvoice = (await Send(HttpMethod.Post, $"/api/sales/deliveries/{second}/invoice", null, HttpStatusCode.Created)).GetProperty("id").GetGuid();
        Assert.Equal(SalesOrderStatus.Invoiced, await StatusAsync(orderId));

        // Voids step back: invoice void → Sevk edildi, then delivery void → Onaylı.
        await Send(HttpMethod.Post, $"/api/sales/invoices/{secondInvoice}/void", null, HttpStatusCode.OK);
        Assert.Equal(SalesOrderStatus.Fulfilled, await StatusAsync(orderId));
        await Send(HttpMethod.Post, $"/api/sales/deliveries/{second}/void", null, HttpStatusCode.OK);
        Assert.Equal(SalesOrderStatus.Open, await StatusAsync(orderId));

        await using (var db = harness.NewTenantDb())
        {
            var steps = await db.TenantDocumentActivities.AsNoTracking().Where(x => x.DocumentId == orderId).OrderBy(x => x.CreatedAt)
                .Select(x => x.Step).ToListAsync();
            Assert.Equal(["Kontroller", "Onaylandı", "Sevk edildi", "Faturalandı", "Sevk edildi", "Onaylıya döndü"], steps);
        }
    }
}
