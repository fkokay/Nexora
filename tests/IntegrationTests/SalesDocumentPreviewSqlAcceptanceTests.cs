using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using AIERP.Platform.Domain;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>
/// Satış Aşama B (P2) on SQL Server: the quote POST / PUT, order POST and standalone invoice POST handlers store exactly the
/// amounts their previews return (the writes take UPDLOCK reads, which the InMemory provider cannot run). Skipped without a
/// disposable SQL Server.
/// </summary>
[Collection("SQL Server acceptance")]
public sealed class SalesDocumentPreviewSqlAcceptanceTests
{
    [SqlServerAcceptanceFact]
    public async Task Writes_store_what_their_previews_return()
    {
        await using var harness = await FiscalCloseRouteSqlAcceptanceHarness.CreateAsync("SalesPreview");
        var tenantId = harness.TenantId;
        var customer = new CustomerAccount { TenantId = tenantId, Code = "C-PRV", Name = "Synthetic customer", Type = CounterpartyType.Customer, CurrencyCode = "TRY", IsActive = true };
        var warehouse = new Warehouse { TenantId = tenantId, Code = "WH-PRV", Name = "Synthetic warehouse" };
        var item = new StockItem { TenantId = tenantId, Code = "S-PRV", Name = "Synthetic stock", UnitCode = "KG", TrackingMode = InventoryTrackingMode.None };
        await using (var seedDb = harness.NewTenantDb())
        {
            seedDb.Tenants.Add(harness.Tenant);
            seedDb.CustomerAccounts.Add(customer);
            seedDb.Warehouses.Add(warehouse);
            seedDb.StockItems.Add(item);
            seedDb.StockItemUnitConversions.Add(new StockItemUnitConversion { TenantId = tenantId, StockItemId = item.Id, UnitCode = "TON", FactorToBase = 1000m });
            seedDb.TenantExchangeRates.Add(new TenantExchangeRate { TenantId = tenantId, CurrencyCode = "USD", RateDate = new DateOnly(2026, 11, 1), Rate = 32.5m });
            seedDb.InventoryTransactions.Add(new InventoryTransaction { TenantId = tenantId, Warehouse = warehouse, StockItem = item, EntryDate = new DateOnly(2026, 11, 1),
                Direction = InventoryDirection.Receipt, Quantity = 100000m, UnitCostBase = 1m, Description = "Synthetic opening stock" });
            seedDb.AccountingRuleProfiles.Add(new AccountingRuleProfile
            {
                TenantId = tenantId, ProfileCode = "TR-PRV", EffectiveFrom = new DateOnly(2026, 1, 1),
                ParametersJson = """{"taxRules":[{"code":"OTV","name":"ÖTV","rate":10,"operationType":"Sales","treatment":"Additive","calculationBase":"Net"},{"code":"TEV","name":"Tevkifat","rate":5,"operationType":"Sales","treatment":"Withholding","calculationBase":"Net"}]}"""
            });
            await seedDb.SaveChangesAsync();
        }
        harness.StartApi();

        async Task<JsonElement> Send(HttpMethod method, string url, object body, HttpStatusCode expected)
        {
            using var response = await harness.Client.SendAsync(new HttpRequestMessage(method, url) { Content = JsonContent.Create(body) });
            Assert.True(response.StatusCode == expected, $"{url} {response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
            return await response.Content.ReadFromJsonAsync<JsonElement>();
        }
        static void SameLine(JsonElement preview, decimal quantity, decimal unitPrice, decimal subtotal, decimal discount, decimal tax, decimal total) =>
            Assert.Equal((quantity, unitPrice, subtotal, discount, tax, total), (preview.GetProperty("quantity").GetDecimal(),
                preview.GetProperty("unitPrice").GetDecimal(), preview.GetProperty("lineSubtotal").GetDecimal(), preview.GetProperty("discountAmount").GetDecimal(),
                preview.GetProperty("taxAmount").GetDecimal(), preview.GetProperty("lineTotal").GetDecimal()));
        static void SameTotals(JsonElement preview, decimal subtotal, decimal discount, decimal tax, decimal grand) =>
            Assert.Equal((subtotal, discount, tax, grand), (preview.GetProperty("subtotal").GetDecimal(), preview.GetProperty("discountTotal").GetDecimal(),
                preview.GetProperty("taxTotal").GetDecimal(), preview.GetProperty("grandTotal").GetDecimal()));

        // ---- Quote POST and PUT ----
        object QuoteBody(object[] lines) => new { code = "", customerId = customer.Id, quoteDate = "2026-11-20", validUntil = "2026-12-20", currencyCode = "TRY", lines };
        object[] quoteLines =
        [
            new { stockItemId = item.Id, quantity = 2m, unitPrice = 100m, discountPercent = 10m, vatPercent = 20m, unitCode = "TON", currencyCode = "USD" },
            new { stockItemId = item.Id, quantity = 3m, unitPrice = 33.335m, discountPercent = 2.5m, vatPercent = 8m, isVatIncluded = true },
            new { stockItemId = item.Id, quantity = 1m, unitPrice = 10m, currencyCode = "USD", exchangeRateToQuoteCurrency = 30m }
        ];
        var quotePreview = await Send(HttpMethod.Post, "/api/sales/quotes/preview", QuoteBody(quoteLines), HttpStatusCode.OK);
        var quoteId = (await Send(HttpMethod.Post, "/api/sales/quotes", QuoteBody(quoteLines), HttpStatusCode.Created)).GetProperty("id").GetGuid();
        await AssertQuoteAsync(quoteId, quotePreview);
        object[] editedLines = [new { stockItemId = item.Id, quantity = 0.5m, unitPrice = 7777.7777m, discountPercent = 33.33m, vatPercent = 18m, unitCode = "TON" }];
        var editPreview = await Send(HttpMethod.Post, "/api/sales/quotes/preview", QuoteBody(editedLines), HttpStatusCode.OK);
        string quoteCode;
        await using (var db = harness.NewTenantDb()) quoteCode = (await db.SalesQuotes.SingleAsync(x => x.Id == quoteId)).Code;
        await Send(HttpMethod.Put, $"/api/sales/quotes/{quoteId}", new { code = quoteCode, customerId = customer.Id, quoteDate = "2026-11-20", validUntil = "2026-12-20",
            currencyCode = "TRY", lines = editedLines }, HttpStatusCode.OK);
        await AssertQuoteAsync(quoteId, editPreview);

        async Task AssertQuoteAsync(Guid id, JsonElement preview)
        {
            await using var db = harness.NewTenantDb();
            var quote = await db.SalesQuotes.AsNoTracking().Include(x => x.Lines).SingleAsync(x => x.Id == id);
            SameTotals(preview, quote.Subtotal, quote.DiscountTotal, quote.TaxTotal, quote.GrandTotal);
            foreach (var line in quote.Lines)
                SameLine(preview.GetProperty("lines")[line.LineNumber - 1], line.Quantity, line.UnitPrice, line.LineSubtotal, line.DiscountAmount, line.TaxAmount, line.LineTotal);
        }

        // ---- Order POST ----
        object OrderBody(object[] lines) => new { code = "", customerId = customer.Id, orderDate = "2026-11-20", currencyCode = "TRY", lines };
        var orderPreview = await Send(HttpMethod.Post, "/api/sales/orders/preview", OrderBody(quoteLines.Take(2).ToArray()), HttpStatusCode.OK);
        var orderId = (await Send(HttpMethod.Post, "/api/sales/orders", OrderBody(quoteLines.Take(2).ToArray()), HttpStatusCode.Created)).GetProperty("id").GetGuid();
        await using (var db = harness.NewTenantDb())
        {
            var order = await db.SalesOrders.AsNoTracking().Include(x => x.Lines).SingleAsync(x => x.Id == orderId);
            SameTotals(orderPreview, order.Subtotal, order.DiscountTotal, order.TaxTotal, order.GrandTotal);
            foreach (var line in order.Lines)
                SameLine(orderPreview.GetProperty("lines")[line.LineNumber - 1], line.Quantity, line.UnitPrice, line.LineSubtotal, line.DiscountAmount, line.TaxAmount, line.LineTotal);
        }

        // ---- Standalone invoice POST (Retail, tax profile with extra tax and withholding) ----
        object InvoiceBody(Guid? requestId) => new
        {
            requestId, customerId = customer.Id, warehouseId = warehouse.Id, invoiceDate = "2026-11-20", invoiceType = "Retail",
            lines = new object[]
            {
                new { stockItemId = item.Id, quantity = 3m, unitPrice = 118m, discountPercent = 5m, vatPercent = 18m, warehouseId = warehouse.Id },
                new { stockItemId = item.Id, quantity = 7m, unitPrice = 12.3456m, discountPercent = 0m, vatPercent = 1m, warehouseId = warehouse.Id }
            }
        };
        var invoicePreview = await Send(HttpMethod.Post, "/api/sales/invoices/preview", InvoiceBody(null), HttpStatusCode.OK);
        Assert.Equal("TR-PRV", invoicePreview.GetProperty("accountingProfileCode").GetString());
        var invoiceId = (await Send(HttpMethod.Post, "/api/sales/invoices", InvoiceBody(Guid.NewGuid()), HttpStatusCode.Created)).GetProperty("id").GetGuid();
        await using (var db = harness.NewTenantDb())
        {
            var invoice = await db.SalesInvoices.AsNoTracking().Include(x => x.Lines).SingleAsync(x => x.Id == invoiceId);
            SameTotals(invoicePreview, invoice.Subtotal, invoice.DiscountTotal, invoice.TaxTotal, invoice.GrandTotal);
            Assert.Equal(AIERP.Platform.Application.AccountingRuleTaxCalculator.SumWithholding(invoice.TaxBreakdownJson),
                invoicePreview.GetProperty("withholdingTotal").GetDecimal());
            foreach (var line in invoice.Lines)
                SameLine(invoicePreview.GetProperty("lines")[line.OrderLineNumber - 1], line.Quantity, line.UnitPrice, line.LineSubtotal, line.DiscountAmount, line.TaxAmount, line.LineTotal);
        }
    }
}
