using System.Net;
using System.Net.Http.Json;
using AIERP.Platform.Domain;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>
/// Belge modeli satis.teklif kabulü (sunucu yarısı): ERP'nin Belge çizimi teklif için yalnız bu uçlarla çalışır — hesap (teklif gövdesi),
/// stok doldurma ve belge görünümü; kayıt notları ve teslimat koşullarını belge görünümünde geri verir.
/// </summary>
public sealed class SalesQuoteBelgeAcceptanceTests
{
    [Fact]
    public async Task Belge_endpoints_calculate_vat_return_notes_in_the_document()
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync();
        using var client = factory.Client(seed);

        // Hesap: teklif gövdesi (tarihler ve döviz ister), satırlar rowKey ile döner.
        using var preview = await client.PostAsJsonAsync("/api/sales/quotes/preview", new
        {
            customerId = seed.CustomerId, quoteDate = "2026-11-02", validUntil = "2099-12-31", currencyCode = "TRY",
            lines = new object[]
            {
                new { rowKey = "satir-1", stockItemId = seed.StockItemId, quantity = 5m, unitPrice = 10m, discountPercent = 0m, vatPercent = 20m },
                new { rowKey = "yeni-2", stockItemId = seed.StockItem2Id, quantity = 2m, unitPrice = 50m, discountPercent = 10m, vatPercent = 10m }
            }
        });
        Assert.Equal(HttpStatusCode.OK, preview.StatusCode);
        var amounts = await SalesOrderApiFactory.ReadJsonAsync(preview);
        Assert.Equal("satir-1", amounts.GetProperty("lines")[0].GetProperty("rowKey").GetString());
        Assert.Equal(50m + 90m + 19m, amounts.GetProperty("grandTotal").GetDecimal());

        // Belge görünümü: kayıt notları ve teslimat koşulları (Belge göstermese de geri gönderir) ve izinli geçişler gelir.
        var id = await factory.WithTenantDbAsync(async db =>
        {
            var item = await db.StockItems.SingleAsync(x => x.Id == seed.StockItemId);
            var quote = new SalesQuote { TenantId = seed.TenantId, CustomerId = seed.CustomerId, Code = "TKL-B", QuoteDate = new DateOnly(2026, 11, 2),
                ValidUntil = new DateOnly(2099, 12, 31), CurrencyCode = "TRY", Notes = "Fiyatlar KDV hariçtir", DeliveryTerms = "Depoda teslim",
                Subtotal = 50m, TaxTotal = 10m, GrandTotal = 60m };
            quote.RevisionGroupId = quote.Id;
            quote.Lines.Add(new SalesQuoteLine { TenantId = seed.TenantId, Quote = quote, LineNumber = 1, StockItemId = item.Id, StockCode = item.Code,
                StockName = item.Name, UnitCode = item.UnitCode, EnteredUnitCode = item.UnitCode, EnteredCurrencyCode = "TRY", EnteredUnitPrice = 10m,
                Quantity = 5m, UnitPrice = 10m, VatPercent = 20m, LineSubtotal = 50m, TaxAmount = 10m, LineTotal = 60m });
            db.SalesQuotes.Add(quote);
            await db.SaveChangesAsync();
            return quote.Id;
        });
        var document = await SalesOrderApiFactory.ReadJsonAsync(await client.GetAsync($"/api/sales/quotes/{id}/document"));
        var quoteJson = document.GetProperty("quote");
        Assert.Equal("Fiyatlar KDV hariçtir", quoteJson.GetProperty("notes").GetString());
        Assert.Equal("Depoda teslim", quoteJson.GetProperty("deliveryTerms").GetString());
        Assert.Equal(60m, document.GetProperty("amounts").GetProperty("grandTotal").GetDecimal());
        Assert.Equal(["ilet"], document.GetProperty("allowedTransitions").EnumerateArray().Select(x => x.GetString()).ToArray());
    }
}
