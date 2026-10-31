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
public sealed class CustomerCollectionFiscalCloseRouteSqlAcceptanceTests
{
    [SqlServerAcceptanceFact]
    public async Task Real_customer_collection_route_serializes_with_fiscal_close_and_rejects_closed_period_without_side_effects()
    {
        var configuredConnection = Environment.GetEnvironmentVariable("AIERP_REPORT_TEST_SQL_CONNECTION_STRING");
        Assert.False(string.IsNullOrWhiteSpace(configuredConnection));
        var suffix = Guid.NewGuid().ToString("N");
        var tenantId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        var platformConnection = BuildDatabaseConnection(configuredConnection!, $"AIERP_CustomerCollectClosePlatform_{suffix}");
        var tenantConnection = BuildDatabaseConnection(configuredConnection!, $"AIERPTenant_{tenantId:N}");
        var studioConnection = BuildDatabaseConnection(configuredConnection!, $"AIERP_CustomerCollectCloseStudio_{suffix}");
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

            var tenant = new Tenant { Id = tenantId, Name = "Synthetic customer collection close", Slug = $"customer-close-{suffix}", BaseCurrencyCode = "TRY" };
            var user = new AppUser { Id = userId, Email = $"customer-close-{suffix}@example.invalid", DisplayName = "Synthetic Tenant Admin", PasswordHash = "test" };
            platformDb.Tenants.Add(tenant);
            platformDb.Users.Add(user);
            platformDb.TenantMemberships.Add(new TenantMembership { TenantId = tenantId, UserId = userId, Role = "TenantAdmin" });
            platformDb.TenantDatabaseCatalog.Add(new TenantDatabaseCatalogEntry
            {
                TenantId = tenantId, Tenant = tenant, DatabaseName = new SqlConnectionStringBuilder(tenantConnection).InitialCatalog,
                State = TenantDatabaseProvisioningState.Ready, ReadyAt = DateTimeOffset.UtcNow
            });
            await platformDb.SaveChangesAsync();

            var customer = new CustomerAccount { TenantId = tenantId, Code = "CUS-CLOSE", Name = "Synthetic customer", Type = CounterpartyType.Customer };
            var item = new StockItem { TenantId = tenantId, Code = "SKU-CLOSE", Name = "Synthetic item", UnitCode = "EA" };
            var quote = new SalesQuote { TenantId = tenantId, CustomerId = customer.Id, Customer = customer, Code = "Q-CLOSE",
                QuoteDate = new DateOnly(2025, 1, 1), ValidUntil = new DateOnly(2025, 12, 31), Status = SalesQuoteStatus.Accepted,
                Subtotal = 100m, GrandTotal = 100m };
            var order = new SalesOrder { TenantId = tenantId, QuoteId = quote.Id, Quote = quote, CustomerId = customer.Id, Customer = customer,
                Code = "SO-CLOSE", OrderDate = new DateOnly(2025, 1, 2), Status = SalesOrderStatus.Fulfilled, Subtotal = 100m, GrandTotal = 100m };
            var orderLine = new SalesOrderLine { TenantId = tenantId, OrderId = order.Id, Order = order, LineNumber = 1, StockItemId = item.Id,
                StockItem = item, StockCode = item.Code, StockName = item.Name, UnitCode = item.UnitCode, Quantity = 1m,
                UnitPrice = 100m, LineSubtotal = 100m, LineTotal = 100m };
            order.Lines.Add(orderLine);
            var warehouse = new Warehouse { TenantId = tenantId, Code = "WH-CLOSE", Name = "Synthetic warehouse" };
            var delivery = new SalesDelivery { TenantId = tenantId, OrderId = order.Id, Order = order, WarehouseId = warehouse.Id, Warehouse = warehouse,
                RequestId = Guid.NewGuid(), Code = "DEL-CLOSE", DeliveryDate = new DateOnly(2025, 1, 3) };
            var deliveryLine = new SalesDeliveryLine { TenantId = tenantId, DeliveryId = delivery.Id, Delivery = delivery, OrderId = order.Id,
                OrderLineNumber = 1, OrderLine = orderLine, StockItemId = item.Id, StockCode = item.Code, StockName = item.Name, UnitCode = item.UnitCode, Quantity = 1m };
            delivery.Lines.Add(deliveryLine);
            var invoice = new SalesInvoice { TenantId = tenantId, DeliveryId = delivery.Id, Delivery = delivery, OrderId = order.Id, Order = order,
                CustomerId = customer.Id, Customer = customer, Code = "SI-CLOSE-RACE", InvoiceDate = new DateOnly(2025, 1, 5),
                CurrencyCode = "TRY", Status = SalesInvoiceStatus.Posted, Subtotal = 100m, GrandTotal = 100m };
            invoice.Lines.Add(new SalesInvoiceLine { TenantId = tenantId, InvoiceId = invoice.Id, Invoice = invoice,
                DeliveryLineId = deliveryLine.Id, DeliveryLine = deliveryLine, OrderLineNumber = 1, StockItemId = item.Id,
                StockCode = item.Code, StockName = item.Name, UnitCode = item.UnitCode, Quantity = 1m, UnitPrice = 100m,
                LineSubtotal = 100m, LineTotal = 100m });
            var retained = Account(tenantId, "390", "Retained earnings", LedgerAccountStatementSection.Equity);
            var cash = Account(tenantId, "100", "Cash", LedgerAccountStatementSection.Asset);
            var capital = Account(tenantId, "300", "Capital", LedgerAccountStatementSection.Equity);
            var revenue = Account(tenantId, "600", "Revenue", LedgerAccountStatementSection.Revenue);
            var receivable = Account(tenantId, "120", "Customer receivable", LedgerAccountStatementSection.Asset);
            var cardClearing = Account(tenantId, "108", "Customer card clearing", LedgerAccountStatementSection.Asset);
            seedDb.Tenants.Add(tenant);
            seedDb.CustomerAccounts.Add(customer);
            seedDb.StockItems.Add(item);
            seedDb.Warehouses.Add(warehouse);
            seedDb.SalesQuotes.Add(quote);
            seedDb.SalesOrders.Add(order);
            seedDb.SalesDeliveries.Add(delivery);
            seedDb.SalesInvoices.Add(invoice);
            seedDb.LedgerAccounts.AddRange(retained, cash, capital, revenue, receivable, cardClearing);
            seedDb.LedgerAccountMappings.AddRange(
                new LedgerAccountMapping { TenantId = tenantId, MappingKey = LedgerMappingKeys.SalesReceivable, AccountId = receivable.Id },
                new LedgerAccountMapping { TenantId = tenantId, MappingKey = LedgerMappingKeys.CustomerCardClearing, AccountId = cardClearing.Id });
            var opening = new JournalEntry { TenantId = tenantId, Code = $"OPEN-{suffix}", EntryDate = new DateOnly(2024, 12, 31),
                Description = "Synthetic opening balance", SourceType = "Manual", SourceId = Guid.NewGuid() };
            opening.Lines.Add(new JournalEntryLine { TenantId = tenantId, JournalEntryId = opening.Id, AccountId = cash.Id,
                LineNumber = 1, Description = "Opening cash", Debit = 1000m, Credit = 0m });
            opening.Lines.Add(new JournalEntryLine { TenantId = tenantId, JournalEntryId = opening.Id, AccountId = capital.Id,
                LineNumber = 2, Description = "Opening capital", Debit = 0m, Credit = 1000m });
            var priorYearIncome = new JournalEntry { TenantId = tenantId, Code = $"REV-2025-{suffix}", EntryDate = new DateOnly(2025, 1, 4),
                Description = "Synthetic revenue", SourceType = "Manual", SourceId = Guid.NewGuid() };
            priorYearIncome.Lines.Add(new JournalEntryLine { TenantId = tenantId, JournalEntryId = priorYearIncome.Id, AccountId = cash.Id,
                LineNumber = 1, Description = "Synthetic revenue", Debit = 100m, Credit = 0m });
            priorYearIncome.Lines.Add(new JournalEntryLine { TenantId = tenantId, JournalEntryId = priorYearIncome.Id, AccountId = revenue.Id,
                LineNumber = 2, Description = "Synthetic revenue", Debit = 0m, Credit = 100m });
            seedDb.JournalEntries.AddRange(opening, priorYearIncome);
            await seedDb.SaveChangesAsync();

            using var startupOverride = ProcessEnvironmentOverride.Push(new Dictionary<string, string?>
            {
                ["Authentication__SigningKey"] = "synthetic-customer-close-acceptance-key-at-least-32-bytes",
                ["PluginHost__SigningKey"] = "different-synthetic-plugin-key-at-least-32-bytes-long",
                ["Authentication__Issuer"] = "AIERP", ["Authentication__Audience"] = "AIERP",
                ["ConnectionStrings__Platform"] = platformConnection, ["ConnectionStrings__Tenant"] = tenantConnection,
                ["ConnectionStrings__AIStudio"] = studioConnection, ["Database__SeparationEnabled"] = "true",
                ["Database__ApplyMigrationsOnStartup"] = "false"
            });
            using var factory = new CustomerCollectionApiFactory(platformConnection, tenantConnection, studioConnection, tenantCredential.CredentialReader);
            using var client = factory.CreateClient();
            client.DefaultRequestHeaders.Add("X-Test-Tenant", tenantId.ToString("D"));
            client.DefaultRequestHeaders.Add("X-Test-User", userId.ToString("D"));

            await seedDb.Database.ExecuteSqlRawAsync("""
                CREATE TRIGGER [dbo].[TR_TestCustomerCollectionCloseAcceptance_HoldPosting]
                ON [dbo].[JournalEntries]
                AFTER INSERT
                AS
                BEGIN
                    SET NOCOUNT ON;
                    IF EXISTS (SELECT 1 FROM inserted WHERE [SourceType] = 'CustomerCollection')
                        WAITFOR DELAY '00:00:04';
                END;
                """);
            triggerCreated = true;

            var raceRequestId = Guid.NewGuid();
            var collectionTask = client.PostAsJsonAsync($"/api/sales/invoices/{invoice.Id}/collections", Collection(raceRequestId, new DateOnly(2025, 4, 15)));
            var triggerDeadline = DateTimeOffset.UtcNow.AddSeconds(15);
            var collectionLockHeld = false;
            while (DateTimeOffset.UtcNow < triggerDeadline && !collectionTask.IsCompleted)
            {
                if (await IsCollectionTriggerHoldingTenantLockAsync(tenantConnection))
                {
                    collectionLockHeld = true;
                    break;
                }
                await Task.Delay(TimeSpan.FromMilliseconds(50));
            }
            Assert.True(collectionLockHeld, "The customer collection did not reach the SQL trigger while holding the tenant posting lock.");
            var closeTask = client.PostAsJsonAsync("/api/finance/general-ledger/fiscal-year-close", new
            {
                fromDate = "2025-01-01", toDate = "2025-12-31", retainedEarningsAccountId = retained.Id
            });
            await Task.Delay(TimeSpan.FromMilliseconds(500));
            Assert.False(closeTask.IsCompleted, "Fiscal close completed before the held customer-collection transaction released the tenant lock.");

            using var collectionResponse = await collectionTask;
            Assert.Equal(HttpStatusCode.Created, collectionResponse.StatusCode);
            using var closeResponse = await closeTask;
            Assert.Equal(HttpStatusCode.Created, closeResponse.StatusCode);
            var collectionCount = await seedDb.CustomerCollections.CountAsync(x => x.TenantId == tenantId);
            var allocationCount = await seedDb.CustomerCollectionAllocations.CountAsync(x => x.TenantId == tenantId);
            var ledgerCount = await seedDb.CustomerLedgerEntries.CountAsync(x => x.TenantId == tenantId && x.CustomerCollectionId != null);
            var journalCount = await seedDb.JournalEntries.CountAsync(x => x.TenantId == tenantId && x.SourceType == "CustomerCollection");
            var auditCount = await seedDb.AuditEvents.CountAsync(x => x.TenantId == tenantId && x.Action == "customer-collection.posted");
            Assert.Equal(1, collectionCount);
            Assert.Equal(1, allocationCount);
            Assert.Equal(1, ledgerCount);
            Assert.Equal(1, journalCount);
            Assert.Equal(1, auditCount);

            using var afterClose = await client.PostAsJsonAsync($"/api/sales/invoices/{invoice.Id}/collections", Collection(Guid.NewGuid(), new DateOnly(2025, 7, 1)));
            Assert.Equal(HttpStatusCode.Conflict, afterClose.StatusCode);
            Assert.Contains("dönemi kapalı", await afterClose.Content.ReadAsStringAsync(), StringComparison.OrdinalIgnoreCase);
            Assert.Equal(collectionCount, await seedDb.CustomerCollections.CountAsync(x => x.TenantId == tenantId));
            Assert.Equal(allocationCount, await seedDb.CustomerCollectionAllocations.CountAsync(x => x.TenantId == tenantId));
            Assert.Equal(ledgerCount, await seedDb.CustomerLedgerEntries.CountAsync(x => x.TenantId == tenantId && x.CustomerCollectionId != null));
            Assert.Equal(journalCount, await seedDb.JournalEntries.CountAsync(x => x.TenantId == tenantId && x.SourceType == "CustomerCollection"));
            Assert.Equal(auditCount, await seedDb.AuditEvents.CountAsync(x => x.TenantId == tenantId && x.Action == "customer-collection.posted"));
            Assert.Empty(await seedDb.FinancialAccountTransactions.Where(x => x.TenantId == tenantId).ToListAsync());
        }
        finally
        {
            if (triggerCreated)
            {
                await using var cleanup = new TenantDbContext(new DbContextOptionsBuilder<TenantDbContext>().UseSqlServer(tenantConnection).Options);
                await cleanup.Database.ExecuteSqlRawAsync("DROP TRIGGER [dbo].[TR_TestCustomerCollectionCloseAcceptance_HoldPosting];");
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

    private static object Collection(Guid requestId, DateOnly collectionDate) => new
    {
        requestId, collectionDate = collectionDate.ToString("yyyy-MM-dd"), amount = 25m, paymentMethod = "Card", reference = "SYN-CARD"
    };

    private static async Task<bool> IsCollectionTriggerHoldingTenantLockAsync(string connectionString)
    {
        await using var connection = new SqlConnection(connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT CASE WHEN EXISTS (
                SELECT 1
                FROM sys.dm_exec_requests AS request
                INNER JOIN sys.dm_tran_locks AS tenantLock
                    ON tenantLock.request_session_id = request.session_id
                WHERE request.session_id <> @@SPID
                    AND request.database_id = DB_ID()
                    AND request.wait_type = N'WAITFOR'
                    AND tenantLock.resource_type = N'OBJECT'
                    AND tenantLock.resource_associated_entity_id = OBJECT_ID(N'dbo.Tenants')
                    AND tenantLock.request_mode = N'IX'
                    AND tenantLock.request_status = N'GRANT'
            ) THEN 1 ELSE 0 END;
            """;
        command.CommandTimeout = 5;
        return Convert.ToInt32(await command.ExecuteScalarAsync()) == 1;
    }

    private static LedgerAccount Account(Guid tenantId, string code, string name, LedgerAccountStatementSection section)
        => new() { TenantId = tenantId, Code = code, Name = name, StatementSection = section };

    private static string BuildDatabaseConnection(string source, string databaseName)
        => new SqlConnectionStringBuilder(source) { InitialCatalog = databaseName, ConnectTimeout = 15, TrustServerCertificate = true }.ConnectionString;

    private sealed class CustomerCollectionApiFactory(string platformConnection, string tenantConnection, string studioConnection,
        ITenantSqlCredentialReader credentialReader)
        : WebApplicationFactory<ApiEntryPointMarker>
    {
        protected override IHost CreateHost(IHostBuilder builder)
        {
            builder.ConfigureHostConfiguration(configuration => configuration.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Vault:Address"] = "https://vault.test",
                ["Vault:TenantSqlCredentialReader:RoleId"] = "customer-collection-test-role",
                ["Vault:TenantSqlCredentialReader:SecretId"] = "customer-collection-test-secret"
            }));
            return base.CreateHost(builder);
        }

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Production);
            builder.ConfigureAppConfiguration((_, configuration) => configuration.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Authentication:SigningKey"] = "synthetic-customer-close-acceptance-key-at-least-32-bytes",
                ["PluginHost:SigningKey"] = "different-synthetic-plugin-key-at-least-32-bytes-long",
                ["Authentication:Issuer"] = "AIERP", ["Authentication:Audience"] = "AIERP",
                ["ConnectionStrings:Platform"] = platformConnection, ["ConnectionStrings:Tenant"] = tenantConnection,
                ["ConnectionStrings:AIStudio"] = studioConnection, ["Database:SeparationEnabled"] = "true",
                ["Database:ApplyMigrationsOnStartup"] = "false"
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
