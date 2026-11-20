using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using Xunit;
using static AIERP.Api.IntegrationTests.ErpOperationCatalogTests;

namespace AIERP.Api.IntegrationTests;

/// <summary>Proje 4: includeInactive, row status and page summary of both balance page routes.</summary>
public sealed class InventoryBalancePageAdditionsTests
{
    private static readonly Guid WarehouseId = Guid.Parse("dddddddd-dddd-dddd-dddd-dddddddddddd");
    private const string AllRoute = "/api/warehouses/balances/page";
    private static readonly string WarehouseRoute = $"/api/warehouses/{WarehouseId:D}/balances/page";
    private static readonly string[] Routes = [AllRoute, WarehouseRoute];

    private sealed record Card(string Code, decimal MinimumStock, bool IsActive, decimal Receipt, decimal? UnitCost, string UnitCode = "EA");

    private static async Task<HttpClient> ArrangeAsync(ErpOperationApiFactory factory, string baseCurrency, params Card[] cards)
    {
        await SeedAsync(factory, _ => { });
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            db.Tenants.AddRange(new Tenant { Id = TenantA, Name = "A", Slug = "tenant-a", BaseCurrencyCode = baseCurrency },
                new Tenant { Id = TenantB, Name = "B", Slug = "tenant-b" });
            db.Warehouses.Add(new Warehouse { Id = WarehouseId, TenantId = TenantA, Code = "A", Name = "Ana depo", IsActive = true });
            foreach (var card in cards)
            {
                var item = new StockItem
                {
                    TenantId = TenantA, Code = card.Code, Name = card.Code, UnitCode = card.UnitCode, MinimumStock = card.MinimumStock, IsActive = card.IsActive
                };
                db.StockItems.Add(item);
                if (card.Receipt > 0)
                    db.InventoryTransactions.Add(new InventoryTransaction
                    {
                        TenantId = TenantA, WarehouseId = WarehouseId, StockItemId = item.Id, EntryDate = new DateOnly(2026, 11, 1),
                        Direction = InventoryDirection.Receipt, Quantity = card.Receipt, UnitCostBase = card.UnitCost, Description = "Giriş"
                    });
            }
            // Another tenant's card never shows up.
            db.StockItems.Add(new StockItem { TenantId = TenantB, Code = "B-1", Name = "B-1", UnitCode = "EA", IsActive = true });
            await db.SaveChangesAsync();
        }
        var client = factory.CreateClient();
        SetIdentity(client, Admin, "TenantAdmin");
        return client;
    }

    private static async Task<JsonElement> GetPageAsync(HttpClient client, string route, string query = "")
    {
        using var response = await client.GetAsync(route + query);
        Assert.True(response.StatusCode == HttpStatusCode.OK, $"{route}{query} {response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
        return await response.Content.ReadFromJsonAsync<JsonElement>();
    }

    private static string[] Codes(JsonElement page) =>
        page.GetProperty("items").EnumerateArray().Select(x => x.GetProperty("balance").GetProperty("code").GetString()!).ToArray();

    private static Dictionary<string, string> Statuses(JsonElement page) =>
        page.GetProperty("items").EnumerateArray().ToDictionary(
            x => x.GetProperty("balance").GetProperty("code").GetString()!, x => x.GetProperty("status").GetString()!);

    [Fact]
    public async Task Default_page_excludes_inactive_cards()
    {
        await using var factory = new ErpOperationApiFactory();
        using var client = await ArrangeAsync(factory, "TRY", new Card("AKTIF", 0, true, 1, 1), new Card("PASIF", 0, false, 1, 1));
        foreach (var route in Routes)
        {
            var page = await GetPageAsync(client, route);
            Assert.Equal(["AKTIF"], Codes(page));
            Assert.Equal(1, page.GetProperty("totalCount").GetInt32());
            Assert.Equal(["AKTIF"], Codes(await GetPageAsync(client, route, "?includeInactive=false")));
        }
    }

    [Fact]
    public async Task Include_inactive_returns_inactive_with_status_pasif()
    {
        await using var factory = new ErpOperationApiFactory();
        // The inactive card is also below minimum and unvalued: Pasif wins.
        using var client = await ArrangeAsync(factory, "TRY", new Card("AKTIF", 0, true, 1, 1), new Card("PASIF", 5, false, 1, null));
        foreach (var route in Routes)
        {
            var page = await GetPageAsync(client, route, "?includeInactive=true");
            Assert.Equal(2, page.GetProperty("totalCount").GetInt32());
            var statuses = Statuses(page);
            Assert.Equal("Pasif", statuses["PASIF"]);
            Assert.Equal("Yeterli", statuses["AKTIF"]);
        }
    }

    [Fact]
    public async Task Status_follows_legacy_priority()
    {
        await using var factory = new ErpOperationApiFactory();
        using var client = await ArrangeAsync(factory, "TRY",
            new Card("ALTI", 10, true, 2, null), new Card("MALIYETSIZ", 0, true, 3, null), new Card("YETERLI", 0, true, 3, 4));
        foreach (var route in Routes)
        {
            var statuses = Statuses(await GetPageAsync(client, route));
            Assert.Equal("Minimum altı", statuses["ALTI"]);
            Assert.Equal("Maliyetsiz", statuses["MALIYETSIZ"]);
            Assert.Equal("Yeterli", statuses["YETERLI"]);
        }
    }

    [Fact]
    public async Task Below_minimum_count_ignores_include_inactive()
    {
        await using var factory = new ErpOperationApiFactory();
        using var client = await ArrangeAsync(factory, "TRY", new Card("ALTI", 10, true, 2, 1), new Card("PASIF-ALTI", 10, false, 0, null));
        foreach (var route in Routes)
        {
            Assert.Equal(1, (await GetPageAsync(client, route)).GetProperty("belowMinimumCount").GetInt32());
            Assert.Equal(1, (await GetPageAsync(client, route, "?includeInactive=true")).GetProperty("belowMinimumCount").GetInt32());
        }
    }

    [Fact]
    public async Task Page_summary_sums_returned_items_only()
    {
        await using var factory = new ErpOperationApiFactory();
        // Ordered by name: A, B are on page 1; C is on page 2.
        using var client = await ArrangeAsync(factory, "TRY", new Card("A", 0, true, 2, 10), new Card("B", 0, true, 3, 5), new Card("C", 0, true, 100, 100));
        foreach (var route in Routes)
        {
            var page = await GetPageAsync(client, route, "?pageSize=2");
            Assert.Equal(["A", "B"], Codes(page));
            Assert.Equal(35m, page.GetProperty("pageValuationAmountBase").GetDecimal());
            Assert.Equal(5m, page.GetProperty("pageAvailableQuantity").GetDecimal());
            Assert.Equal("EA", page.GetProperty("pageUnitCode").GetString());
            var second = await GetPageAsync(client, route, "?pageSize=2&page=2");
            Assert.Equal(10000m, second.GetProperty("pageValuationAmountBase").GetDecimal());
            Assert.Equal(100m, second.GetProperty("pageAvailableQuantity").GetDecimal());
        }
    }

    [Fact]
    public async Task Page_unit_code_is_null_for_mixed_or_empty_page()
    {
        await using var factory = new ErpOperationApiFactory();
        using var client = await ArrangeAsync(factory, "TRY", new Card("A", 0, true, 1, 1, "EA"), new Card("B", 0, true, 1, 1, "KG"));
        foreach (var route in Routes)
        {
            var mixed = await GetPageAsync(client, route);
            Assert.Equal(JsonValueKind.Null, mixed.GetProperty("pageUnitCode").ValueKind);
            var empty = await GetPageAsync(client, route, "?q=yok-boyle-kart");
            Assert.Empty(Codes(empty));
            Assert.Equal(JsonValueKind.Null, empty.GetProperty("pageUnitCode").ValueKind);
            Assert.Equal(0m, empty.GetProperty("pageValuationAmountBase").GetDecimal());
            Assert.Equal(0m, empty.GetProperty("pageAvailableQuantity").GetDecimal());
            Assert.Equal(0, empty.GetProperty("pageAvailableCount").GetInt32());
            Assert.Equal(0, empty.GetProperty("pageUnvaluedCount").GetInt32());
        }
    }

    [Fact]
    public async Task Page_counts_available_and_unvalued_cards()
    {
        await using var factory = new ErpOperationApiFactory();
        using var client = await ArrangeAsync(factory, "TRY",
            new Card("BOS", 0, true, 0, null), new Card("DEGERLI", 0, true, 2, 1), new Card("MALIYETSIZ", 0, true, 3, null));
        foreach (var route in Routes)
        {
            var page = await GetPageAsync(client, route);
            Assert.Equal(2, page.GetProperty("pageAvailableCount").GetInt32());
            Assert.Equal(1, page.GetProperty("pageUnvaluedCount").GetInt32());
        }
    }

    [Fact]
    public async Task Base_currency_code_is_tenant_base_currency()
    {
        await using var factory = new ErpOperationApiFactory();
        using var client = await ArrangeAsync(factory, "EUR", new Card("A", 0, true, 1, 1));
        foreach (var route in Routes)
            Assert.Equal("EUR", (await GetPageAsync(client, route)).GetProperty("baseCurrencyCode").GetString());
    }

    /// <summary>stok.bakiye.kart: the optional stockItemId filter returns that one card of the tenant, on both routes.</summary>
    [Fact]
    public async Task Stock_item_filter_returns_that_card_only()
    {
        await using var factory = new ErpOperationApiFactory();
        using var client = await ArrangeAsync(factory, "TRY", new Card("A", 0, true, 2, 10), new Card("B", 0, true, 3, 5), new Card("C", 0, false, 1, 1));
        Guid cardB, otherTenantCard;
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            cardB = db.StockItems.Single(x => x.TenantId == TenantA && x.Code == "B").Id;
            otherTenantCard = db.StockItems.Single(x => x.TenantId == TenantB).Id;
        }
        foreach (var route in Routes)
        {
            var page = await GetPageAsync(client, route, $"?stockItemId={cardB:D}");
            Assert.Equal(["B"], Codes(page));
            Assert.Equal(1, page.GetProperty("totalCount").GetInt32());
            var balance = page.GetProperty("items")[0].GetProperty("balance");
            Assert.Equal((cardB, 3m, 15m), (balance.GetProperty("stockItemId").GetGuid(), balance.GetProperty("quantityOnHand").GetDecimal(),
                balance.GetProperty("valuationAmountBase").GetDecimal()));
            // The filter narrows the other filters, it never widens them: q and the active-only default still apply.
            Assert.Empty(Codes(await GetPageAsync(client, route, $"?stockItemId={cardB:D}&q=yok-boyle-kart")));
            Assert.Equal(["B"], Codes(await GetPageAsync(client, route, $"?stockItemId={cardB:D}&belowMinimumOnly=false&page=1&pageSize=25")));
            // Another tenant's card or an unknown id: an empty page, never another card.
            Assert.Empty(Codes(await GetPageAsync(client, route, $"?stockItemId={otherTenantCard:D}")));
            Assert.Empty(Codes(await GetPageAsync(client, route, $"?stockItemId={Guid.NewGuid():D}")));
            Assert.Equal(["A", "B"], Codes(await GetPageAsync(client, route)));
        }
    }

    [Fact]
    public async Task Per_warehouse_page_has_same_additions()
    {
        await using var factory = new ErpOperationApiFactory();
        using var client = await ArrangeAsync(factory, "TRY",
            new Card("ALTI", 10, true, 2, null), new Card("PASIF", 0, false, 1, 1), new Card("YETERLI", 0, true, 3, 4));
        var all = await GetPageAsync(client, AllRoute, "?includeInactive=true");
        var one = await GetPageAsync(client, WarehouseRoute, "?includeInactive=true");
        // One active warehouse holds every movement, so both routes return the same page.
        Assert.Equal(Statuses(all), Statuses(one));
        foreach (var member in new[] { "totalCount", "belowMinimumCount", "pageAvailableCount", "pageUnvaluedCount" })
            Assert.Equal(all.GetProperty(member).GetInt32(), one.GetProperty(member).GetInt32());
        foreach (var member in new[] { "pageValuationAmountBase", "pageAvailableQuantity" })
            Assert.Equal(all.GetProperty(member).GetDecimal(), one.GetProperty(member).GetDecimal());
        Assert.Equal(all.GetProperty("pageUnitCode").GetString(), one.GetProperty("pageUnitCode").GetString());
        Assert.Equal(all.GetProperty("baseCurrencyCode").GetString(), one.GetProperty("baseCurrencyCode").GetString());
        Assert.Equal("Pasif", Statuses(one)["PASIF"]);
    }
}
