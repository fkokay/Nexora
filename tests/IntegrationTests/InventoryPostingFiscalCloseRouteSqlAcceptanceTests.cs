using System.Net.Http.Json;
using System.Text.Json;
using AIERP.Platform.Domain;
using Microsoft.EntityFrameworkCore;
using Xunit;
using static AIERP.Api.IntegrationTests.FiscalCloseRouteSqlAcceptanceHarness;

namespace AIERP.Api.IntegrationTests;

/// <summary>
/// Real SQL Server acceptance for stock-side posting routes after a fiscal-year close: document-driven deliveries and
/// receipts, warehouse transfers, manual stock movement reversals, cost revaluations, landed costs, the module journal
/// transfer of a receipt and manufacturing completion. Each route first proves it posts in the open period (where cheap),
/// then must reject the closed period with 409 and leave stock, valuation, journal and audit rows untouched.
/// </summary>
[Collection("SQL Server acceptance")]
public sealed class InventoryPostingFiscalCloseRouteSqlAcceptanceTests
{
    [SqlServerAcceptanceFact]
    public async Task Stock_posting_routes_reject_closed_period_without_side_effects()
    {
        await using var harness = await FiscalCloseRouteSqlAcceptanceHarness.CreateAsync("InventoryRouteClose");
        var tenantId = harness.TenantId;
        // Void/reversal routes date their effects "today", so the closed range must contain today.
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var closeFrom = today.AddDays(-120);
        var closeTo = today.AddDays(30);
        var postingDate = today.AddDays(-30);
        var closedDate = postingDate.AddDays(1);

        var customer = new CustomerAccount { TenantId = tenantId, Code = "CUS-INV-CLOSE", Name = "Synthetic customer", Type = CounterpartyType.Customer };
        var supplier = new CustomerAccount { TenantId = tenantId, Code = "SUP-INV-CLOSE", Name = "Synthetic supplier", Type = CounterpartyType.Supplier };
        var item = new StockItem { TenantId = tenantId, Code = "SKU-INV-CLOSE", Name = "Synthetic item", UnitCode = "EA" };
        var product = new StockItem { TenantId = tenantId, Code = "FG-INV-CLOSE", Name = "Synthetic finished good", UnitCode = "EA" };
        var mainWarehouse = new Warehouse { TenantId = tenantId, Code = "WH-INV-A", Name = "Synthetic main warehouse" };
        var secondWarehouse = new Warehouse { TenantId = tenantId, Code = "WH-INV-B", Name = "Synthetic second warehouse" };
        var quote = new SalesQuote { TenantId = tenantId, RevisionGroupId = Guid.NewGuid(), CustomerId = customer.Id, Customer = customer,
            Code = "Q-INV-CLOSE", QuoteDate = postingDate.AddDays(-5), ValidUntil = postingDate.AddDays(30), Status = SalesQuoteStatus.Accepted,
            Subtotal = 50m, GrandTotal = 50m };
        var salesOrder = new SalesOrder { TenantId = tenantId, QuoteId = quote.Id, Quote = quote, CustomerId = customer.Id, Customer = customer,
            Code = "SO-INV-CLOSE", OrderDate = postingDate.AddDays(-4), Subtotal = 50m, GrandTotal = 50m };
        salesOrder.Lines.Add(new SalesOrderLine { TenantId = tenantId, OrderId = salesOrder.Id, Order = salesOrder, LineNumber = 1,
            StockItemId = item.Id, StockItem = item, StockCode = item.Code, StockName = item.Name, UnitCode = item.UnitCode,
            Quantity = 5m, UnitPrice = 10m, LineSubtotal = 50m, LineTotal = 50m });
        var purchaseOrder = new PurchaseOrder { TenantId = tenantId, SupplierId = supplier.Id, Supplier = supplier, Code = "PO-INV-CLOSE",
            OrderDate = postingDate.AddDays(-4), TargetWarehouseId = mainWarehouse.Id, TargetWarehouse = mainWarehouse };
        purchaseOrder.Lines.Add(new PurchaseOrderLine { TenantId = tenantId, PurchaseOrderId = purchaseOrder.Id, PurchaseOrder = purchaseOrder,
            LineNumber = 1, StockItemId = item.Id, StockItem = item, StockCode = item.Code, StockName = item.Name, UnitCode = item.UnitCode,
            Quantity = 10m, UnitPrice = 5m, LineSubtotal = 50m, LineTotal = 50m });
        var bom = new BillOfMaterial { TenantId = tenantId, Code = "BOM-INV-CLOSE", Name = "Synthetic BOM", ProductStockItemId = product.Id };
        var manufacturingOrder = new ManufacturingOrder { TenantId = tenantId, Code = "MO-INV-CLOSE", BillOfMaterialId = bom.Id,
            WarehouseId = mainWarehouse.Id, PlannedQuantity = 1m, PlannedDate = postingDate, Status = ManufacturingOrderStatus.Released };
        var retained = Account(tenantId, "390", "Retained earnings", LedgerAccountStatementSection.Equity);
        var cash = Account(tenantId, "100", "Cash", LedgerAccountStatementSection.Asset);
        var capital = Account(tenantId, "300", "Capital", LedgerAccountStatementSection.Equity);
        var revenue = Account(tenantId, "600", "Revenue", LedgerAccountStatementSection.Revenue);
        var inventory = Account(tenantId, "153", "Inventory", LedgerAccountStatementSection.Asset);
        var accrual = Account(tenantId, "329", "Goods received not invoiced", LedgerAccountStatementSection.Liability);

        await using (var seedDb = harness.NewTenantDb())
        {
            seedDb.Tenants.Add(harness.Tenant);
            seedDb.CustomerAccounts.AddRange(customer, supplier);
            seedDb.StockItems.AddRange(item, product);
            seedDb.Warehouses.AddRange(mainWarehouse, secondWarehouse);
            seedDb.SalesQuotes.Add(quote);
            seedDb.SalesOrders.Add(salesOrder);
            seedDb.PurchaseOrders.Add(purchaseOrder);
            seedDb.BillOfMaterials.Add(bom);
            seedDb.ManufacturingOrders.Add(manufacturingOrder);
            seedDb.LedgerAccounts.AddRange(retained, cash, capital, revenue, inventory, accrual);
            seedDb.LedgerAccountMappings.AddRange(
                new LedgerAccountMapping { TenantId = tenantId, MappingKey = LedgerMappingKeys.InventoryAsset, AccountId = inventory.Id },
                new LedgerAccountMapping { TenantId = tenantId, MappingKey = LedgerMappingKeys.PurchaseReceiptAccrual, AccountId = accrual.Id });
            seedDb.JournalEntries.AddRange(
                BalancedEntry(tenantId, $"OPEN-{harness.Suffix}", closeFrom.AddDays(-1), cash, capital, 1000m),
                BalancedEntry(tenantId, $"REV-{harness.Suffix}", postingDate, cash, revenue, 100m));
            await seedDb.SaveChangesAsync();
        }
        harness.StartApi();
        var client = harness.Client;

        // Open period: the routes post normally.
        using var receipt = await client.PostAsJsonAsync($"/api/purchasing/orders/{purchaseOrder.Id}/receipts", new
        {
            requestId = Guid.NewGuid(), warehouseId = mainWarehouse.Id, receiptDate = Date(postingDate),
            lines = new[] { new { orderLineNumber = 1, quantity = 4m } }
        });
        await AssertCreatedAsync(receipt, "purchase-order receipt (open period)");
        var receiptId = await IdAsync(receipt);
        // Landed cost must precede any later stock issue from the receipt.
        using var landedCost = await client.PostAsJsonAsync($"/api/purchasing/receipts/{receiptId}/landed-costs", new
        {
            entryDate = Date(postingDate), amountBase = 4m, allocationMethod = "EQUAL", description = "Synthetic open-period freight"
        });
        await AssertCreatedAsync(landedCost, "landed cost (open period)");
        var landedCostId = await IdAsync(landedCost);
        using var movement = await client.PostAsJsonAsync($"/api/warehouses/{mainWarehouse.Id}/stock/{item.Id}/transactions", new
        {
            entryDate = Date(postingDate), direction = "Receipt", quantity = 6m, unitCostBase = 5m, description = "Synthetic open-period receipt"
        });
        await AssertCreatedAsync(movement, "manual stock movement (open period)");
        var movementId = await IdAsync(movement);
        using var delivery = await client.PostAsJsonAsync($"/api/sales/orders/{salesOrder.Id}/deliveries", new
        {
            requestId = Guid.NewGuid(), warehouseId = mainWarehouse.Id, deliveryDate = Date(postingDate),
            lines = new[] { new { orderLineNumber = 1, quantity = 1m } }
        });
        await AssertCreatedAsync(delivery, "sales-order delivery (open period)");
        using var transfer = await client.PostAsJsonAsync("/api/warehouses/transfers", new
        {
            requestId = Guid.NewGuid(), fromWarehouseId = mainWarehouse.Id, toWarehouseId = secondWarehouse.Id, transferDate = Date(postingDate),
            lines = new[] { new { stockItemId = item.Id, quantity = 1m } }
        });
        await AssertCreatedAsync(transfer, "warehouse transfer (open period)");
        var transferId = await IdAsync(transfer);
        using var revaluation = await client.PostAsJsonAsync($"/api/warehouses/{mainWarehouse.Id}/stock/{item.Id}/revaluations", new
        {
            entryDate = Date(postingDate), amountBase = 3m, reason = "Synthetic open-period revaluation"
        });
        await AssertCreatedAsync(revaluation, "stock revaluation (open period)");
        var revaluationId = await IdAsync(revaluation);

        await harness.CloseAsync(closeFrom, closeTo, retained.Id);
        var before = await SnapshotAsync(harness, tenantId);

        // Closed period: every stock-side posting route must refuse before writing anything.
        await AssertClosedPeriodRejectedAsync(await client.PostAsJsonAsync($"/api/sales/orders/{salesOrder.Id}/deliveries", new
        {
            requestId = Guid.NewGuid(), warehouseId = mainWarehouse.Id, deliveryDate = Date(closedDate),
            lines = new[] { new { orderLineNumber = 1, quantity = 1m } }
        }), "sales-order delivery");
        await AssertClosedPeriodRejectedAsync(await client.PostAsJsonAsync($"/api/purchasing/orders/{purchaseOrder.Id}/receipts", new
        {
            requestId = Guid.NewGuid(), warehouseId = mainWarehouse.Id, receiptDate = Date(closedDate),
            lines = new[] { new { orderLineNumber = 1, quantity = 1m } }
        }), "purchase-order receipt");
        await AssertClosedPeriodRejectedAsync(await client.PostAsJsonAsync("/api/warehouses/transfers", new
        {
            requestId = Guid.NewGuid(), fromWarehouseId = mainWarehouse.Id, toWarehouseId = secondWarehouse.Id, transferDate = Date(closedDate),
            lines = new[] { new { stockItemId = item.Id, quantity = 1m } }
        }), "warehouse transfer");
        await AssertClosedPeriodRejectedAsync(await client.PostAsJsonAsync($"/api/warehouses/transfers/{transferId}/void", new
        {
            reason = "Closed-period transfer void", confirmation = true
        }), "warehouse transfer void");
        await AssertClosedPeriodRejectedAsync(await client.PostAsJsonAsync(
            $"/api/warehouses/{mainWarehouse.Id}/stock/{item.Id}/transactions/{movementId}/reverse", new { reason = "Closed-period reversal" }),
            "stock movement reversal");
        await AssertClosedPeriodRejectedAsync(await client.PostAsJsonAsync($"/api/warehouses/{mainWarehouse.Id}/stock/{item.Id}/revaluations", new
        {
            entryDate = Date(closedDate), amountBase = 2m, reason = "Closed-period revaluation"
        }), "stock revaluation");
        await AssertClosedPeriodRejectedAsync(await client.PostAsJsonAsync($"/api/warehouses/cost-adjustments/{revaluationId}/reverse",
            new { reason = "Closed-period revaluation reversal" }), "stock revaluation reversal");
        await AssertClosedPeriodRejectedAsync(await client.PostAsJsonAsync($"/api/purchasing/receipts/{receiptId}/landed-costs/{landedCostId}/reverse",
            new { reason = "Closed-period landed-cost reversal" }), "landed cost reversal");
        await AssertClosedPeriodRejectedAsync(await client.PostAsJsonAsync("/api/finance/general-ledger/transfer", new
        {
            sourceType = "PurchaseReceipt", sourceId = receiptId
        }), "module journal transfer (purchase receipt)");
        await AssertClosedPeriodRejectedAsync(await client.PostAsJsonAsync($"/api/manufacturing/orders/{manufacturingOrder.Id}/complete", new { }),
            "manufacturing order completion");

        var after = await SnapshotAsync(harness, tenantId);
        Assert.Equal(before, after);
        await using var readDb = harness.NewTenantDb();
        Assert.Equal(ManufacturingOrderStatus.Released, await readDb.ManufacturingOrders.AsNoTracking()
            .Where(x => x.TenantId == tenantId && x.Id == manufacturingOrder.Id).Select(x => x.Status).SingleAsync());
        Assert.False(await readDb.JournalEntries.AnyAsync(x => x.TenantId == tenantId && x.SourceType == "PurchaseReceipt" && x.SourceId == receiptId));
    }

