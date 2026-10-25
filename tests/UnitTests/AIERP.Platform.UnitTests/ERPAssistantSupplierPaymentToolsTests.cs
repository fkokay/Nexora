using System.Text.Json;
using AIERP.AIService.AI;
using AIERP.Platform.Application;

namespace AIERP.Platform.UnitTests;

public sealed class ERPAssistantSupplierPaymentToolsTests
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
        Assert.Equal(expected, ERPAssistantSupplierPaymentTools.TryValidatePeriod(from, to,
            new DateOnly(2026, 10, 25), out _, out _));
    }

    [Fact]
    public async Task Payment_search_requires_supplier_payment_read_permission()
    {
        var tenantId = Guid.NewGuid();
        var authorizer = new RecordingPermissionAuthorizer(true, tenantId);
        Assert.True(await ERPAssistantSupplierPaymentTools.IsReadAllowedAsync(tenantId, Guid.NewGuid(), "TenantUser", authorizer, CancellationToken.None));
        Assert.Equal("erp.supplier-payments.read", authorizer.PermissionCode);
        Assert.False(await ERPAssistantSupplierPaymentTools.IsReadAllowedAsync(tenantId, Guid.NewGuid(), "TenantUser",
            new RecordingPermissionAuthorizer(false, tenantId), CancellationToken.None));
    }

    [Theory]
    [InlineData(1, false)]
    [InlineData(2, true)]
    [InlineData(3, true)]
    public void Payment_search_requires_a_unique_supplier_or_combined_account_from_this_turn(int type, bool expected)
    {
        var accountId = Guid.NewGuid();
        var selection = new ERPAssistantCustomerAccountSelection();
        using var unique = JsonDocument.Parse($"{{\"totalCount\":1,\"items\":[{{\"id\":\"{accountId:D}\",\"code\":\"S-100\",\"type\":{type}}}]}}");
        Assert.True(selection.TryRememberUniqueSearchResult(unique.RootElement));
        Assert.Equal(expected, selection.TryGetSelectedSupplierCode(accountId, out var supplierCode));
        if (expected) Assert.Equal("S-100", supplierCode);
    }

    [Fact]
    public void Projection_keeps_bounded_payment_facts_and_omits_supplier_and_document_identity()
    {
        using var report = JsonDocument.Parse("""
            {
              "source":"supplierPayments","page":1,"pageSize":10,"totalCount":11,
              "rows":[
                {"paymentDate":"2026-10-20","amount":1250.50,"currencyCode":"try","paymentMethod":"BankTransfer","status":"Posted","supplierName":"Private supplier","supplierCode":"S-100","reference":"private-reference","invoiceCode":"PUR-001","accountName":"Private bank","id":"internal-id"}
              ]
            }
            """);

        var serialized = ERPAssistantSupplierPaymentTools.SummarizeReport(report.RootElement,
            new DateOnly(2026, 10, 1), new DateOnly(2026, 10, 25));
        using var result = JsonDocument.Parse(serialized);
        Assert.Equal(11, result.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(1, result.RootElement.GetProperty("returned").GetInt32());
        Assert.True(result.RootElement.GetProperty("hasMore").GetBoolean());
        var payment = Assert.Single(result.RootElement.GetProperty("payments").EnumerateArray());
        Assert.Equal("2026-10-20", payment.GetProperty("paymentDate").GetString());
        Assert.Equal(1250.50m, payment.GetProperty("amount").GetDecimal());
        Assert.Equal("TRY", payment.GetProperty("currencyCode").GetString());
        Assert.Equal("BankTransfer", payment.GetProperty("paymentMethod").GetString());
        Assert.Equal("Posted", payment.GetProperty("status").GetString());
        Assert.DoesNotContain("supplierName", serialized, StringComparison.Ordinal);
        Assert.DoesNotContain("supplierCode", serialized, StringComparison.Ordinal);
        Assert.DoesNotContain("private-reference", serialized, StringComparison.Ordinal);
        Assert.DoesNotContain("PUR-001", serialized, StringComparison.Ordinal);
        Assert.DoesNotContain("Private bank", serialized, StringComparison.Ordinal);
        Assert.DoesNotContain("internal-id", serialized, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("{\"source\":\"supplierPayments\",\"page\":2,\"totalCount\":0,\"rows\":[]}")]
    [InlineData("{\"source\":\"supplierPayments\",\"page\":1,\"totalCount\":0,\"rows\":[{\"paymentDate\":\"2026-10-20\",\"amount\":1,\"currencyCode\":\"TRY\",\"paymentMethod\":\"BankTransfer\",\"status\":\"Posted\"}]}")]
    [InlineData("{\"source\":\"supplierPayments\",\"page\":1,\"totalCount\":1,\"rows\":[{\"paymentDate\":\"2026-10-20\",\"amount\":-1,\"currencyCode\":\"TRY\",\"paymentMethod\":\"BankTransfer\",\"status\":\"Posted\"}]}")]
    [InlineData("{\"source\":\"supplierPayments\",\"page\":1,\"totalCount\":1,\"rows\":[{\"paymentDate\":\"2026-09-20\",\"amount\":1,\"currencyCode\":\"TRY\",\"paymentMethod\":\"BankTransfer\",\"status\":\"Posted\"}]}")]
    public void Projection_rejects_unexpected_or_invalid_report_rows(string json)
    {
        using var report = JsonDocument.Parse(json);
        Assert.Throws<JsonException>(() => ERPAssistantSupplierPaymentTools.SummarizeReport(report.RootElement,
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
