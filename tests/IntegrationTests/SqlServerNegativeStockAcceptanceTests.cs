using System.Net;
using System.Net.Http.Json;
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

public sealed class SqlServerNegativeStockAcceptanceTests
{
    private static readonly Guid TenantId = Guid.Parse("d6afec65-3418-4b4a-9d84-b8c352efad55");
    private static readonly Guid UserId = Guid.Parse("7cac183e-305a-43c6-aa17-c19d110f6a19");

    [SqlServerAcceptanceFact]
    public async Task Company_negative_stock_setting_controls_manual_issues_deliveries_purchase_returns_and_transfers()
    {
        var configuredConnection = Environment.GetEnvironmentVariable("AIERP_REPORT_TEST_SQL_CONNECTION_STRING");
        Assert.False(string.IsNullOrWhiteSpace(configuredConnection));
        var suffix = Guid.NewGuid().ToString("N");
        var platformConnection = BuildDatabaseConnection(configuredConnection!, $"AIERP_NegativeStockPlatform_{suffix}");
        var tenantConnection = BuildDatabaseConnection(configuredConnection!, $"AIERP_NegativeStockTenant_{suffix}");
        var studioConnection = BuildDatabaseConnection(configuredConnection!, $"AIERP_NegativeStockStudio_{suffix}");
        var platformCreated = false;
        var tenantCreated = false;
        try
        {
            var platformOptions = new DbContextOptionsBuilder<PlatformDbContext>().UseSqlServer(platformConnection).Options;
            var tenantOptions = new DbContextOptionsBuilder<TenantDbContext>().UseSqlServer(tenantConnection).Options;
            await using var platformDb = new PlatformDbContext(platformOptions);
            await using var tenantDb = new TenantDbContext(tenantOptions);
            platformCreated = await platformDb.Database.EnsureCreatedAsync();
            tenantCreated = await tenantDb.Database.EnsureCreatedAsync();
            Assert.True(platformCreated);
            Assert.True(tenantCreated);

            var tenant = new Tenant { Id = TenantId, Name = "Negative stock acceptance", Slug = $"negative-stock-{suffix}" };
            var warehouse = new Warehouse { TenantId = TenantId, Tenant = tenant, Code = "WH-NEG", Name = "Negative source" };
            var destination = new Warehouse { TenantId = TenantId, Tenant = tenant, Code = "WH-DEST", Name = "Transfer destination" };
            var stockItem = new StockItem { TenantId = TenantId, Tenant = tenant, Code = "SKU-NEG", Name = "Untracked item", UnitCode = "EA" };
            var salesStockItem = new StockItem { TenantId = TenantId, Tenant = tenant, Code = "SKU-SALES-NEG", Name = "Sales untracked item", UnitCode = "EA" };
            var purchaseStockItem = new StockItem { TenantId = TenantId, Tenant = tenant, Code = "SKU-PURCHASE-NEG", Name = "Purchase untracked item", UnitCode = "EA" };
            var customer = new CustomerAccount { TenantId = TenantId, Tenant = tenant, Code = "C-NEG", Name = "Synthetic customer", Type = CounterpartyType.Customer };
            var supplier = new CustomerAccount { TenantId = TenantId, Tenant = tenant, Code = "S-NEG", Name = "Synthetic supplier", Type = CounterpartyType.Supplier };
            var quote = new SalesQuote { TenantId = TenantId, Tenant = tenant, CustomerId = customer.Id, Customer = customer,
                Code = "Q-NEG", QuoteDate = new DateOnly(2026, 10, 20), ValidUntil = new DateOnly(2026, 11, 20), Status = SalesQuoteStatus.Accepted };
            var salesOrder = new SalesOrder { TenantId = TenantId, Tenant = tenant, QuoteId = quote.Id, Quote = quote,
                CustomerId = customer.Id, Customer = customer, Code = "SO-NEG", OrderDate = new DateOnly(2026, 10, 20), Status = SalesOrderStatus.Open };
            salesOrder.Lines.Add(new SalesOrderLine { TenantId = TenantId, Order = salesOrder, LineNumber = 1,
                StockItemId = salesStockItem.Id, StockItem = salesStockItem, StockCode = salesStockItem.Code,
                StockName = salesStockItem.Name, UnitCode = "EA", Quantity = 1m, UnitPrice = 10m, VatPercent = 20m,
                LineSubtotal = 10m, TaxAmount = 2m, LineTotal = 12m });
            var purchaseOrder = new PurchaseOrder { TenantId = TenantId, Tenant = tenant, SupplierId = supplier.Id, Supplier = supplier,
                Code = "PO-NEG", OrderDate = new DateOnly(2026, 10, 20), TargetWarehouseId = warehouse.Id, TargetWarehouse = warehouse };
            var purchaseOrderLine = new PurchaseOrderLine { TenantId = TenantId, PurchaseOrder = purchaseOrder, LineNumber = 1,
                StockItemId = purchaseStockItem.Id, StockItem = purchaseStockItem, StockCode = purchaseStockItem.Code,
                StockName = purchaseStockItem.Name, UnitCode = "EA", Quantity = 1m, UnitPrice = 10m, LineSubtotal = 10m, LineTotal = 10m };
            purchaseOrder.Lines.Add(purchaseOrderLine);
            var purchaseReceipt = new PurchaseReceipt { TenantId = TenantId, Tenant = tenant, RequestId = Guid.NewGuid(),
                PurchaseOrder = purchaseOrder, Warehouse = warehouse, Code = "GR-NEG", ReceiptDate = new DateOnly(2026, 10, 20) };
            var purchaseReceiptLine = new PurchaseReceiptLine { TenantId = TenantId, Receipt = purchaseReceipt, PurchaseOrderId = purchaseOrder.Id,
                OrderLine = purchaseOrderLine, StockItemId = purchaseStockItem.Id, StockCode = purchaseStockItem.Code,
                StockName = purchaseStockItem.Name, UnitCode = "EA", Quantity = 1m };
            purchaseReceipt.Lines.Add(purchaseReceiptLine);
            var purchaseInvoice = new PurchaseInvoice { TenantId = TenantId, Tenant = tenant, PurchaseReceipt = purchaseReceipt,
                PurchaseOrder = purchaseOrder, SupplierId = supplier.Id, Supplier = supplier, Code = "PI-NEG",
                InvoiceDate = new DateOnly(2026, 10, 20), DueDate = new DateOnly(2026, 11, 20), Status = PurchaseInvoiceStatus.Posted,
                Subtotal = 10m, GrandTotal = 10m };
            var purchaseInvoiceLine = new PurchaseInvoiceLine { TenantId = TenantId, PurchaseInvoice = purchaseInvoice,
                PurchaseReceiptLineId = purchaseReceiptLine.Id, PurchaseReceiptId = purchaseReceipt.Id, PurchaseReceiptLine = purchaseReceiptLine,
                OrderLineNumber = 1, StockItemId = purchaseStockItem.Id, StockCode = purchaseStockItem.Code,
                StockName = purchaseStockItem.Name, UnitCode = "EA", Quantity = 1m, UnitPrice = 10m, LineSubtotal = 10m, LineTotal = 10m };
            purchaseInvoice.Lines.Add(purchaseInvoiceLine);
            platformDb.Tenants.Add(tenant);
            platformDb.Users.Add(new AppUser { Id = UserId, Email = $"negative-{suffix}@example.invalid", DisplayName = "Synthetic Tenant Admin", PasswordHash = "test" });
            platformDb.TenantMemberships.Add(new TenantMembership { TenantId = TenantId, UserId = UserId, Role = "TenantAdmin" });
            platformDb.TenantDatabaseCatalog.Add(new TenantDatabaseCatalogEntry
            {
                TenantId = TenantId, Tenant = tenant, DatabaseName = new SqlConnectionStringBuilder(tenantConnection).InitialCatalog,
                State = TenantDatabaseProvisioningState.Ready, ReadyAt = DateTimeOffset.UtcNow
            });
            await platformDb.SaveChangesAsync();
            tenantDb.Tenants.Add(tenant);
            tenantDb.CustomerAccounts.AddRange(customer, supplier);
            tenantDb.Warehouses.AddRange(warehouse, destination);
            tenantDb.StockItems.AddRange(stockItem, salesStockItem, purchaseStockItem);
            tenantDb.SalesQuotes.Add(quote);
            tenantDb.SalesOrders.Add(salesOrder);
            tenantDb.PurchaseOrders.Add(purchaseOrder);
            tenantDb.PurchaseReceipts.Add(purchaseReceipt);
            tenantDb.PurchaseInvoices.Add(purchaseInvoice);
            await tenantDb.SaveChangesAsync();

            using var startupConfiguration = ProcessEnvironmentOverride.Push(new Dictionary<string, string?>
            {
                ["Authentication__SigningKey"] = "synthetic-negative-stock-acceptance-key-at-least-32-bytes",
                ["PluginHost__SigningKey"] = "different-synthetic-plugin-key-at-least-32-bytes-long",
                ["Authentication__Issuer"] = "AIERP",
                ["Authentication__Audience"] = "AIERP",
                ["ConnectionStrings__Platform"] = platformConnection,
                ["ConnectionStrings__Tenant"] = tenantConnection,
                ["ConnectionStrings__AIStudio"] = studioConnection,
                ["Database__SeparationEnabled"] = "true",
                ["Database__ApplyMigrationsOnStartup"] = "false"
            });
            using var factory = new NegativeStockApiFactory(platformConnection, tenantConnection, studioConnection);
            using var client = factory.CreateClient();
            client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantId.ToString("D"));
            client.DefaultRequestHeaders.Add("X-Test-User", UserId.ToString("D"));

            var issuePath = $"/api/warehouses/{warehouse.Id:D}/stock/{stockItem.Id:D}/transactions";
            var strictIssue = await client.PostAsJsonAsync(issuePath, new
            {
                entryDate = "2026-10-21", direction = "Issue", quantity = 2m, description = "Strict setting must reject"
            });
            Assert.Equal(HttpStatusCode.Conflict, strictIssue.StatusCode);

            var strictDelivery = await client.PostAsJsonAsync($"/api/sales/orders/{salesOrder.Id:D}/deliveries", new
            {
                requestId = Guid.NewGuid(), warehouseId = warehouse.Id, deliveryDate = "2026-10-21",
                lines = new[] { new { orderLineNumber = 1, quantity = 1m } }
            });
            Assert.Equal(HttpStatusCode.Conflict, strictDelivery.StatusCode);
            var strictPurchaseReturn = await client.PostAsJsonAsync($"/api/purchasing/invoices/{purchaseInvoice.Id:D}/returns", new
            {
                requestId = Guid.NewGuid(), warehouseId = warehouse.Id, returnDate = "2026-10-21",
                lines = new[] { new { purchaseInvoiceLineId = purchaseInvoiceLine.Id, quantity = 1m } }
            });
            Assert.Equal(HttpStatusCode.Conflict, strictPurchaseReturn.StatusCode);

            tenantDb.TenantOperationalSettings.Add(new TenantOperationalSettings { TenantId = TenantId, AllowNegativeStock = true });
            await tenantDb.SaveChangesAsync();
            var allowedIssue = await client.PostAsJsonAsync(issuePath, new
            {
                entryDate = "2026-10-21", direction = "Issue", quantity = 2m, description = "Company setting permits negative balance"
            });
            Assert.Equal(HttpStatusCode.Created, allowedIssue.StatusCode);

            var transferPath = "/api/warehouses/transfers";
            var allowedTransfer = await client.PostAsJsonAsync(transferPath, new
            {
                requestId = Guid.NewGuid(), fromWarehouseId = warehouse.Id, toWarehouseId = destination.Id,
                transferDate = "2026-10-21", lines = new[] { new { stockItemId = stockItem.Id, quantity = 1m } }
            });
            Assert.Equal(HttpStatusCode.Created, allowedTransfer.StatusCode);

            var allowedDelivery = await client.PostAsJsonAsync($"/api/sales/orders/{salesOrder.Id:D}/deliveries", new
            {
                requestId = Guid.NewGuid(), warehouseId = warehouse.Id, deliveryDate = "2026-10-21",
                lines = new[] { new { orderLineNumber = 1, quantity = 1m } }
            });
            Assert.Equal(HttpStatusCode.Created, allowedDelivery.StatusCode);
            var allowedPurchaseReturn = await client.PostAsJsonAsync($"/api/purchasing/invoices/{purchaseInvoice.Id:D}/returns", new
            {
                requestId = Guid.NewGuid(), warehouseId = warehouse.Id, returnDate = "2026-10-21",
                lines = new[] { new { purchaseInvoiceLineId = purchaseInvoiceLine.Id, quantity = 1m } }
            });
            Assert.Equal(HttpStatusCode.Created, allowedPurchaseReturn.StatusCode);

            var settingsRow = tenantDb.TenantOperationalSettings.Single();
            await using (var policyReadTransaction = await tenantDb.Database.BeginTransactionAsync())
            {
                Assert.True(await TenantOperationalSettingsEndpoints.AllowsNegativeStockAsync(tenantDb, TenantId));
                var updateAttempted = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
                var disableTask = Task.Run(async () =>
                {
                    await using var updateDb = new TenantDbContext(tenantOptions);
                    var row = await updateDb.TenantOperationalSettings.SingleAsync(x => x.TenantId == TenantId);
                    row.AllowNegativeStock = false;
                    updateAttempted.SetResult();
                    await updateDb.SaveChangesAsync();
                });
                await updateAttempted.Task.WaitAsync(TimeSpan.FromSeconds(5));
                await Task.Delay(150);
                Assert.False(disableTask.IsCompleted);
                await policyReadTransaction.CommitAsync();
                await disableTask.WaitAsync(TimeSpan.FromSeconds(10));
            }
            await tenantDb.Entry(settingsRow).ReloadAsync();
            var strictTransfer = await client.PostAsJsonAsync(transferPath, new
            {
                requestId = Guid.NewGuid(), fromWarehouseId = warehouse.Id, toWarehouseId = destination.Id,
                transferDate = "2026-10-21", lines = new[] { new { stockItemId = stockItem.Id, quantity = 1m } }
            });
            Assert.Equal(HttpStatusCode.Conflict, strictTransfer.StatusCode);

            var sourceBalance = await tenantDb.InventoryTransactions.AsNoTracking().Where(x => x.TenantId == TenantId
                    && x.WarehouseId == warehouse.Id && x.StockItemId == stockItem.Id)
                .SumAsync(x => x.Direction == InventoryDirection.Receipt ? x.Quantity : -x.Quantity);
            var destinationBalance = await tenantDb.InventoryTransactions.AsNoTracking().Where(x => x.TenantId == TenantId
                    && x.WarehouseId == destination.Id && x.StockItemId == stockItem.Id)
                .SumAsync(x => x.Direction == InventoryDirection.Receipt ? x.Quantity : -x.Quantity);
            Assert.Equal(-3m, sourceBalance);
            Assert.Equal(1m, destinationBalance);
            Assert.Equal(4, await tenantDb.InventoryTransactions.CountAsync(x => x.TenantId == TenantId && x.WarehouseId == warehouse.Id));
            Assert.Equal(1, await tenantDb.InventoryTransfers.CountAsync(x => x.TenantId == TenantId));
            Assert.Equal(-1m, await tenantDb.InventoryTransactions.AsNoTracking().Where(x => x.TenantId == TenantId
                    && x.WarehouseId == warehouse.Id && x.StockItemId == salesStockItem.Id)
                .SumAsync(x => x.Direction == InventoryDirection.Receipt ? x.Quantity : -x.Quantity));
            Assert.Equal(-1m, await tenantDb.InventoryTransactions.AsNoTracking().Where(x => x.TenantId == TenantId
                    && x.WarehouseId == warehouse.Id && x.StockItemId == purchaseStockItem.Id)
                .SumAsync(x => x.Direction == InventoryDirection.Receipt ? x.Quantity : -x.Quantity));
        }
        finally
        {
            if (tenantCreated)
            {
                await using var cleanup = new TenantDbContext(new DbContextOptionsBuilder<TenantDbContext>().UseSqlServer(tenantConnection).Options);
                await cleanup.Database.EnsureDeletedAsync();
            }
            if (platformCreated)
            {
                await using var cleanup = new PlatformDbContext(new DbContextOptionsBuilder<PlatformDbContext>().UseSqlServer(platformConnection).Options);
                await cleanup.Database.EnsureDeletedAsync();
            }
        }
    }

    private static string BuildDatabaseConnection(string source, string databaseName)
    {
        var builder = new SqlConnectionStringBuilder(source) { InitialCatalog = databaseName, ConnectTimeout = 15, TrustServerCertificate = true };
        return builder.ConnectionString;
    }

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

    private sealed class NegativeStockApiFactory(string platformConnection, string tenantConnection, string studioConnection) : WebApplicationFactory<ApiEntryPointMarker>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Production);
            builder.ConfigureAppConfiguration((_, configuration) => configuration.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Authentication:SigningKey"] = "synthetic-negative-stock-acceptance-key-at-least-32-bytes",
                ["PluginHost:SigningKey"] = "different-synthetic-plugin-key-at-least-32-bytes-long",
                ["Authentication:Issuer"] = "AIERP", ["Authentication:Audience"] = "AIERP",
                ["ConnectionStrings:Platform"] = platformConnection, ["ConnectionStrings:Tenant"] = tenantConnection,
                ["ConnectionStrings:AIStudio"] = studioConnection,
                ["Database:SeparationEnabled"] = "true", ["Database:ApplyMigrationsOnStartup"] = "false"
            }));
            builder.ConfigureTestServices(services =>
            {
                services.AddAuthentication("report-test").AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("report-test", _ => { });
                foreach (var worker in services.Where(x => x.ServiceType == typeof(IHostedService)
                             && x.ImplementationType?.Name is "IntegrationOperationWorker" or "AuditRetentionWorker" or "TcmbExchangeRateWorker").ToArray())
                    services.Remove(worker);
            });
        }
    }
}
