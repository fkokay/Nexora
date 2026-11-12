using System.Net.Http.Json;
using System.Text.Json;
using AIERP.Platform.Domain;
using Microsoft.EntityFrameworkCore;
using Xunit;
using static AIERP.Api.IntegrationTests.FiscalCloseRouteSqlAcceptanceHarness;

namespace AIERP.Api.IntegrationTests;

/// <summary>
/// Real SQL Server acceptance for invoice/settlement voids, journal reversals, cash/bank voids, account opening balances
/// and standalone invoice posting after a fiscal-year close. Source documents are posted through the API in the open
/// period first; afterwards each route must reject the closed period with 409 and leave every ledger, cash, journal,
/// status and audit row unchanged.
/// </summary>
[Collection("SQL Server acceptance")]
public sealed class SettlementAndLedgerFiscalCloseRouteSqlAcceptanceTests
{
    [SqlServerAcceptanceFact]
    public async Task Settlement_void_and_ledger_routes_reject_closed_period_without_side_effects()
    {
        await using var harness = await FiscalCloseRouteSqlAcceptanceHarness.CreateAsync("SettlementRouteClose");
        var tenantId = harness.TenantId;
        // Void routes date their reversals "today", so the closed range must contain today.
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var closeFrom = today.AddDays(-120);
        var closeTo = today.AddDays(30);
        var postingDate = today.AddDays(-30);
        var closedDate = postingDate.AddDays(1);

        var customer = new CustomerAccount { TenantId = tenantId, Code = "CUS-SET-CLOSE", Name = "Synthetic customer", Type = CounterpartyType.Customer };
        var supplier = new CustomerAccount { TenantId = tenantId, Code = "SUP-SET-CLOSE", Name = "Synthetic supplier", Type = CounterpartyType.Supplier };
        var item = new StockItem { TenantId = tenantId, Code = "SKU-SET-CLOSE", Name = "Synthetic item", UnitCode = "EA" };
        var warehouse = new Warehouse { TenantId = tenantId, Code = "WH-SET-CLOSE", Name = "Synthetic warehouse" };
        var quote = new SalesQuote { TenantId = tenantId, RevisionGroupId = Guid.NewGuid(), CustomerId = customer.Id, Customer = customer,
            Code = "Q-SET-CLOSE", QuoteDate = postingDate.AddDays(-6), ValidUntil = postingDate.AddDays(30), Status = SalesQuoteStatus.Accepted,
            Subtotal = 100m, GrandTotal = 100m };
        var salesOrder = new SalesOrder { TenantId = tenantId, QuoteId = quote.Id, Quote = quote, CustomerId = customer.Id, Customer = customer,
            Code = "SO-SET-CLOSE", OrderDate = postingDate.AddDays(-5), Status = SalesOrderStatus.Fulfilled, Subtotal = 100m, GrandTotal = 100m };
        var salesOrderLine = new SalesOrderLine { TenantId = tenantId, OrderId = salesOrder.Id, Order = salesOrder, LineNumber = 1,
            StockItemId = item.Id, StockItem = item, StockCode = item.Code, StockName = item.Name, UnitCode = item.UnitCode,
            Quantity = 1m, UnitPrice = 100m, LineSubtotal = 100m, LineTotal = 100m };
        salesOrder.Lines.Add(salesOrderLine);
        var delivery = new SalesDelivery { TenantId = tenantId, OrderId = salesOrder.Id, Order = salesOrder, WarehouseId = warehouse.Id,
            Warehouse = warehouse, RequestId = Guid.NewGuid(), Code = "DEL-SET-CLOSE", DeliveryDate = postingDate.AddDays(-4) };
        var deliveryLine = new SalesDeliveryLine { TenantId = tenantId, DeliveryId = delivery.Id, Delivery = delivery, OrderId = salesOrder.Id,
            OrderLineNumber = 1, OrderLine = salesOrderLine, StockItemId = item.Id, StockCode = item.Code, StockName = item.Name,
            UnitCode = item.UnitCode, Quantity = 1m };
        delivery.Lines.Add(deliveryLine);
        var salesInvoice = new SalesInvoice { TenantId = tenantId, DeliveryId = delivery.Id, Delivery = delivery, OrderId = salesOrder.Id,
            Order = salesOrder, CustomerId = customer.Id, Customer = customer, Code = "SI-SET-CLOSE", InvoiceDate = postingDate.AddDays(-3),
            CurrencyCode = "TRY", Status = SalesInvoiceStatus.Posted, Subtotal = 100m, GrandTotal = 100m };
        salesInvoice.Lines.Add(new SalesInvoiceLine { TenantId = tenantId, InvoiceId = salesInvoice.Id, Invoice = salesInvoice,
            DeliveryLineId = deliveryLine.Id, DeliveryLine = deliveryLine, OrderLineNumber = 1, StockItemId = item.Id,
            StockCode = item.Code, StockName = item.Name, UnitCode = item.UnitCode, Quantity = 1m, UnitPrice = 100m,
            LineSubtotal = 100m, LineTotal = 100m });
        var purchaseOrder = new PurchaseOrder { TenantId = tenantId, SupplierId = supplier.Id, Supplier = supplier, Code = "PO-SET-CLOSE",
            OrderDate = postingDate.AddDays(-5), TargetWarehouseId = warehouse.Id, TargetWarehouse = warehouse, Status = PurchaseOrderStatus.Received };
        var purchaseOrderLine = new PurchaseOrderLine { TenantId = tenantId, PurchaseOrderId = purchaseOrder.Id, PurchaseOrder = purchaseOrder,
            LineNumber = 1, StockItemId = item.Id, StockItem = item, StockCode = item.Code, StockName = item.Name, UnitCode = item.UnitCode,
            Quantity = 1m, UnitPrice = 100m, LineSubtotal = 100m, LineTotal = 100m };
        purchaseOrder.Lines.Add(purchaseOrderLine);
        var purchaseReceipt = new PurchaseReceipt { TenantId = tenantId, RequestId = Guid.NewGuid(), PurchaseOrderId = purchaseOrder.Id,
            PurchaseOrder = purchaseOrder, WarehouseId = warehouse.Id, Warehouse = warehouse, Code = "GR-SET-CLOSE", ReceiptDate = postingDate.AddDays(-4) };
        var purchaseReceiptLine = new PurchaseReceiptLine { TenantId = tenantId, ReceiptId = purchaseReceipt.Id, Receipt = purchaseReceipt,
            PurchaseOrderId = purchaseOrder.Id, OrderLineNumber = 1, OrderLine = purchaseOrderLine, StockItemId = item.Id,
            StockCode = item.Code, StockName = item.Name, UnitCode = item.UnitCode, Quantity = 1m };
        purchaseReceipt.Lines.Add(purchaseReceiptLine);
        var purchaseInvoice = new PurchaseInvoice { TenantId = tenantId, PurchaseReceiptId = purchaseReceipt.Id, PurchaseReceipt = purchaseReceipt,
            PurchaseOrderId = purchaseOrder.Id, PurchaseOrder = purchaseOrder, SupplierId = supplier.Id, Supplier = supplier, Code = "PI-SET-CLOSE",
            InvoiceDate = postingDate.AddDays(-3), DueDate = postingDate.AddDays(27), CurrencyCode = "TRY", Status = PurchaseInvoiceStatus.Posted,
            Subtotal = 100m, GrandTotal = 100m };
        purchaseInvoice.Lines.Add(new PurchaseInvoiceLine { TenantId = tenantId, PurchaseInvoiceId = purchaseInvoice.Id, PurchaseInvoice = purchaseInvoice,
            PurchaseReceiptId = purchaseReceipt.Id, PurchaseReceiptLineId = purchaseReceiptLine.Id, PurchaseReceiptLine = purchaseReceiptLine,
            OrderLineNumber = 1, StockItemId = item.Id, StockCode = item.Code, StockName = item.Name, UnitCode = item.UnitCode,
            Quantity = 1m, UnitPrice = 100m, LineSubtotal = 100m, LineTotal = 100m });
        var bank = new FinancialAccount { TenantId = tenantId, Code = "BANK-SET-1", Name = "Synthetic bank", Type = FinancialAccountType.Bank, CurrencyCode = "TRY" };
        var secondBank = new FinancialAccount { TenantId = tenantId, Code = "BANK-SET-2", Name = "Synthetic second bank", Type = FinancialAccountType.Bank, CurrencyCode = "TRY" };
        var retained = Account(tenantId, "390", "Retained earnings", LedgerAccountStatementSection.Equity);
        var cash = Account(tenantId, "100", "Cash", LedgerAccountStatementSection.Asset);
        var capital = Account(tenantId, "300", "Capital", LedgerAccountStatementSection.Equity);
        var revenue = Account(tenantId, "600", "Revenue", LedgerAccountStatementSection.Revenue);
        var expense = Account(tenantId, "770", "General expense", LedgerAccountStatementSection.Expense);
        var receivable = Account(tenantId, "120", "Customer receivable", LedgerAccountStatementSection.Asset);
        var cardClearing = Account(tenantId, "108", "Customer card clearing", LedgerAccountStatementSection.Asset);
        var payable = Account(tenantId, "320", "Supplier payable", LedgerAccountStatementSection.Liability);
        var checkClearing = Account(tenantId, "103", "Supplier check clearing", LedgerAccountStatementSection.Liability);

        await using (var seedDb = harness.NewTenantDb())
        {
            seedDb.Tenants.Add(harness.Tenant);
            seedDb.CustomerAccounts.AddRange(customer, supplier);
            seedDb.StockItems.Add(item);
            seedDb.Warehouses.Add(warehouse);
            seedDb.SalesQuotes.Add(quote);
            seedDb.SalesOrders.Add(salesOrder);
            seedDb.SalesDeliveries.Add(delivery);
            seedDb.SalesInvoices.Add(salesInvoice);
            seedDb.PurchaseOrders.Add(purchaseOrder);
            seedDb.PurchaseReceipts.Add(purchaseReceipt);
            seedDb.PurchaseInvoices.Add(purchaseInvoice);
            seedDb.FinancialAccounts.AddRange(bank, secondBank);
            seedDb.LedgerAccounts.AddRange(retained, cash, capital, revenue, expense, receivable, cardClearing, payable, checkClearing);
            seedDb.LedgerAccountMappings.AddRange(
                new LedgerAccountMapping { TenantId = tenantId, MappingKey = LedgerMappingKeys.SalesReceivable, AccountId = receivable.Id },
                new LedgerAccountMapping { TenantId = tenantId, MappingKey = LedgerMappingKeys.CustomerCardClearing, AccountId = cardClearing.Id },
                new LedgerAccountMapping { TenantId = tenantId, MappingKey = LedgerMappingKeys.PurchasePayable, AccountId = payable.Id },
                new LedgerAccountMapping { TenantId = tenantId, MappingKey = LedgerMappingKeys.SupplierCheckClearing, AccountId = checkClearing.Id });
            seedDb.JournalEntries.AddRange(
                BalancedEntry(tenantId, $"OPEN-{harness.Suffix}", closeFrom.AddDays(-1), cash, capital, 1000m),
                BalancedEntry(tenantId, $"REV-{harness.Suffix}", postingDate, cash, revenue, 100m));
            // Inflows the bank movement/transfer below can draw on.
            seedDb.FinancialAccountTransactions.Add(new FinancialAccountTransaction { TenantId = tenantId, FinancialAccount = bank,
                CurrencyCode = "TRY", TransactionDate = closeFrom.AddDays(-1), Direction = FinancialDirection.Inflow,
                CashFlowCategory = CashFlowCategory.OpeningBalance, Amount = 500m, Description = "Synthetic opening bank balance" });
            await seedDb.SaveChangesAsync();
        }
        harness.StartApi();
        var client = harness.Client;

        // Open period: the source documents post normally.
        using var collection = await client.PostAsJsonAsync($"/api/sales/invoices/{salesInvoice.Id}/collections", new
        {
            requestId = Guid.NewGuid(), collectionDate = Date(postingDate), amount = 25m, paymentMethod = "Card", reference = "SYN-SET-CARD"
        });
        await AssertCreatedAsync(collection, "customer collection (open period)");
        var collectionId = await IdAsync(collection);
        using var payment = await client.PostAsJsonAsync($"/api/purchasing/invoices/{purchaseInvoice.Id}/payments", new
        {
            requestId = Guid.NewGuid(), paymentDate = Date(postingDate), amount = 25m, paymentMethod = "Check", reference = "SYN-SET-CHECK"
        });
        await AssertCreatedAsync(payment, "supplier payment (open period)");
        var paymentId = await IdAsync(payment);
        using var manualJournal = await client.PostAsJsonAsync("/api/finance/general-ledger/entries/manual", new
        {
            entryDate = Date(postingDate), description = "Synthetic open-period journal",
            lines = new[]
            {
                new { accountId = cash.Id, description = "Cash debit", debit = 10m, credit = 0m },
                new { accountId = revenue.Id, description = "Revenue credit", debit = 0m, credit = 10m }
            }
        });
        await AssertCreatedAsync(manualJournal, "manual journal (open period)");
        var manualJournalId = await IdAsync(manualJournal);
        using var bankMovement = await client.PostAsJsonAsync($"/api/finance/accounts/{bank.Id}/movements", new
        {
            requestId = Guid.NewGuid(), transactionDate = Date(postingDate), direction = "Inflow", amount = 15m,
            description = "Synthetic open-period bank receipt", reference = "SYN-SET-BANK", cashFlowCategory = "Operating"
        });
        await AssertCreatedAsync(bankMovement, "bank movement (open period)");
        var bankMovementId = await IdAsync(bankMovement);
        using var bankTransfer = await client.PostAsJsonAsync("/api/finance/transfers/", new
        {
            requestId = Guid.NewGuid(), fromAccountId = bank.Id, toAccountId = secondBank.Id, transferDate = Date(postingDate),
            amount = 20m, reference = "SYN-SET-XFER", description = "Synthetic open-period transfer", exchangeRate = 1m
        });
        await AssertCreatedAsync(bankTransfer, "account transfer (open period)");
        var bankTransferId = await IdAsync(bankTransfer);
        using var openingAccount = await client.PostAsJsonAsync("/api/finance/accounts/", new
        {
            code = "CASH-SET-OPEN", name = "Synthetic open-period cash", type = "Cash", currencyCode = "TRY", openingBalance = 30m
        });
        await AssertCreatedAsync(openingAccount, "financial account with opening balance (open period)");
        using var supplierDraft = await client.PostAsJsonAsync("/api/purchasing/standalone-invoices/", new
        {
            requestId = Guid.NewGuid(), supplierId = supplier.Id, invoiceNumber = "SUP-SET-001", invoiceDate = Date(postingDate),
            dueDate = (string?)null, currencyCode = "TRY", notes = (string?)null, subtotal = 40m, discountTotal = 0m, taxTotal = 0m, grandTotal = 40m,
            lines = new[]
            {
                new { lineNumber = 1, description = "Synthetic service", quantity = (decimal?)null, unitCode = (string?)null, unitPrice = (decimal?)null,
                    subtotal = 40m, discountAmount = 0m, taxAmount = 0m, total = 40m, expenseAccountId = (Guid?)expense.Id }
            }
        });
        await AssertCreatedAsync(supplierDraft, "standalone supplier invoice draft (open period)");
        var supplierDraftId = await IdAsync(supplierDraft);

        await harness.CloseAsync(closeFrom, closeTo, retained.Id);
        var before = await SnapshotAsync(harness, tenantId);

        // Closed period: every settlement, void and ledger route must refuse before writing anything.
        await AssertClosedPeriodRejectedAsync(await client.PostAsync($"/api/sales/invoices/{salesInvoice.Id}/void", content: null), "sales invoice void");
        await AssertClosedPeriodRejectedAsync(await client.PostAsync($"/api/customer-collections/{collectionId}/void", content: null), "customer collection void");
        await AssertClosedPeriodRejectedAsync(await client.PostAsync($"/api/purchasing/invoices/{purchaseInvoice.Id}/void", content: null), "purchase invoice void");
        await AssertClosedPeriodRejectedAsync(await client.PostAsync($"/api/purchasing/payments/{paymentId}/void", content: null), "supplier payment void");
        await AssertClosedPeriodRejectedAsync(await client.PostAsJsonAsync($"/api/finance/general-ledger/entries/{manualJournalId}/reverse", new
        {
            entryDate = Date(closedDate), reason = "Closed-period journal reversal"
        }), "manual journal reversal");
        await AssertClosedPeriodRejectedAsync(await client.PostAsync($"/api/finance/accounts/{bank.Id}/transactions/{bankMovementId}/void", content: null),
            "bank movement void");
        await AssertClosedPeriodRejectedAsync(await client.PostAsync($"/api/finance/transfers/{bankTransferId}/void", content: null), "account transfer void");
        await AssertClosedPeriodRejectedAsync(await client.PostAsJsonAsync("/api/finance/accounts/", new
        {
            code = "CASH-SET-CLOSED", name = "Synthetic closed-period cash", type = "Cash", currencyCode = "TRY", openingBalance = 30m
        }), "financial account opening balance");
        await AssertClosedPeriodRejectedAsync(await client.PostAsJsonAsync("/api/sales/invoices", new
        {
            requestId = Guid.NewGuid(), customerId = customer.Id, warehouseId = warehouse.Id, invoiceDate = Date(closedDate),
            lines = new[] { new { stockItemId = item.Id, quantity = 1m, unitPrice = 10m } }
        }), "standalone sales invoice");
        await AssertClosedPeriodRejectedAsync(await client.PostAsync($"/api/purchasing/standalone-invoices/{supplierDraftId}/post", content: null),
            "standalone supplier invoice posting");

        var after = await SnapshotAsync(harness, tenantId);
        Assert.Equal(before, after);
        await using var readDb = harness.NewTenantDb();
        Assert.False(await readDb.FinancialAccounts.AnyAsync(x => x.TenantId == tenantId && x.Code == "CASH-SET-CLOSED"));
        Assert.False(await readDb.JournalEntries.AnyAsync(x => x.TenantId == tenantId && x.SourceType == "ManualReversal" && x.SourceId == manualJournalId));
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
        return string.Join("|",
            $"journals={await db.JournalEntries.CountAsync(x => x.TenantId == tenantId)}",
            $"counterpartyLedger={await db.CustomerLedgerEntries.CountAsync(x => x.TenantId == tenantId)}",
            $"cash={await db.FinancialAccountTransactions.CountAsync(x => x.TenantId == tenantId)}",
            $"accounts={await db.FinancialAccounts.CountAsync(x => x.TenantId == tenantId)}",
            $"salesInvoices={string.Join(",", await db.SalesInvoices.Where(x => x.TenantId == tenantId).OrderBy(x => x.Id).Select(x => x.Status).ToListAsync())}",
            $"collections={string.Join(",", await db.CustomerCollections.Where(x => x.TenantId == tenantId).OrderBy(x => x.Id).Select(x => x.Status).ToListAsync())}",
            $"purchaseInvoices={string.Join(",", await db.PurchaseInvoices.Where(x => x.TenantId == tenantId).OrderBy(x => x.Id).Select(x => x.Status).ToListAsync())}",
            $"payments={string.Join(",", await db.SupplierPayments.Where(x => x.TenantId == tenantId).OrderBy(x => x.Id).Select(x => x.Status).ToListAsync())}",
            $"transfers={string.Join(",", await db.FinancialAccountTransfers.Where(x => x.TenantId == tenantId).OrderBy(x => x.Id).Select(x => x.Status).ToListAsync())}",
            $"drafts={string.Join(",", await db.PurchaseInvoiceDrafts.Where(x => x.TenantId == tenantId).OrderBy(x => x.Id).Select(x => x.Status).ToListAsync())}",
            $"stock={await db.InventoryTransactions.CountAsync(x => x.TenantId == tenantId)}",
            $"audit={await db.AuditEvents.CountAsync(x => x.TenantId == tenantId)}");
    }
}
