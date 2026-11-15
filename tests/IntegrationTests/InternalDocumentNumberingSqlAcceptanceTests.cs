using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using AIERP.Platform.Domain;
using Microsoft.EntityFrameworkCore;
using Xunit;
using static AIERP.Api.IntegrationTests.FiscalCloseRouteSqlAcceptanceHarness;

namespace AIERP.Api.IntegrationTests;

/// <summary>
/// Real SQL Server acceptance for internal document numbers on posting routes: goods receipts receive consecutive
/// GR-yyyy-NNNNNN codes, an idempotent replay returns the original receipt without reserving a number, a rejected
/// posting rolls its reservation back with the caller's transaction, and a manual journal entry gets YV-yyyy-NNNNNN.
/// </summary>
[Collection("SQL Server acceptance")]
public sealed class InternalDocumentNumberingSqlAcceptanceTests
{
    [SqlServerAcceptanceFact]
    public async Task Receipt_and_journal_routes_use_sequential_codes_and_replays_or_rejections_do_not_consume_numbers()
    {
        await using var harness = await FiscalCloseRouteSqlAcceptanceHarness.CreateAsync("InternalNumbering");
        var tenantId = harness.TenantId;
        var receiptDate = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(-2);
        var year = receiptDate.Year;

        var supplier = new CustomerAccount { TenantId = tenantId, Code = "SUP-NUM", Name = "Synthetic supplier", Type = CounterpartyType.Supplier };
        var item = new StockItem { TenantId = tenantId, Code = "SKU-NUM", Name = "Synthetic item", UnitCode = "EA" };
        var warehouse = new Warehouse { TenantId = tenantId, Code = "WH-NUM", Name = "Synthetic warehouse" };
        var order = new PurchaseOrder { TenantId = tenantId, SupplierId = supplier.Id, Supplier = supplier, Code = "PO-NUM",
            OrderDate = receiptDate.AddDays(-3), TargetWarehouseId = warehouse.Id, TargetWarehouse = warehouse };
        order.Lines.Add(new PurchaseOrderLine { TenantId = tenantId, PurchaseOrderId = order.Id, PurchaseOrder = order,
            LineNumber = 1, StockItemId = item.Id, StockItem = item, StockCode = item.Code, StockName = item.Name, UnitCode = item.UnitCode,
            Quantity = 10m, UnitPrice = 5m, LineSubtotal = 50m, LineTotal = 50m });
        var cash = Account(tenantId, "100", "Cash", LedgerAccountStatementSection.Asset);
        var capital = Account(tenantId, "500", "Capital", LedgerAccountStatementSection.Equity);
        await using (var seedDb = harness.NewTenantDb())
        {
            seedDb.Tenants.Add(harness.Tenant);
            seedDb.CustomerAccounts.Add(supplier);
            seedDb.StockItems.Add(item);
            seedDb.Warehouses.Add(warehouse);
            seedDb.PurchaseOrders.Add(order);
            seedDb.LedgerAccounts.AddRange(cash, capital);
            await seedDb.SaveChangesAsync();
        }
        harness.StartApi();
        var client = harness.Client;

        var firstRequestId = Guid.NewGuid();
        object Receipt(Guid requestId, decimal quantity) => new
        {
            requestId, warehouseId = warehouse.Id, receiptDate = receiptDate.ToString("yyyy-MM-dd"),
            lines = new[] { new { orderLineNumber = 1, quantity } }
        };

        using var first = await client.PostAsJsonAsync($"/api/purchasing/orders/{order.Id}/receipts", Receipt(firstRequestId, 2m));
        await AssertCreatedAsync(first, "first receipt");
        Assert.Equal($"GR-{year}-000001", await CodeAsync(first));

        using var replay = await client.PostAsJsonAsync($"/api/purchasing/orders/{order.Id}/receipts", Receipt(firstRequestId, 2m));
        Assert.Equal(HttpStatusCode.OK, replay.StatusCode);
        Assert.Equal($"GR-{year}-000001", await CodeAsync(replay));

        using var second = await client.PostAsJsonAsync($"/api/purchasing/orders/{order.Id}/receipts", Receipt(Guid.NewGuid(), 3m));
        await AssertCreatedAsync(second, "second receipt");
        Assert.Equal($"GR-{year}-000002", await CodeAsync(second));

        // Rejected after the number was reserved (serial tracking is not enabled, so a tracking allocation is invalid):
        // the reservation rolls back with the route's transaction.
        using var rejected = await client.PostAsJsonAsync($"/api/purchasing/orders/{order.Id}/receipts", new
        {
            requestId = Guid.NewGuid(), warehouseId = warehouse.Id, receiptDate = receiptDate.ToString("yyyy-MM-dd"),
            lines = new[] { new { orderLineNumber = 1, quantity = 1m, tracking = new[] { new { trackingCode = "LOT-X", quantity = 1m } } } }
        });
        Assert.False(rejected.IsSuccessStatusCode, await rejected.Content.ReadAsStringAsync());

        using var third = await client.PostAsJsonAsync($"/api/purchasing/orders/{order.Id}/receipts", Receipt(Guid.NewGuid(), 1m));
        await AssertCreatedAsync(third, "third receipt");
        Assert.Equal($"GR-{year}-000003", await CodeAsync(third));

        using var manual = await client.PostAsJsonAsync("/api/finance/general-ledger/entries/manual", new
        {
            entryDate = receiptDate.ToString("yyyy-MM-dd"), description = "Synthetic opening", accountingBasis = "TDHP",
            lines = new[]
            {
                new { accountId = cash.Id, description = "Cash", debit = 10m, credit = 0m },
                new { accountId = capital.Id, description = "Capital", debit = 0m, credit = 10m }
            }
        });
        await AssertCreatedAsync(manual, "manual journal entry");
        Assert.Matches($"^YV-{year}-\\d{{6}}$", await CodeAsync(manual));

        await using var db = harness.NewTenantDb();
        var codes = await db.PurchaseReceipts.AsNoTracking().Where(x => x.TenantId == tenantId).OrderBy(x => x.Code).Select(x => x.Code).ToListAsync();
        Assert.Equal([$"GR-{year}-000001", $"GR-{year}-000002", $"GR-{year}-000003"], codes);
        var counter = await db.TenantDocumentNumberCounters.AsNoTracking()
            .SingleAsync(x => x.TenantId == tenantId && x.DocumentType == "PurchaseReceipt" && x.PeriodKey == year.ToString("0000"));
        Assert.Equal(3, counter.LastValue);
    }

    private static async Task<string> CodeAsync(HttpResponseMessage response)
    {
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return json.RootElement.GetProperty("code").GetString()!;
    }
}
