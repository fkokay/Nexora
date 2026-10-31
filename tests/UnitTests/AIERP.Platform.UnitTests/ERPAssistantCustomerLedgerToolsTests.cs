using System.Text.Json;
using AIERP.AIService.AI;
using AIERP.Platform.Application;

namespace AIERP.Platform.UnitTests;

public sealed class ERPAssistantCustomerLedgerToolsTests
{
    [Theory]
    [InlineData("2025-10-25", "2026-10-25", true)]
    [InlineData("2025-10-24", "2026-10-25", false)]
    [InlineData("2026-10-26", "2026-10-25", false)]
    [InlineData("2026-02-30", "2026-03-01", false)]
    [InlineData("2026-1-01", "2026-03-01", false)]
    [InlineData(null, "2026-03-01", false)]
    public void Period_requires_exact_dates_in_a_past_or_current_365_day_window(string? from, string? to, bool expected)
    {
        Assert.Equal(expected, ERPAssistantCustomerLedgerTools.TryValidatePeriod(from, to,
            new DateOnly(2026, 10, 25), out _, out _));
    }

    [Fact]
    public async Task Customer_ledger_requires_customer_read_permission()
    {
        var tenantId = Guid.NewGuid();
        var authorizer = new RecordingPermissionAuthorizer(true, tenantId);
        Assert.True(await ERPAssistantCustomerLedgerTools.IsReadAllowedAsync(tenantId, Guid.NewGuid(), "TenantUser", authorizer, CancellationToken.None));
        Assert.Equal("erp.customers.read", authorizer.PermissionCode);
        Assert.False(await ERPAssistantCustomerLedgerTools.IsReadAllowedAsync(tenantId, Guid.NewGuid(), "TenantUser",
            new RecordingPermissionAuthorizer(false, tenantId), CancellationToken.None));
    }

    [Fact]
    public void Projection_keeps_only_bounded_financial_facts_and_indicates_truncation()
    {
        using var report = JsonDocument.Parse("""
            {
              "source":"customerLedgerEntries","page":1,"pageSize":10,"totalCount":11,
              "rows":[
                {"entryDate":"2026-10-20","direction":"Debit","amount":1250.50,"currencyCode":"TRY","customerName":"Private name","customerCode":"C-100","description":"Sensitive description","id":"internal-id"}
              ]
            }
            """);

        var serialized = ERPAssistantCustomerLedgerTools.SummarizeLedgerReport(report.RootElement,
            new DateOnly(2026, 10, 1), new DateOnly(2026, 10, 25));
        using var result = JsonDocument.Parse(serialized);
        Assert.Equal(11, result.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(1, result.RootElement.GetProperty("returned").GetInt32());
        Assert.True(result.RootElement.GetProperty("hasMore").GetBoolean());
        var entry = Assert.Single(result.RootElement.GetProperty("entries").EnumerateArray());
        Assert.Equal("Debit", entry.GetProperty("direction").GetString());
        Assert.Equal(1250.50m, entry.GetProperty("amount").GetDecimal());
        Assert.Equal("TRY", entry.GetProperty("currencyCode").GetString());
        Assert.DoesNotContain("customerName", serialized, StringComparison.Ordinal);
        Assert.DoesNotContain("customerCode", serialized, StringComparison.Ordinal);
        Assert.DoesNotContain("description", serialized, StringComparison.Ordinal);
        Assert.DoesNotContain("internal-id", serialized, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("{\"source\":\"salesInvoices\",\"page\":1,\"totalCount\":0,\"rows\":[]}")]
    [InlineData("{\"source\":\"customerLedgerEntries\",\"page\":2,\"totalCount\":0,\"rows\":[]}")]
    [InlineData("{\"source\":\"customerLedgerEntries\",\"page\":1,\"totalCount\":0,\"rows\":[{\"entryDate\":\"2026-10-20\",\"direction\":\"Debit\",\"amount\":1,\"currencyCode\":\"TRY\"}]}")]
    [InlineData("{\"source\":\"customerLedgerEntries\",\"page\":1,\"totalCount\":1,\"rows\":[{\"entryDate\":\"2026-10-20\",\"direction\":\"Debit\",\"amount\":-1,\"currencyCode\":\"TRY\"}]}")]
    public void Projection_rejects_unexpected_or_invalid_report_rows(string json)
    {
        using var report = JsonDocument.Parse(json);
        Assert.Throws<JsonException>(() => ERPAssistantCustomerLedgerTools.SummarizeLedgerReport(report.RootElement,
            new DateOnly(2026, 10, 1), new DateOnly(2026, 10, 25)));
    }

    [Fact]
    public async Task Supplier_ledger_requires_supplier_read_permission_and_minimizes_rows()
    {
        var tenantId = Guid.NewGuid();
        var authorizer = new RecordingPermissionAuthorizer(true, tenantId);
        Assert.True(await ERPAssistantSupplierLedgerTools.IsReadAllowedAsync(tenantId, Guid.NewGuid(), "TenantUser", authorizer, CancellationToken.None));
        Assert.Equal("erp.supplier-payments.read", authorizer.PermissionCode);
        using var report = JsonDocument.Parse("""
            {"source":"supplierLedgerEntries","page":1,"totalCount":1,"rows":[{"entryDate":"2026-10-20","direction":"Credit","amount":125.50,"currencyCode":"eur","supplierCode":"SECRET","description":"private"}]}
            """);

        var summary = ERPAssistantSupplierLedgerTools.SummarizeReport(report.RootElement,
            new DateOnly(2026, 10, 1), new DateOnly(2026, 10, 25));

        Assert.Contains("\"direction\":\"Credit\"", summary);
        Assert.Contains("\"currencyCode\":\"EUR\"", summary);
        Assert.DoesNotContain("SECRET", summary);
        Assert.DoesNotContain("private", summary);
    }

    [Fact]
    public void Supplier_ledger_projection_rejects_customer_source()
    {
        using var report = JsonDocument.Parse("""{"source":"customerLedgerEntries","page":1,"totalCount":0,"rows":[]}""");
        Assert.Throws<JsonException>(() => ERPAssistantSupplierLedgerTools.SummarizeReport(report.RootElement,
            new DateOnly(2026, 10, 1), new DateOnly(2026, 10, 25)));
    }

    private sealed class RecordingPermissionAuthorizer(bool allowed, Guid expectedTenantId) : IPlatformPermissionAuthorizer
    {
        public string? PermissionCode { get; private set; }

        public Task<bool> IsAllowedAsync(Guid tenantId, Guid userId, string role, ResolvedPlatformPermission permission,
            CancellationToken cancellationToken = default)
        {
            PermissionCode = permission.Permission.Code;
            return Task.FromResult(allowed && tenantId == expectedTenantId);
        }
    }
}
