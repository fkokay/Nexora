using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Encodings.Web;
using System.Text.Json;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Xunit;
using Microsoft.Extensions.Options;

namespace AIERP.Api.IntegrationTests;

public sealed class ReportEndpointsIntegrationTests
{
    private static readonly Guid TenantA = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid TenantB = Guid.Parse("22222222-2222-2222-2222-222222222222");

    [Fact]
    public async Task Catalog_requires_authenticated_tenant_context()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();

        var response = await client.GetAsync("/api/reports/catalog");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Crm_opportunity_report_is_tenant_scoped_filtered_paged_exportable_and_audited()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        var catalog = await client.GetFromJsonAsync<JsonElement[]>("/api/reports/catalog");
        var source = Assert.Single(catalog!, item => item.GetProperty("code").GetString() == "crmOpportunities");
        Assert.Empty(source.GetProperty("aggregates").EnumerateArray());
        Assert.Contains(source.GetProperty("columns").EnumerateArray(), column => column.GetProperty("code").GetString() == "probabilityPercent");

        var definition = new
        {
            source = "crmOpportunities", columns = new[] { "code", "name", "customerCode", "customerName", "stage", "estimatedValue", "currencyCode", "probabilityPercent", "expectedCloseDate" },
            filters = new[] { new { field = "stage", @operator = "equals", value = "Qualified" }, new { field = "currencyCode", @operator = "equals", value = "USD" } },
            sortBy = "code", descending = false, page = 1, pageSize = 1
        };
        var page1Response = await client.PostAsJsonAsync("/api/reports/run", definition);
        page1Response.EnsureSuccessStatusCode();
        using var page1 = JsonDocument.Parse(await page1Response.Content.ReadAsStringAsync());
        Assert.Equal(2, page1.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Single(page1.RootElement.GetProperty("rows").EnumerateArray());
        var first = page1.RootElement.GetProperty("rows")[0];
        Assert.Equal("OPP-A", first.GetProperty("code").GetString());
        Assert.Equal("CUST-A", first.GetProperty("customerCode").GetString());
        Assert.Equal("A customer", first.GetProperty("customerName").GetString());
        Assert.Equal("Qualified", first.GetProperty("stage").GetString());
        Assert.Equal(2500m, first.GetProperty("estimatedValue").GetDecimal());
        Assert.Equal(50, first.GetProperty("probabilityPercent").GetInt32());

        var page2Response = await client.PostAsJsonAsync("/api/reports/run", new
        {
            source = definition.source, columns = definition.columns, filters = definition.filters, sortBy = definition.sortBy,
            descending = false, page = 2, pageSize = 1
        });
        page2Response.EnsureSuccessStatusCode();
        using var page2 = JsonDocument.Parse(await page2Response.Content.ReadAsStringAsync());
        Assert.Equal("OPP-C", page2.RootElement.GetProperty("rows")[0].GetProperty("code").GetString());

        var csvResponse = await client.PostAsJsonAsync("/api/reports/export", definition);
        csvResponse.EnsureSuccessStatusCode();
        var csv = await csvResponse.Content.ReadAsStringAsync();
        Assert.Contains("OPP-A", csv);
        Assert.Contains("OPP-C", csv);
        Assert.DoesNotContain("OPP-B", csv);

        var groupedResponse = await client.PostAsJsonAsync("/api/reports/run", new
        {
            source = "crmOpportunities", columns = new[] { "currencyCode" }, filters = Array.Empty<object>(), sortBy = "currencyCode",
            descending = false, page = 1, pageSize = 50, groupByFields = new[] { "currencyCode" }, aggregate = "count"
        });
        Assert.Equal(HttpStatusCode.BadRequest, groupedResponse.StatusCode);
        var mixedCurrencyAggregateResponse = await client.PostAsJsonAsync("/api/reports/run", new
        {
            source = "crmOpportunities", columns = new[] { "currencyCode", "estimatedValue" }, filters = Array.Empty<object>(), sortBy = "currencyCode",
            descending = false, page = 1, pageSize = 50, groupByFields = new[] { "currencyCode" }, aggregate = "sumEstimatedValue"
        });
        Assert.Equal(HttpStatusCode.BadRequest, mixedCurrencyAggregateResponse.StatusCode);

        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantB.ToString());
        var tenantBResponse = await client.PostAsJsonAsync("/api/reports/run", new
        {
            source = "crmOpportunities", columns = new[] { "code", "customerCode" }, filters = Array.Empty<object>(),
            sortBy = "code", descending = false, page = 1, pageSize = 50
        });
        tenantBResponse.EnsureSuccessStatusCode();
        using var tenantB = JsonDocument.Parse(await tenantBResponse.Content.ReadAsStringAsync());
        Assert.Equal(1, tenantB.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal("OPP-B", tenantB.RootElement.GetProperty("rows")[0].GetProperty("code").GetString());

        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        Assert.Equal(3, await db.AuditEvents.CountAsync(x => x.TenantId == TenantA && (x.Action == "erp.report.executed" || x.Action == "erp.report.exported") && x.Resource.StartsWith("crmOpportunities")));
    }

