using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using AIERP.Platform.Domain;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>
/// Belge kuralları PR 2, §7 kabul (sunucu yarısı): Studio'nun Belge panelinin ürettiği sipariş sayfası (Fixtures/Belge/definition.json)
/// §2 ayarlarından hiçbirini taşımaz ve geçerlidir; ERP'nin Belge çizimi yalnız bu uçlarla G-S7, G-S8 ve G-S9'u karşılar.
/// </summary>
public sealed class SalesOrderBelgeAcceptanceTests
{
    private static readonly string[] Section2Settings = ["fillQuery", "fillColumns", "lookupFills", "formulas", "editableGrid", "calc:", "gridColumns"];

    [Fact]
    public void Studio_belge_page_is_valid_and_carries_no_section_2_settings()
    {
        var json = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "BelgeFixtures", "definition.json"));

        Assert.True(TenantCustomPageSchema.Validate(json, out var error), error);
        foreach (var setting in Section2Settings) Assert.DoesNotContain(setting, json);
    }

    [Fact]
    public async Task Belge_endpoints_load_lines_calculate_vat_and_fill_stock()
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync();
        var orderId = await factory.SeedOrderAsync(seed, SalesOrderStatus.Draft, quantity: 4m);
        using var client = factory.Client(seed);

        // G-S7: var olan satırlar girilen değerleriyle düzenlenebilir yüklenir.
        var document = await SalesOrderApiFactory.ReadJsonAsync(await client.GetAsync($"/api/sales/orders/{orderId}/document"));
        var line = document.GetProperty("order").GetProperty("lines")[0];
        Assert.Equal(4m, line.GetProperty("quantity").GetDecimal());
        Assert.Equal(10m, line.GetProperty("enteredUnitPrice").GetDecimal());
        Assert.Contains("onayla", document.GetProperty("allowedTransitions").EnumerateArray().Select(x => x.GetString()));

        // G-S8: miktar değişince sunucu satır tutarını, KDV dökümünü ve toplamları hesaplar.
        using var preview = await client.PostAsJsonAsync("/api/sales/orders/preview", new
        {
            customerId = seed.CustomerId, orderDate = "2026-11-02", currencyCode = "TRY",
            lines = new object[]
            {
                new { rowKey = "satir-1", stockItemId = seed.StockItemId, quantity = 5m, unitPrice = 10m, discountPercent = 0m, vatPercent = 20m },
                new { rowKey = "yeni-2", stockItemId = seed.StockItem2Id, quantity = 2m, unitPrice = 50m, discountPercent = 10m, vatPercent = 10m }
            }
        });
        Assert.Equal(HttpStatusCode.OK, preview.StatusCode);
        var amounts = await SalesOrderApiFactory.ReadJsonAsync(preview);
        Assert.Equal(60m, amounts.GetProperty("lines")[0].GetProperty("lineTotal").GetDecimal());
        Assert.Equal("satir-1", amounts.GetProperty("lines")[0].GetProperty("rowKey").GetString());
        var vat = amounts.GetProperty("taxes").EnumerateArray().Where(x => x.GetProperty("code").GetString() == "VAT")
            .ToDictionary(x => x.GetProperty("rate").GetDecimal(), x => x.GetProperty("amount").GetDecimal());
        Assert.Equal(10m, vat[20m]);
        Assert.Equal(9m, vat[10m]);
        Assert.Equal(50m + 90m + 19m, amounts.GetProperty("grandTotal").GetDecimal());

        // G-S9: stok seçilince birim, fiyat, KDV, iskonto, döviz ve kullanılabilir miktar dolar.
        using var fill = await client.PostAsJsonAsync("/api/document-models/satis.siparis/fill", new { field = "stockItemId", value = seed.StockItemId.ToString("D") });
        var values = (await SalesOrderApiFactory.ReadJsonAsync(fill)).GetProperty("values");
        foreach (var code in new[] { "unitCode", "unitPrice", "vatPercent", "discountPercent", "currencyCode", "availableQuantity" })
            Assert.True(values.TryGetProperty(code, out _), code);
    }
}
