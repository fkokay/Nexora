using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using AIERP.Api;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using Xunit;

namespace AIERP.Api.IntegrationTests;

[Collection("SQL Server acceptance")]
public sealed class SqlServerReturnLocationAcceptanceTests
{
    private static readonly Guid TenantId = Guid.NewGuid();
    private static readonly Guid UserId = Guid.NewGuid();

    [SqlServerAcceptanceFact]
    public async Task Sales_and_purchase_return_endpoints_post_validate_and_read_back_storage_locations()
    {
        var configuredConnection = Environment.GetEnvironmentVariable("AIERP_REPORT_TEST_SQL_CONNECTION_STRING");
        Assert.False(string.IsNullOrWhiteSpace(configuredConnection));
        var suffix = Guid.NewGuid().ToString("N");
        var platformName = $"AIERP_ReturnLocationPlatform_{suffix}";
        var tenantName = $"AIERPTenant_{TenantId:N}";
        var platformConnection = BuildDatabaseConnection(configuredConnection!, platformName);
        var tenantConnection = BuildDatabaseConnection(configuredConnection!, tenantName);
        var studioConnection = BuildDatabaseConnection(configuredConnection!, $"AIERP_ReturnLocationStudio_{suffix}");

        var platformOptions = new DbContextOptionsBuilder<PlatformDbContext>().UseSqlServer(platformConnection).Options;
        var tenantOptions = new DbContextOptionsBuilder<TenantDbContext>().UseSqlServer(tenantConnection).Options;
        await using var platformDb = new PlatformDbContext(platformOptions);
        await using var tenantDb = new TenantDbContext(tenantOptions);
        var platformCreated = false;
        var tenantCreated = false;
        SqlAcceptanceTenantCredential? tenantCredential = null;
        try
        {
            platformCreated = await platformDb.Database.EnsureCreatedAsync();
            tenantCreated = await tenantDb.Database.EnsureCreatedAsync();
            Assert.True(platformCreated);
            Assert.True(tenantCreated);
            tenantCredential = await SqlAcceptanceTenantCredential.CreateAsync(configuredConnection!, TenantId);

            var data = await SeedAsync(platformDb, tenantDb, tenantName);
            using var startupConfiguration = ProcessEnvironmentOverride.Push(new Dictionary<string, string?>
            {
                ["Authentication__SigningKey"] = "synthetic-return-acceptance-signing-key-32-bytes-minimum",
                ["PluginHost__SigningKey"] = "different-synthetic-plugin-signing-key-32-bytes-minimum",
                ["Authentication__Issuer"] = "AIERP",
                ["Authentication__Audience"] = "AIERP",
                ["ConnectionStrings__Platform"] = platformConnection,
                ["ConnectionStrings__Tenant"] = tenantConnection,
                ["ConnectionStrings__AIStudio"] = studioConnection,
                ["Database__SeparationEnabled"] = "true",
                ["Database__ApplyMigrationsOnStartup"] = "false"
            });
            using var factory = new ReturnApiFactory(platformConnection, tenantConnection, studioConnection, tenantCredential.CredentialReader);
            using var client = factory.CreateClient();
            client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantId.ToString("D"));
            client.DefaultRequestHeaders.Add("X-Test-User", UserId.ToString("D"));

            var invalidSales = await client.PostAsJsonAsync($"/api/sales/invoices/{data.SalesInvoiceId:D}/returns", new
            {
                requestId = Guid.NewGuid(), warehouseId = data.WarehouseId, returnDate = "2026-10-20",
                lines = new[] { new { salesInvoiceLineId = data.SalesInvoiceLineId, quantity = 1m, storageLocationId = data.InactiveLocationId } }
            });
            Assert.Equal(HttpStatusCode.BadRequest, invalidSales.StatusCode);

            var salesRequestId = Guid.NewGuid();
            var salesRequest = new
            {
                requestId = salesRequestId, warehouseId = data.WarehouseId, returnDate = "2026-10-20",
                lines = new[] { new { salesInvoiceLineId = data.SalesInvoiceLineId, quantity = 1m, storageLocationId = data.SalesReturnLocationId } }
            };
            using var salesResponse = await client.PostAsJsonAsync($"/api/sales/invoices/{data.SalesInvoiceId:D}/returns", salesRequest);
            Assert.Equal(HttpStatusCode.Created, salesResponse.StatusCode);
            using var salesJson = JsonDocument.Parse(await salesResponse.Content.ReadAsStringAsync());
            var salesReturnId = salesJson.RootElement.GetProperty("id").GetGuid();
            Assert.Equal(data.SalesReturnLocationId,
                salesJson.RootElement.GetProperty("lines")[0].GetProperty("storageLocationId").GetGuid());

            using var salesReplay = await client.PostAsJsonAsync($"/api/sales/invoices/{data.SalesInvoiceId:D}/returns", salesRequest);
            Assert.Equal(HttpStatusCode.OK, salesReplay.StatusCode);
            using var salesReplayJson = JsonDocument.Parse(await salesReplay.Content.ReadAsStringAsync());
            Assert.Equal(salesReturnId, salesReplayJson.RootElement.GetProperty("id").GetGuid());
            Assert.Equal(data.SalesReturnLocationId,
                salesReplayJson.RootElement.GetProperty("lines")[0].GetProperty("storageLocationId").GetGuid());

            using var salesReadback = await client.GetAsync($"/api/sales/invoices/{data.SalesInvoiceId:D}");
            Assert.Equal(HttpStatusCode.OK, salesReadback.StatusCode);
            using var salesReadbackJson = JsonDocument.Parse(await salesReadback.Content.ReadAsStringAsync());
            Assert.Equal(data.SalesReturnLocationId, salesReadbackJson.RootElement.GetProperty("returns")[0]
                .GetProperty("lines")[0].GetProperty("storageLocationId").GetGuid());

            var insufficientPurchase = await client.PostAsJsonAsync($"/api/purchasing/invoices/{data.PurchaseInvoiceId:D}/returns", new
            {
                requestId = Guid.NewGuid(), warehouseId = data.WarehouseId, returnDate = "2026-10-20",
                lines = new[] { new { purchaseInvoiceLineId = data.PurchaseInvoiceLineId, quantity = 2m, storageLocationId = data.PurchaseReturnLocationId } }
            });
            Assert.Equal(HttpStatusCode.Conflict, insufficientPurchase.StatusCode);

            var purchaseRequestId = Guid.NewGuid();
            var purchaseRequest = new
            {
                requestId = purchaseRequestId, warehouseId = data.WarehouseId, returnDate = "2026-10-20",
                lines = new[] { new { purchaseInvoiceLineId = data.PurchaseInvoiceLineId, quantity = 1m, storageLocationId = data.PurchaseReturnLocationId } }
            };
            using var purchaseResponse = await client.PostAsJsonAsync($"/api/purchasing/invoices/{data.PurchaseInvoiceId:D}/returns", purchaseRequest);
            Assert.Equal(HttpStatusCode.Created, purchaseResponse.StatusCode);
            using var purchaseJson = JsonDocument.Parse(await purchaseResponse.Content.ReadAsStringAsync());
            var purchaseReturnId = purchaseJson.RootElement.GetProperty("id").GetGuid();
            Assert.Equal(data.PurchaseReturnLocationId,
                purchaseJson.RootElement.GetProperty("lines")[0].GetProperty("storageLocationId").GetGuid());

            using var purchaseReplay = await client.PostAsJsonAsync($"/api/purchasing/invoices/{data.PurchaseInvoiceId:D}/returns", purchaseRequest);
            Assert.Equal(HttpStatusCode.OK, purchaseReplay.StatusCode);
            using var purchaseReplayJson = JsonDocument.Parse(await purchaseReplay.Content.ReadAsStringAsync());
            Assert.Equal(purchaseReturnId, purchaseReplayJson.RootElement.GetProperty("id").GetGuid());
            Assert.Equal(data.PurchaseReturnLocationId,
                purchaseReplayJson.RootElement.GetProperty("lines")[0].GetProperty("storageLocationId").GetGuid());

            using var purchaseReadback = await client.GetAsync($"/api/purchasing/invoices/{data.PurchaseInvoiceId:D}");
            Assert.Equal(HttpStatusCode.OK, purchaseReadback.StatusCode);
            using var purchaseReadbackJson = JsonDocument.Parse(await purchaseReadback.Content.ReadAsStringAsync());
            Assert.Equal(data.PurchaseReturnLocationId, purchaseReadbackJson.RootElement.GetProperty("returns")[0]
                .GetProperty("lines")[0].GetProperty("storageLocationId").GetGuid());

            await using var readbackTenant = new TenantDbContext(tenantOptions);
            var salesMovement = await readbackTenant.InventoryTransactions.AsNoTracking()
                .SingleAsync(x => x.SalesReturnLine != null && x.SalesReturnLine.SalesReturnId == salesReturnId && x.ReversalOfId == null);
            Assert.Equal(data.SalesReturnLocationId, salesMovement.StorageLocationId);
            var purchaseMovement = await readbackTenant.InventoryTransactions.AsNoTracking()
                .SingleAsync(x => x.SupplierReturnLine != null && x.SupplierReturnLine.SupplierReturnId == purchaseReturnId && x.ReversalOfId == null);
            Assert.Equal(data.PurchaseReturnLocationId, purchaseMovement.StorageLocationId);
            Assert.Equal(7m, purchaseMovement.UnitCostBase);

            using var manualLedgerResponse = await client.PostAsJsonAsync($"/api/customers/{data.CustomerId:D}/ledger", new
            {
                entryDate = "2026-10-20", direction = "Debit", amount = 1m, currencyCode = "TRY", description = "Synthetic manual ledger entry"
            });
            Assert.Equal(HttpStatusCode.Created, manualLedgerResponse.StatusCode);
            using var manualLedgerJson = JsonDocument.Parse(await manualLedgerResponse.Content.ReadAsStringAsync());
            var manualLedgerEntryId = manualLedgerJson.RootElement.GetProperty("id").GetGuid();

            using var closeResponse = await client.PostAsJsonAsync("/api/finance/general-ledger/fiscal-year-close", new
            {
                fromDate = "2026-01-01", toDate = "2026-12-31", retainedEarningsAccountId = data.RetainedEarningsAccountId
            });
            Assert.Equal(HttpStatusCode.Created, closeResponse.StatusCode);
            var salesReturnCount = await readbackTenant.SalesReturns.CountAsync(x => x.TenantId == TenantId);
            var supplierReturnCount = await readbackTenant.SupplierReturns.CountAsync(x => x.TenantId == TenantId);
            var salesInvoiceCount = await readbackTenant.SalesInvoices.CountAsync(x => x.TenantId == TenantId);
            var purchaseInvoiceCount = await readbackTenant.PurchaseInvoices.CountAsync(x => x.TenantId == TenantId);
            var movementCount = await readbackTenant.InventoryTransactions.CountAsync(x => x.TenantId == TenantId);
            var ledgerCount = await readbackTenant.CustomerLedgerEntries.CountAsync(x => x.TenantId == TenantId);
            var returnAuditCount = await readbackTenant.AuditEvents.CountAsync(x => x.TenantId == TenantId &&
                (x.Action == "sales-return.posted" || x.Action == "supplier-return.posted"));
            var manualLedgerAuditCount = await readbackTenant.AuditEvents.CountAsync(x => x.TenantId == TenantId &&
                (x.Action == "customer-ledger.created" || x.Action == "customer-ledger.reversed"));
            var invoiceAuditCount = await readbackTenant.AuditEvents.CountAsync(x => x.TenantId == TenantId &&
                (x.Action == "sales-invoice.posted" || x.Action == "purchase-invoice.posted"));
            var fxVoucherCount = await readbackTenant.FxRevaluationVouchers.CountAsync(x => x.TenantId == TenantId);
            var costAdjustmentCount = await readbackTenant.InventoryCostAdjustments.CountAsync(x => x.TenantId == TenantId);
            var valuationAuditCount = await readbackTenant.AuditEvents.CountAsync(x => x.TenantId == TenantId &&
                (x.Action == "finance.fx-revaluation.created" || x.Action == "inventory-landed-cost.posted"));
            var totalAuditCountAfterClose = await readbackTenant.AuditEvents.CountAsync(x => x.TenantId == TenantId);

            using var closedManualLedger = await client.PostAsJsonAsync($"/api/customers/{data.CustomerId:D}/ledger", new
            {
                entryDate = "2026-10-21", direction = "Credit", amount = 1m, currencyCode = "TRY", description = "Closed-period manual ledger entry"
            });
            Assert.Equal(HttpStatusCode.Conflict, closedManualLedger.StatusCode);
            Assert.Contains("dönemi kapalı", await closedManualLedger.Content.ReadAsStringAsync(), StringComparison.OrdinalIgnoreCase);

            using var closedManualReversal = await client.PostAsJsonAsync($"/api/customers/{data.CustomerId:D}/ledger/{manualLedgerEntryId:D}/reverse", new
            {
                reason = "Closed-period reversal"
            });
            Assert.Equal(HttpStatusCode.Conflict, closedManualReversal.StatusCode);
            Assert.Contains("dönemi kapalı", await closedManualReversal.Content.ReadAsStringAsync(), StringComparison.OrdinalIgnoreCase);

            using var closedSalesReturn = await client.PostAsJsonAsync($"/api/sales/invoices/{data.SalesInvoiceId:D}/returns", new
            {
                requestId = Guid.NewGuid(), warehouseId = data.WarehouseId, returnDate = "2026-10-21",
                lines = new[] { new { salesInvoiceLineId = data.SalesInvoiceLineId, quantity = 1m, storageLocationId = data.SalesReturnLocationId } }
            });
            Assert.Equal(HttpStatusCode.Conflict, closedSalesReturn.StatusCode);
            Assert.Contains("dönemi kapalı", await closedSalesReturn.Content.ReadAsStringAsync(), StringComparison.OrdinalIgnoreCase);

            using var closedSupplierReturn = await client.PostAsJsonAsync($"/api/purchasing/invoices/{data.PurchaseInvoiceId:D}/returns", new
            {
                requestId = Guid.NewGuid(), warehouseId = data.WarehouseId, returnDate = "2026-10-21",
                lines = new[] { new { purchaseInvoiceLineId = data.PurchaseInvoiceLineId, quantity = 1m, storageLocationId = data.PurchaseReturnLocationId } }
            });
            Assert.Equal(HttpStatusCode.Conflict, closedSupplierReturn.StatusCode);
            Assert.Contains("dönemi kapalı", await closedSupplierReturn.Content.ReadAsStringAsync(), StringComparison.OrdinalIgnoreCase);

            using var closedSalesInvoice = await client.PostAsync($"/api/sales/deliveries/{data.UnbilledSalesDeliveryId:D}/invoice", content: null);
            Assert.Equal(HttpStatusCode.Conflict, closedSalesInvoice.StatusCode);
            Assert.Contains("dönemi kapalı", await closedSalesInvoice.Content.ReadAsStringAsync(), StringComparison.OrdinalIgnoreCase);

            using var closedPurchaseInvoice = await client.PostAsJsonAsync($"/api/purchasing/receipts/{data.UnbilledPurchaseReceiptId:D}/invoice", new
            {
                code = "PINV-CLOSED-TEST", invoiceDate = "2026-10-21"
            });
            Assert.Equal(HttpStatusCode.Conflict, closedPurchaseInvoice.StatusCode);
            Assert.Contains("dönemi kapalı", await closedPurchaseInvoice.Content.ReadAsStringAsync(), StringComparison.OrdinalIgnoreCase);

            using var closedFxValuation = await client.PostAsJsonAsync("/api/finance/fx-revaluations/", new { asOfDate = "2026-10-21" });
            Assert.Equal(HttpStatusCode.Conflict, closedFxValuation.StatusCode);
            Assert.Contains("dönemi kapalı", await closedFxValuation.Content.ReadAsStringAsync(), StringComparison.OrdinalIgnoreCase);

            using var closedLandedCost = await client.PostAsJsonAsync($"/api/purchasing/receipts/{data.PurchaseReceiptId:D}/landed-costs", new
            {
                entryDate = "2026-10-21", amountBase = 25m, allocationMethod = "EQUAL", description = "Closed-period landed cost"
            });
            Assert.Equal(HttpStatusCode.Conflict, closedLandedCost.StatusCode);
            Assert.Contains("dönemi kapalı", await closedLandedCost.Content.ReadAsStringAsync(), StringComparison.OrdinalIgnoreCase);

            using var closedSalesReturnVoid = await client.PostAsync($"/api/sales/returns/{salesReturnId:D}/void", content: null);
            Assert.Equal(HttpStatusCode.Conflict, closedSalesReturnVoid.StatusCode);
            Assert.Contains("dönemi kapalı", await closedSalesReturnVoid.Content.ReadAsStringAsync(), StringComparison.OrdinalIgnoreCase);

            using var closedSupplierReturnVoid = await client.PostAsync($"/api/purchasing/returns/{purchaseReturnId:D}/void", content: null);
            Assert.Equal(HttpStatusCode.Conflict, closedSupplierReturnVoid.StatusCode);
            Assert.Contains("dönemi kapalı", await closedSupplierReturnVoid.Content.ReadAsStringAsync(), StringComparison.OrdinalIgnoreCase);

            using var closedSalesDeliveryVoid = await client.PostAsync($"/api/sales/deliveries/{data.UnbilledSalesDeliveryId:D}/void", content: null);
            Assert.Equal(HttpStatusCode.Conflict, closedSalesDeliveryVoid.StatusCode);
            Assert.Contains("dönemi kapalı", await closedSalesDeliveryVoid.Content.ReadAsStringAsync(), StringComparison.OrdinalIgnoreCase);

            using var closedPurchaseReceiptVoid = await client.PostAsync($"/api/purchasing/receipts/{data.UnbilledPurchaseReceiptId:D}/void", content: null);
            Assert.Equal(HttpStatusCode.Conflict, closedPurchaseReceiptVoid.StatusCode);
            Assert.Contains("dönemi kapalı", await closedPurchaseReceiptVoid.Content.ReadAsStringAsync(), StringComparison.OrdinalIgnoreCase);

            using var closedStockMovement = await client.PostAsJsonAsync(
                $"/api/warehouses/{data.WarehouseId:D}/stock/{data.StockItemId:D}/transactions", new
                {
                    entryDate = "2026-10-21", direction = "Receipt", quantity = 1m, unitCostBase = 5m,
                    description = "Closed-period synthetic stock movement"
                });
            Assert.Equal(HttpStatusCode.Conflict, closedStockMovement.StatusCode);
            Assert.Contains("dönemi kapalı", await closedStockMovement.Content.ReadAsStringAsync(), StringComparison.OrdinalIgnoreCase);

            Assert.Equal(salesReturnCount, await readbackTenant.SalesReturns.CountAsync(x => x.TenantId == TenantId));
            Assert.Equal(supplierReturnCount, await readbackTenant.SupplierReturns.CountAsync(x => x.TenantId == TenantId));
            Assert.Equal(salesInvoiceCount, await readbackTenant.SalesInvoices.CountAsync(x => x.TenantId == TenantId));
            Assert.Equal(purchaseInvoiceCount, await readbackTenant.PurchaseInvoices.CountAsync(x => x.TenantId == TenantId));
            Assert.Equal(movementCount, await readbackTenant.InventoryTransactions.CountAsync(x => x.TenantId == TenantId));
            Assert.Equal(ledgerCount, await readbackTenant.CustomerLedgerEntries.CountAsync(x => x.TenantId == TenantId));
            Assert.Equal(returnAuditCount, await readbackTenant.AuditEvents.CountAsync(x => x.TenantId == TenantId &&
                (x.Action == "sales-return.posted" || x.Action == "supplier-return.posted")));
            Assert.Equal(manualLedgerAuditCount, await readbackTenant.AuditEvents.CountAsync(x => x.TenantId == TenantId &&
                (x.Action == "customer-ledger.created" || x.Action == "customer-ledger.reversed")));
            Assert.Equal(invoiceAuditCount, await readbackTenant.AuditEvents.CountAsync(x => x.TenantId == TenantId &&
                (x.Action == "sales-invoice.posted" || x.Action == "purchase-invoice.posted")));
            Assert.Equal(fxVoucherCount, await readbackTenant.FxRevaluationVouchers.CountAsync(x => x.TenantId == TenantId));
            Assert.Equal(costAdjustmentCount, await readbackTenant.InventoryCostAdjustments.CountAsync(x => x.TenantId == TenantId));
            Assert.Equal(valuationAuditCount, await readbackTenant.AuditEvents.CountAsync(x => x.TenantId == TenantId &&
                (x.Action == "finance.fx-revaluation.created" || x.Action == "inventory-landed-cost.posted")));
            Assert.Equal(totalAuditCountAfterClose, await readbackTenant.AuditEvents.CountAsync(x => x.TenantId == TenantId));
            Assert.Equal(SalesReturnStatus.Posted, await readbackTenant.SalesReturns.AsNoTracking()
                .Where(x => x.TenantId == TenantId && x.Id == salesReturnId).Select(x => x.Status).SingleAsync());
            Assert.Equal(SupplierReturnStatus.Posted, await readbackTenant.SupplierReturns.AsNoTracking()
                .Where(x => x.TenantId == TenantId && x.Id == purchaseReturnId).Select(x => x.Status).SingleAsync());
        }
        finally
        {
            if (tenantCreated) await tenantDb.Database.EnsureDeletedAsync();
            if (platformCreated) await platformDb.Database.EnsureDeletedAsync();
            if (tenantCredential is not null) await tenantCredential.DisposeAsync();
        }
    }

    private static string BuildDatabaseConnection(string source, string databaseName)
    {
        var builder = new SqlConnectionStringBuilder(source)
        {
            InitialCatalog = databaseName,
            ConnectTimeout = 15,
            TrustServerCertificate = true
        };
        return builder.ConnectionString;
    }

    private static async Task<SeedIds> SeedAsync(PlatformDbContext platformDb, TenantDbContext tenantDb, string tenantDatabase)
    {
        var tenant = new Tenant { Id = TenantId, Name = "Synthetic returns tenant", Slug = $"returns-{Guid.NewGuid():N}" };
        platformDb.Tenants.Add(tenant);
        platformDb.Users.Add(new AppUser { Id = UserId, Email = $"returns-{Guid.NewGuid():N}@example.invalid", DisplayName = "Synthetic Tenant Admin" });
        platformDb.TenantMemberships.Add(new TenantMembership { TenantId = TenantId, UserId = UserId, Role = "TenantAdmin" });
        platformDb.TenantDatabaseCatalog.Add(new TenantDatabaseCatalogEntry
        {
            TenantId = TenantId, Tenant = tenant, DatabaseName = tenantDatabase, State = TenantDatabaseProvisioningState.Ready, ReadyAt = DateTimeOffset.UtcNow
        });
        await platformDb.SaveChangesAsync();

        var customer = new CustomerAccount { TenantId = TenantId, Tenant = tenant, Code = "CUST-RETURN", Name = "Synthetic customer", Type = CounterpartyType.Customer };
        var supplier = new CustomerAccount { TenantId = TenantId, Tenant = tenant, Code = "SUP-RETURN", Name = "Synthetic supplier", Type = CounterpartyType.Supplier };
        var warehouse = new Warehouse { TenantId = TenantId, Tenant = tenant, Code = "WH-RETURN", Name = "Synthetic warehouse" };
        var salesLocation = new WarehouseLocation { TenantId = TenantId, WarehouseId = warehouse.Id, Warehouse = warehouse, Code = "SALES-RET", Name = "Sales return bin" };
        var purchaseLocation = new WarehouseLocation { TenantId = TenantId, WarehouseId = warehouse.Id, Warehouse = warehouse, Code = "PURCHASE-RET", Name = "Purchase return bin" };
        var inactiveLocation = new WarehouseLocation { TenantId = TenantId, WarehouseId = warehouse.Id, Warehouse = warehouse, Code = "INACTIVE", Name = "Inactive bin", IsActive = false };
        var item = new StockItem { TenantId = TenantId, Tenant = tenant, Code = "SKU-RETURN", Name = "Synthetic item", UnitCode = "EA" };

        var quote = new SalesQuote { TenantId = TenantId, Tenant = tenant, CustomerId = customer.Id, Customer = customer,
            Code = "Q-RETURN", QuoteDate = new DateOnly(2026, 10, 1), ValidUntil = new DateOnly(2026, 11, 1), Status = SalesQuoteStatus.Accepted,
            Subtotal = 20m, GrandTotal = 20m };
        var salesOrder = new SalesOrder { TenantId = TenantId, Tenant = tenant, QuoteId = quote.Id, Quote = quote, CustomerId = customer.Id,
            Customer = customer, Code = "SO-RETURN", OrderDate = new DateOnly(2026, 10, 2), Status = SalesOrderStatus.Fulfilled, Subtotal = 20m, GrandTotal = 20m };
        var salesOrderLine = new SalesOrderLine { TenantId = TenantId, OrderId = salesOrder.Id, Order = salesOrder, LineNumber = 1,
            StockItemId = item.Id, StockItem = item, StockCode = item.Code, StockName = item.Name, UnitCode = item.UnitCode,
            Quantity = 2m, UnitPrice = 10m, LineSubtotal = 20m, LineTotal = 20m };
        salesOrder.Lines.Add(salesOrderLine);
        var delivery = new SalesDelivery { TenantId = TenantId, Tenant = tenant, OrderId = salesOrder.Id, Order = salesOrder,
            WarehouseId = warehouse.Id, Warehouse = warehouse, RequestId = Guid.NewGuid(), Code = "DEL-RETURN", DeliveryDate = new DateOnly(2026, 10, 3) };
        var deliveryLine = new SalesDeliveryLine { TenantId = TenantId, DeliveryId = delivery.Id, Delivery = delivery, OrderId = salesOrder.Id,
            OrderLineNumber = 1, OrderLine = salesOrderLine, StockItemId = item.Id, StockCode = item.Code, StockName = item.Name, UnitCode = item.UnitCode, Quantity = 2m };
        delivery.Lines.Add(deliveryLine);
        var salesInvoice = new SalesInvoice { TenantId = TenantId, Tenant = tenant, DeliveryId = delivery.Id, Delivery = delivery,
            OrderId = salesOrder.Id, Order = salesOrder, CustomerId = customer.Id, Customer = customer, Code = "INV-RETURN",
            InvoiceDate = new DateOnly(2026, 10, 4), Status = SalesInvoiceStatus.Posted, Subtotal = 20m, GrandTotal = 20m };
        var salesInvoiceLine = new SalesInvoiceLine { TenantId = TenantId, InvoiceId = salesInvoice.Id, Invoice = salesInvoice,
            DeliveryLineId = deliveryLine.Id, DeliveryLine = deliveryLine, OrderLineNumber = 1, StockItemId = item.Id,
            StockCode = item.Code, StockName = item.Name, UnitCode = item.UnitCode, Quantity = 2m, UnitPrice = 10m,
            LineSubtotal = 20m, LineTotal = 20m };
        salesInvoice.Lines.Add(salesInvoiceLine);

        var unbilledQuote = new SalesQuote { TenantId = TenantId, Tenant = tenant, CustomerId = customer.Id, Customer = customer,
            Code = "Q-RETURN-CLOSED", QuoteDate = new DateOnly(2026, 10, 1), ValidUntil = new DateOnly(2026, 11, 1), Status = SalesQuoteStatus.Accepted,
            Subtotal = 10m, GrandTotal = 10m };
        var unbilledOrder = new SalesOrder { TenantId = TenantId, Tenant = tenant, QuoteId = unbilledQuote.Id, Quote = unbilledQuote, CustomerId = customer.Id,
            Customer = customer, Code = "SO-RETURN-CLOSED", OrderDate = new DateOnly(2026, 10, 2), Subtotal = 10m, GrandTotal = 10m };
        var unbilledOrderLine = new SalesOrderLine { TenantId = TenantId, OrderId = unbilledOrder.Id, Order = unbilledOrder, LineNumber = 1,
            StockItemId = item.Id, StockItem = item, StockCode = item.Code, StockName = item.Name, UnitCode = item.UnitCode,
            Quantity = 1m, UnitPrice = 10m, LineSubtotal = 10m, LineTotal = 10m };
        unbilledOrder.Lines.Add(unbilledOrderLine);
        var unbilledDelivery = new SalesDelivery { TenantId = TenantId, Tenant = tenant, OrderId = unbilledOrder.Id, Order = unbilledOrder,
            WarehouseId = warehouse.Id, Warehouse = warehouse, RequestId = Guid.NewGuid(), Code = "DEL-RETURN-CLOSED", DeliveryDate = new DateOnly(2026, 10, 5) };
        unbilledDelivery.Lines.Add(new SalesDeliveryLine { TenantId = TenantId, DeliveryId = unbilledDelivery.Id, Delivery = unbilledDelivery,
            OrderId = unbilledOrder.Id, OrderLineNumber = 1, OrderLine = unbilledOrderLine, StockItemId = item.Id,
            StockCode = item.Code, StockName = item.Name, UnitCode = item.UnitCode, Quantity = 1m });

        var purchaseOrder = new PurchaseOrder { TenantId = TenantId, Tenant = tenant, SupplierId = supplier.Id, Supplier = supplier,
            Code = "PO-RETURN", OrderDate = new DateOnly(2026, 10, 1), TargetWarehouseId = warehouse.Id, TargetWarehouse = warehouse };
        var purchaseOrderLine = new PurchaseOrderLine { TenantId = TenantId, PurchaseOrderId = purchaseOrder.Id, PurchaseOrder = purchaseOrder,
            LineNumber = 1, StockItemId = item.Id, StockItem = item, StockCode = item.Code, StockName = item.Name, UnitCode = item.UnitCode,
            Quantity = 3m, UnitPrice = 5m, LineSubtotal = 15m, LineTotal = 15m };
        purchaseOrder.Lines.Add(purchaseOrderLine);
        var purchaseReceipt = new PurchaseReceipt { TenantId = TenantId, Tenant = tenant, RequestId = Guid.NewGuid(), PurchaseOrderId = purchaseOrder.Id,
            PurchaseOrder = purchaseOrder, WarehouseId = warehouse.Id, Warehouse = warehouse, Code = "GR-RETURN", ReceiptDate = new DateOnly(2026, 10, 2) };
        var purchaseReceiptLine = new PurchaseReceiptLine { TenantId = TenantId, ReceiptId = purchaseReceipt.Id, Receipt = purchaseReceipt,
            PurchaseOrderId = purchaseOrder.Id, OrderLineNumber = 1, OrderLine = purchaseOrderLine, StockItemId = item.Id,
            StockCode = item.Code, StockName = item.Name, UnitCode = item.UnitCode, Quantity = 3m };
        purchaseReceipt.Lines.Add(purchaseReceiptLine);
        var purchaseInvoice = new PurchaseInvoice { TenantId = TenantId, Tenant = tenant, PurchaseReceiptId = purchaseReceipt.Id,
            PurchaseReceipt = purchaseReceipt, PurchaseOrderId = purchaseOrder.Id, PurchaseOrder = purchaseOrder, SupplierId = supplier.Id,
            Supplier = supplier, Code = "PINV-RETURN", InvoiceDate = new DateOnly(2026, 10, 3), DueDate = new DateOnly(2026, 11, 3),
            Status = PurchaseInvoiceStatus.Posted, Subtotal = 15m, GrandTotal = 15m };
        var purchaseInvoiceLine = new PurchaseInvoiceLine { TenantId = TenantId, PurchaseInvoiceId = purchaseInvoice.Id, PurchaseInvoice = purchaseInvoice,
            PurchaseReceiptLineId = purchaseReceiptLine.Id, PurchaseReceiptId = purchaseReceipt.Id, PurchaseReceiptLine = purchaseReceiptLine,
            OrderLineNumber = 1, StockItemId = item.Id, StockCode = item.Code, StockName = item.Name, UnitCode = item.UnitCode,
            Quantity = 3m, UnitPrice = 5m, LineSubtotal = 15m, LineTotal = 15m };
        purchaseInvoice.Lines.Add(purchaseInvoiceLine);

        var unbilledPurchaseOrder = new PurchaseOrder { TenantId = TenantId, Tenant = tenant, SupplierId = supplier.Id, Supplier = supplier,
            Code = "PO-RETURN-CLOSED", OrderDate = new DateOnly(2026, 10, 1), TargetWarehouseId = warehouse.Id, TargetWarehouse = warehouse };
        var unbilledPurchaseOrderLine = new PurchaseOrderLine { TenantId = TenantId, PurchaseOrderId = unbilledPurchaseOrder.Id, PurchaseOrder = unbilledPurchaseOrder,
            LineNumber = 1, StockItemId = item.Id, StockItem = item, StockCode = item.Code, StockName = item.Name, UnitCode = item.UnitCode,
            Quantity = 1m, UnitPrice = 5m, LineSubtotal = 5m, LineTotal = 5m };
        unbilledPurchaseOrder.Lines.Add(unbilledPurchaseOrderLine);
        var unbilledPurchaseReceipt = new PurchaseReceipt { TenantId = TenantId, Tenant = tenant, RequestId = Guid.NewGuid(),
            PurchaseOrderId = unbilledPurchaseOrder.Id, PurchaseOrder = unbilledPurchaseOrder, WarehouseId = warehouse.Id,
            Warehouse = warehouse, Code = "GR-RETURN-CLOSED", ReceiptDate = new DateOnly(2026, 10, 6) };
        unbilledPurchaseReceipt.Lines.Add(new PurchaseReceiptLine { TenantId = TenantId, ReceiptId = unbilledPurchaseReceipt.Id,
            Receipt = unbilledPurchaseReceipt, PurchaseOrderId = unbilledPurchaseOrder.Id, OrderLineNumber = 1,
            OrderLine = unbilledPurchaseOrderLine, StockItemId = item.Id, StockCode = item.Code, StockName = item.Name,
            UnitCode = item.UnitCode, Quantity = 1m });

        tenantDb.Tenants.Add(tenant);
        tenantDb.CustomerAccounts.AddRange(customer, supplier);
        tenantDb.Warehouses.Add(warehouse);
        tenantDb.WarehouseLocations.AddRange(salesLocation, purchaseLocation, inactiveLocation);
        tenantDb.StockItems.Add(item);
        tenantDb.SalesQuotes.Add(quote);
        tenantDb.SalesOrders.Add(salesOrder);
        tenantDb.SalesOrders.Add(unbilledOrder);
        tenantDb.SalesDeliveries.AddRange(delivery, unbilledDelivery);
        tenantDb.SalesInvoices.Add(salesInvoice);
        tenantDb.PurchaseOrders.AddRange(purchaseOrder, unbilledPurchaseOrder);
        tenantDb.PurchaseReceipts.AddRange(purchaseReceipt, unbilledPurchaseReceipt);
        tenantDb.PurchaseInvoices.Add(purchaseInvoice);
        tenantDb.InventoryTransactions.AddRange(
            new InventoryTransaction { TenantId = TenantId, WarehouseId = warehouse.Id, StockItemId = item.Id, SalesDeliveryLineId = deliveryLine.Id,
                EntryDate = new DateOnly(2026, 10, 3), Direction = InventoryDirection.Issue, Quantity = 2m, UnitCostBase = 3m, Description = "Synthetic delivery" },
            new InventoryTransaction { TenantId = TenantId, WarehouseId = warehouse.Id, StockItemId = item.Id, PurchaseReceiptLineId = purchaseReceiptLine.Id,
                StorageLocationId = purchaseLocation.Id, EntryDate = new DateOnly(2026, 10, 2), Direction = InventoryDirection.Receipt,
                Quantity = 1m, UnitCostBase = 5m, Description = "Located purchase receipt" },
            new InventoryTransaction { TenantId = TenantId, WarehouseId = warehouse.Id, StockItemId = item.Id, PurchaseReceiptLineId = purchaseReceiptLine.Id,
                EntryDate = new DateOnly(2026, 10, 2), Direction = InventoryDirection.Receipt, Quantity = 2m, UnitCostBase = 8m, Description = "Unlocated purchase receipt" });
        var cashAccount = new LedgerAccount { TenantId = TenantId, Code = "A100", Name = "Synthetic cash", StatementSection = LedgerAccountStatementSection.Asset };
        var retainedEarnings = new LedgerAccount { TenantId = TenantId, Code = "E390", Name = "Synthetic retained earnings", StatementSection = LedgerAccountStatementSection.Equity };
        var opening = new JournalEntry { TenantId = TenantId, Code = "OPEN-RETURN-2026", EntryDate = new DateOnly(2026, 1, 1),
            Description = "Synthetic opening balances", SourceType = "Manual", SourceId = Guid.NewGuid() };
        opening.Lines.Add(new JournalEntryLine { TenantId = TenantId, JournalEntryId = opening.Id, AccountId = cashAccount.Id,
            LineNumber = 1, Description = "Synthetic cash", Debit = 1000m, Credit = 0m });
        opening.Lines.Add(new JournalEntryLine { TenantId = TenantId, JournalEntryId = opening.Id, AccountId = retainedEarnings.Id,
            LineNumber = 2, Description = "Synthetic equity", Debit = 0m, Credit = 1000m });
        tenantDb.LedgerAccounts.AddRange(cashAccount, retainedEarnings);
        tenantDb.JournalEntries.Add(opening);
        await tenantDb.SaveChangesAsync();
        return new SeedIds(item.Id, customer.Id, warehouse.Id, salesLocation.Id, purchaseLocation.Id, inactiveLocation.Id, salesInvoice.Id, salesInvoiceLine.Id,
            purchaseInvoice.Id, purchaseInvoiceLine.Id, retainedEarnings.Id, unbilledDelivery.Id, purchaseReceipt.Id, unbilledPurchaseReceipt.Id);
    }

    private sealed record SeedIds(Guid StockItemId, Guid CustomerId, Guid WarehouseId, Guid SalesReturnLocationId, Guid PurchaseReturnLocationId, Guid InactiveLocationId,
        Guid SalesInvoiceId, Guid SalesInvoiceLineId, Guid PurchaseInvoiceId, Guid PurchaseInvoiceLineId, Guid RetainedEarningsAccountId,
        Guid UnbilledSalesDeliveryId, Guid PurchaseReceiptId, Guid UnbilledPurchaseReceiptId);

    private sealed class ProcessEnvironmentOverride(IReadOnlyDictionary<string, string?> previousValues) : IDisposable
    {
        public static ProcessEnvironmentOverride Push(IReadOnlyDictionary<string, string?> values)
        {
            var previous = values.Keys.ToDictionary(key => key, Environment.GetEnvironmentVariable);
            foreach (var (key, value) in values) Environment.SetEnvironmentVariable(key, value);
            return new ProcessEnvironmentOverride(previous);
        }

        public void Dispose()
        {
            foreach (var (key, value) in previousValues) Environment.SetEnvironmentVariable(key, value);
        }
    }

    private sealed class ReturnApiFactory(string platformConnection, string tenantConnection, string studioConnection,
        ITenantSqlCredentialReader credentialReader) : WebApplicationFactory<ApiEntryPointMarker>
    {
        protected override IHost CreateHost(IHostBuilder builder)
        {
            builder.ConfigureHostConfiguration(configuration => configuration.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Vault:Address"] = "https://vault.test",
                ["Vault:TenantSqlCredentialReader:RoleId"] = "return-location-test-role",
                ["Vault:TenantSqlCredentialReader:SecretId"] = "return-location-test-secret"
            }));
            return base.CreateHost(builder);
        }

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Production);
            builder.ConfigureAppConfiguration((_, configuration) => configuration.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Authentication:SigningKey"] = "synthetic-return-acceptance-signing-key-32-bytes-minimum",
                ["PluginHost:SigningKey"] = "different-synthetic-plugin-signing-key-32-bytes-minimum",
                ["Authentication:Issuer"] = "AIERP",
                ["Authentication:Audience"] = "AIERP",
                ["ConnectionStrings:Platform"] = platformConnection,
                ["ConnectionStrings:Tenant"] = tenantConnection,
                ["ConnectionStrings:AIStudio"] = studioConnection,
                ["Database:SeparationEnabled"] = "true",
                ["Database:ApplyMigrationsOnStartup"] = "false"
            }));
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<ITenantSqlCredentialReader>();
                services.AddSingleton(credentialReader);
                services.AddAuthentication("report-test")
                    .AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("report-test", _ => { });
            var backgroundWorkers = services.Where(descriptor => descriptor.ServiceType == typeof(IHostedService)
                && descriptor.ImplementationType?.Name is "IntegrationOperationWorker" or "AuditRetentionWorker" or "TcmbExchangeRateWorker")
                .ToArray();
            foreach (var worker in backgroundWorkers) services.Remove(worker);
            });
        }
    }
}
