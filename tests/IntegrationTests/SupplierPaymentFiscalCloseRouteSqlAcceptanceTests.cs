using System.Net;
using System.Net.Http.Json;
using AIERP.Api;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
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
public sealed class SupplierPaymentFiscalCloseRouteSqlAcceptanceTests
{
    [SqlServerAcceptanceFact]
    public async Task Real_supplier_payment_route_serializes_with_fiscal_close_and_rejects_closed_period_without_side_effects()
    {
        var configuredConnection = Environment.GetEnvironmentVariable("AIERP_REPORT_TEST_SQL_CONNECTION_STRING");
        Assert.False(string.IsNullOrWhiteSpace(configuredConnection));
        var suffix = Guid.NewGuid().ToString("N");
        var tenantId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        var platformConnection = BuildDatabaseConnection(configuredConnection!, $"AIERP_SupplierPayClosePlatform_{suffix}");
        var tenantConnection = BuildDatabaseConnection(configuredConnection!, $"AIERPTenant_{tenantId:N}");
        var studioConnection = BuildDatabaseConnection(configuredConnection!, $"AIERP_SupplierPayCloseStudio_{suffix}");
        var platformCreated = false;
        var tenantCreated = false;
        var studioCreated = false;
        var triggerCreated = false;
        SqlAcceptanceTenantCredential? tenantCredential = null;
        try
        {
            var platformOptions = new DbContextOptionsBuilder<PlatformDbContext>().UseSqlServer(platformConnection).Options;
            var tenantOptions = new DbContextOptionsBuilder<TenantDbContext>().UseSqlServer(tenantConnection).Options;
            await using var platformDb = new PlatformDbContext(platformOptions);
            await using var seedDb = new TenantDbContext(tenantOptions);
            await using var studioDb = new AIStudioDbContext(new DbContextOptionsBuilder<AIStudioDbContext>().UseSqlServer(studioConnection).Options);
            platformCreated = await platformDb.Database.EnsureCreatedAsync();
            tenantCreated = await seedDb.Database.EnsureCreatedAsync();
            studioCreated = await studioDb.Database.EnsureCreatedAsync();
            Assert.True(platformCreated && tenantCreated && studioCreated);
            tenantCredential = await SqlAcceptanceTenantCredential.CreateAsync(configuredConnection!, tenantId);

            var tenant = new Tenant { Id = tenantId, Name = "Synthetic supplier payment close", Slug = $"supplier-close-{suffix}", BaseCurrencyCode = "TRY" };
            var user = new AppUser { Id = userId, Email = $"supplier-close-{suffix}@example.invalid", DisplayName = "Synthetic Tenant Admin", PasswordHash = "test" };
            platformDb.Tenants.Add(tenant);
            platformDb.Users.Add(user);
            platformDb.TenantMemberships.Add(new TenantMembership { TenantId = tenantId, UserId = userId, Role = "TenantAdmin" });
            platformDb.TenantDatabaseCatalog.Add(new TenantDatabaseCatalogEntry
            {
                TenantId = tenantId,
                Tenant = tenant,
                DatabaseName = new SqlConnectionStringBuilder(tenantConnection).InitialCatalog,
                State = TenantDatabaseProvisioningState.Ready,
                ReadyAt = DateTimeOffset.UtcNow
            });
            await platformDb.SaveChangesAsync();

            var supplier = new CustomerAccount { TenantId = tenantId, Code = "SUP-CLOSE", Name = "Synthetic supplier", Type = CounterpartyType.Supplier };
            var warehouse = new Warehouse { TenantId = tenantId, Code = "WH-CLOSE", Name = "Synthetic warehouse" };
            var stockItem = new StockItem { TenantId = tenantId, Code = "SKU-CLOSE", Name = "Synthetic goods", UnitCode = "EA" };
            var purchaseOrder = new PurchaseOrder
            {
                TenantId = tenantId, SupplierId = supplier.Id, Supplier = supplier, Code = "PO-CLOSE",
                OrderDate = new DateOnly(2025, 1, 2), TargetWarehouseId = warehouse.Id, TargetWarehouse = warehouse
            };
            var orderLine = new PurchaseOrderLine
            {
                TenantId = tenantId, PurchaseOrder = purchaseOrder, LineNumber = 1, StockItemId = stockItem.Id, StockItem = stockItem,
                StockCode = stockItem.Code, StockName = stockItem.Name, UnitCode = "EA", Quantity = 1m, UnitPrice = 100m,
                LineSubtotal = 100m, LineTotal = 100m
            };
            purchaseOrder.Lines.Add(orderLine);
            var receipt = new PurchaseReceipt
            {
                TenantId = tenantId, RequestId = Guid.NewGuid(), PurchaseOrder = purchaseOrder,
                Warehouse = warehouse, Code = "GR-CLOSE", ReceiptDate = new DateOnly(2025, 1, 3)
            };
            var receiptLine = new PurchaseReceiptLine
            {
                TenantId = tenantId, Receipt = receipt, PurchaseOrderId = purchaseOrder.Id, OrderLine = orderLine,
                StockItemId = stockItem.Id, StockCode = stockItem.Code, StockName = stockItem.Name, UnitCode = "EA", Quantity = 1m
            };
            receipt.Lines.Add(receiptLine);
            var invoice = Invoice(tenantId, supplier, purchaseOrder, receipt, receiptLine, "PI-CLOSE-RACE", new DateOnly(2025, 2, 10));
            var retained = Account(tenantId, "570", "Retained earnings", LedgerAccountStatementSection.Equity);
            var cash = Account(tenantId, "100", "Cash", LedgerAccountStatementSection.Asset);
            var capital = Account(tenantId, "500", "Capital", LedgerAccountStatementSection.Equity);
            var revenue = Account(tenantId, "600", "Revenue", LedgerAccountStatementSection.Revenue);
            var payable = Account(tenantId, "320", "Supplier payable", LedgerAccountStatementSection.Liability);
            var clearing = Account(tenantId, "103", "Supplier check clearing", LedgerAccountStatementSection.Liability);

            seedDb.Tenants.Add(tenant);
            seedDb.CustomerAccounts.Add(supplier);
            seedDb.Warehouses.Add(warehouse);
            seedDb.StockItems.Add(stockItem);
            seedDb.PurchaseOrders.Add(purchaseOrder);
            seedDb.PurchaseReceipts.Add(receipt);
            seedDb.PurchaseInvoices.Add(invoice);
            seedDb.LedgerAccounts.AddRange(retained, cash, capital, revenue, payable, clearing);
            seedDb.LedgerAccountMappings.AddRange(
                new LedgerAccountMapping { TenantId = tenantId, MappingKey = LedgerMappingKeys.PurchasePayable, AccountId = payable.Id },
                new LedgerAccountMapping { TenantId = tenantId, MappingKey = LedgerMappingKeys.SupplierCheckClearing, AccountId = clearing.Id });

            var opening = new JournalEntry
            {
                TenantId = tenantId, Code = $"OPEN-{suffix}", EntryDate = new DateOnly(2024, 12, 31),
                Description = "Synthetic opening balance", SourceType = "Manual", SourceId = Guid.NewGuid()
            };
            opening.Lines.Add(new JournalEntryLine { TenantId = tenantId, JournalEntryId = opening.Id, AccountId = cash.Id,
                LineNumber = 1, Description = "Opening cash", Debit = 1000m, Credit = 0m });
            opening.Lines.Add(new JournalEntryLine { TenantId = tenantId, JournalEntryId = opening.Id, AccountId = capital.Id,
                LineNumber = 2, Description = "Opening capital", Debit = 0m, Credit = 1000m });
            var priorYearIncome = new JournalEntry
            {
                TenantId = tenantId, Code = $"REV-2025-{suffix}", EntryDate = new DateOnly(2025, 1, 5),
                Description = "Synthetic revenue", SourceType = "Manual", SourceId = Guid.NewGuid()
            };
            priorYearIncome.Lines.Add(new JournalEntryLine { TenantId = tenantId, JournalEntryId = priorYearIncome.Id, AccountId = cash.Id,
                LineNumber = 1, Description = "Synthetic cash receipt", Debit = 100m, Credit = 0m });
            priorYearIncome.Lines.Add(new JournalEntryLine { TenantId = tenantId, JournalEntryId = priorYearIncome.Id, AccountId = revenue.Id,
                LineNumber = 2, Description = "Synthetic revenue", Debit = 0m, Credit = 100m });
            seedDb.JournalEntries.AddRange(opening, priorYearIncome);
            await seedDb.SaveChangesAsync();

            using var startupOverride = ProcessEnvironmentOverride.Push(new Dictionary<string, string?>
            {
                ["Authentication__SigningKey"] = "synthetic-supplier-close-acceptance-key-at-least-32-bytes",
                ["PluginHost__SigningKey"] = "different-synthetic-plugin-key-at-least-32-bytes-long",
                ["Authentication__Issuer"] = "AIERP",
                ["Authentication__Audience"] = "AIERP",
                ["ConnectionStrings__Platform"] = platformConnection,
                ["ConnectionStrings__Tenant"] = tenantConnection,
                ["ConnectionStrings__AIStudio"] = studioConnection,
                ["Database__SeparationEnabled"] = "true",
                ["Database__ApplyMigrationsOnStartup"] = "false"
            });
            using var factory = new SupplierPaymentApiFactory(platformConnection, tenantConnection, studioConnection, tenantCredential.CredentialReader);
            using var client = factory.CreateClient();
            client.DefaultRequestHeaders.Add("X-Test-Tenant", tenantId.ToString("D"));
            client.DefaultRequestHeaders.Add("X-Test-User", userId.ToString("D"));

            await seedDb.Database.ExecuteSqlRawAsync("""
                CREATE TRIGGER [dbo].[TR_TestSupplierPaymentCloseAcceptance_HoldPosting]
                ON [dbo].[JournalEntries]
                AFTER INSERT
                AS
                BEGIN
                    SET NOCOUNT ON;
                    IF EXISTS (SELECT 1 FROM inserted WHERE [SourceType] = 'SupplierPayment')
                        WAITFOR DELAY '00:00:04';
                END;
                """);
            triggerCreated = true;

            var raceRequestId = Guid.NewGuid();
            var paymentTask = client.PostAsJsonAsync($"/api/purchasing/invoices/{invoice.Id}/payments", Payment(raceRequestId, new DateOnly(2025, 4, 15)));
            await Task.Delay(TimeSpan.FromMilliseconds(600));
            Assert.False(paymentTask.IsCompleted, "The SQL trigger did not hold the real supplier-payment transaction.");

            var closeTask = client.PostAsJsonAsync("/api/finance/general-ledger/fiscal-year-close", new
            {
                fromDate = "2025-01-01", toDate = "2025-12-31", retainedEarningsAccountId = retained.Id
            });
            await Task.Delay(TimeSpan.FromMilliseconds(500));
            Assert.False(closeTask.IsCompleted, "Fiscal close completed before the held payment transaction released the tenant lock.");

            using var paymentResponse = await paymentTask;
            Assert.Equal(HttpStatusCode.Created, paymentResponse.StatusCode);
            using var closeResponse = await closeTask;
            Assert.Equal(HttpStatusCode.Created, closeResponse.StatusCode);

            var postedPaymentCount = await seedDb.SupplierPayments.CountAsync(x => x.TenantId == tenantId);
            var paymentJournalCount = await seedDb.JournalEntries.CountAsync(x => x.TenantId == tenantId && x.SourceType == "SupplierPayment");
            var paymentAuditCount = await seedDb.AuditEvents.CountAsync(x => x.TenantId == tenantId && x.Action == "supplier-payment.posted");
            Assert.Equal(1, postedPaymentCount);
            Assert.Equal(1, paymentJournalCount);
            Assert.Equal(1, paymentAuditCount);

            using var afterClose = await client.PostAsJsonAsync($"/api/purchasing/invoices/{invoice.Id}/payments", Payment(Guid.NewGuid(), new DateOnly(2025, 7, 1)));
            Assert.Equal(HttpStatusCode.Conflict, afterClose.StatusCode);
            Assert.Contains("dönemi kapalı", await afterClose.Content.ReadAsStringAsync(), StringComparison.OrdinalIgnoreCase);
            Assert.Equal(postedPaymentCount, await seedDb.SupplierPayments.CountAsync(x => x.TenantId == tenantId));
            Assert.Equal(paymentJournalCount, await seedDb.JournalEntries.CountAsync(x => x.TenantId == tenantId && x.SourceType == "SupplierPayment"));
            Assert.Equal(paymentAuditCount, await seedDb.AuditEvents.CountAsync(x => x.TenantId == tenantId && x.Action == "supplier-payment.posted"));
            Assert.Empty(await seedDb.FinancialAccountTransactions.Where(x => x.TenantId == tenantId).ToListAsync());
        }
        finally
        {
            if (triggerCreated)
            {
                await using var cleanup = new TenantDbContext(new DbContextOptionsBuilder<TenantDbContext>().UseSqlServer(tenantConnection).Options);
                await cleanup.Database.ExecuteSqlRawAsync("DROP TRIGGER [dbo].[TR_TestSupplierPaymentCloseAcceptance_HoldPosting];");
            }
            if (studioCreated)
            {
                await using var cleanup = new AIStudioDbContext(new DbContextOptionsBuilder<AIStudioDbContext>().UseSqlServer(studioConnection).Options);
                await cleanup.Database.EnsureDeletedAsync();
            }
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
            if (tenantCredential is not null) await tenantCredential.DisposeAsync();
        }
    }

