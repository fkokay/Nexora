using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using AIERP.Platform.Domain;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>
/// The unified sales delivery list (<c>GET /api/sales/deliveries/all</c>) on SQL Server: both keyed source queries (search,
/// status, unbilled filters with their correlated invoice subqueries), the detail reads of the page rows and the in-memory
/// merge translate and page across the two tables. InMemory cannot prove the translation. Skipped without a disposable SQL
/// Server.
/// </summary>
[Collection("SQL Server acceptance")]
public sealed class SalesDeliveryListSqlAcceptanceTests
{
    [SqlServerAcceptanceFact]
    public async Task Unified_list_translates_filters_and_pages_across_both_tables()
    {
        await using var harness = await FiscalCloseRouteSqlAcceptanceHarness.CreateAsync("SalesDeliveryList");
        var tenantId = harness.TenantId;
        var customer = new CustomerAccount { TenantId = tenantId, Code = "C-SDL", Name = "Synthetic customer", Type = CounterpartyType.Customer, CurrencyCode = "TRY", IsActive = true };
        var warehouse = new Warehouse { TenantId = tenantId, Code = "WH-SDL", Name = "Synthetic warehouse" };
        var order = new SalesOrder { TenantId = tenantId, Customer = customer, Code = "SIP-SDL", OrderDate = new DateOnly(2026, 11, 1) };
        var created = new DateTimeOffset(2026, 11, 1, 8, 0, 0, TimeSpan.Zero);
        SalesDelivery Delivery(string code, int day, SalesOrder? source) => new()
        {
            TenantId = tenantId, RequestId = Guid.NewGuid(), Order = source, Warehouse = warehouse, Code = code,
            DeliveryDate = new DateOnly(2026, 11, day), CreatedAt = created.AddDays(day)
        };
        var invoiced = Delivery("IRS-SDL-1", 10, order);
        var open = Delivery("IRS-SDL-2", 15, order);
        await using (var seedDb = harness.NewTenantDb())
        {
            seedDb.Tenants.Add(harness.Tenant);
            seedDb.CustomerAccounts.Add(customer);
            seedDb.Warehouses.Add(warehouse);
            seedDb.SalesOrders.Add(order);
            seedDb.SalesDeliveries.AddRange(invoiced, open);
            seedDb.SalesInvoices.Add(new SalesInvoice { TenantId = tenantId, Delivery = invoiced, Order = order, Customer = customer, Code = "F-SDL-1",
                InvoiceDate = new DateOnly(2026, 11, 10) });
            seedDb.StandaloneSalesDeliveries.AddRange(
                new StandaloneSalesDelivery { TenantId = tenantId, RequestId = Guid.NewGuid(), Customer = customer, Warehouse = warehouse, Code = "BIRS-SDL-1",
                    DeliveryDate = new DateOnly(2026, 11, 12), CreatedAt = created.AddDays(12) },
                new StandaloneSalesDelivery { TenantId = tenantId, RequestId = Guid.NewGuid(), Customer = customer, Warehouse = warehouse, Code = "BIRS-SDL-2",
                    DeliveryDate = new DateOnly(2026, 11, 18), CreatedAt = created.AddDays(18), Status = StandaloneInventoryDocumentStatus.Posted });
            await seedDb.SaveChangesAsync();
        }
        harness.StartApi();

        async Task<JsonElement> ListAsync(string query)
        {
            using var response = await harness.Client.GetAsync(SalesDeliveryListEndpoints.Route + "?" + query);
            Assert.True(response.StatusCode == HttpStatusCode.OK, $"{response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
            return await response.Content.ReadFromJsonAsync<JsonElement>();
        }
        static string[] Codes(JsonElement page) => page.GetProperty("items").EnumerateArray().Select(x => x.GetProperty("code").GetString()!).ToArray();

        var all = await ListAsync("pageSize=100");
        Assert.Equal(4, all.GetProperty("totalCount").GetInt32());
        Assert.Equal(new[] { "BIRS-SDL-2", "IRS-SDL-2", "BIRS-SDL-1", "IRS-SDL-1" }, Codes(all));
        var first = all.GetProperty("items").EnumerateArray().Last();
        Assert.Equal(("Order", "SIP-SDL", "F-SDL-1", "Posted", "Synthetic customer"), (first.GetProperty("kind").GetString(),
            first.GetProperty("orderCode").GetString(), first.GetProperty("invoiceCode").GetString(), first.GetProperty("invoiceStatus").GetString(),
            first.GetProperty("customerName").GetString()));
        Assert.Equal(new[] { "BIRS-SDL-1", "IRS-SDL-1" }, Codes(await ListAsync("page=2&pageSize=2")));
        Assert.Equal(new[] { "BIRS-SDL-2", "IRS-SDL-2" }, Codes(await ListAsync("unbilledOnly=true")));
        Assert.Equal(new[] { "BIRS-SDL-1" }, Codes(await ListAsync("status=Draft")));
        Assert.Equal(new[] { "IRS-SDL-2", "IRS-SDL-1" }, Codes(await ListAsync("q=SIP-SDL")));
        Assert.Equal(new[] { "BIRS-SDL-2", "IRS-SDL-2", "BIRS-SDL-1", "IRS-SDL-1" }, Codes(await ListAsync("q=Synthetic")));
    }
}
