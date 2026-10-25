using System.Text.Json;
using AIERP.AIService.AI;
using AIERP.Platform.Application;

namespace AIERP.Platform.UnitTests;

public sealed class ERPAssistantMaturityToolsTests
{
    [Theory]
    [InlineData("2026-10-25", true)]
    [InlineData("2026-10-26", false)]
    [InlineData("2026-02-30", false)]
    [InlineData("2026-1-01", false)]
    [InlineData(null, false)]
    public void As_of_date_must_be_valid_and_not_future(string? value, bool expected)
    {
        Assert.Equal(expected, ERPAssistantMaturityTools.TryValidateAsOfDate(value, out _));
    }

    [Fact]
    public async Task Maturity_read_requires_the_specific_permission()
    {
        var tenantId = Guid.NewGuid();
        var authorizer = new RecordingPermissionAuthorizer(true, tenantId);
        Assert.True(await ERPAssistantMaturityTools.IsReadAllowedAsync(tenantId, Guid.NewGuid(), "FinanceUser", authorizer, CancellationToken.None));
        Assert.Equal("erp.maturities.read", authorizer.PermissionCode);
        Assert.False(await ERPAssistantMaturityTools.IsReadAllowedAsync(tenantId, Guid.NewGuid(), "FinanceUser",
            new RecordingPermissionAuthorizer(false, tenantId), CancellationToken.None));
    }

    [Fact]
    public void Summary_returns_only_currency_direction_aging_buckets()
    {
        using var response = JsonDocument.Parse("""
            {
              "asOfDate":"2026-10-25",
              "summaries":[
                {"direction":"Receivable","currencyCode":"TRY","invoiceCount":4,"outstandingAmount":1250.00,"notDue":250.00,"days1To30":300.00,"days31To60":200.00,"days61To90":100.00,"over90Days":400.00}
              ],
              "items":[{"invoiceId":"11111111-1111-1111-1111-111111111111","invoiceCode":"INV-SECRET","counterpartyName":"Private customer","outstandingAmount":1250.00}]
            }
            """);

        var serialized = ERPAssistantMaturityTools.SummarizeMaturities(response.RootElement, new DateOnly(2026, 10, 25));
        using var result = JsonDocument.Parse(serialized);
        var item = Assert.Single(result.RootElement.GetProperty("currencies").EnumerateArray());
        Assert.Equal("Receivable", item.GetProperty("direction").GetString());
        Assert.Equal(1250.00m, item.GetProperty("outstandingAmount").GetDecimal());
        Assert.Equal(400.00m, item.GetProperty("over90Days").GetDecimal());
        Assert.DoesNotContain("invoiceId", serialized, StringComparison.Ordinal);
        Assert.DoesNotContain("INV-SECRET", serialized, StringComparison.Ordinal);
        Assert.DoesNotContain("Private customer", serialized, StringComparison.Ordinal);
    }

    [Fact]
    public void Summary_rejects_unreconciled_buckets_oversized_results_and_wrong_as_of_date()
    {
        using var badBuckets = JsonDocument.Parse("""
            {"asOfDate":"2026-10-25","summaries":[{"direction":"Payable","currencyCode":"TRY","invoiceCount":1,"outstandingAmount":10,"notDue":0,"days1To30":0,"days31To60":0,"days61To90":0,"over90Days":0}]}
            """);
        using var wrongDate = JsonDocument.Parse("""
            {"asOfDate":"2026-10-24","summaries":[]}
            """);
        Assert.Throws<JsonException>(() => ERPAssistantMaturityTools.SummarizeMaturities(badBuckets.RootElement, new DateOnly(2026, 10, 25)));
        Assert.Throws<JsonException>(() => ERPAssistantMaturityTools.SummarizeMaturities(wrongDate.RootElement, new DateOnly(2026, 10, 25)));
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