    [Fact]
    public async Task Bank_statement_report_is_tenant_scoped_projected_and_exportable()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());

        var catalog = await client.GetFromJsonAsync<JsonElement[]>("/api/reports/catalog");
        var source = Assert.Single(catalog!, item => item.GetProperty("code").GetString() == "bankStatements");
        Assert.Empty(source.GetProperty("aggregates").EnumerateArray());
        Assert.Contains(source.GetProperty("columns").EnumerateArray(), column => column.GetProperty("code").GetString() == "createdAt");
        var definition = new
        {
            source = "bankStatements",
            columns = new[] { "code", "accountCode", "accountName", "currencyCode", "startDate", "endDate", "openingBalance", "closingBalance", "status", "lineCount", "matchedLineCount", "unmatchedLineCount" },
            filters = new[] { new { field = "lineCount", @operator = "gte", value = "1" } },
            sortBy = "code", descending = false, page = 1, pageSize = 1
        };
        var response = await client.PostAsJsonAsync("/api/reports/run", definition);
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        using var result = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, result.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Single(result.RootElement.GetProperty("rows").EnumerateArray());
        var row = result.RootElement.GetProperty("rows")[0];
        Assert.Equal("BANK-A", row.GetProperty("code").GetString());
        Assert.Equal("BANK-A", row.GetProperty("accountCode").GetString());
        Assert.Equal("Operating account A", row.GetProperty("accountName").GetString());
        Assert.Equal("USD", row.GetProperty("currencyCode").GetString());
        Assert.Equal("2026-10-01", row.GetProperty("startDate").GetString());
        Assert.Equal("2026-10-31", row.GetProperty("endDate").GetString());
        Assert.Equal(100m, row.GetProperty("openingBalance").GetDecimal());
        Assert.Equal(175m, row.GetProperty("closingBalance").GetDecimal());
        Assert.Equal("Imported", row.GetProperty("status").GetString());
        Assert.Equal(2, row.GetProperty("lineCount").GetInt32());
        Assert.Equal(1, row.GetProperty("matchedLineCount").GetInt32());
        Assert.Equal(1, row.GetProperty("unmatchedLineCount").GetInt32());

        var grouped = await client.PostAsJsonAsync("/api/reports/run", new
        {
            source = "bankStatements", columns = new[] { "status" }, filters = Array.Empty<object>(), sortBy = "status",
            descending = false, page = 1, pageSize = 50, groupByFields = new[] { "status" }, aggregate = "count"
        });
        Assert.Equal(HttpStatusCode.BadRequest, grouped.StatusCode);

        var csvResponse = await client.PostAsJsonAsync("/api/reports/export", definition);
        csvResponse.EnsureSuccessStatusCode();
        var csv = await csvResponse.Content.ReadAsStringAsync();
        Assert.Contains("BANK-A", csv);
        Assert.DoesNotContain("BANK-B", csv);

        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantB.ToString());
        var otherTenantResponse = await client.PostAsJsonAsync("/api/reports/run", new
        {
            source = "bankStatements", columns = new[] { "code", "accountCode", "lineCount" }, filters = Array.Empty<object>(),
            sortBy = "code", descending = false, page = 1, pageSize = 50
        });
        otherTenantResponse.EnsureSuccessStatusCode();
        using var otherTenant = JsonDocument.Parse(await otherTenantResponse.Content.ReadAsStringAsync());
        Assert.Equal(1, otherTenant.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal("BANK-B", otherTenant.RootElement.GetProperty("rows")[0].GetProperty("code").GetString());
    }

    [Fact]
    public async Task Customer_ledger_report_is_tenant_scoped_filtered_traceable_and_exportable()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            var customerA = await db.CustomerAccounts.SingleAsync(x => x.TenantId == TenantA && x.Code == "CUST-A");
            var customerB = await db.CustomerAccounts.SingleAsync(x => x.TenantId == TenantB && x.Code == "CUST-B");
            var invoiceA = await db.SalesInvoices.SingleAsync(x => x.TenantId == TenantA && x.Code == "INV-A");
            var invoiceB = await db.SalesInvoices.SingleAsync(x => x.TenantId == TenantB && x.Code == "INV-B");
            db.CustomerLedgerEntries.AddRange(
                new CustomerLedgerEntry { TenantId = TenantA, CustomerId = customerA.Id, Customer = customerA, SalesInvoiceId = invoiceA.Id, SalesInvoice = invoiceA,
                    EntryDate = new DateOnly(2026, 10, 15), Direction = CustomerLedgerDirection.Debit, Amount = 250m, CurrencyCode = "USD", Description = "Tenant A invoice ledger" },
                new CustomerLedgerEntry { TenantId = TenantB, CustomerId = customerB.Id, Customer = customerB, SalesInvoiceId = invoiceB.Id, SalesInvoice = invoiceB,
                    EntryDate = new DateOnly(2026, 10, 16), Direction = CustomerLedgerDirection.Debit, Amount = 900_000m, CurrencyCode = "EUR", Description = "Tenant B invoice ledger" });
            await db.SaveChangesAsync();
        }

        var catalog = await client.GetFromJsonAsync<JsonElement[]>("/api/reports/catalog");
        var source = Assert.Single(catalog!, item => item.GetProperty("code").GetString() == "customerLedgerEntries");
        Assert.Empty(source.GetProperty("aggregates").EnumerateArray());
        Assert.Contains(source.GetProperty("columns").EnumerateArray(), column => column.GetProperty("code").GetString() == "sourceCode");
        var definition = new
        {
            source = "customerLedgerEntries",
            columns = new[] { "entryDate", "customerCode", "customerName", "direction", "amount", "currencyCode", "description", "sourceType", "sourceCode", "reversalOfId" },
            filters = new[] { new { field = "currencyCode", @operator = "equals", value = "USD" }, new { field = "direction", @operator = "equals", value = "Debit" } },
            sortBy = "entryDate", descending = true, page = 1, pageSize = 10
        };
        var response = await client.PostAsJsonAsync("/api/reports/run", definition);
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        using var result = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, result.RootElement.GetProperty("totalCount").GetInt32());
        var row = result.RootElement.GetProperty("rows")[0];
        Assert.Equal("CUST-A", row.GetProperty("customerCode").GetString());
        Assert.Equal("A customer", row.GetProperty("customerName").GetString());
        Assert.Equal("Debit", row.GetProperty("direction").GetString());
        Assert.Equal(250m, row.GetProperty("amount").GetDecimal());
        Assert.Equal("USD", row.GetProperty("currencyCode").GetString());
        Assert.Equal("SalesInvoice", row.GetProperty("sourceType").GetString());
        Assert.Equal("INV-A", row.GetProperty("sourceCode").GetString());

        var csvResponse = await client.PostAsJsonAsync("/api/reports/export", definition);
        csvResponse.EnsureSuccessStatusCode();
        var csv = await csvResponse.Content.ReadAsStringAsync();
        Assert.Contains("INV-A", csv);
        Assert.DoesNotContain("INV-B", csv);

        var invalidGrouping = await client.PostAsJsonAsync("/api/reports/run", new
        {
            source = "customerLedgerEntries", columns = new[] { "currencyCode" }, filters = Array.Empty<object>(), sortBy = "currencyCode",
            descending = false, page = 1, pageSize = 50, groupByFields = new[] { "currencyCode" }, aggregate = "count"
        });
        Assert.Equal(HttpStatusCode.BadRequest, invalidGrouping.StatusCode);

        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantB.ToString());
        var otherTenantResponse = await client.PostAsJsonAsync("/api/reports/run", new
        {
            source = "customerLedgerEntries", columns = new[] { "customerCode", "amount", "currencyCode", "sourceCode" }, filters = Array.Empty<object>(),
            sortBy = "amount", descending = true, page = 1, pageSize = 50
        });
        otherTenantResponse.EnsureSuccessStatusCode();
        using var otherTenant = JsonDocument.Parse(await otherTenantResponse.Content.ReadAsStringAsync());
        Assert.Equal(1, otherTenant.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal("CUST-B", otherTenant.RootElement.GetProperty("rows")[0].GetProperty("customerCode").GetString());
        Assert.Equal("INV-B", otherTenant.RootElement.GetProperty("rows")[0].GetProperty("sourceCode").GetString());

        await using var auditScope = app.Services.CreateAsyncScope();
        var auditDb = auditScope.ServiceProvider.GetRequiredService<TenantDbContext>();
        Assert.True(await auditDb.AuditEvents.AnyAsync(x => x.TenantId == TenantA && x.Action == "erp.report.executed" && x.Resource == "customerLedgerEntries"));
        Assert.True(await auditDb.AuditEvents.AnyAsync(x => x.TenantId == TenantA && x.Action == "erp.report.exported" && x.Resource.StartsWith("customerLedgerEntries:")));
    }

    [Fact]
    public async Task Supplier_payment_report_is_tenant_scoped_filtered_traceable_and_exportable()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        var catalog = await client.GetFromJsonAsync<JsonElement[]>("/api/reports/catalog");
        var source = Assert.Single(catalog!, item => item.GetProperty("code").GetString() == "supplierPayments");
        Assert.Empty(source.GetProperty("aggregates").EnumerateArray());
        Assert.Contains(source.GetProperty("columns").EnumerateArray(), column => column.GetProperty("code").GetString() == "invoiceCode");

        var definition = new
        {
            source = "supplierPayments",
            columns = new[] { "code", "invoiceCode", "supplierCode", "supplierName", "paymentDate", "currencyCode", "amount", "paymentMethod", "reference", "status", "accountCode" },
            filters = new[] { new { field = "amount", @operator = "gte", value = "100" }, new { field = "status", @operator = "equals", value = "Posted" } },
            sortBy = "paymentDate", descending = true, page = 1, pageSize = 1
        };
        var response = await client.PostAsJsonAsync("/api/reports/run", definition);
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        using var result = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, result.RootElement.GetProperty("totalCount").GetInt32());
        var row = result.RootElement.GetProperty("rows")[0];
        Assert.Equal("PAY-A", row.GetProperty("code").GetString());
        Assert.Equal("PINV-A", row.GetProperty("invoiceCode").GetString());
        Assert.Equal("CUST-A", row.GetProperty("supplierCode").GetString());
        Assert.Equal("A customer", row.GetProperty("supplierName").GetString());
        Assert.Equal(125m, row.GetProperty("amount").GetDecimal());
        Assert.Equal("Bank transfer", row.GetProperty("paymentMethod").GetString());
        Assert.Equal("REF-A", row.GetProperty("reference").GetString());
        Assert.Equal("BANK-A", row.GetProperty("accountCode").GetString());

        var grouped = await client.PostAsJsonAsync("/api/reports/run", new
        {
            source = "supplierPayments", columns = new[] { "status" }, filters = Array.Empty<object>(), sortBy = "status",
            descending = false, page = 1, pageSize = 50, groupByFields = new[] { "status" }, aggregate = "count"
        });
        Assert.Equal(HttpStatusCode.BadRequest, grouped.StatusCode);

        var csvResponse = await client.PostAsJsonAsync("/api/reports/export", definition);
        csvResponse.EnsureSuccessStatusCode();
        var csv = await csvResponse.Content.ReadAsStringAsync();
        Assert.Contains("PAY-A", csv);
        Assert.DoesNotContain("PAY-B", csv);

        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantB.ToString());
        var tenantBResponse = await client.PostAsJsonAsync("/api/reports/run", new
        {
            source = "supplierPayments", columns = new[] { "code", "invoiceCode", "amount" }, filters = Array.Empty<object>(),
            sortBy = "code", descending = false, page = 1, pageSize = 50
        });
        tenantBResponse.EnsureSuccessStatusCode();
        using var tenantB = JsonDocument.Parse(await tenantBResponse.Content.ReadAsStringAsync());
        Assert.Equal(1, tenantB.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal("PAY-B", tenantB.RootElement.GetProperty("rows")[0].GetProperty("code").GetString());
    }

    [Fact]
    public async Task Sales_delivery_reports_are_tenant_scoped_traceable_and_exportable()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        var catalog = await client.GetFromJsonAsync<JsonElement[]>("/api/reports/catalog");
        Assert.Contains(catalog!, source => source.GetProperty("code").GetString() == "salesDeliveries");
        var definition = new
        {
            source = "salesDeliveries", columns = new[] { "code", "orderCode", "customerCode", "warehouseCode", "deliveryDate", "status", "lineCount", "totalQuantity", "invoiceCode" },
            filters = new[] { new { field = "deliveryDate", @operator = "gte", value = "2026-10-01" } },
            sortBy = "deliveryDate", descending = false, page = 1, pageSize = 50
        };
        var response = await client.PostAsJsonAsync("/api/reports/run", definition);
        response.EnsureSuccessStatusCode();
        using var result = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, result.RootElement.GetProperty("totalCount").GetInt32());
        var row = result.RootElement.GetProperty("rows")[0];
        Assert.Equal("D-A", row.GetProperty("code").GetString());
        Assert.Equal("O-A", row.GetProperty("orderCode").GetString());
        Assert.Equal("CUST-A", row.GetProperty("customerCode").GetString());
        Assert.Equal("WH-A", row.GetProperty("warehouseCode").GetString());
        Assert.Equal(1, row.GetProperty("lineCount").GetInt32());
        Assert.Equal(4m, row.GetProperty("totalQuantity").GetDecimal());
        Assert.Equal("INV-A", row.GetProperty("invoiceCode").GetString());

        var csv = await client.PostAsJsonAsync("/api/reports/export", definition);
        csv.EnsureSuccessStatusCode();
        var csvText = await csv.Content.ReadAsStringAsync();
        Assert.Contains("D-A", csvText);
        Assert.DoesNotContain("D-B", csvText);

        var grouped = await client.PostAsJsonAsync("/api/reports/run", new
        {
            source = "salesDeliveries", columns = new[] { "status" }, filters = Array.Empty<object>(), sortBy = "status",
            descending = false, page = 1, pageSize = 50, groupByFields = new[] { "status" }, aggregate = "count"
        });
        Assert.Equal(HttpStatusCode.BadRequest, grouped.StatusCode);

        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantB.ToString());
        var tenantB = await client.PostAsJsonAsync("/api/reports/run", new
        {
            source = "salesDeliveries", columns = new[] { "code" }, filters = Array.Empty<object>(), sortBy = "code",
            descending = false, page = 1, pageSize = 50
        });
        tenantB.EnsureSuccessStatusCode();
        using var tenantBResult = JsonDocument.Parse(await tenantB.Content.ReadAsStringAsync());
        Assert.Equal("D-B", tenantBResult.RootElement.GetProperty("rows")[0].GetProperty("code").GetString());
    }

    [Fact]
    public async Task Sales_return_reports_are_tenant_scoped_traceable_and_exportable()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());

        var catalog = await client.GetFromJsonAsync<JsonElement[]>("/api/reports/catalog");
        Assert.Contains(catalog!, source => source.GetProperty("code").GetString() == "salesReturns");
        var definition = new
        {
            source = "salesReturns", columns = new[] { "code", "invoiceCode", "customerCode", "warehouseCode", "returnDate", "currencyCode", "status", "grandTotal" },
            filters = new[] { new { field = "returnDate", @operator = "gte", value = "2026-10-01" } },
            sortBy = "returnDate", descending = false, page = 1, pageSize = 50
        };
        var response = await client.PostAsJsonAsync("/api/reports/run", definition);
        response.EnsureSuccessStatusCode();
        using var result = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, result.RootElement.GetProperty("totalCount").GetInt32());
        var row = result.RootElement.GetProperty("rows")[0];
        Assert.Equal("RET-A", row.GetProperty("code").GetString());
        Assert.Equal("INV-A", row.GetProperty("invoiceCode").GetString());
        Assert.Equal("CUST-A", row.GetProperty("customerCode").GetString());
        Assert.Equal("WH-A", row.GetProperty("warehouseCode").GetString());
        Assert.Equal("USD", row.GetProperty("currencyCode").GetString());
        Assert.Equal(25m, row.GetProperty("grandTotal").GetDecimal());

        var csv = await client.PostAsJsonAsync("/api/reports/export", definition);
        csv.EnsureSuccessStatusCode();
        var csvText = await csv.Content.ReadAsStringAsync();
        Assert.Contains("RET-A", csvText);
        Assert.DoesNotContain("RET-B", csvText);

        var grouped = await client.PostAsJsonAsync("/api/reports/run", new
        {
            source = "salesReturns", columns = new[] { "status" }, filters = Array.Empty<object>(), sortBy = "status",
            descending = false, page = 1, pageSize = 50, groupByFields = new[] { "status" }, aggregate = "count"
        });
        Assert.Equal(HttpStatusCode.BadRequest, grouped.StatusCode);
    }

    [Fact]
    public async Task Supplier_return_reports_are_tenant_scoped_traceable_and_exportable()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        var catalog = await client.GetFromJsonAsync<JsonElement[]>("/api/reports/catalog");
        var source = Assert.Single(catalog!, item => item.GetProperty("code").GetString() == "supplierReturns");
        Assert.Contains(source.GetProperty("columns").EnumerateArray(), column => column.GetProperty("code").GetString() == "supplierCode");
        var definition = new
        {
            source = "supplierReturns", columns = new[] { "code", "invoiceCode", "supplierCode", "warehouseCode", "returnDate", "status", "lineCount", "totalQuantity", "grandTotal" },
            filters = new[] { new { field = "returnDate", @operator = "gte", value = "2026-10-01" }, new { field = "grandTotal", @operator = "gte", value = "35" } },
            sortBy = "returnDate", descending = false, page = 1, pageSize = 50
        };
        var response = await client.PostAsJsonAsync("/api/reports/run", definition);
        response.EnsureSuccessStatusCode();
        using var result = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, result.RootElement.GetProperty("totalCount").GetInt32());
        var row = result.RootElement.GetProperty("rows")[0];
        Assert.Equal("SRET-A", row.GetProperty("code").GetString());
        Assert.Equal("PINV-A", row.GetProperty("invoiceCode").GetString());
        Assert.Equal("CUST-A", row.GetProperty("supplierCode").GetString());
        Assert.Equal("WH-A", row.GetProperty("warehouseCode").GetString());
        Assert.Equal("Posted", row.GetProperty("status").GetString());
        Assert.Equal(1, row.GetProperty("lineCount").GetInt32());
        Assert.Equal(7m, row.GetProperty("totalQuantity").GetDecimal());
        Assert.Equal(35m, row.GetProperty("grandTotal").GetDecimal());
        var csv = await client.PostAsJsonAsync("/api/reports/export", definition);
        csv.EnsureSuccessStatusCode();
        var csvText = await csv.Content.ReadAsStringAsync();
        Assert.Contains("SRET-A", csvText);
        Assert.DoesNotContain("SRET-B", csvText);
        var grouped = await client.PostAsJsonAsync("/api/reports/run", new
        {
            source = "supplierReturns", columns = new[] { "status" }, filters = Array.Empty<object>(), sortBy = "status",
            descending = false, page = 1, pageSize = 50, groupByFields = new[] { "status" }, aggregate = "count"
        });
        Assert.Equal(HttpStatusCode.BadRequest, grouped.StatusCode);
    }

    [Fact]
    public async Task Sales_order_reports_support_tenant_scoped_rows_grouping_currency_safety_and_csv()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());

        var catalog = await client.GetFromJsonAsync<JsonElement[]>("/api/reports/catalog");
        Assert.Contains(catalog!, source => source.GetProperty("code").GetString() == "salesOrders");
        var definition = new
        {
            source = "salesOrders", columns = new[] { "code", "customerCode", "customerName", "status", "grandTotal" },
            filters = new[] { new { field = "status", @operator = "equals", value = "Open" } },
            sortBy = "orderDate", descending = false, page = 1, pageSize = 50
        };
        var rowsResponse = await client.PostAsJsonAsync("/api/reports/run", definition);
        rowsResponse.EnsureSuccessStatusCode();
        using var rows = JsonDocument.Parse(await rowsResponse.Content.ReadAsStringAsync());
        Assert.Equal(1, rows.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal("O-A", rows.RootElement.GetProperty("rows")[0].GetProperty("code").GetString());
        Assert.Equal("CUST-A", rows.RootElement.GetProperty("rows")[0].GetProperty("customerCode").GetString());

        var unsafeAggregate = await client.PostAsJsonAsync("/api/reports/run", new
        {
            source = "salesOrders", columns = new[] { "status" }, filters = Array.Empty<object>(), sortBy = "status",
            descending = false, page = 1, pageSize = 50, groupByFields = new[] { "status" }, aggregate = "sumGrandTotal"
        });
        Assert.Equal(HttpStatusCode.BadRequest, unsafeAggregate.StatusCode);

        var grouped = await client.PostAsJsonAsync("/api/reports/run", new
        {
            source = "salesOrders", columns = new[] { "code" }, filters = Array.Empty<object>(), sortBy = "currencyCode",
            descending = false, page = 1, pageSize = 50, groupByFields = new[] { "currencyCode" }, aggregate = "sumGrandTotal"
        });
        grouped.EnsureSuccessStatusCode();
        using var groupedResult = JsonDocument.Parse(await grouped.Content.ReadAsStringAsync());
        Assert.Equal("USD", groupedResult.RootElement.GetProperty("groups")[0].GetProperty("groupValue").GetString());
        Assert.Equal(350m, groupedResult.RootElement.GetProperty("groups")[0].GetProperty("value").GetDecimal());

        var csv = await client.PostAsJsonAsync("/api/reports/export", definition);
        csv.EnsureSuccessStatusCode();
        var csvText = await csv.Content.ReadAsStringAsync();
        Assert.Contains("O-A", csvText);
        Assert.DoesNotContain("O-B", csvText);
    }

    [Fact]
    public async Task Sales_order_fulfillment_report_shows_line_reservations_backorders_and_is_tenant_scoped()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        using (var scope = app.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            var order = await db.SalesOrders.SingleAsync(x => x.TenantId == TenantB && x.Code == "O-B");
            order.Status = SalesOrderStatus.Cancelled;
            var stock = await db.StockItems.SingleAsync(x => x.TenantId == TenantB && x.Code == "STOCK-B");
            db.SalesOrderLines.Add(new SalesOrderLine
            {
                TenantId = TenantB, OrderId = order.Id, Order = order, LineNumber = 1, StockItemId = stock.Id, StockItem = stock,
                StockCode = stock.Code, StockName = stock.Name, UnitCode = stock.UnitCode, Quantity = 900m
            });
            await db.SaveChangesAsync();
        }

        var catalog = await client.GetFromJsonAsync<JsonElement[]>("/api/reports/catalog");
        var source = Assert.Single(catalog!, item => item.GetProperty("code").GetString() == "salesOrderFulfillment");
        Assert.Contains(source.GetProperty("columns").EnumerateArray(), column => column.GetProperty("code").GetString() == "backorderQuantity");
        var definition = new
        {
            source = "salesOrderFulfillment",
            columns = new[] { "orderCode", "stockCode", "orderedQuantity", "reservedQuantity", "fulfilledQuantity", "remainingQuantity", "backorderQuantity" },
            filters = new[] { new { field = "backorderQuantity", @operator = "gte", value = "6" } },
            sortBy = "orderCode", descending = false, page = 1, pageSize = 1
        };
        var response = await client.PostAsJsonAsync("/api/reports/run", definition);
        response.EnsureSuccessStatusCode();
        using var result = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, result.RootElement.GetProperty("totalCount").GetInt32());
        var row = result.RootElement.GetProperty("rows")[0];
        Assert.Equal("O-A", row.GetProperty("orderCode").GetString());
        Assert.Equal("STOCK-A", row.GetProperty("stockCode").GetString());
        Assert.Equal(10m, row.GetProperty("orderedQuantity").GetDecimal());
        Assert.Equal(3m, row.GetProperty("reservedQuantity").GetDecimal());
        Assert.Equal(1m, row.GetProperty("fulfilledQuantity").GetDecimal());
        Assert.Equal(9m, row.GetProperty("remainingQuantity").GetDecimal());
        Assert.Equal(6m, row.GetProperty("backorderQuantity").GetDecimal());

        var csvResponse = await client.PostAsJsonAsync("/api/reports/export", definition);
        csvResponse.EnsureSuccessStatusCode();
        var csv = await csvResponse.Content.ReadAsStringAsync();
        Assert.Contains("Rezerve edilmemiş kalan miktar", csv);
        Assert.Contains("STOCK-A", csv);
        Assert.DoesNotContain("STOCK-B", csv);

        var grouped = await client.PostAsJsonAsync("/api/reports/run", new
        {
            source = "salesOrderFulfillment", columns = new[] { "orderCode" }, filters = Array.Empty<object>(), sortBy = "orderCode",
            descending = false, page = 1, pageSize = 50, groupByFields = new[] { "orderCode" }, aggregate = "count"
        });
        Assert.Equal(HttpStatusCode.BadRequest, grouped.StatusCode);
        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantB.ToString());
        var tenantB = await client.PostAsJsonAsync("/api/reports/run", new
        {
            source = "salesOrderFulfillment", columns = new[] { "orderCode", "stockCode", "remainingQuantity", "backorderQuantity" }, filters = Array.Empty<object>(), sortBy = "orderCode",
            descending = false, page = 1, pageSize = 50
        });
        tenantB.EnsureSuccessStatusCode();
        using var tenantBResult = JsonDocument.Parse(await tenantB.Content.ReadAsStringAsync());
        Assert.Equal("O-B", tenantBResult.RootElement.GetProperty("rows")[0].GetProperty("orderCode").GetString());
        Assert.Equal("STOCK-B", tenantBResult.RootElement.GetProperty("rows")[0].GetProperty("stockCode").GetString());
        Assert.Equal(0m, tenantBResult.RootElement.GetProperty("rows")[0].GetProperty("remainingQuantity").GetDecimal());
        Assert.Equal(0m, tenantBResult.RootElement.GetProperty("rows")[0].GetProperty("backorderQuantity").GetDecimal());
    }

    [Fact]
    public async Task Sales_quote_reports_are_tenant_scoped_filterable_pageable_and_exportable()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        using (var scope = app.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            var customer = await db.CustomerAccounts.SingleAsync(x => x.TenantId == TenantA && x.Code == "CUST-A");
            db.SalesQuotes.Add(new SalesQuote
            {
                TenantId = TenantA, CustomerId = customer.Id, Customer = customer,
                Code = "Q-C", QuoteDate = new DateOnly(2026, 10, 2), ValidUntil = new DateOnly(2026, 11, 30),
                CurrencyCode = "USD", Status = SalesQuoteStatus.Sent, GrandTotal = 125m
            });
            await db.SaveChangesAsync();
        }

        var catalog = await client.GetFromJsonAsync<JsonElement[]>("/api/reports/catalog");
        var quoteSource = Assert.Single(catalog!, source => source.GetProperty("code").GetString() == "salesQuotes");
        Assert.Contains(quoteSource.GetProperty("columns").EnumerateArray(), column => column.GetProperty("code").GetString() == "orderCode");

        var definition = new
        {
            source = "salesQuotes",
            columns = new[] { "code", "customerCode", "status", "quoteDate", "validUntil", "grandTotal", "orderCode" },
            filters = new object[]
            {
                new { field = "status", @operator = "equals", value = "Draft" },
                new { field = "quoteDate", @operator = "gte", value = "2026-10-01" },
                new { field = "orderCode", @operator = "equals", value = "O-A" }
            },
            sortBy = "code", descending = false, page = 1, pageSize = 1
        };
        var response = await client.PostAsJsonAsync("/api/reports/run", definition);
        response.EnsureSuccessStatusCode();
        using var result = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, result.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Single(result.RootElement.GetProperty("rows").EnumerateArray());
        var row = result.RootElement.GetProperty("rows")[0];
        Assert.Equal("Q-A", row.GetProperty("code").GetString());
        Assert.Equal("CUST-A", row.GetProperty("customerCode").GetString());
        Assert.Equal("Draft", row.GetProperty("status").GetString());
        Assert.Equal("O-A", row.GetProperty("orderCode").GetString());
        Assert.Equal(new DateOnly(2026, 10, 1), row.GetProperty("quoteDate").Deserialize<DateOnly>());

        var nextPage = await client.PostAsJsonAsync("/api/reports/run", new
        {
            source = "salesQuotes", columns = new[] { "code" }, filters = Array.Empty<object>(), sortBy = "code",
            descending = false, page = 2, pageSize = 1
        });
        nextPage.EnsureSuccessStatusCode();
        using var pageResult = JsonDocument.Parse(await nextPage.Content.ReadAsStringAsync());
        Assert.Equal(2, pageResult.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal("Q-C", pageResult.RootElement.GetProperty("rows")[0].GetProperty("code").GetString());

        var unconverted = await client.PostAsJsonAsync("/api/reports/run", new
        {
            source = "salesQuotes", columns = new[] { "code", "orderCode" },
            filters = new[] { new { field = "orderCode", @operator = "isNull", value = "" } }, sortBy = "code",
            descending = false, page = 1, pageSize = 50
        });
        unconverted.EnsureSuccessStatusCode();
        using var unconvertedResult = JsonDocument.Parse(await unconverted.Content.ReadAsStringAsync());
        Assert.Equal("Q-C", unconvertedResult.RootElement.GetProperty("rows")[0].GetProperty("code").GetString());
        Assert.Equal(JsonValueKind.Null, unconvertedResult.RootElement.GetProperty("rows")[0].GetProperty("orderCode").ValueKind);

        var csvResponse = await client.PostAsJsonAsync("/api/reports/export", definition);
        csvResponse.EnsureSuccessStatusCode();
        var csv = await csvResponse.Content.ReadAsStringAsync();
        Assert.Contains("Q-A", csv);
        Assert.DoesNotContain("Q-B", csv);

        var grouped = await client.PostAsJsonAsync("/api/reports/run", new
        {
            source = "salesQuotes", columns = new[] { "status" }, filters = Array.Empty<object>(), sortBy = "status",
            descending = false, page = 1, pageSize = 50, groupByFields = new[] { "status" }, aggregate = "count"
        });
        Assert.Equal(HttpStatusCode.BadRequest, grouped.StatusCode);

        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantB.ToString());
        var tenantB = await client.PostAsJsonAsync("/api/reports/run", new
        {
            source = "salesQuotes", columns = new[] { "code", "orderCode" }, filters = Array.Empty<object>(), sortBy = "code",
            descending = false, page = 1, pageSize = 50
        });
        tenantB.EnsureSuccessStatusCode();
        using var tenantBResult = JsonDocument.Parse(await tenantB.Content.ReadAsStringAsync());
        Assert.Equal("Q-B", tenantBResult.RootElement.GetProperty("rows")[0].GetProperty("code").GetString());
        Assert.Equal("O-B", tenantBResult.RootElement.GetProperty("rows")[0].GetProperty("orderCode").GetString());
    }

    [Fact]
    public async Task Purchase_supplier_quote_reports_are_tenant_scoped_filterable_pageable_exportable_and_audited()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        using (var scope = app.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            var supplierA = await db.CustomerAccounts.SingleAsync(x => x.TenantId == TenantA && x.Code == "CUST-A");
            var supplierB = await db.CustomerAccounts.SingleAsync(x => x.TenantId == TenantB && x.Code == "CUST-B");
            var requestA = await db.PurchaseRequests.SingleAsync(x => x.TenantId == TenantA && x.Code == "PR-OWNER");
            var requestB = await db.PurchaseRequests.SingleAsync(x => x.TenantId == TenantB && x.Code == "PR-TENANT-B");
            db.PurchaseSupplierQuotes.AddRange(
                new PurchaseSupplierQuote
                {
                    TenantId = TenantA, PurchaseRequestId = requestA.Id, PurchaseRequest = requestA, SupplierId = supplierA.Id, Supplier = supplierA,
                    Code = "SQ-A", QuoteDate = new DateOnly(2026, 10, 12), ValidUntil = new DateOnly(2026, 11, 12), CurrencyCode = "USD",
                    Status = PurchaseSupplierQuoteStatus.Selected, Subtotal = 90m, TaxTotal = 10m, GrandTotal = 100m
                },
                new PurchaseSupplierQuote
                {
                    TenantId = TenantB, PurchaseRequestId = requestB.Id, PurchaseRequest = requestB, SupplierId = supplierB.Id, Supplier = supplierB,
                    Code = "SQ-B", QuoteDate = new DateOnly(2026, 10, 12), CurrencyCode = "EUR", Status = PurchaseSupplierQuoteStatus.Submitted, GrandTotal = 900_000m
                });
            await db.SaveChangesAsync();
        }

        var catalog = await client.GetFromJsonAsync<JsonElement[]>("/api/reports/catalog");
        var source = Assert.Single(catalog!, item => item.GetProperty("code").GetString() == "purchaseSupplierQuotes");
        Assert.Empty(source.GetProperty("aggregates").EnumerateArray());
        Assert.Contains(source.GetProperty("columns").EnumerateArray(), item => item.GetProperty("code").GetString() == "requestCode");

        var definition = new
        {
            source = "purchaseSupplierQuotes", columns = new[] { "code", "requestCode", "supplierCode", "supplierName", "status", "currencyCode", "grandTotal" },
            filters = new object[]
            {
                new { field = "status", @operator = "equals", value = "Selected" },
                new { field = "requestCode", @operator = "contains", value = "OWNER" }
            },
            sortBy = "code", descending = false, page = 1, pageSize = 1
        };
        var response = await client.PostAsJsonAsync("/api/reports/run", definition);
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        using var result = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, result.RootElement.GetProperty("totalCount").GetInt32());
        var row = result.RootElement.GetProperty("rows")[0];
        Assert.Equal("SQ-A", row.GetProperty("code").GetString());
        Assert.Equal("PR-OWNER", row.GetProperty("requestCode").GetString());
        Assert.Equal("CUST-A", row.GetProperty("supplierCode").GetString());
        Assert.Equal("Selected", row.GetProperty("status").GetString());
        Assert.Equal(100m, row.GetProperty("grandTotal").GetDecimal());

        var csvResponse = await client.PostAsJsonAsync("/api/reports/export", definition);
        csvResponse.EnsureSuccessStatusCode();
        var csv = await csvResponse.Content.ReadAsStringAsync();
        Assert.Contains("SQ-A", csv);
        Assert.DoesNotContain("SQ-B", csv);

        var grouped = await client.PostAsJsonAsync("/api/reports/run", new
        {
            source = "purchaseSupplierQuotes", columns = new[] { "currencyCode", "grandTotal" }, filters = Array.Empty<object>(),
            sortBy = "currencyCode", descending = false, page = 1, pageSize = 50, groupByFields = new[] { "currencyCode" }, aggregate = "count"
        });
        Assert.Equal(HttpStatusCode.BadRequest, grouped.StatusCode);

        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantB.ToString());
        var tenantBResponse = await client.PostAsJsonAsync("/api/reports/run", new
        {
            source = "purchaseSupplierQuotes", columns = new[] { "code", "currencyCode" }, filters = Array.Empty<object>(),
            sortBy = "code", descending = false, page = 1, pageSize = 50
        });
        tenantBResponse.EnsureSuccessStatusCode();
        using var tenantB = JsonDocument.Parse(await tenantBResponse.Content.ReadAsStringAsync());
        Assert.Equal(1, tenantB.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal("SQ-B", tenantB.RootElement.GetProperty("rows")[0].GetProperty("code").GetString());

        await using var auditScope = app.Services.CreateAsyncScope();
        var auditDb = auditScope.ServiceProvider.GetRequiredService<TenantDbContext>();
        Assert.Equal(2, await auditDb.AuditEvents.CountAsync(x => x.TenantId == TenantA &&
            (x.Action == "erp.report.executed" || x.Action == "erp.report.exported") && x.Resource.StartsWith("purchaseSupplierQuotes")));
    }

    [Fact]
    public async Task Csv_report_escapes_formula_like_text_cells()
    {
        await using var app = await StartApplicationAsync();
        using (var scope = app.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            var customer = await db.CustomerAccounts.SingleAsync(x => x.TenantId == TenantA && x.Code == "CUST-A");
            // Spreadsheets may ignore leading whitespace before a formula marker.
            customer.Name = " \t=1+1";
            await db.SaveChangesAsync();
        }

        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        var response = await client.PostAsJsonAsync("/api/reports/export", new
        {
            source = "salesQuotes", columns = new[] { "code", "customerName" }, filters = Array.Empty<object>(),
            sortBy = "code", descending = false, page = 1, pageSize = 50
        });
        response.EnsureSuccessStatusCode();
        var csv = await response.Content.ReadAsStringAsync();
        Assert.Contains("\"' \t=1+1\"", csv);
    }

    [Fact]
    public async Task Manufacturing_order_reports_include_operation_costs_and_remain_tenant_scoped()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());

        var catalog = await client.GetFromJsonAsync<JsonElement[]>("/api/reports/catalog");
        Assert.Contains(catalog!, source => source.GetProperty("code").GetString() == "manufacturingOrders");
        var definition = new
        {
            source = "manufacturingOrders",
            columns = new[] { "code", "bomCode", "warehouseCode", "status", "plannedQuantity", "operationCount", "plannedOperationCost", "actualOperationCost" },
            filters = new[] { new { field = "plannedOperationCost", @operator = "gte", value = "12" } },
            sortBy = "plannedOperationCost", descending = true, page = 1, pageSize = 50
        };

        var response = await client.PostAsJsonAsync("/api/reports/run", definition);
        response.EnsureSuccessStatusCode();
        using var result = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, result.RootElement.GetProperty("totalCount").GetInt32());
        var row = result.RootElement.GetProperty("rows")[0];
        Assert.Equal("MO-A", row.GetProperty("code").GetString());
        Assert.Equal("BOM-A", row.GetProperty("bomCode").GetString());
        Assert.Equal("WH-A", row.GetProperty("warehouseCode").GetString());
        Assert.Equal(1, row.GetProperty("operationCount").GetInt32());
        Assert.Equal(12m, row.GetProperty("plannedOperationCost").GetDecimal());
        Assert.Equal(7m, row.GetProperty("actualOperationCost").GetDecimal());

        var grouped = await client.PostAsJsonAsync("/api/reports/run", new
        {
            source = "manufacturingOrders", columns = new[] { "status" }, filters = Array.Empty<object>(), sortBy = "status",
            descending = false, page = 1, pageSize = 50, groupByFields = new[] { "status" }, aggregate = "count"
        });
        grouped.EnsureSuccessStatusCode();
        using var groupedResult = JsonDocument.Parse(await grouped.Content.ReadAsStringAsync());
        Assert.Equal("Completed", groupedResult.RootElement.GetProperty("groups")[0].GetProperty("groupValue").GetString());
        Assert.Equal(1, groupedResult.RootElement.GetProperty("groups")[0].GetProperty("rowCount").GetInt32());

        var csv = await client.PostAsJsonAsync("/api/reports/export", definition);
        csv.EnsureSuccessStatusCode();
        var csvText = await csv.Content.ReadAsStringAsync();
        Assert.Contains("MO-A", csvText);
        Assert.DoesNotContain("MO-B", csvText);

        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantB.ToString());
        var tenantBDefinition = new
        {
            source = "manufacturingOrders", columns = new[] { "code" }, filters = Array.Empty<object>(), sortBy = "code",
            descending = false, page = 1, pageSize = 50
        };
        var tenantBResponse = await client.PostAsJsonAsync("/api/reports/run", tenantBDefinition);
        tenantBResponse.EnsureSuccessStatusCode();
        using var tenantBResult = JsonDocument.Parse(await tenantBResponse.Content.ReadAsStringAsync());
        Assert.Equal("MO-B", tenantBResult.RootElement.GetProperty("rows")[0].GetProperty("code").GetString());
    }

    [Fact]
    public async Task Manufacturing_work_center_reports_filter_capacity_export_csv_and_isolate_tenants()
    {
        await using var app = await StartApplicationAsync();
        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            db.ManufacturingWorkCenters.AddRange(
                new ManufacturingWorkCenter { TenantId = TenantA, Code = "WC-A", Name = "Assembly", CapacityMinutesPerDay = 480, LaborCostPerHourBase = 60.5m, OverheadCostPerHourBase = 20.25m, IsActive = true },
                new ManufacturingWorkCenter { TenantId = TenantA, Code = "WC-A2", Name = "Inactive cell", CapacityMinutesPerDay = 240, LaborCostPerHourBase = 45m, OverheadCostPerHourBase = 10m, IsActive = false },
                new ManufacturingWorkCenter { TenantId = TenantB, Code = "WC-B", Name = "Other tenant cell", CapacityMinutesPerDay = 1440, LaborCostPerHourBase = 9000m, OverheadCostPerHourBase = 9000m, IsActive = true });
            await db.SaveChangesAsync();
        }

        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        var catalog = await client.GetFromJsonAsync<JsonElement[]>("/api/reports/catalog");
        Assert.Contains(catalog!, source => source.GetProperty("code").GetString() == "manufacturingWorkCenters");
        var definition = new
        {
            source = "manufacturingWorkCenters",
            columns = new[] { "code", "name", "capacityMinutesPerDay", "laborCostPerHourBase", "overheadCostPerHourBase", "isActive" },
            filters = new[] { new { field = "capacityMinutesPerDay", @operator = "gte", value = "300" }, new { field = "isActive", @operator = "equals", value = "true" } },
            sortBy = "laborCostPerHourBase", descending = true, page = 1, pageSize = 50
        };

        var response = await client.PostAsJsonAsync("/api/reports/run", definition);
        response.EnsureSuccessStatusCode();
        using var result = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, result.RootElement.GetProperty("totalCount").GetInt32());
        var row = result.RootElement.GetProperty("rows")[0];
        Assert.Equal("WC-A", row.GetProperty("code").GetString());
        Assert.Equal(480, row.GetProperty("capacityMinutesPerDay").GetInt32());
        Assert.Equal(60.5m, row.GetProperty("laborCostPerHourBase").GetDecimal());
        Assert.Equal(20.25m, row.GetProperty("overheadCostPerHourBase").GetDecimal());

        var csvResponse = await client.PostAsJsonAsync("/api/reports/export", definition);
        csvResponse.EnsureSuccessStatusCode();
        var csv = await csvResponse.Content.ReadAsStringAsync();
        Assert.Contains("WC-A", csv);
        Assert.DoesNotContain("WC-B", csv);

        var grouping = await client.PostAsJsonAsync("/api/reports/run", new
        {
            source = "manufacturingWorkCenters", columns = new[] { "isActive" }, filters = Array.Empty<object>(), sortBy = "code",
            descending = false, page = 1, pageSize = 50, groupByFields = new[] { "isActive" }, aggregate = "count"
        });
        Assert.Equal(HttpStatusCode.BadRequest, grouping.StatusCode);
    }

    [Fact]
    public async Task Inventory_transaction_reports_expose_traceable_costed_movements_and_isolate_tenants()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        var catalog = await client.GetFromJsonAsync<JsonElement[]>("/api/reports/catalog");
        Assert.Contains(catalog!, source => source.GetProperty("code").GetString() == "inventoryTransactions");

        var definition = new
        {
            source = "inventoryTransactions", columns = new[] { "transactionId", "entryDate", "direction", "stockCode", "warehouseCode", "quantity", "unitCostBase", "totalCostBase", "description" },
            filters = new[] { new { field = "direction", @operator = "equals", value = "Receipt" }, new { field = "entryDate", @operator = "gte", value = "2026-10-01" } },
            sortBy = "entryDate", descending = false, page = 1, pageSize = 50
        };
        var response = await client.PostAsJsonAsync("/api/reports/run", definition);
        response.EnsureSuccessStatusCode();
        using var result = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, result.RootElement.GetProperty("totalCount").GetInt32());
        var row = result.RootElement.GetProperty("rows")[0];
        Assert.Equal("Receipt", row.GetProperty("direction").GetString());
        Assert.Equal("STOCK-A", row.GetProperty("stockCode").GetString());
        Assert.Equal("WH-A", row.GetProperty("warehouseCode").GetString());
        Assert.Equal(20m, row.GetProperty("quantity").GetDecimal());
        Assert.Equal(2.5m, row.GetProperty("unitCostBase").GetDecimal());
        Assert.Equal(50m, row.GetProperty("totalCostBase").GetDecimal());

        var csv = await client.PostAsJsonAsync("/api/reports/export", definition);
        csv.EnsureSuccessStatusCode();
        var csvText = await csv.Content.ReadAsStringAsync();
        Assert.Contains("STOCK-A", csvText);
        Assert.DoesNotContain("STOCK-B", csvText);

        var unsafeGrouping = await client.PostAsJsonAsync("/api/reports/run", new
        {
            source = "inventoryTransactions", columns = new[] { "direction" }, filters = Array.Empty<object>(), sortBy = "direction",
            descending = false, page = 1, pageSize = 50, groupByFields = new[] { "direction" }, aggregate = "count"
        });
        Assert.Equal(HttpStatusCode.BadRequest, unsafeGrouping.StatusCode);
    }

    [Fact]
    public async Task Inventory_transfer_report_is_tenant_scoped_filterable_and_exportable()
    {
        await using var app = await StartApplicationAsync();
        var transferId = Guid.NewGuid();
        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            var source = await db.Warehouses.SingleAsync(x => x.TenantId == TenantA && x.Code == "WH-A");
            var stock = await db.StockItems.SingleAsync(x => x.TenantId == TenantA && x.Code == "STOCK-A");
            var destination = new Warehouse { TenantId = TenantA, Code = "WH-A2", Name = "A destination" };
            var transfer = new InventoryTransfer { Id = transferId, TenantId = TenantA, RequestId = Guid.NewGuid(), Code = "TR-A", TransferDate = new DateOnly(2026, 10, 19), FromWarehouseId = source.Id, ToWarehouseId = destination.Id };
            db.AddRange(destination, transfer,
                new InventoryTransaction { TenantId = TenantA, WarehouseId = source.Id, StockItemId = stock.Id, EntryDate = transfer.TransferDate, Direction = InventoryDirection.Issue, Quantity = 7m, InventoryTransferId = transfer.Id, Description = "Transfer out" },
                new InventoryTransaction { TenantId = TenantA, WarehouseId = destination.Id, StockItemId = stock.Id, EntryDate = transfer.TransferDate, Direction = InventoryDirection.Receipt, Quantity = 7m, InventoryTransferId = transfer.Id, Description = "Transfer in" });
            await db.SaveChangesAsync();
        }

        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        var catalog = await client.GetFromJsonAsync<JsonElement[]>("/api/reports/catalog");
        var sourceDefinition = Assert.Single(catalog!, x => x.GetProperty("code").GetString() == "inventoryTransfers");
        Assert.Contains(sourceDefinition.GetProperty("columns").EnumerateArray(), x => x.GetProperty("code").GetString() == "totalQuantity");
        var definition = new
        {
            source = "inventoryTransfers", columns = new[] { "code", "transferDate", "status", "fromWarehouseCode", "toWarehouseName", "lineCount", "totalQuantity" },
            filters = new[] { new { field = "fromWarehouseCode", @operator = "equals", value = "WH-A" }, new { field = "transferDate", @operator = "gte", value = "2026-10-01" } },
            sortBy = "transferDate", descending = false, page = 1, pageSize = 25
        };
        var response = await client.PostAsJsonAsync("/api/reports/run", definition);
        response.EnsureSuccessStatusCode();
        using var result = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, result.RootElement.GetProperty("totalCount").GetInt32());
        var row = result.RootElement.GetProperty("rows")[0];
        Assert.Equal("TR-A", row.GetProperty("code").GetString());
        Assert.Equal("A destination", row.GetProperty("toWarehouseName").GetString());
        Assert.Equal(1, row.GetProperty("lineCount").GetInt32());
        Assert.Equal(7m, row.GetProperty("totalQuantity").GetDecimal());

        var export = await client.PostAsJsonAsync("/api/reports/export", definition);
        export.EnsureSuccessStatusCode();
        var csv = await export.Content.ReadAsStringAsync();
        Assert.Contains("TR-A", csv);
        Assert.DoesNotContain("TR-B", csv);

        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantB.ToString());
        using var tenantB = JsonDocument.Parse(await (await client.PostAsJsonAsync("/api/reports/run", definition)).Content.ReadAsStringAsync());
        Assert.Equal(0, tenantB.RootElement.GetProperty("totalCount").GetInt32());
        var grouped = await client.PostAsJsonAsync("/api/reports/run", new
        {
            source = "inventoryTransfers", columns = new[] { "code" }, filters = Array.Empty<object>(), sortBy = "code",
            descending = false, page = 1, pageSize = 25, groupByFields = new[] { "code" }, aggregate = "count"
        });
        Assert.Equal(HttpStatusCode.BadRequest, grouped.StatusCode);
    }

    [Fact]
    public async Task Dynamic_list_views_are_tenant_scoped_separate_from_reports_and_cannot_group()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        var definition = new
        {
            source = "customers", columns = new[] { "code", "name", "currencyCode" }, filters = Array.Empty<object>(),
            sortBy = "name", descending = false, page = 1, pageSize = 50
        };
        var create = await client.PostAsJsonAsync("/api/reports/", new { name = "Active customer list", kind = "List", definition });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        using var created = JsonDocument.Parse(await create.Content.ReadAsStringAsync());
        Assert.Equal("List", created.RootElement.GetProperty("kind").GetString());

        var lists = await client.GetFromJsonAsync<JsonElement[]>("/api/reports/?kind=List");
        Assert.Single(lists!);
        Assert.Empty((await client.GetFromJsonAsync<JsonElement[]>("/api/reports/?kind=Report"))!);
        var rendered = await client.PostAsJsonAsync($"/api/reports/{created.RootElement.GetProperty("id").GetGuid()}/run", new { page = 1, pageSize = 50 });
        rendered.EnsureSuccessStatusCode();
        using var result = JsonDocument.Parse(await rendered.Content.ReadAsStringAsync());
        Assert.Equal(2, result.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(3, result.RootElement.GetProperty("columns").GetArrayLength());

        var grouped = await client.PostAsJsonAsync("/api/reports/", new
        {
            name = "Grouped list must fail", kind = "List",
            definition = new
            {
                source = "customers", columns = new[] { "code" }, filters = Array.Empty<object>(), sortBy = "code",
                descending = false, page = 1, pageSize = 50, groupByFields = new[] { "currencyCode" }, aggregate = "count"
            }
        });
        Assert.Equal(HttpStatusCode.BadRequest, grouped.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/reports/?kind=Custom")).StatusCode);
    }

    [Fact]
    public async Task Saved_report_reads_updates_and_runs_are_isolated_between_tenants()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        var definition = new
        {
            source = "customers",
            columns = new[] { "code", "name" },
            filters = new[] { new { field = "code", @operator = "equals", value = "CUST-A" } },
            sortBy = "code",
            descending = false,
            page = 1,
            pageSize = 50
        };

        var createResponse = await client.PostAsJsonAsync("/api/reports/", new { name = "Tenant A report", definition });
        Assert.Equal(HttpStatusCode.Created, createResponse.StatusCode);
        using var created = JsonDocument.Parse(await createResponse.Content.ReadAsStringAsync());
        var reportId = created.RootElement.GetProperty("id").GetGuid();
        var ownList = await client.GetFromJsonAsync<JsonElement[]>("/api/reports/");
        Assert.Single(ownList!);

        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantB.ToString());
        var otherTenantList = await client.GetFromJsonAsync<JsonElement[]>("/api/reports/");
        Assert.Empty(otherTenantList!);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsJsonAsync($"/api/reports/{reportId}/run", new { page = 1, pageSize = 50 })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PutAsJsonAsync($"/api/reports/{reportId}", new { name = "Overwritten", definition })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.DeleteAsync($"/api/reports/{reportId}")).StatusCode);

        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        var ownerRun = await client.PostAsJsonAsync($"/api/reports/{reportId}/run", new { page = 1, pageSize = 50 });
        ownerRun.EnsureSuccessStatusCode();
        using var result = JsonDocument.Parse(await ownerRun.Content.ReadAsStringAsync());
        Assert.Equal(1, result.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal("CUST-A", result.RootElement.GetProperty("rows")[0].GetProperty("code").GetString());

        await using var auditScope = app.Services.CreateAsyncScope();
        var auditDb = auditScope.ServiceProvider.GetRequiredService<TenantDbContext>();
        Assert.True(await auditDb.AuditEvents.AnyAsync(x => x.TenantId == TenantA && x.Action == "erp.report.executed" && x.Resource == "customers"));
    }

    [Fact]
    public async Task Dashboard_widgets_are_persisted_tenant_scoped_and_admin_managed()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/dashboard/widgets/")).StatusCode);

        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        var definition = new
        {
            source = "customers", columns = new[] { "code" }, filters = Array.Empty<object>(),
            sortBy = "code", descending = false, page = 1, pageSize = 50
        };
        var reportResponse = await client.PostAsJsonAsync("/api/reports/", new { name = "Dashboard source", definition });
        Assert.Equal(HttpStatusCode.Created, reportResponse.StatusCode);
        using var report = JsonDocument.Parse(await reportResponse.Content.ReadAsStringAsync());
        var reportId = report.RootElement.GetProperty("id").GetGuid();

        var createWidget = await client.PostAsJsonAsync("/api/dashboard/widgets/", new { savedReportId = reportId });
        Assert.Equal(HttpStatusCode.Created, createWidget.StatusCode);
        using var created = JsonDocument.Parse(await createWidget.Content.ReadAsStringAsync());
        var widgetId = created.RootElement.GetProperty("id").GetGuid();
        Assert.Equal("Dashboard source", created.RootElement.GetProperty("name").GetString());
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync("/api/dashboard/widgets/", new { savedReportId = reportId })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync("/api/dashboard/widgets/order", new { widgetIds = new[] { widgetId } })).StatusCode);

        client.DefaultRequestHeaders.Add("X-Test-Role", "TenantUser");
        Assert.Equal(HttpStatusCode.Forbidden, (await client.DeleteAsync($"/api/dashboard/widgets/{widgetId}")).StatusCode);
        var visibleToUser = await client.GetFromJsonAsync<JsonElement[]>("/api/dashboard/widgets/");
        Assert.Single(visibleToUser!);

        client.DefaultRequestHeaders.Remove("X-Test-Role");
        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantB.ToString());
        var otherTenantWidgets = await client.GetFromJsonAsync<JsonElement[]>("/api/dashboard/widgets/");
        Assert.Empty(otherTenantWidgets!);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync("/api/dashboard/widgets/order", new { widgetIds = new[] { widgetId } })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.DeleteAsync($"/api/dashboard/widgets/{widgetId}")).StatusCode);

        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/dashboard/widgets/{widgetId}")).StatusCode);
        var emptyAfterDelete = await client.GetFromJsonAsync<JsonElement[]>("/api/dashboard/widgets/");
        Assert.Empty(emptyAfterDelete!);
    }

    [Fact]
    public async Task Stock_report_is_tenant_scoped_supports_null_drilldown_and_grouped_csv()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());

        var catalogResponse = await client.GetAsync("/api/reports/catalog");
        catalogResponse.EnsureSuccessStatusCode();
        using var catalog = JsonDocument.Parse(await catalogResponse.Content.ReadAsStringAsync());
        Assert.Contains(catalog.RootElement.EnumerateArray(), source => source.GetProperty("code").GetString() == "stockItems");

        var definition = new
        {
            source = "stockItems",
            columns = new[] { "code", "minimumStock" },
            filters = Array.Empty<object>(),
            sortBy = "code",
            descending = false,
            page = 1,
            pageSize = 50,
            groupByFields = new[] { "category", "trackingMode" },
            aggregate = "sumMinimumStock"
        };
        var groupedResponse = await client.PostAsJsonAsync("/api/reports/run", definition);
        groupedResponse.EnsureSuccessStatusCode();
        using var grouped = JsonDocument.Parse(await groupedResponse.Content.ReadAsStringAsync());
        Assert.Equal(1, grouped.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(1, grouped.RootElement.GetProperty("totalGroups").GetInt32());
        Assert.Equal(2, grouped.RootElement.GetProperty("groupByFields").GetArrayLength());
        var row = grouped.RootElement.GetProperty("groups")[0];
        Assert.Equal(1, row.GetProperty("rowCount").GetInt32());
        Assert.Equal(5.5m, row.GetProperty("value").GetDecimal());
        Assert.Equal(JsonValueKind.Null, row.GetProperty("groupValues")[0].ValueKind);

        var availabilityDefinition = new
        {
            source = "stockItems",
            columns = new[] { "code", "onHand", "reserved", "available" },
            filters = Array.Empty<object>(),
            sortBy = "available",
            descending = false,
            page = 1,
            pageSize = 50,
            groupByFields = new[] { "category", "trackingMode" },
            aggregate = "sumAvailable"
        };
        var availabilityResponse = await client.PostAsJsonAsync("/api/reports/run", availabilityDefinition);
        availabilityResponse.EnsureSuccessStatusCode();
        using var availability = JsonDocument.Parse(await availabilityResponse.Content.ReadAsStringAsync());
        Assert.Equal(12m, availability.RootElement.GetProperty("groups")[0].GetProperty("value").GetDecimal());

        var drilldown = await client.PostAsJsonAsync("/api/reports/run", new
        {
            source = "stockItems",
            columns = new[] { "code", "onHand", "reserved", "available" },
            filters = new object[]
            {
                new { field = "category", @operator = "isNull", value = "" },
                new { field = "trackingMode", @operator = "equals", value = "None" },
                new { field = "available", @operator = "gte", value = "12" }
            },
            sortBy = "code",
            descending = false,
            page = 1,
            pageSize = 50
        });
        drilldown.EnsureSuccessStatusCode();
        using var details = JsonDocument.Parse(await drilldown.Content.ReadAsStringAsync());
        Assert.Equal(row.GetProperty("rowCount").GetInt32(), details.RootElement.GetProperty("totalCount").GetInt32());
        var detailRow = details.RootElement.GetProperty("rows")[0];
        Assert.Equal(15m, detailRow.GetProperty("onHand").GetDecimal());
        Assert.Equal(3m, detailRow.GetProperty("reserved").GetDecimal());
        Assert.Equal(12m, detailRow.GetProperty("available").GetDecimal());

        var csvResponse = await client.PostAsJsonAsync("/api/reports/export", availabilityDefinition);
        Assert.Equal(HttpStatusCode.OK, csvResponse.StatusCode);
        var csv = await csvResponse.Content.ReadAsStringAsync();
        Assert.Contains("Kategori", csv);
        Assert.Contains("12", csv);

        var invalidNullFilter = await client.PostAsJsonAsync("/api/reports/run", new
        {
            source = "stockItems",
            columns = new[] { "code" },
            filters = new[] { new { field = "code", @operator = "isNull", value = "" } },
            sortBy = "code",
            descending = false,
            page = 1,
            pageSize = 50
        });
        Assert.Equal(HttpStatusCode.BadRequest, invalidNullFilter.StatusCode);
    }

    [Fact]
    public async Task Customer_report_groups_nullable_risk_limit_and_keeps_tenant_boundary()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());

        var groupedResponse = await client.PostAsJsonAsync("/api/reports/run", new
        {
            source = "customers",
            columns = new[] { "code" },
            filters = Array.Empty<object>(),
            sortBy = "code",
            descending = false,
            page = 1,
            pageSize = 50,
            groupByFields = new[] { "isActive", "currencyCode" },
            aggregate = "sumRiskLimit"
        });
        groupedResponse.EnsureSuccessStatusCode();
        using var grouped = JsonDocument.Parse(await groupedResponse.Content.ReadAsStringAsync());
        Assert.Equal(2, grouped.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(1, grouped.RootElement.GetProperty("totalGroups").GetInt32());
        Assert.Equal(12000m, grouped.RootElement.GetProperty("groups")[0].GetProperty("value").GetDecimal());

        var nullableGroupsResponse = await client.PostAsJsonAsync("/api/reports/run", new
        {
            source = "customers",
            columns = new[] { "code" },
            filters = Array.Empty<object>(),
            sortBy = "code",
            descending = false,
            page = 1,
            pageSize = 50,
            groupByFields = new[] { "riskLimit" },
            aggregate = "count"
        });
        nullableGroupsResponse.EnsureSuccessStatusCode();
        using var nullableGroups = JsonDocument.Parse(await nullableGroupsResponse.Content.ReadAsStringAsync());
        Assert.Equal(2, nullableGroups.RootElement.GetProperty("totalGroups").GetInt32());
        var nullGroup = nullableGroups.RootElement.GetProperty("groups").EnumerateArray()
            .Single(row => row.GetProperty("groupValue").ValueKind == JsonValueKind.Null);
        Assert.Equal(1, nullGroup.GetProperty("rowCount").GetInt32());

        var nullDetail = await client.PostAsJsonAsync("/api/reports/run", new
        {
            source = "customers",
            columns = new[] { "code" },
            filters = new[] { new { field = "riskLimit", @operator = "isNull", value = "" } },
            sortBy = "code",
            descending = false,
            page = 1,
            pageSize = 50
        });
        nullDetail.EnsureSuccessStatusCode();
        using var details = JsonDocument.Parse(await nullDetail.Content.ReadAsStringAsync());
        Assert.Equal(nullGroup.GetProperty("rowCount").GetInt32(), details.RootElement.GetProperty("totalCount").GetInt32());
    }

    [Fact]
    public async Task Sales_invoice_report_requires_currency_context_for_money_and_drills_by_date()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());

        var unsafeAggregate = await client.PostAsJsonAsync("/api/reports/run", new
        {
            source = "salesInvoices",
            columns = new[] { "code" },
            filters = Array.Empty<object>(),
            sortBy = "code",
            descending = false,
            page = 1,
            pageSize = 50,
            groupByFields = new[] { "invoiceDate" },
            aggregate = "sumGrandTotal"
        });
        Assert.Equal(HttpStatusCode.BadRequest, unsafeAggregate.StatusCode);

        var groupedResponse = await client.PostAsJsonAsync("/api/reports/run", new
        {
            source = "salesInvoices",
            columns = new[] { "code" },
            filters = new[] { new { field = "currencyCode", @operator = "equals", value = "USD" } },
            sortBy = "code",
            descending = false,
            page = 1,
            pageSize = 50,
            groupByFields = new[] { "invoiceDate" },
            aggregate = "sumGrandTotal"
        });
        groupedResponse.EnsureSuccessStatusCode();
        using var grouped = JsonDocument.Parse(await groupedResponse.Content.ReadAsStringAsync());
        Assert.Equal(1, grouped.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(250m, grouped.RootElement.GetProperty("groups")[0].GetProperty("value").GetDecimal());
        var groupValue = grouped.RootElement.GetProperty("groups")[0].GetProperty("groupValue").GetString()!;

        var detailsResponse = await client.PostAsJsonAsync("/api/reports/run", new
        {
            source = "salesInvoices",
            columns = new[] { "code" },
            filters = new object[]
            {
                new { field = "currencyCode", @operator = "equals", value = "USD" },
                new { field = "invoiceDate", @operator = "gte", value = groupValue },
                new { field = "invoiceDate", @operator = "lte", value = groupValue }
            },
            sortBy = "code",
            descending = false,
            page = 1,
            pageSize = 50
        });
        detailsResponse.EnsureSuccessStatusCode();
        using var details = JsonDocument.Parse(await detailsResponse.Content.ReadAsStringAsync());
        Assert.Equal(1, details.RootElement.GetProperty("totalCount").GetInt32());
    }

    [Fact]
    public async Task Purchase_order_report_is_tenant_scoped_and_currency_safe()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());

        var catalogResponse = await client.GetAsync("/api/reports/catalog");
        catalogResponse.EnsureSuccessStatusCode();
        using var catalog = JsonDocument.Parse(await catalogResponse.Content.ReadAsStringAsync());
        Assert.Contains(catalog.RootElement.EnumerateArray(), source => source.GetProperty("code").GetString() == "purchaseOrders");

        var unsafeAggregate = await client.PostAsJsonAsync("/api/reports/run", new
        {
            source = "purchaseOrders", columns = new[] { "code" }, filters = Array.Empty<object>(), sortBy = "code",
            descending = false, page = 1, pageSize = 50, groupByFields = new[] { "orderDate" }, aggregate = "sumGrandTotal"
        });
        Assert.Equal(HttpStatusCode.BadRequest, unsafeAggregate.StatusCode);

        var groupedResponse = await client.PostAsJsonAsync("/api/reports/run", new
        {
            source = "purchaseOrders", columns = new[] { "code" },
            filters = new[] { new { field = "currencyCode", @operator = "equals", value = "USD" } }, sortBy = "code",
            descending = false, page = 1, pageSize = 50, groupByFields = new[] { "orderDate" }, aggregate = "sumGrandTotal"
        });
        groupedResponse.EnsureSuccessStatusCode();
        using var grouped = JsonDocument.Parse(await groupedResponse.Content.ReadAsStringAsync());
        Assert.Equal(1, grouped.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(1, grouped.RootElement.GetProperty("totalGroups").GetInt32());
        Assert.Equal(350m, grouped.RootElement.GetProperty("groups")[0].GetProperty("value").GetDecimal());

        var detailResponse = await client.PostAsJsonAsync("/api/reports/run", new
        {
            source = "purchaseOrders", columns = new[] { "code", "supplierCode", "supplierName", "orderDate", "currencyCode", "status", "grandTotal" },
            filters = new object[]
            {
                new { field = "currencyCode", @operator = "equals", value = "USD" },
                new { field = "status", @operator = "equals", value = "Open" }
            }, sortBy = "code", descending = false, page = 1, pageSize = 50
        });
        detailResponse.EnsureSuccessStatusCode();
        using var details = JsonDocument.Parse(await detailResponse.Content.ReadAsStringAsync());
        Assert.Equal(1, details.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal("PO-A", details.RootElement.GetProperty("rows")[0].GetProperty("code").GetString());

        var csvResponse = await client.PostAsJsonAsync("/api/reports/export", new
        {
            source = "purchaseOrders", columns = new[] { "code" },
            filters = new[] { new { field = "currencyCode", @operator = "equals", value = "USD" } }, sortBy = "code",
            descending = false, page = 1, pageSize = 50, groupByFields = new[] { "orderDate" }, aggregate = "sumGrandTotal"
        });
        Assert.Equal(HttpStatusCode.OK, csvResponse.StatusCode);
        var csv = await csvResponse.Content.ReadAsStringAsync();
        Assert.Contains("Sipariş genel toplamları", csv);
        Assert.Contains("350", csv);
    }

    [Fact]
    public async Task Purchase_invoice_report_is_tenant_scoped_traceable_and_exportable()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());

        var catalog = await client.GetFromJsonAsync<JsonElement[]>("/api/reports/catalog");
        Assert.Contains(catalog!, source => source.GetProperty("code").GetString() == "purchaseInvoices");
        var definition = new
        {
            source = "purchaseInvoices",
            columns = new[] { "code", "orderCode", "receiptCode", "supplierCode", "invoiceDate", "dueDate", "currencyCode", "grandTotal", "paidAmount", "returnedAmount", "outstandingAmount", "lineCount" },
            filters = new[] { new { field = "invoiceDate", @operator = "gte", value = "2026-10-01" } },
            sortBy = "invoiceDate", descending = false, page = 1, pageSize = 50
        };
        var response = await client.PostAsJsonAsync("/api/reports/run", definition);
        response.EnsureSuccessStatusCode();
        using var result = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, result.RootElement.GetProperty("totalCount").GetInt32());
        var row = result.RootElement.GetProperty("rows")[0];
        Assert.Equal("PINV-A", row.GetProperty("code").GetString());
        Assert.Equal("PO-A", row.GetProperty("orderCode").GetString());
        Assert.Equal("GR-A", row.GetProperty("receiptCode").GetString());
        Assert.Equal("CUST-A", row.GetProperty("supplierCode").GetString());
        Assert.Equal("USD", row.GetProperty("currencyCode").GetString());
        Assert.Equal(350m, row.GetProperty("grandTotal").GetDecimal());
        Assert.Equal(125m, row.GetProperty("paidAmount").GetDecimal());
        Assert.Equal(35m, row.GetProperty("returnedAmount").GetDecimal());
        Assert.Equal(190m, row.GetProperty("outstandingAmount").GetDecimal());
        Assert.Equal(1, row.GetProperty("lineCount").GetInt32());

        var openBalanceFilter = await client.PostAsJsonAsync("/api/reports/run", new
        {
            source = "purchaseInvoices", columns = new[] { "code", "outstandingAmount" },
            filters = new[] { new { field = "outstandingAmount", @operator = "gt", value = "190" } },
            sortBy = "outstandingAmount", descending = true, page = 1, pageSize = 50
        });
        openBalanceFilter.EnsureSuccessStatusCode();
        using var filteredResult = JsonDocument.Parse(await openBalanceFilter.Content.ReadAsStringAsync());
        Assert.Equal(0, filteredResult.RootElement.GetProperty("totalCount").GetInt32());

        var csv = await client.PostAsJsonAsync("/api/reports/export", definition);
        csv.EnsureSuccessStatusCode();
        var csvText = await csv.Content.ReadAsStringAsync();
        Assert.Contains("PINV-A", csvText);
        Assert.DoesNotContain("PINV-B", csvText);
        Assert.Contains("Açık bakiye", csvText);
        Assert.Contains("190", csvText);

        var grouped = await client.PostAsJsonAsync("/api/reports/run", new
        {
            source = "purchaseInvoices", columns = new[] { "status" }, filters = Array.Empty<object>(), sortBy = "status",
            descending = false, page = 1, pageSize = 50, groupByFields = new[] { "currencyCode" }, aggregate = "count"
        });
        Assert.Equal(HttpStatusCode.BadRequest, grouped.StatusCode);

        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantB.ToString());
        var tenantB = await client.PostAsJsonAsync("/api/reports/run", new
        {
            source = "purchaseInvoices", columns = new[] { "code" }, filters = Array.Empty<object>(), sortBy = "code",
            descending = false, page = 1, pageSize = 50
        });
        tenantB.EnsureSuccessStatusCode();
        using var tenantBResult = JsonDocument.Parse(await tenantB.Content.ReadAsStringAsync());
        Assert.Equal("PINV-B", tenantBResult.RootElement.GetProperty("rows")[0].GetProperty("code").GetString());
    }

    [Fact]
    public async Task Purchase_receipt_report_filters_rows_and_exports_only_the_selected_tenant()
    {
        await using var app = await StartApplicationAsync(); using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        var catalog = await client.GetFromJsonAsync<JsonElement[]>("/api/reports/catalog");
        Assert.Contains(catalog!, source => source.GetProperty("code").GetString() == "purchaseReceipts");
        var definition = new
        {
            source = "purchaseReceipts",
            columns = new[] { "code", "orderCode", "supplierName", "warehouseCode", "receiptDate", "status", "lineCount", "totalQuantity" },
            filters = new[] { new { field = "status", @operator = "equals", value = "Posted" }, new { field = "totalQuantity", @operator = "gte", value = "7" } },
            sortBy = "receiptDate", descending = false, page = 1, pageSize = 50
        };
        var response = await client.PostAsJsonAsync("/api/reports/run", definition);
        response.EnsureSuccessStatusCode();
        using var result = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, result.RootElement.GetProperty("totalCount").GetInt32());
        var row = result.RootElement.GetProperty("rows")[0];
        Assert.Equal("GR-A", row.GetProperty("code").GetString());
        Assert.Equal("PO-A", row.GetProperty("orderCode").GetString());
        Assert.Equal("WH-A", row.GetProperty("warehouseCode").GetString());
        Assert.Equal(1, row.GetProperty("lineCount").GetInt32());
        Assert.Equal(7m, row.GetProperty("totalQuantity").GetDecimal());

        var csvResponse = await client.PostAsJsonAsync("/api/reports/export", definition);
        Assert.Equal(HttpStatusCode.OK, csvResponse.StatusCode);
        var csv = await csvResponse.Content.ReadAsStringAsync();
        Assert.Contains("GR-A", csv);
        Assert.DoesNotContain("GR-B", csv);

        client.DefaultRequestHeaders.Remove("X-Test-Tenant"); client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantB.ToString());
        using var otherTenant = JsonDocument.Parse(await (await client.PostAsJsonAsync("/api/reports/run", definition)).Content.ReadAsStringAsync());
        Assert.Equal(1, otherTenant.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal("GR-B", otherTenant.RootElement.GetProperty("rows")[0].GetProperty("code").GetString());
    }

    [Fact]
    public async Task Financial_account_transactions_report_is_tenant_scoped_currency_safe_and_exportable()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        var catalog = await client.GetFromJsonAsync<JsonElement[]>("/api/reports/catalog");
        var source = Assert.Single(catalog!, item => item.GetProperty("code").GetString() == "financialAccountTransactions");
        Assert.Empty(source.GetProperty("aggregates").EnumerateArray());

        var definition = new
        {
            source = "financialAccountTransactions",
            columns = new[] { "accountCode", "transactionDate", "direction", "currencyCode", "amount", "description", "reference", "sourceType", "sourceCode", "reversalOfId", "createdAt" },
            filters = new[] { new { field = "currencyCode", @operator = "equals", value = "USD" } },
            sortBy = "transactionDate", descending = false, page = 1, pageSize = 1
        };
        var response = await client.PostAsJsonAsync("/api/reports/run", definition);
        response.EnsureSuccessStatusCode();
        using var result = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(2, result.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Single(result.RootElement.GetProperty("rows").EnumerateArray());
        var row = result.RootElement.GetProperty("rows")[0];
        Assert.Equal("BANK-A", row.GetProperty("accountCode").GetString());
        Assert.Equal("Outflow", row.GetProperty("direction").GetString());
        Assert.Equal("USD", row.GetProperty("currencyCode").GetString());
        Assert.Equal("BankStatement", row.GetProperty("sourceType").GetString());
        Assert.Equal("BANK-A", row.GetProperty("sourceCode").GetString());

        var exportDefinition = new
        {
            source = "financialAccountTransactions",
            columns = new[] { "accountCode", "currencyCode", "amount", "sourceType", "sourceCode", "reversalOfId" },
            filters = Array.Empty<object>(), sortBy = "accountCode", descending = false, page = 1, pageSize = 50
        };
        var csvResponse = await client.PostAsJsonAsync("/api/reports/export", exportDefinition);
        Assert.Equal(HttpStatusCode.OK, csvResponse.StatusCode);
        var csv = await csvResponse.Content.ReadAsStringAsync();
        Assert.Contains("BANK-A", csv);
        Assert.Contains("BankStatement", csv);
        Assert.Contains("EUR", csv);
        Assert.Contains("aaaaaaaa-0000-0000-0000-000000000001", csv);
        Assert.DoesNotContain("BANK-B", csv);

        var grouped = await client.PostAsJsonAsync("/api/reports/run", new
        {
            source = "financialAccountTransactions", columns = new[] { "currencyCode", "amount" }, filters = Array.Empty<object>(),
            sortBy = "currencyCode", descending = false, page = 1, pageSize = 50,
            groupByFields = new[] { "currencyCode" }, aggregate = "sumGrandTotal"
        });
        Assert.Equal(HttpStatusCode.BadRequest, grouped.StatusCode);

        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantB.ToString());
        using var otherTenant = JsonDocument.Parse(await (await client.PostAsJsonAsync("/api/reports/run", exportDefinition)).Content.ReadAsStringAsync());
        Assert.Equal(1, otherTenant.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal("BANK-B", otherTenant.RootElement.GetProperty("rows")[0].GetProperty("accountCode").GetString());
    }

    [Fact]
    public async Task Financial_account_transfer_report_exposes_fx_details_filters_tenant_scopes_and_exports()
    {
        await using var app = await StartApplicationAsync();
        using (var scope = app.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            var from = await db.FinancialAccounts.SingleAsync(x => x.TenantId == TenantA && x.Code == "BANK-A");
            var to = await db.FinancialAccounts.SingleAsync(x => x.TenantId == TenantA && x.Code == "CASH-EUR-A");
            db.FinancialAccountTransfers.Add(new FinancialAccountTransfer
            {
                TenantId = TenantA, RequestId = Guid.NewGuid(), Code = "TR-A", FromAccountId = from.Id, ToAccountId = to.Id,
                CurrencyCode = "USD", ToCurrencyCode = "EUR", TransferDate = new DateOnly(2026, 10, 17),
                Amount = 100m, DestinationAmount = 92m, ExchangeRate = 0.92m, Status = FinancialTransferStatus.Posted,
                Reference = "FX-REF", Description = "Month end conversion"
            });
            await db.SaveChangesAsync();
        }

        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        var catalog = await client.GetFromJsonAsync<JsonElement[]>("/api/reports/catalog");
        var source = Assert.Single(catalog!, item => item.GetProperty("code").GetString() == "financialAccountTransfers");
        Assert.Contains(source.GetProperty("columns").EnumerateArray(), column => column.GetProperty("code").GetString() == "exchangeRate");
        var definition = new
        {
            source = "financialAccountTransfers",
            columns = new[] { "code", "fromAccountCode", "toAccountCode", "transferDate", "currencyCode", "amount", "toCurrencyCode", "destinationAmount", "exchangeRate", "status", "reference" },
            filters = new[] { new { field = "currencyCode", @operator = "equals", value = "USD" }, new { field = "amount", @operator = "gte", value = "100" } },
            sortBy = "transferDate", descending = true, page = 1, pageSize = 50
        };
        var response = await client.PostAsJsonAsync("/api/reports/run", definition);
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        using var result = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, result.RootElement.GetProperty("totalCount").GetInt32());
        var row = result.RootElement.GetProperty("rows")[0];
        Assert.Equal("BANK-A", row.GetProperty("fromAccountCode").GetString());
        Assert.Equal("CASH-EUR-A", row.GetProperty("toAccountCode").GetString());
        Assert.Equal(92m, row.GetProperty("destinationAmount").GetDecimal());
        Assert.Equal(0.92m, row.GetProperty("exchangeRate").GetDecimal());

        var csvResponse = await client.PostAsJsonAsync("/api/reports/export", definition);
        Assert.Equal(HttpStatusCode.OK, csvResponse.StatusCode);
        var csv = await csvResponse.Content.ReadAsStringAsync();
        Assert.Contains("TR-A", csv);
        Assert.Contains("FX-REF", csv);

        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantB.ToString());
        var otherTenantResponse = await client.PostAsJsonAsync("/api/reports/run", definition);
        using var otherTenant = JsonDocument.Parse(await otherTenantResponse.Content.ReadAsStringAsync());
        Assert.Equal(0, otherTenant.RootElement.GetProperty("totalCount").GetInt32());
    }

    [Fact]
    public async Task Journal_entry_line_report_joins_tenant_accounts_shows_balanced_totals_and_exports()
    {
        await using var app = await StartApplicationAsync();
        using (var scope = app.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            var debitA = new LedgerAccount { TenantId = TenantA, Code = "1000", Name = "Operating cash" };
            var creditA = new LedgerAccount { TenantId = TenantA, Code = "4000", Name = "Sales revenue" };
            var debitB = new LedgerAccount { TenantId = TenantB, Code = "1000", Name = "Tenant B cash" };
            var creditB = new LedgerAccount { TenantId = TenantB, Code = "4000", Name = "Tenant B revenue" };
            var entryA = new JournalEntry { TenantId = TenantA, Code = "JE-A", EntryDate = new DateOnly(2026, 10, 18), Description = "Daily sales", SourceType = "SalesInvoice" };
            var entryB = new JournalEntry { TenantId = TenantB, Code = "JE-B", EntryDate = new DateOnly(2026, 10, 18), Description = "Other tenant entry", SourceType = "SalesInvoice" };
            db.AddRange(debitA, creditA, debitB, creditB, entryA, entryB,
                new JournalEntryLine { TenantId = TenantA, JournalEntryId = entryA.Id, AccountId = debitA.Id, LineNumber = 1, Description = "Cash received", Debit = 100m },
                new JournalEntryLine { TenantId = TenantA, JournalEntryId = entryA.Id, AccountId = creditA.Id, LineNumber = 2, Description = "Revenue recognized", Credit = 100m },
                new JournalEntryLine { TenantId = TenantB, JournalEntryId = entryB.Id, AccountId = debitB.Id, LineNumber = 1, Description = "Tenant B debit", Debit = 9900m },
                new JournalEntryLine { TenantId = TenantB, JournalEntryId = entryB.Id, AccountId = creditB.Id, LineNumber = 2, Description = "Private tenant line", Credit = 9900m });
            await db.SaveChangesAsync();
        }

        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        var catalog = await client.GetFromJsonAsync<JsonElement[]>("/api/reports/catalog");
        var source = Assert.Single(catalog!, item => item.GetProperty("code").GetString() == "journalEntryLines");
        Assert.Contains(source.GetProperty("columns").EnumerateArray(), column => column.GetProperty("code").GetString() == "entryDebitTotal");
        var definition = new
        {
            source = "journalEntryLines",
            columns = new[] { "entryCode", "entryDate", "entryDescription", "sourceType", "accountCode", "accountName", "lineNumber", "debit", "credit", "entryDebitTotal", "entryCreditTotal", "isBalanced" },
            filters = new[] { new { field = "accountCode", @operator = "equals", value = "4000" }, new { field = "isBalanced", @operator = "equals", value = "true" } },
            sortBy = "entryCode", descending = false, page = 1, pageSize = 50
        };
        var response = await client.PostAsJsonAsync("/api/reports/run", definition);
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        using var result = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, result.RootElement.GetProperty("totalCount").GetInt32());
        var row = result.RootElement.GetProperty("rows")[0];
        Assert.Equal("JE-A", row.GetProperty("entryCode").GetString());
        Assert.Equal("Sales revenue", row.GetProperty("accountName").GetString());
        Assert.Equal(100m, row.GetProperty("entryDebitTotal").GetDecimal());
        Assert.Equal(100m, row.GetProperty("entryCreditTotal").GetDecimal());
        Assert.True(row.GetProperty("isBalanced").GetBoolean());

        var csvResponse = await client.PostAsJsonAsync("/api/reports/export", definition);
        Assert.Equal(HttpStatusCode.OK, csvResponse.StatusCode);
        var csv = await csvResponse.Content.ReadAsStringAsync();
        Assert.Contains("JE-A", csv);
        Assert.DoesNotContain("JE-B", csv);

        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantB.ToString());
        var otherTenantResponse = await client.PostAsJsonAsync("/api/reports/run", definition);
        using var otherTenant = JsonDocument.Parse(await otherTenantResponse.Content.ReadAsStringAsync());
        Assert.Equal(1, otherTenant.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal("JE-B", otherTenant.RootElement.GetProperty("rows")[0].GetProperty("entryCode").GetString());
    }

    [Fact]
    public async Task Fx_revaluation_line_report_is_tenant_scoped_filtered_and_exportable()
    {
        await using var app = await StartApplicationAsync();
        using (var scope = app.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            var tenantA = await db.Tenants.SingleAsync(x => x.Id == TenantA);
            var tenantB = await db.Tenants.SingleAsync(x => x.Id == TenantB);
            var voucherA = new FxRevaluationVoucher { TenantId = TenantA, Tenant = tenantA, Code = "FX-2026-10", AsOfDate = new DateOnly(2026, 10, 18), BaseCurrencyCode = "TRY" };
            var voucherB = new FxRevaluationVoucher { TenantId = TenantB, Tenant = tenantB, Code = "FX-2026-10", AsOfDate = new DateOnly(2026, 10, 18), BaseCurrencyCode = "TRY" };
            voucherA.Lines.Add(new FxRevaluationVoucherLine
            {
                TenantId = TenantA, VoucherId = voucherA.Id, Voucher = voucherA, Direction = FxRevaluationDirection.Receivable,
                InvoiceId = Guid.NewGuid(), InvoiceCode = "INV-FX-A", CounterpartyName = "Tenant A customer", CurrencyCode = "USD",
                OutstandingAmount = 100m, InvoiceDateRate = 30m, ClosingRate = 32m, PreviousAdjustmentBase = 100m,
                TargetAdjustmentBase = 300m, AdjustmentBase = 200m, DebitAccount = "1200", CreditAccount = "6460",
                DebitBaseAmount = 200m, CreditBaseAmount = 200m
            });
            voucherB.Lines.Add(new FxRevaluationVoucherLine
            {
                TenantId = TenantB, VoucherId = voucherB.Id, Voucher = voucherB, Direction = FxRevaluationDirection.Receivable,
                InvoiceId = Guid.NewGuid(), InvoiceCode = "INV-FX-B", CounterpartyName = "Tenant B customer", CurrencyCode = "USD",
                OutstandingAmount = 900m, InvoiceDateRate = 30m, ClosingRate = 32m, PreviousAdjustmentBase = 100m,
                TargetAdjustmentBase = 300m, AdjustmentBase = 1800m, DebitAccount = "1200", CreditAccount = "6460",
                DebitBaseAmount = 1800m, CreditBaseAmount = 1800m
            });
            db.FxRevaluationVouchers.AddRange(voucherA, voucherB);
            await db.SaveChangesAsync();
        }

        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        var catalog = await client.GetFromJsonAsync<JsonElement[]>("/api/reports/catalog");
        var source = Assert.Single(catalog!, item => item.GetProperty("code").GetString() == "fxRevaluationLines");
        Assert.Contains(source.GetProperty("columns").EnumerateArray(), column => column.GetProperty("code").GetString() == "closingRate");
        var definition = new
        {
            source = "fxRevaluationLines",
            columns = new[] { "voucherCode", "asOfDate", "baseCurrencyCode", "direction", "invoiceCode", "counterpartyName", "currencyCode", "outstandingAmount", "invoiceDateRate", "closingRate", "previousAdjustmentBase", "targetAdjustmentBase" },
            filters = new[] { new { field = "invoiceCode", @operator = "contains", value = "INV-FX" }, new { field = "direction", @operator = "equals", value = "Receivable" } },
            sortBy = "invoiceCode", descending = false, page = 1, pageSize = 50
        };
        var response = await client.PostAsJsonAsync("/api/reports/run", definition);
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        using var result = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, result.RootElement.GetProperty("totalCount").GetInt32());
        var row = result.RootElement.GetProperty("rows")[0];
        Assert.Equal("FX-2026-10", row.GetProperty("voucherCode").GetString());
        Assert.Equal("INV-FX-A", row.GetProperty("invoiceCode").GetString());
        Assert.Equal("Tenant A customer", row.GetProperty("counterpartyName").GetString());
        Assert.Equal(200m, row.GetProperty("targetAdjustmentBase").GetDecimal() - row.GetProperty("previousAdjustmentBase").GetDecimal());

        var accountDefinition = new
        {
            source = "fxRevaluationLines", columns = new[] { "invoiceCode", "adjustmentBase", "debitAccount", "creditAccount", "debitBaseAmount", "creditBaseAmount" },
            filters = new[] { new { field = "invoiceCode", @operator = "equals", value = "INV-FX-A" } }, sortBy = "invoiceCode", descending = false, page = 1, pageSize = 50
        };
        var csvResponse = await client.PostAsJsonAsync("/api/reports/export", accountDefinition);
        Assert.Equal(HttpStatusCode.OK, csvResponse.StatusCode);
        var csv = await csvResponse.Content.ReadAsStringAsync();
        Assert.Contains("1200", csv);
        Assert.Contains("6460", csv);
        Assert.Contains("200", csv);
        Assert.DoesNotContain("INV-FX-B", csv);

        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantB.ToString());
        var otherTenantResponse = await client.PostAsJsonAsync("/api/reports/run", definition);
        using var otherTenant = JsonDocument.Parse(await otherTenantResponse.Content.ReadAsStringAsync());
        Assert.Equal(1, otherTenant.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal("INV-FX-B", otherTenant.RootElement.GetProperty("rows")[0].GetProperty("invoiceCode").GetString());
    }

    [Fact]
    public async Task Financial_account_transaction_csv_rejects_more_than_ten_thousand_rows()
    {
        await using var app = await StartApplicationAsync();
        using (var scope = app.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            var account = await db.FinancialAccounts.SingleAsync(x => x.TenantId == TenantA && x.Code == "BANK-A");
            db.FinancialAccountTransactions.AddRange(Enumerable.Range(0, 10_001).Select(index => new FinancialAccountTransaction
            {
                TenantId = TenantA, FinancialAccountId = account.Id, FinancialAccount = account, CurrencyCode = account.CurrencyCode,
                TransactionDate = new DateOnly(2026, 10, 1), Direction = FinancialDirection.Inflow, Amount = index + 1,
                Description = "CSV row limit"
            }));
            await db.SaveChangesAsync();
        }

        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        var response = await client.PostAsJsonAsync("/api/reports/export", new
        {
            source = "financialAccountTransactions", columns = new[] { "amount" }, filters = Array.Empty<object>(),
            sortBy = "amount", descending = false, page = 1, pageSize = 50
        });
        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, response.StatusCode);
    }

    [Fact]
    public async Task Accepted_sales_quotes_route_through_rules_and_block_order_conversion_until_decided()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        var catalog = await client.GetFromJsonAsync<JsonElement[]>("/api/business-rules/catalog");
        Assert.Contains(catalog!, trigger => trigger.GetProperty("code").GetString() == "sales-quote.accepted");

        var workflowCreate = await client.PostAsJsonAsync("/api/workflows/definitions", new
        {
            code = "finance-review", name = "Finance review", description = "Review accepted sales quotes",
            steps = new[] { new { name = "Finance", approverRole = "TenantAdmin" } }
        });
        Assert.Equal(HttpStatusCode.Created, workflowCreate.StatusCode);
        using var workflowCreated = JsonDocument.Parse(await workflowCreate.Content.ReadAsStringAsync());
        var workflowId = workflowCreated.RootElement.GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/workflows/definitions/{workflowId}/publish", new { })).StatusCode);

        var ruleCreate = await client.PostAsJsonAsync("/api/business-rules/", new
        {
            code = "large-quote-review", name = "Large quote review", trigger = "sales-quote.accepted", workflowCode = "finance-review",
            conditions = new[] { new { field = "grandTotal", @operator = "GreaterThanOrEqual", value = "100000" } }
        });
        Assert.Equal(HttpStatusCode.Created, ruleCreate.StatusCode);
        using var ruleCreated = JsonDocument.Parse(await ruleCreate.Content.ReadAsStringAsync());
        var ruleId = ruleCreated.RootElement.GetProperty("id").GetGuid();
        Assert.Equal("sales-quote.accepted", ruleCreated.RootElement.GetProperty("trigger").GetString());
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/business-rules/{ruleId}/publish", new { })).StatusCode);
        var badRule = await client.PostAsJsonAsync("/api/business-rules/", new
        {
            code = "invalid-quote-rule", name = "Invalid quote rule", trigger = "sales-quote.accepted", workflowCode = "finance-review",
            conditions = new[] { new { field = "neededByDate", @operator = "IsEmpty", value = "" } }
        });
        Assert.Equal(HttpStatusCode.BadRequest, badRule.StatusCode);

        SalesQuote matchingQuote;
        SalesQuote rejectedQuote;
        SalesQuote nonMatchingQuote;
        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            var tenant = await db.Tenants.SingleAsync(x => x.Id == TenantA);
            var customer = await db.CustomerAccounts.OrderBy(x => x.Code).FirstAsync(x => x.TenantId == TenantA);
            matchingQuote = new SalesQuote { TenantId = TenantA, Tenant = tenant, CustomerId = customer.Id, Customer = customer, Code = "SQ-MATCH", QuoteDate = new DateOnly(2026, 10, 17), ValidUntil = new DateOnly(2026, 12, 31), CurrencyCode = customer.CurrencyCode, Status = SalesQuoteStatus.Accepted, GrandTotal = 150_000m };
            rejectedQuote = new SalesQuote { TenantId = TenantA, Tenant = tenant, CustomerId = customer.Id, Customer = customer, Code = "SQ-REJECT", QuoteDate = new DateOnly(2026, 10, 17), ValidUntil = new DateOnly(2026, 12, 31), CurrencyCode = customer.CurrencyCode, Status = SalesQuoteStatus.Accepted, GrandTotal = 250_000m };
            nonMatchingQuote = new SalesQuote { TenantId = TenantA, Tenant = tenant, CustomerId = customer.Id, Customer = customer, Code = "SQ-SMALL", QuoteDate = new DateOnly(2026, 10, 17), ValidUntil = new DateOnly(2026, 12, 31), CurrencyCode = customer.CurrencyCode, Status = SalesQuoteStatus.Accepted, GrandTotal = 95_000m };
            db.AddRange(matchingQuote, rejectedQuote, nonMatchingQuote);
            await db.SaveChangesAsync();

            await BusinessRuleEndpoints.ApplySalesQuoteAcceptedRulesAsync(db, matchingQuote, Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"), CancellationToken.None);
            await BusinessRuleEndpoints.ApplySalesQuoteAcceptedRulesAsync(db, rejectedQuote, Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"), CancellationToken.None);
            await BusinessRuleEndpoints.ApplySalesQuoteAcceptedRulesAsync(db, nonMatchingQuote, Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"), CancellationToken.None);
            await db.SaveChangesAsync();

            Assert.True(await BusinessRuleEndpoints.IsSalesQuoteAwaitingApprovalAsync(db, TenantA, matchingQuote.Id, CancellationToken.None));
            Assert.True(await BusinessRuleEndpoints.IsSalesQuoteAwaitingApprovalAsync(db, TenantA, rejectedQuote.Id, CancellationToken.None));
            Assert.False(await BusinessRuleEndpoints.IsSalesQuoteAwaitingApprovalAsync(db, TenantA, nonMatchingQuote.Id, CancellationToken.None));
            var evaluations = await db.TenantBusinessRuleEvaluations.OrderBy(x => x.EventId).ToListAsync();
            Assert.Equal(3, evaluations.Count);
            Assert.Equal(2, evaluations.Count(x => x.Matched));
        }

        var instances = await client.GetFromJsonAsync<JsonElement[]>("/api/workflows/instances") ?? [];
        var matchingInstance = instances.Single(x => x.GetProperty("subjectId").GetGuid() == matchingQuote.Id);
        var rejectedInstance = instances.Single(x => x.GetProperty("subjectId").GetGuid() == rejectedQuote.Id);
        Assert.Equal("Pending", matchingInstance.GetProperty("status").GetString());
        Assert.Equal("SalesQuote", matchingInstance.GetProperty("subjectType").GetString());

        client.DefaultRequestHeaders.Add("X-Test-User", "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
        var approved = await client.PostAsJsonAsync($"/api/workflows/instances/{matchingInstance.GetProperty("id").GetGuid()}/decision", new { decision = "Approved", comment = "Finance approved" });
        approved.EnsureSuccessStatusCode();
        var rejected = await client.PostAsJsonAsync($"/api/workflows/instances/{rejectedInstance.GetProperty("id").GetGuid()}/decision", new { decision = "Rejected", comment = "Margin below policy" });
        rejected.EnsureSuccessStatusCode();

        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            Assert.Equal(SalesQuoteStatus.Accepted, (await db.SalesQuotes.SingleAsync(x => x.Id == matchingQuote.Id)).Status);
            Assert.Equal(SalesQuoteStatus.Rejected, (await db.SalesQuotes.SingleAsync(x => x.Id == rejectedQuote.Id)).Status);
            Assert.False(await BusinessRuleEndpoints.IsSalesQuoteAwaitingApprovalAsync(db, TenantA, matchingQuote.Id, CancellationToken.None));
            Assert.False(await BusinessRuleEndpoints.IsSalesQuoteAwaitingApprovalAsync(db, TenantA, rejectedQuote.Id, CancellationToken.None));
        }

        var workflowReport = await client.PostAsJsonAsync("/api/reports/run", new
        {
            source = "workflowInstances", columns = new[] { "workflowCode", "subjectType", "subjectCode", "status", "completedAt" },
            filters = new[] { new { field = "subjectType", @operator = "equals", value = "SalesQuote" } },
            sortBy = "subjectCode", descending = false, page = 1, pageSize = 50,
            groupByFields = new[] { "status" }, aggregate = "count"
        });
        workflowReport.EnsureSuccessStatusCode();
        using var workflowReportJson = JsonDocument.Parse(await workflowReport.Content.ReadAsStringAsync());
        Assert.Equal(2, workflowReportJson.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(2, workflowReportJson.RootElement.GetProperty("totalGroups").GetInt32());
        Assert.Contains(workflowReportJson.RootElement.GetProperty("groups").EnumerateArray(), row => row.GetProperty("groupValue").GetString() == "Approved");

        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            var tenantBDefinition = new TenantWorkflowDefinition { TenantId = TenantB, Code = "tenant-b-only", Name = "Tenant B only", Status = "Published" };
            db.TenantWorkflowInstances.Add(new TenantWorkflowInstance
            {
                TenantId = TenantB, DefinitionId = tenantBDefinition.Id, Definition = tenantBDefinition,
                DefinitionCode = tenantBDefinition.Code, DefinitionName = tenantBDefinition.Name, SubjectType = "SalesQuote",
                SubjectTitle = "MUST-NOT-LEAK", Status = "Approved", StartedByUserId = Guid.NewGuid()
            });
            await db.SaveChangesAsync();
        }
        var tenantScopedWorkflowReport = await client.PostAsJsonAsync("/api/reports/run", new
        {
            source = "workflowInstances", columns = new[] { "subjectCode" }, filters = Array.Empty<object>(),
            sortBy = "subjectCode", descending = false, page = 1, pageSize = 50
        });
        tenantScopedWorkflowReport.EnsureSuccessStatusCode();
        Assert.DoesNotContain("MUST-NOT-LEAK", await tenantScopedWorkflowReport.Content.ReadAsStringAsync());

        var workflowExport = await client.PostAsJsonAsync("/api/reports/export", new
        {
            source = "workflowInstances", columns = new[] { "workflowCode", "subjectType", "subjectCode", "status" },
            filters = new[] { new { field = "status", @operator = "equals", value = "Rejected" } },
            sortBy = "startedAt", descending = false, page = 1, pageSize = 50
        });
        Assert.Equal(HttpStatusCode.OK, workflowExport.StatusCode);
        Assert.Contains("SQ-REJECT", await workflowExport.Content.ReadAsStringAsync());

        using var nonAdmin = app.GetTestClient();
        nonAdmin.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        nonAdmin.DefaultRequestHeaders.Add("X-Test-Role", "TenantUser");
        var restrictedCatalog = await nonAdmin.GetFromJsonAsync<JsonElement[]>("/api/reports/catalog");
        Assert.DoesNotContain(restrictedCatalog!, source => source.GetProperty("code").GetString() == "workflowInstances");
        var forbiddenReport = await nonAdmin.PostAsJsonAsync("/api/reports/run", new
        {
            source = "workflowInstances", columns = new[] { "workflowCode" }, filters = Array.Empty<object>(),
            sortBy = "workflowCode", descending = false, page = 1, pageSize = 50
        });
        Assert.Equal(HttpStatusCode.Forbidden, forbiddenReport.StatusCode);
    }

    [Fact]
    public async Task Large_purchase_orders_wait_for_workflow_decision_before_becoming_receivable()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        var catalog = await client.GetFromJsonAsync<JsonElement[]>("/api/business-rules/catalog");
        Assert.Contains(catalog!, trigger => trigger.GetProperty("code").GetString() == TenantBusinessRuleEngine.PurchaseOrderCreated);

        var workflowCreate = await client.PostAsJsonAsync("/api/workflows/definitions", new
        {
            code = "purchase-order-review", name = "Purchase order review", description = "Review large orders",
            steps = new[] { new { name = "Finance", approverRole = "TenantAdmin" } }
        });
        Assert.Equal(HttpStatusCode.Created, workflowCreate.StatusCode);
        using var workflowCreated = JsonDocument.Parse(await workflowCreate.Content.ReadAsStringAsync());
        var workflowId = workflowCreated.RootElement.GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/workflows/definitions/{workflowId}/publish", new { })).StatusCode);

        var ruleCreate = await client.PostAsJsonAsync("/api/business-rules/", new
        {
            code = "large-purchase-order-review", name = "Large purchase order review",
            trigger = TenantBusinessRuleEngine.PurchaseOrderCreated, workflowCode = "purchase-order-review",
            conditions = new[] { new { field = "grandTotal", @operator = "GreaterThanOrEqual", value = "50000" } }
        });
        Assert.Equal(HttpStatusCode.Created, ruleCreate.StatusCode);
        using var ruleCreated = JsonDocument.Parse(await ruleCreate.Content.ReadAsStringAsync());
        var ruleId = ruleCreated.RootElement.GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/business-rules/{ruleId}/publish", new { })).StatusCode);

        PurchaseOrder approvedOrder;
        PurchaseOrder rejectedOrder;
        PurchaseOrder unreviewedOrder;
        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            var tenant = await db.Tenants.SingleAsync(x => x.Id == TenantA);
            var supplier = await db.CustomerAccounts.OrderBy(x => x.Code).FirstAsync(x => x.TenantId == TenantA);
            approvedOrder = new PurchaseOrder { TenantId = TenantA, Tenant = tenant, SupplierId = supplier.Id, Supplier = supplier,
                Code = "PO-REVIEW-APPROVE", OrderDate = new DateOnly(2026, 10, 17), CurrencyCode = "TRY", GrandTotal = 75000m };
            rejectedOrder = new PurchaseOrder { TenantId = TenantA, Tenant = tenant, SupplierId = supplier.Id, Supplier = supplier,
                Code = "PO-REVIEW-REJECT", OrderDate = new DateOnly(2026, 10, 17), CurrencyCode = "TRY", GrandTotal = 100000m };
            unreviewedOrder = new PurchaseOrder { TenantId = TenantA, Tenant = tenant, SupplierId = supplier.Id, Supplier = supplier,
                Code = "PO-REVIEW-SMALL", OrderDate = new DateOnly(2026, 10, 17), CurrencyCode = "TRY", GrandTotal = 49999m };
            db.PurchaseOrders.AddRange(approvedOrder, rejectedOrder, unreviewedOrder);
            await db.SaveChangesAsync();

            foreach (var order in new[] { approvedOrder, rejectedOrder, unreviewedOrder })
                if (await BusinessRuleEndpoints.ApplyPurchaseOrderCreatedRulesAsync(db, order,
                    Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"), CancellationToken.None))
                    order.Status = PurchaseOrderStatus.PendingApproval;
            await db.SaveChangesAsync();

            Assert.Equal(PurchaseOrderStatus.PendingApproval, approvedOrder.Status);
            Assert.Equal(PurchaseOrderStatus.PendingApproval, rejectedOrder.Status);
            Assert.Equal(PurchaseOrderStatus.Open, unreviewedOrder.Status);
            Assert.False(PurchaseOrderWorkflow.CanReceive(approvedOrder.Status));
            Assert.False(PurchaseOrderWorkflow.CanEdit(approvedOrder.Status));
        }

        var instances = await client.GetFromJsonAsync<JsonElement[]>("/api/workflows/instances") ?? [];
        var approvalInstance = instances.Single(instance => instance.GetProperty("subjectId").GetGuid() == approvedOrder.Id);
        var rejectionInstance = instances.Single(instance => instance.GetProperty("subjectId").GetGuid() == rejectedOrder.Id);
        var waitingReport = await client.PostAsJsonAsync("/api/reports/run", new
        {
            source = "workflowInstances", columns = new[] { "workflowCode", "subjectCode", "status", "completedAt" },
            filters = new[] { new { field = "completedAt", @operator = "isNull", value = "" } },
            sortBy = "subjectCode", descending = false, page = 1, pageSize = 50
        });
        waitingReport.EnsureSuccessStatusCode();
        using var waitingReportJson = JsonDocument.Parse(await waitingReport.Content.ReadAsStringAsync());
        Assert.Equal(2, waitingReportJson.RootElement.GetProperty("totalCount").GetInt32());
        Assert.DoesNotContain("ContextJson", await waitingReport.Content.ReadAsStringAsync());
        client.DefaultRequestHeaders.Add("X-Test-User", "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/workflows/instances/{approvalInstance.GetProperty("id").GetGuid()}/decision",
            new { decision = "Approved", comment = "Budget approved" })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/workflows/instances/{rejectionInstance.GetProperty("id").GetGuid()}/decision",
            new { decision = "Rejected", comment = "Budget limit exceeded" })).StatusCode);

        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            Assert.Equal(PurchaseOrderStatus.Open, (await db.PurchaseOrders.SingleAsync(x => x.Id == approvedOrder.Id)).Status);
            Assert.Equal(PurchaseOrderStatus.Rejected, (await db.PurchaseOrders.SingleAsync(x => x.Id == rejectedOrder.Id)).Status);
            Assert.True(PurchaseOrderWorkflow.CanReceive(PurchaseOrderStatus.Open));
            Assert.False(PurchaseOrderWorkflow.CanReceive(PurchaseOrderStatus.Rejected));
        }
    }

    [Fact]
    public async Task Purchase_request_report_applies_owner_abac_filters_and_exports_only_visible_rows()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        client.DefaultRequestHeaders.Add("X-Test-Role", "TenantUser");

        var catalog = await client.GetFromJsonAsync<JsonElement[]>("/api/reports/catalog");
        Assert.Contains(catalog!, source => source.GetProperty("code").GetString() == "purchaseRequests");

        var definition = new
        {
            source = "purchaseRequests", columns = new[] { "code", "requesterUserId", "status", "neededByDate" },
            filters = Array.Empty<object>(), sortBy = "code", descending = false, page = 1, pageSize = 50
        };
        var detailResponse = await client.PostAsJsonAsync("/api/reports/run", definition);
        detailResponse.EnsureSuccessStatusCode();
        using var details = JsonDocument.Parse(await detailResponse.Content.ReadAsStringAsync());
        Assert.Equal(1, details.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal("PR-OWNER", details.RootElement.GetProperty("rows")[0].GetProperty("code").GetString());
        Assert.Equal("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", details.RootElement.GetProperty("rows")[0].GetProperty("requesterUserId").GetString());
        Assert.Equal(JsonValueKind.Null, details.RootElement.GetProperty("rows")[0].GetProperty("neededByDate").ValueKind);

        var nullDateFilter = await client.PostAsJsonAsync("/api/reports/run", new
        {
            source = "purchaseRequests", columns = new[] { "code" },
            filters = new[] { new { field = "neededByDate", @operator = "isNull", value = "" } },
            sortBy = "code", descending = false, page = 1, pageSize = 50
        });
        nullDateFilter.EnsureSuccessStatusCode();
        using var nullDateResult = JsonDocument.Parse(await nullDateFilter.Content.ReadAsStringAsync());
        Assert.Equal(1, nullDateResult.RootElement.GetProperty("totalCount").GetInt32());

        var groupedResponse = await client.PostAsJsonAsync("/api/reports/run", new
        {
            source = "purchaseRequests", columns = new[] { "code" }, filters = Array.Empty<object>(), sortBy = "code",
            descending = false, page = 1, pageSize = 50, groupByFields = new[] { "status" }, aggregate = "count"
        });
        groupedResponse.EnsureSuccessStatusCode();
        using var grouped = JsonDocument.Parse(await groupedResponse.Content.ReadAsStringAsync());
        Assert.Equal(1, grouped.RootElement.GetProperty("totalGroups").GetInt32());
        Assert.Equal("Submitted", grouped.RootElement.GetProperty("groups")[0].GetProperty("groupValue").GetString());
        Assert.Equal(1, grouped.RootElement.GetProperty("groups")[0].GetProperty("rowCount").GetInt32());

        var csvResponse = await client.PostAsJsonAsync("/api/reports/export", definition);
        Assert.Equal(HttpStatusCode.OK, csvResponse.StatusCode);
        var csv = await csvResponse.Content.ReadAsStringAsync();
        Assert.Contains("PR-OWNER", csv);
        Assert.DoesNotContain("PR-OTHER", csv);

        var invalidGrouping = await client.PostAsJsonAsync("/api/reports/run", new
        {
            source = "purchaseRequests", columns = new[] { "code" }, filters = Array.Empty<object>(), sortBy = "code",
            descending = false, page = 1, pageSize = 50, groupByFields = new[] { "status", "requestDate" }, aggregate = "count"
        });
        Assert.Equal(HttpStatusCode.BadRequest, invalidGrouping.StatusCode);

        client.DefaultRequestHeaders.Remove("X-Test-Role");
        var adminResponse = await client.PostAsJsonAsync("/api/reports/run", definition);
        adminResponse.EnsureSuccessStatusCode();
        using var adminResult = JsonDocument.Parse(await adminResponse.Content.ReadAsStringAsync());
        Assert.Equal(2, adminResult.RootElement.GetProperty("totalCount").GetInt32());
    }

    private static async Task<WebApplication> StartApplicationAsync()
    {
        var databaseName = $"reports-{Guid.NewGuid():N}";
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Services.AddDbContext<TenantDbContext>(options => options.UseInMemoryDatabase(databaseName)
            .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning)));
        builder.Services.AddDbContext<PlatformDbContext>(options => options.UseInMemoryDatabase($"{databaseName}-platform"));
        builder.Services.AddAuthentication("report-test")
            .AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("report-test", _ => { });
        builder.Services.AddAuthorization();

        var app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapReportEndpoints();
        app.MapDashboardWidgetEndpoints();
        app.MapWorkflowEndpoints();
        app.MapBusinessRuleEndpoints();
        await app.StartAsync();

        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        var platformDb = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        await db.Database.EnsureCreatedAsync();
        await platformDb.Database.EnsureCreatedAsync();
        var tenantA = new Tenant { Id = TenantA, Name = "Tenant A", Slug = "tenant-a" };
        var tenantB = new Tenant { Id = TenantB, Name = "Tenant B", Slug = "tenant-b" };
        var customerA = new CustomerAccount { TenantId = TenantA, Tenant = tenantA, Code = "CUST-A", Name = "A customer", Type = CounterpartyType.Customer, CurrencyCode = "USD", RiskLimit = 12000m };
        var customerANoLimit = new CustomerAccount { TenantId = TenantA, Tenant = tenantA, Code = "CUST-A-NULL", Name = "A customer without limit", Type = CounterpartyType.Customer, CurrencyCode = "USD", RiskLimit = null };
        var customerB = new CustomerAccount { TenantId = TenantB, Tenant = tenantB, Code = "CUST-B", Name = "B customer", Type = CounterpartyType.Customer, CurrencyCode = "USD", RiskLimit = 900000m };
        var crmOpportunityA = new CrmOpportunity { TenantId = TenantA, Code = "OPP-A", Name = "Alpha renewal", CustomerId = customerA.Id, Customer = customerA, Stage = CrmOpportunityStage.Qualified, EstimatedValue = 2500m, CurrencyCode = "USD", ProbabilityPercent = 50, ExpectedCloseDate = new DateOnly(2026, 12, 1) };
        var crmOpportunityC = new CrmOpportunity { TenantId = TenantA, Code = "OPP-C", Name = "Gamma expansion", CustomerId = customerA.Id, Customer = customerA, Stage = CrmOpportunityStage.Qualified, EstimatedValue = 5000m, CurrencyCode = "USD", ProbabilityPercent = 60, ExpectedCloseDate = new DateOnly(2027, 1, 15) };
        var crmOpportunityB = new CrmOpportunity { TenantId = TenantB, Code = "OPP-B", Name = "Beta proposal", CustomerId = customerB.Id, Customer = customerB, Stage = CrmOpportunityStage.Qualified, EstimatedValue = 900000m, CurrencyCode = "EUR", ProbabilityPercent = 80 };
        var bankAccountA = new FinancialAccount { TenantId = TenantA, Tenant = tenantA, Code = "BANK-A", Name = "Operating account A", Type = FinancialAccountType.Bank, CurrencyCode = "USD" };
        var bankAccountB = new FinancialAccount { TenantId = TenantB, Tenant = tenantB, Code = "BANK-B", Name = "Operating account B", Type = FinancialAccountType.Bank, CurrencyCode = "USD" };
        var euroAccountA = new FinancialAccount { TenantId = TenantA, Tenant = tenantA, Code = "CASH-EUR-A", Name = "Euro cash A", Type = FinancialAccountType.Cash, CurrencyCode = "EUR" };
        var matchedBankTransaction = new FinancialAccountTransaction { Id = Guid.Parse("aaaaaaaa-0000-0000-0000-000000000001"), TenantId = TenantA, FinancialAccountId = bankAccountA.Id, FinancialAccount = bankAccountA,
            CurrencyCode = "USD", TransactionDate = new DateOnly(2026, 10, 2), Direction = FinancialDirection.Outflow, Amount = 25m, Description = "Matched bank item", Reference = "EXT-25" };
        var reversalTransaction = new FinancialAccountTransaction { TenantId = TenantA, FinancialAccountId = bankAccountA.Id, FinancialAccount = bankAccountA,
            CurrencyCode = "USD", TransactionDate = new DateOnly(2026, 10, 4), Direction = FinancialDirection.Inflow, Amount = 25m,
            Description = "Reversal", ReversalOfId = matchedBankTransaction.Id, ReversalOf = matchedBankTransaction };
        matchedBankTransaction.ReversalEntry = reversalTransaction;
        var euroTransaction = new FinancialAccountTransaction { TenantId = TenantA, FinancialAccountId = euroAccountA.Id, FinancialAccount = euroAccountA,
            CurrencyCode = "EUR", TransactionDate = new DateOnly(2026, 10, 3), Direction = FinancialDirection.Inflow, Amount = 50m, Description = "EUR cash receipt" };
        var tenantBTransaction = new FinancialAccountTransaction { TenantId = TenantB, FinancialAccountId = bankAccountB.Id, FinancialAccount = bankAccountB,
            CurrencyCode = "USD", TransactionDate = new DateOnly(2026, 10, 2), Direction = FinancialDirection.Inflow, Amount = 75m, Description = "Tenant B deposit" };
        var bankStatementA = new BankStatement { TenantId = TenantA, Tenant = tenantA, AccountId = bankAccountA.Id, Account = bankAccountA,
            CurrencyCode = "USD", RequestId = Guid.NewGuid(), Code = "BANK-A", StartDate = new DateOnly(2026, 10, 1), EndDate = new DateOnly(2026, 10, 31),
            OpeningBalance = 100m, ClosingBalance = 175m, Status = BankStatementStatus.Imported, CreatedAt = DateTimeOffset.Parse("2026-10-18T08:00:00Z") };
        bankStatementA.Lines.Add(new BankStatementLine { TenantId = TenantA, Statement = bankStatementA, StatementId = bankStatementA.Id,
            FinancialAccountId = bankAccountA.Id, CurrencyCode = "USD", LineNumber = 1, TransactionDate = new DateOnly(2026, 10, 2),
            Direction = FinancialDirection.Outflow, Amount = 25m, Description = "Matched line", FinancialAccountTransactionId = matchedBankTransaction.Id,
            FinancialAccountTransaction = matchedBankTransaction, MatchedAt = DateTimeOffset.Parse("2026-10-18T08:10:00Z") });
        bankStatementA.Lines.Add(new BankStatementLine { TenantId = TenantA, Statement = bankStatementA, StatementId = bankStatementA.Id,
            FinancialAccountId = bankAccountA.Id, CurrencyCode = "USD", LineNumber = 2, TransactionDate = new DateOnly(2026, 10, 3),
            Direction = FinancialDirection.Inflow, Amount = 100m, Description = "Unmatched line" });
        var bankStatementB = new BankStatement { TenantId = TenantB, Tenant = tenantB, AccountId = bankAccountB.Id, Account = bankAccountB,
            CurrencyCode = "USD", RequestId = Guid.NewGuid(), Code = "BANK-B", StartDate = new DateOnly(2026, 10, 1), EndDate = new DateOnly(2026, 10, 31),
            OpeningBalance = 1000m, ClosingBalance = 2000m, Status = BankStatementStatus.Reconciled };
        db.Tenants.AddRange(tenantA, tenantB);
        db.CustomerAccounts.AddRange(customerA, customerANoLimit, customerB);
        var stockA = new StockItem { TenantId = TenantA, Tenant = tenantA, Code = "STOCK-A", Name = "A item", Category = null, MinimumStock = 5.5m };
        var stockB = new StockItem { TenantId = TenantB, Tenant = tenantB, Code = "STOCK-B", Name = "B item", Category = null, MinimumStock = 900m };
        db.StockItems.AddRange(stockA, stockB);
        var warehouseA = new Warehouse { TenantId = TenantA, Tenant = tenantA, Code = "WH-A", Name = "A warehouse" };
        var warehouseB = new Warehouse { TenantId = TenantB, Tenant = tenantB, Code = "WH-B", Name = "B warehouse" };
        var bomA = new BillOfMaterial { TenantId = TenantA, Code = "BOM-A", Name = "A recipe", ProductStockItemId = stockA.Id };
        var bomB = new BillOfMaterial { TenantId = TenantB, Code = "BOM-B", Name = "B recipe", ProductStockItemId = stockB.Id };
        var productionOrderA = new ManufacturingOrder { TenantId = TenantA, Code = "MO-A", BillOfMaterialId = bomA.Id, WarehouseId = warehouseA.Id,
            PlannedQuantity = 3m, PlannedDate = new DateOnly(2026, 10, 20), Status = ManufacturingOrderStatus.Completed, CompletedAt = DateTimeOffset.UtcNow };
        productionOrderA.Operations.Add(new ManufacturingOrderOperation { TenantId = TenantA, ManufacturingOrderId = productionOrderA.Id, Sequence = 1,
            WorkCenterId = Guid.NewGuid(), WorkCenterCodeSnapshot = "WC-A", WorkCenterNameSnapshot = "A center", PlannedCostBase = 12m, ActualCostBase = 7m,
            Status = ManufacturingOperationStatus.Completed });
        var productionOrderB = new ManufacturingOrder { TenantId = TenantB, Code = "MO-B", BillOfMaterialId = bomB.Id, WarehouseId = warehouseB.Id,
            PlannedQuantity = 90m, PlannedDate = new DateOnly(2026, 10, 21), Status = ManufacturingOrderStatus.Completed };
        productionOrderB.Operations.Add(new ManufacturingOrderOperation { TenantId = TenantB, ManufacturingOrderId = productionOrderB.Id, Sequence = 1,
            WorkCenterId = Guid.NewGuid(), WorkCenterCodeSnapshot = "WC-B", WorkCenterNameSnapshot = "B center", PlannedCostBase = 1200m,
            Status = ManufacturingOperationStatus.Completed });
        var quoteA = new SalesQuote { TenantId = TenantA, Tenant = tenantA, CustomerId = customerA.Id, Customer = customerA, Code = "Q-A", QuoteDate = new DateOnly(2026, 10, 1), ValidUntil = new DateOnly(2026, 10, 31), CurrencyCode = "USD" };
        var orderA = new SalesOrder { TenantId = TenantA, Tenant = tenantA, QuoteId = quoteA.Id, Quote = quoteA, CustomerId = customerA.Id, Customer = customerA, Code = "O-A", OrderDate = new DateOnly(2026, 10, 2), CurrencyCode = "USD", GrandTotal = 350m };
        quoteA.Order = orderA;
        var deliveryA = new SalesDelivery { TenantId = TenantA, Tenant = tenantA, OrderId = orderA.Id, Order = orderA, WarehouseId = warehouseA.Id, Warehouse = warehouseA, RequestId = Guid.NewGuid(), Code = "D-A", DeliveryDate = new DateOnly(2026, 10, 15) };
        var orderLineA = new SalesOrderLine { TenantId = TenantA, OrderId = orderA.Id, Order = orderA, LineNumber = 1, StockItemId = stockA.Id, StockItem = stockA, StockCode = stockA.Code, StockName = stockA.Name, Quantity = 10m };
        deliveryA.Lines.Add(new SalesDeliveryLine { TenantId = TenantA, Delivery = deliveryA, OrderId = orderA.Id, OrderLineNumber = orderLineA.LineNumber, OrderLine = orderLineA, StockItemId = stockA.Id, StockCode = stockA.Code, StockName = stockA.Name, UnitCode = stockA.UnitCode, Quantity = 4m });
        var reservationA = new SalesOrderReservation { TenantId = TenantA, Tenant = tenantA, OrderId = orderA.Id, Order = orderA, OrderLineNumber = orderLineA.LineNumber, OrderLine = orderLineA, WarehouseId = warehouseA.Id, Warehouse = warehouseA, RequestId = Guid.NewGuid(), Quantity = 4m, FulfilledQuantity = 1m, Status = SalesOrderReservationStatus.Active };
        var receiptA = new InventoryTransaction { TenantId = TenantA, WarehouseId = warehouseA.Id, Warehouse = warehouseA, StockItemId = stockA.Id, StockItem = stockA, EntryDate = new DateOnly(2026, 10, 1), Direction = InventoryDirection.Receipt, Quantity = 20m, UnitCostBase = 2.5m, Description = "Test receipt" };
        var issueA = new InventoryTransaction { TenantId = TenantA, WarehouseId = warehouseA.Id, Warehouse = warehouseA, StockItemId = stockA.Id, StockItem = stockA, EntryDate = new DateOnly(2026, 10, 2), Direction = InventoryDirection.Issue, Quantity = 5m, Description = "Test issue" };
        var receiptB = new InventoryTransaction { TenantId = TenantB, WarehouseId = warehouseB.Id, Warehouse = warehouseB, StockItemId = stockB.Id, StockItem = stockB, EntryDate = new DateOnly(2026, 10, 1), Direction = InventoryDirection.Receipt, Quantity = 100m, Description = "Other tenant receipt" };
        var invoiceA = new SalesInvoice { TenantId = TenantA, Tenant = tenantA, DeliveryId = deliveryA.Id, Delivery = deliveryA, OrderId = orderA.Id, Order = orderA, CustomerId = customerA.Id, Customer = customerA, Code = "INV-A", InvoiceDate = new DateOnly(2026, 10, 15), CurrencyCode = "USD", GrandTotal = 250m };
        var quoteB = new SalesQuote { TenantId = TenantB, Tenant = tenantB, CustomerId = customerB.Id, Customer = customerB, Code = "Q-B", QuoteDate = new DateOnly(2026, 10, 1), ValidUntil = new DateOnly(2026, 10, 31), CurrencyCode = "USD" };
        var orderB = new SalesOrder { TenantId = TenantB, Tenant = tenantB, QuoteId = quoteB.Id, Quote = quoteB, CustomerId = customerB.Id, Customer = customerB, Code = "O-B", OrderDate = new DateOnly(2026, 10, 2), CurrencyCode = "USD", GrandTotal = 900_000m };
        quoteB.Order = orderB;
        var deliveryB = new SalesDelivery { TenantId = TenantB, Tenant = tenantB, OrderId = orderB.Id, Order = orderB, WarehouseId = warehouseB.Id, Warehouse = warehouseB, RequestId = Guid.NewGuid(), Code = "D-B", DeliveryDate = new DateOnly(2026, 10, 15) };
        var invoiceB = new SalesInvoice { TenantId = TenantB, Tenant = tenantB, DeliveryId = deliveryB.Id, Delivery = deliveryB, OrderId = orderB.Id, Order = orderB, CustomerId = customerB.Id, Customer = customerB, Code = "INV-B", InvoiceDate = new DateOnly(2026, 10, 15), CurrencyCode = "USD", GrandTotal = 900000m };
        var salesReturnA = new SalesReturn { TenantId = TenantA, Tenant = tenantA, SalesInvoiceId = invoiceA.Id, SalesInvoice = invoiceA, CustomerId = customerA.Id, Customer = customerA, WarehouseId = warehouseA.Id, Warehouse = warehouseA, RequestId = Guid.NewGuid(), Code = "RET-A", ReturnDate = new DateOnly(2026, 10, 18), GrandTotal = 25m };
        var salesReturnB = new SalesReturn { TenantId = TenantB, Tenant = tenantB, SalesInvoiceId = invoiceB.Id, SalesInvoice = invoiceB, CustomerId = customerB.Id, Customer = customerB, WarehouseId = warehouseB.Id, Warehouse = warehouseB, RequestId = Guid.NewGuid(), Code = "RET-B", ReturnDate = new DateOnly(2026, 10, 18), GrandTotal = 900m };
        var purchaseOrderA = new PurchaseOrder { TenantId = TenantA, Tenant = tenantA, SupplierId = customerA.Id, Supplier = customerA, Code = "PO-A", OrderDate = new DateOnly(2026, 10, 3), CurrencyCode = "USD", Status = PurchaseOrderStatus.Open, Subtotal = 315m, TaxTotal = 35m, GrandTotal = 350m };
        var purchaseOrderB = new PurchaseOrder { TenantId = TenantB, Tenant = tenantB, SupplierId = customerB.Id, Supplier = customerB, Code = "PO-B", OrderDate = new DateOnly(2026, 10, 3), CurrencyCode = "USD", Status = PurchaseOrderStatus.Open, Subtotal = 8_100_000m, TaxTotal = 900_000m, GrandTotal = 9_000_000m };
        var poLineA = new PurchaseOrderLine { TenantId = TenantA, PurchaseOrder = purchaseOrderA, PurchaseOrderId = purchaseOrderA.Id, LineNumber = 1, StockItem = stockA, StockItemId = stockA.Id, StockCode = stockA.Code, StockName = stockA.Name, UnitCode = stockA.UnitCode, Quantity = 10m, UnitPrice = 1m, VatPercent = 0m, LineSubtotal = 10m, LineTotal = 10m };
        var poLineB = new PurchaseOrderLine { TenantId = TenantB, PurchaseOrder = purchaseOrderB, PurchaseOrderId = purchaseOrderB.Id, LineNumber = 1, StockItem = stockB, StockItemId = stockB.Id, StockCode = stockB.Code, StockName = stockB.Name, UnitCode = stockB.UnitCode, Quantity = 100m, UnitPrice = 1m, VatPercent = 0m, LineSubtotal = 100m, LineTotal = 100m };
        purchaseOrderA.Lines.Add(poLineA); purchaseOrderB.Lines.Add(poLineB);
        var purchaseReceiptA = new PurchaseReceipt { TenantId = TenantA, Tenant = tenantA, PurchaseOrderId = purchaseOrderA.Id, PurchaseOrder = purchaseOrderA, WarehouseId = warehouseA.Id, Warehouse = warehouseA, RequestId = Guid.NewGuid(), Code = "GR-A", ReceiptDate = new DateOnly(2026, 10, 7), Status = PurchaseReceiptStatus.Posted };
        var purchaseReceiptB = new PurchaseReceipt { TenantId = TenantB, Tenant = tenantB, PurchaseOrderId = purchaseOrderB.Id, PurchaseOrder = purchaseOrderB, WarehouseId = warehouseB.Id, Warehouse = warehouseB, RequestId = Guid.NewGuid(), Code = "GR-B", ReceiptDate = new DateOnly(2026, 10, 8), Status = PurchaseReceiptStatus.Posted };
        purchaseReceiptA.Lines.Add(new PurchaseReceiptLine { TenantId = TenantA, Receipt = purchaseReceiptA, PurchaseOrderId = purchaseOrderA.Id, OrderLineNumber = 1, OrderLine = poLineA, StockItemId = stockA.Id, StockCode = stockA.Code, StockName = stockA.Name, UnitCode = stockA.UnitCode, Quantity = 7m });
        purchaseReceiptB.Lines.Add(new PurchaseReceiptLine { TenantId = TenantB, Receipt = purchaseReceiptB, PurchaseOrderId = purchaseOrderB.Id, OrderLineNumber = 1, OrderLine = poLineB, StockItemId = stockB.Id, StockCode = stockB.Code, StockName = stockB.Name, UnitCode = stockB.UnitCode, Quantity = 70m });
        var purchaseInvoiceA = new PurchaseInvoice { TenantId = TenantA, Tenant = tenantA, PurchaseReceiptId = purchaseReceiptA.Id, PurchaseReceipt = purchaseReceiptA, PurchaseOrderId = purchaseOrderA.Id, PurchaseOrder = purchaseOrderA, SupplierId = customerA.Id, Supplier = customerA, Code = "PINV-A", InvoiceDate = new DateOnly(2026, 10, 9), DueDate = new DateOnly(2026, 11, 8), CurrencyCode = "USD", Subtotal = 315m, TaxTotal = 35m, GrandTotal = 350m };
        var purchaseInvoiceLineA = new PurchaseInvoiceLine { TenantId = TenantA, PurchaseInvoice = purchaseInvoiceA, PurchaseInvoiceId = purchaseInvoiceA.Id, PurchaseReceiptId = purchaseReceiptA.Id, PurchaseReceiptLine = purchaseReceiptA.Lines.Single(), PurchaseReceiptLineId = purchaseReceiptA.Lines.Single().Id, OrderLineNumber = 1, StockItemId = stockA.Id, StockCode = stockA.Code, StockName = stockA.Name, UnitCode = stockA.UnitCode, Quantity = 7m, LineTotal = 350m };
        purchaseInvoiceA.Lines.Add(purchaseInvoiceLineA);
        var purchaseInvoiceB = new PurchaseInvoice { TenantId = TenantB, Tenant = tenantB, PurchaseReceiptId = purchaseReceiptB.Id, PurchaseReceipt = purchaseReceiptB, PurchaseOrderId = purchaseOrderB.Id, PurchaseOrder = purchaseOrderB, SupplierId = customerB.Id, Supplier = customerB, Code = "PINV-B", InvoiceDate = new DateOnly(2026, 10, 9), DueDate = new DateOnly(2026, 11, 8), CurrencyCode = "USD", GrandTotal = 9_000_000m };
        var supplierPaymentA = new SupplierPayment { TenantId = TenantA, Tenant = tenantA, RequestId = Guid.NewGuid(), PurchaseInvoiceId = purchaseInvoiceA.Id, PurchaseInvoice = purchaseInvoiceA, SupplierId = customerA.Id, Supplier = customerA, Code = "PAY-A", PaymentDate = new DateOnly(2026, 10, 12), CurrencyCode = "USD", Amount = 125m, PaymentMethod = "Bank transfer", Reference = "REF-A", FinancialAccountId = bankAccountA.Id, FinancialAccount = bankAccountA };
        var supplierPaymentB = new SupplierPayment { TenantId = TenantB, Tenant = tenantB, RequestId = Guid.NewGuid(), PurchaseInvoiceId = purchaseInvoiceB.Id, PurchaseInvoice = purchaseInvoiceB, SupplierId = customerB.Id, Supplier = customerB, Code = "PAY-B", PaymentDate = new DateOnly(2026, 10, 13), CurrencyCode = "USD", Amount = 900_000m, PaymentMethod = "Bank transfer", Reference = "REF-B", FinancialAccountId = bankAccountB.Id, FinancialAccount = bankAccountB };
        var supplierReturnA = new SupplierReturn { TenantId = TenantA, Tenant = tenantA, PurchaseInvoiceId = purchaseInvoiceA.Id, PurchaseInvoice = purchaseInvoiceA, SupplierId = customerA.Id, Supplier = customerA, WarehouseId = warehouseA.Id, Warehouse = warehouseA, RequestId = Guid.NewGuid(), Code = "SRET-A", ReturnDate = new DateOnly(2026, 10, 18), Subtotal = 35m, GrandTotal = 35m };
        supplierReturnA.Lines.Add(new SupplierReturnLine { TenantId = TenantA, SupplierReturn = supplierReturnA, PurchaseInvoiceId = purchaseInvoiceA.Id, PurchaseInvoiceLineId = purchaseInvoiceLineA.Id, PurchaseInvoiceLine = purchaseInvoiceLineA, OrderLineNumber = 1, StockItemId = stockA.Id, StockCode = stockA.Code, StockName = stockA.Name, UnitCode = stockA.UnitCode, Quantity = 7m, UnitPrice = 5m, LineSubtotal = 35m, LineTotal = 35m });
        var supplierReturnB = new SupplierReturn { TenantId = TenantB, Tenant = tenantB, PurchaseInvoiceId = purchaseInvoiceB.Id, PurchaseInvoice = purchaseInvoiceB, SupplierId = customerB.Id, Supplier = customerB, WarehouseId = warehouseB.Id, Warehouse = warehouseB, RequestId = Guid.NewGuid(), Code = "SRET-B", ReturnDate = new DateOnly(2026, 10, 18), Subtotal = 900m, GrandTotal = 900m };
        var currentUserId = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
        var otherUserId = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
        var ownedRequest = new PurchaseRequest { TenantId = TenantA, Tenant = tenantA, RequestedByUserId = currentUserId, Code = "PR-OWNER", RequestDate = new DateOnly(2026, 10, 10), Description = "Visible request", Status = PurchaseRequestStatus.Submitted };
        var otherRequest = new PurchaseRequest { TenantId = TenantA, Tenant = tenantA, RequestedByUserId = otherUserId, Code = "PR-OTHER", RequestDate = new DateOnly(2026, 10, 11), Description = "Hidden request", Status = PurchaseRequestStatus.Approved };
        var requestTenantB = new PurchaseRequest { TenantId = TenantB, Tenant = tenantB, RequestedByUserId = currentUserId, Code = "PR-TENANT-B", RequestDate = new DateOnly(2026, 10, 12), Description = "Other tenant", Status = PurchaseRequestStatus.Submitted };
        db.AddRange(crmOpportunityA, crmOpportunityC, crmOpportunityB, bankAccountA, bankAccountB, euroAccountA, reversalTransaction, euroTransaction, tenantBTransaction, bankStatementA, bankStatementB, ownedRequest, otherRequest, requestTenantB, bomA, bomB, productionOrderA, productionOrderB, supplierReturnA, supplierReturnB,
            warehouseA, quoteA, orderA, orderLineA, reservationA, deliveryA, invoiceA, salesReturnA, receiptA, issueA, warehouseB, receiptB, quoteB, orderB, deliveryB, invoiceB, salesReturnB, purchaseOrderA, purchaseOrderB, purchaseReceiptA, purchaseReceiptB, purchaseInvoiceA, purchaseInvoiceB, supplierPaymentA, supplierPaymentB);
        platformDb.Tenants.AddRange(new Tenant { Id = TenantA, Name = "Tenant A", Slug = "tenant-a" }, new Tenant { Id = TenantB, Name = "Tenant B", Slug = "tenant-b" });
        platformDb.TenantPermissionRules.Add(new TenantPermissionRule
        {
            TenantId = TenantA, SubjectType = TenantPermissionSubjectType.Role, SubjectRole = "TenantUser",
            PermissionCode = "erp.purchase-requests.read", Effect = TenantPermissionEffect.Allow, ResourceType = "erp.purchase-requests",
            AttributeName = "resource.ownerUserId", AttributeOperator = TenantPermissionConditionOperator.Equals, AttributeValue = currentUserId.ToString("D")
        });
        await platformDb.SaveChangesAsync();
        await db.SaveChangesAsync();
        return app;
    }
}

internal sealed class ReportTestAuthenticationHandler(
    IOptionsMonitor<AuthenticationSchemeOptions> options,
    ILoggerFactory logger,
    UrlEncoder encoder)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (!Guid.TryParse(Request.Headers["X-Test-Tenant"], out var tenantId))
            return Task.FromResult(AuthenticateResult.NoResult());

        var claims = new[]
        {
            new Claim("tenant_id", tenantId.ToString()),
            new Claim("sub", Guid.TryParse(Request.Headers["X-Test-User"], out var userId)
                ? userId.ToString() : Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa").ToString()),
            new Claim("role", Request.Headers["X-Test-Role"].FirstOrDefault() ?? "TenantAdmin")
        };
        var identity = new ClaimsIdentity(claims, Scheme.Name);
        return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), Scheme.Name)));
    }
}
