using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace AIERP.Api.IntegrationTests;

[Collection("SQL Server acceptance")]
public sealed class SqlServerBankStatementLineReportAcceptanceTests
{
    [SqlServerAcceptanceFact]
    public async Task SqlServer_bank_statement_line_report_filters_pages_exports_and_isolates_tenants()
    {
        var configuredConnection = Environment.GetEnvironmentVariable("AIERP_REPORT_TEST_SQL_CONNECTION_STRING");
        Assert.False(string.IsNullOrWhiteSpace(configuredConnection));

        var tenantA = Guid.NewGuid();
        var tenantB = Guid.NewGuid();
        var databaseName = $"AIERP_ReportAcceptance_{Guid.NewGuid():N}";
        var connectionBuilder = new SqlConnectionStringBuilder(configuredConnection)
        {
            InitialCatalog = databaseName,
            ConnectTimeout = 15,
            TrustServerCertificate = true
        };
        var connectionString = connectionBuilder.ConnectionString;
        var options = new DbContextOptionsBuilder<TenantDbContext>().UseSqlServer(connectionString).Options;

        await using var seedDb = new TenantDbContext(options);
        var databaseCreated = false;
        try
        {
            databaseCreated = await seedDb.Database.EnsureCreatedAsync();
            Assert.True(databaseCreated);
            var tenantARecord = new Tenant { Id = tenantA, Name = "Synthetic SQL report tenant A", Slug = $"sql-report-a-{tenantA:N}" };
            var tenantBRecord = new Tenant { Id = tenantB, Name = "Synthetic SQL report tenant B", Slug = $"sql-report-b-{tenantB:N}" };
            var accountA = new FinancialAccount { TenantId = tenantA, Tenant = tenantARecord, Code = "BANK-A", Name = "Synthetic bank A", Type = FinancialAccountType.Bank, CurrencyCode = "TRY" };
            var accountB = new FinancialAccount { TenantId = tenantB, Tenant = tenantBRecord, Code = "BANK-B", Name = "Synthetic bank B", Type = FinancialAccountType.Bank, CurrencyCode = "TRY" };
            var supplierA = new CustomerAccount { TenantId = tenantA, Tenant = tenantARecord, Code = "SUP-SYN-A", Name = "Synthetic supplier A", Type = CounterpartyType.Supplier };
            var supplierB = new CustomerAccount { TenantId = tenantB, Tenant = tenantBRecord, Code = "SUP-SYN-B", Name = "Synthetic supplier B", Type = CounterpartyType.Supplier };
            var warehouseA = new Warehouse { TenantId = tenantA, Tenant = tenantARecord, Code = "WH-SYN-A", Name = "Synthetic warehouse A" };
            var warehouseB = new Warehouse { TenantId = tenantB, Tenant = tenantBRecord, Code = "WH-SYN-B", Name = "Synthetic warehouse B" };
            var stockA = new StockItem { TenantId = tenantA, Tenant = tenantARecord, Code = "ITEM-SYN-A", Name = "Synthetic item A", UnitCode = "EA" };
            var stockB = new StockItem { TenantId = tenantB, Tenant = tenantBRecord, Code = "ITEM-SYN-B", Name = "Synthetic item B", UnitCode = "EA" };
            var statementA = new BankStatement
            {
                TenantId = tenantA, Tenant = tenantARecord, AccountId = accountA.Id, Account = accountA,
                CurrencyCode = "TRY", RequestId = Guid.NewGuid(), Code = "SYN-A-001", StartDate = new DateOnly(2026, 10, 1),
                EndDate = new DateOnly(2026, 10, 31), OpeningBalance = 100m, ClosingBalance = 150m
            };
            var statementB = new BankStatement
            {
                TenantId = tenantB, Tenant = tenantBRecord, AccountId = accountB.Id, Account = accountB,
                CurrencyCode = "TRY", RequestId = Guid.NewGuid(), Code = "SYN-B-001", StartDate = new DateOnly(2026, 10, 1),
                EndDate = new DateOnly(2026, 10, 31), OpeningBalance = 200m, ClosingBalance = 300m
            };
            var orderA = new PurchaseOrder { TenantId = tenantA, Tenant = tenantARecord, SupplierId = supplierA.Id, Supplier = supplierA, Code = "PO-SYN-A", OrderDate = new DateOnly(2026, 10, 1), ExpectedReceiptDate = new DateOnly(2026, 10, 30), Status = PurchaseOrderStatus.PartiallyReceived };
            var orderB = new PurchaseOrder { TenantId = tenantB, Tenant = tenantBRecord, SupplierId = supplierB.Id, Supplier = supplierB, Code = "PO-SYN-B", OrderDate = new DateOnly(2026, 10, 1), ExpectedReceiptDate = new DateOnly(2026, 10, 30), Status = PurchaseOrderStatus.PartiallyReceived };
            var orderLineA = new PurchaseOrderLine { TenantId = tenantA, PurchaseOrderId = orderA.Id, PurchaseOrder = orderA, LineNumber = 1, StockItemId = stockA.Id, StockItem = stockA, StockCode = stockA.Code, StockName = stockA.Name, UnitCode = stockA.UnitCode, Quantity = 20m };
            var orderLineB = new PurchaseOrderLine { TenantId = tenantB, PurchaseOrderId = orderB.Id, PurchaseOrder = orderB, LineNumber = 1, StockItemId = stockB.Id, StockItem = stockB, StockCode = stockB.Code, StockName = stockB.Name, UnitCode = stockB.UnitCode, Quantity = 100m };
            orderA.Lines.Add(orderLineA); orderB.Lines.Add(orderLineB);
            var receiptA = new PurchaseReceipt { TenantId = tenantA, Tenant = tenantARecord, PurchaseOrderId = orderA.Id, PurchaseOrder = orderA, WarehouseId = warehouseA.Id, Warehouse = warehouseA, RequestId = Guid.NewGuid(), Code = "GR-SYN-A", ReceiptDate = new DateOnly(2026, 10, 5), Status = PurchaseReceiptStatus.Posted };
            var receiptB = new PurchaseReceipt { TenantId = tenantB, Tenant = tenantBRecord, PurchaseOrderId = orderB.Id, PurchaseOrder = orderB, WarehouseId = warehouseB.Id, Warehouse = warehouseB, RequestId = Guid.NewGuid(), Code = "GR-SYN-B", ReceiptDate = new DateOnly(2026, 10, 5), Status = PurchaseReceiptStatus.Posted };
            receiptA.Lines.Add(new PurchaseReceiptLine { TenantId = tenantA, Receipt = receiptA, PurchaseOrderId = orderA.Id, OrderLineNumber = 1, OrderLine = orderLineA, StockItemId = stockA.Id, StockCode = stockA.Code, StockName = stockA.Name, UnitCode = stockA.UnitCode, Quantity = 12m });
            receiptB.Lines.Add(new PurchaseReceiptLine { TenantId = tenantB, Receipt = receiptB, PurchaseOrderId = orderB.Id, OrderLineNumber = 1, OrderLine = orderLineB, StockItemId = stockB.Id, StockCode = stockB.Code, StockName = stockB.Name, UnitCode = stockB.UnitCode, Quantity = 50m });
            seedDb.Tenants.AddRange(tenantARecord, tenantBRecord);
            seedDb.FinancialAccounts.AddRange(accountA, accountB);
            seedDb.CustomerAccounts.AddRange(supplierA, supplierB);
            seedDb.Warehouses.AddRange(warehouseA, warehouseB);
            seedDb.StockItems.AddRange(stockA, stockB);
            seedDb.BankStatements.AddRange(statementA, statementB);
            seedDb.PurchaseOrders.AddRange(orderA, orderB);
            seedDb.PurchaseReceipts.AddRange(receiptA, receiptB);
            seedDb.BankStatementLines.AddRange(
                new BankStatementLine { TenantId = tenantA, StatementId = statementA.Id, Statement = statementA, FinancialAccountId = accountA.Id, CurrencyCode = "TRY", LineNumber = 1, TransactionDate = new DateOnly(2026, 10, 2), Direction = FinancialDirection.Inflow, Amount = 25m, Description = "Synthetic unmatched A one" },
                new BankStatementLine { TenantId = tenantA, StatementId = statementA.Id, Statement = statementA, FinancialAccountId = accountA.Id, CurrencyCode = "TRY", LineNumber = 2, TransactionDate = new DateOnly(2026, 10, 3), Direction = FinancialDirection.Outflow, Amount = 10m, Description = "Synthetic unmatched A two" },
                new BankStatementLine { TenantId = tenantB, StatementId = statementB.Id, Statement = statementB, FinancialAccountId = accountB.Id, CurrencyCode = "TRY", LineNumber = 1, TransactionDate = new DateOnly(2026, 10, 2), Direction = FinancialDirection.Inflow, Amount = 999m, Description = "Synthetic tenant B marker" });
            await seedDb.SaveChangesAsync();

            var builder = WebApplication.CreateBuilder();
            builder.WebHost.UseTestServer();
            builder.Services.AddDbContext<TenantDbContext>(db => db.UseSqlServer(connectionString));
            builder.Services.AddDbContext<PlatformDbContext>(db => db.UseInMemoryDatabase($"sql-report-platform-{Guid.NewGuid():N}"));
            builder.Services.AddAuthentication("report-test")
                .AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("report-test", _ => { });
            builder.Services.AddAuthorization();

            await using var app = builder.Build();
            app.UseAuthentication();
            app.UseAuthorization();
            app.MapReportEndpoints();
            await app.StartAsync();
            using var client = app.GetTestClient();
            client.DefaultRequestHeaders.Add("X-Test-Tenant", tenantA.ToString("D"));

            var reportRequest = new
            {
                source = "bankStatementLines",
                columns = new[] { "statementCode", "lineNumber", "transactionDate", "amount", "isMatched" },
                filters = new[] { new { field = "isMatched", @operator = "equals", value = "false" } },
                sortBy = "transactionDate", descending = false, page = 1, pageSize = 1
            };
            using var page1Response = await client.PostAsJsonAsync("/api/reports/run", reportRequest);
            Assert.Equal(HttpStatusCode.OK, page1Response.StatusCode);
            using var page1 = JsonDocument.Parse(await page1Response.Content.ReadAsStringAsync());
            Assert.Equal(2, page1.RootElement.GetProperty("totalCount").GetInt32());
            Assert.Single(page1.RootElement.GetProperty("rows").EnumerateArray());
            Assert.Equal("SYN-A-001", page1.RootElement.GetProperty("rows")[0].GetProperty("statementCode").GetString());
            Assert.Equal(25m, page1.RootElement.GetProperty("rows")[0].GetProperty("amount").GetDecimal());
            Assert.False(page1.RootElement.GetProperty("rows")[0].GetProperty("isMatched").GetBoolean());

            using var page2Response = await client.PostAsJsonAsync("/api/reports/run", new
            {
                source = reportRequest.source, columns = reportRequest.columns, filters = reportRequest.filters,
                sortBy = reportRequest.sortBy, descending = false, page = 2, pageSize = 1
            });
            Assert.Equal(HttpStatusCode.OK, page2Response.StatusCode);
            using var page2 = JsonDocument.Parse(await page2Response.Content.ReadAsStringAsync());
            Assert.Equal(2, page2.RootElement.GetProperty("totalCount").GetInt32());
            Assert.Equal(10m, page2.RootElement.GetProperty("rows")[0].GetProperty("amount").GetDecimal());

            using var csvResponse = await client.PostAsJsonAsync("/api/reports/export", reportRequest);
            Assert.Equal(HttpStatusCode.OK, csvResponse.StatusCode);
            var csv = await csvResponse.Content.ReadAsStringAsync();
            Assert.Contains("SYN-A-001", csv, StringComparison.Ordinal);
            Assert.DoesNotContain("SYN-B-001", csv, StringComparison.Ordinal);
            Assert.DoesNotContain("999", csv, StringComparison.Ordinal);

            var purchaseRequest = new
            {
                source = "purchaseOrderFulfillment", columns = new[] { "orderCode", "stockCode", "orderedQuantity", "receivedQuantity", "outstandingQuantity" },
                filters = new[] { new { field = "outstandingQuantity", @operator = "gt", value = "0" } },
                sortBy = "orderCode", descending = false, page = 1, pageSize = 10
            };
            using var purchaseResponse = await client.PostAsJsonAsync("/api/reports/run", purchaseRequest);
            Assert.Equal(HttpStatusCode.OK, purchaseResponse.StatusCode);
            using var purchaseResult = JsonDocument.Parse(await purchaseResponse.Content.ReadAsStringAsync());
            Assert.Equal(1, purchaseResult.RootElement.GetProperty("totalCount").GetInt32());
            var purchaseRow = purchaseResult.RootElement.GetProperty("rows")[0];
            Assert.Equal("PO-SYN-A", purchaseRow.GetProperty("orderCode").GetString());
            Assert.Equal(20m, purchaseRow.GetProperty("orderedQuantity").GetDecimal());
            Assert.Equal(12m, purchaseRow.GetProperty("receivedQuantity").GetDecimal());
            Assert.Equal(8m, purchaseRow.GetProperty("outstandingQuantity").GetDecimal());
            using var purchaseCsvResponse = await client.PostAsJsonAsync("/api/reports/export", purchaseRequest);
            Assert.Equal(HttpStatusCode.OK, purchaseCsvResponse.StatusCode);
            var purchaseCsv = await purchaseCsvResponse.Content.ReadAsStringAsync();
            Assert.Contains("PO-SYN-A", purchaseCsv, StringComparison.Ordinal);
            Assert.DoesNotContain("PO-SYN-B", purchaseCsv, StringComparison.Ordinal);
            Assert.DoesNotContain("ITEM-SYN-B", purchaseCsv, StringComparison.Ordinal);
        }
        finally
        {
            if (databaseCreated)
                await seedDb.Database.EnsureDeletedAsync();
        }
    }
}

internal sealed class SqlServerAcceptanceFactAttribute : FactAttribute
{
    public SqlServerAcceptanceFactAttribute()
    {
        if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("AIERP_REPORT_TEST_SQL_CONNECTION_STRING")))
            Skip = "Set AIERP_REPORT_TEST_SQL_CONNECTION_STRING to run this isolated SQL Server acceptance test.";
    }
}