    private static string Date(DateOnly value) => value.ToString("yyyy-MM-dd");

    private static async Task<Guid> IdAsync(HttpResponseMessage response)
    {
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return json.RootElement.GetProperty("id").GetGuid();
    }

    private static async Task<string> SnapshotAsync(FiscalCloseRouteSqlAcceptanceHarness harness, Guid tenantId)
    {
        await using var db = harness.NewTenantDb();
        var transferStatuses = string.Join(",", await db.InventoryTransfers.AsNoTracking().Where(x => x.TenantId == tenantId)
            .OrderBy(x => x.Id).Select(x => x.Status).ToListAsync());
        return string.Join("|",
            $"stock={await db.InventoryTransactions.CountAsync(x => x.TenantId == tenantId)}",
            $"costAdjustments={await db.InventoryCostAdjustments.CountAsync(x => x.TenantId == tenantId)}",
            $"transfers={await db.InventoryTransfers.CountAsync(x => x.TenantId == tenantId)}:{transferStatuses}",
            $"deliveries={await db.SalesDeliveries.CountAsync(x => x.TenantId == tenantId)}",
            $"receipts={await db.PurchaseReceipts.CountAsync(x => x.TenantId == tenantId)}",
            $"journals={await db.JournalEntries.CountAsync(x => x.TenantId == tenantId)}",
            $"audit={await db.AuditEvents.CountAsync(x => x.TenantId == tenantId)}");
    }
}