    private static PurchaseInvoice Invoice(Guid tenantId, CustomerAccount supplier, PurchaseOrder order, PurchaseReceipt receipt,
        PurchaseReceiptLine receiptLine, string code, DateOnly invoiceDate)
    {
        var invoice = new PurchaseInvoice
        {
            TenantId = tenantId, Supplier = supplier, PurchaseOrder = order, PurchaseReceipt = receipt, Code = code,
            InvoiceDate = invoiceDate, DueDate = invoiceDate.AddDays(30), CurrencyCode = "TRY", Status = PurchaseInvoiceStatus.Posted,
            Subtotal = 100m, GrandTotal = 100m
        };
        invoice.Lines.Add(new PurchaseInvoiceLine
        {
            TenantId = tenantId, PurchaseInvoice = invoice, PurchaseReceiptId = receipt.Id, PurchaseReceiptLineId = receiptLine.Id,
            PurchaseReceiptLine = receiptLine, OrderLineNumber = 1, StockItemId = receiptLine.StockItemId,
            StockCode = receiptLine.StockCode, StockName = receiptLine.StockName, UnitCode = "EA", Quantity = 1m,
            UnitPrice = 100m, LineSubtotal = 100m, LineTotal = 100m
        });
        return invoice;
    }

    private static object Payment(Guid requestId, DateOnly paymentDate) => new
    {
        requestId, paymentDate = paymentDate.ToString("yyyy-MM-dd"), amount = 25m, paymentMethod = "Check", reference = "SYN-CHECK"
    };

    private static LedgerAccount Account(Guid tenantId, string code, string name, LedgerAccountStatementSection section)
        => new() { TenantId = tenantId, Code = code, Name = name, StatementSection = section };

    private static string BuildDatabaseConnection(string source, string databaseName)
        => new SqlConnectionStringBuilder(source) { InitialCatalog = databaseName, ConnectTimeout = 15, TrustServerCertificate = true }.ConnectionString;

    private sealed class SupplierPaymentApiFactory(string platformConnection, string tenantConnection, string studioConnection,
        ITenantSqlCredentialReader credentialReader)
        : WebApplicationFactory<ApiEntryPointMarker>
    {
        protected override IHost CreateHost(IHostBuilder builder)
        {
            builder.ConfigureHostConfiguration(configuration => configuration.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Vault:Address"] = "https://vault.test",
                ["Vault:TenantSqlCredentialReader:RoleId"] = "supplier-payment-test-role",
                ["Vault:TenantSqlCredentialReader:SecretId"] = "supplier-payment-test-secret"
            }));
            return base.CreateHost(builder);
        }

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Production);
            builder.ConfigureAppConfiguration((_, configuration) => configuration.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Authentication:SigningKey"] = "synthetic-supplier-close-acceptance-key-at-least-32-bytes",
                ["PluginHost:SigningKey"] = "different-synthetic-plugin-key-at-least-32-bytes-long",
                ["Authentication:Issuer"] = "AIERP", ["Authentication:Audience"] = "AIERP",
                ["ConnectionStrings:Platform"] = platformConnection, ["ConnectionStrings:Tenant"] = tenantConnection,
                ["ConnectionStrings:AIStudio"] = studioConnection,
                ["Database:SeparationEnabled"] = "true", ["Database:ApplyMigrationsOnStartup"] = "false"
            }));
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<ITenantSqlCredentialReader>();
                services.AddSingleton(credentialReader);
                services.AddAuthentication("report-test").AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("report-test", _ => { });
                foreach (var worker in services.Where(x => x.ServiceType == typeof(IHostedService)
                             && x.ImplementationType?.Name is "IntegrationOperationWorker" or "AuditRetentionWorker" or "TcmbExchangeRateWorker").ToArray())
                    services.Remove(worker);
            });
        }
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
}
