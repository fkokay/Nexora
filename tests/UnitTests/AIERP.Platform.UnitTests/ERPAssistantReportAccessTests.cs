using System.Text.Json;
using AIERP.AIService.AI;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;

namespace AIERP.Platform.UnitTests;

public sealed class ERPAssistantReportAccessTests
{
    [Fact]
    public async Task Report_source_requires_its_module_read_permission()
    {
        var authorizer = new RecordingPermissionAuthorizer(allowed: false);

        var allowed = await ERPAssistantReportAccess.IsSourceAllowedAsync("salesOrders", Guid.NewGuid(), Guid.NewGuid(),
            "SalesManager", authorizer, CancellationToken.None);

        Assert.False(allowed);
        Assert.Equal("erp.sales-orders.read", authorizer.PermissionCode);
    }

    [Fact]
    public async Task Unknown_report_source_is_rejected_without_permission_lookup()
    {
        var authorizer = new RecordingPermissionAuthorizer(allowed: true);

        var allowed = await ERPAssistantReportAccess.IsSourceAllowedAsync("payroll", Guid.NewGuid(), Guid.NewGuid(),
            "TenantAdmin", authorizer, CancellationToken.None);

        Assert.False(allowed);
        Assert.Null(authorizer.PermissionCode);
    }

    [Fact]
    public async Task Report_permission_is_evaluated_for_the_callers_selected_tenant()
    {
        var selectedTenant = Guid.NewGuid();
        var authorizer = new RecordingPermissionAuthorizer(allowed: true, expectedTenant: selectedTenant);

        var allowed = await ERPAssistantReportAccess.IsSourceAllowedAsync("salesOrders", Guid.NewGuid(), Guid.NewGuid(),
            "SalesManager", authorizer, CancellationToken.None);

        Assert.False(allowed);
    }

    [Theory]
    [InlineData("catalog", "erp.reports.read")]
    [InlineData("run", "erp.reports.execute")]
    public async Task Report_endpoint_precheck_matches_api_permission_and_selected_tenant(string endpoint, string permissionCode)
    {
        var tenantId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        var authorizer = new RecordingPermissionAuthorizer(allowed: true, expectedTenant: tenantId);

        var allowed = endpoint == "catalog"
            ? await ERPAssistantReportAccess.IsReportCatalogAllowedAsync(tenantId, userId, "TenantUser", authorizer, CancellationToken.None)
            : await ERPAssistantReportAccess.IsReportRunAllowedAsync(tenantId, userId, "TenantUser", authorizer, CancellationToken.None);

        Assert.True(allowed);
        Assert.Equal(permissionCode, authorizer.PermissionCode);
        Assert.Equal(tenantId, authorizer.ActualTenantId);
    }

    [Theory]
    [InlineData("catalog")]
    [InlineData("run")]
    public async Task Report_endpoint_precheck_denies_missing_report_grant(string endpoint)
    {
        var authorizer = new RecordingPermissionAuthorizer(allowed: false);
        var tenantId = Guid.NewGuid();

        var allowed = endpoint == "catalog"
            ? await ERPAssistantReportAccess.IsReportCatalogAllowedAsync(tenantId, Guid.NewGuid(), "TenantUser", authorizer, CancellationToken.None)
            : await ERPAssistantReportAccess.IsReportRunAllowedAsync(tenantId, Guid.NewGuid(), "TenantUser", authorizer, CancellationToken.None);

        Assert.False(allowed);
        Assert.NotNull(authorizer.PermissionCode);
    }

    [Theory]
    [InlineData("salesOrders", "2026-01-01", "2026-12-31", true)]
    [InlineData("salesOrders", "2025-12-30", "2026-12-31", false)]
    [InlineData("salesOrders", "2026-02-01", "2026-01-01", false)]
    [InlineData("salesOrders", "", "2026-01-01", false)]
    [InlineData("stockItems", "", "", true)]
    public void Transaction_report_requires_a_bounded_date_window(string source, string from, string through, bool expected)
    {
        using var filters = JsonDocument.Parse(JsonSerializer.Serialize(new[]
        {
            new { field = "orderDate", @operator = "gte", value = from },
            new { field = "orderDate", @operator = "lte", value = through }
        }));

        Assert.Equal(expected, ERPAssistantReportAccess.HasBoundedDateWindow(source, filters.RootElement));
    }

    [Fact]
    public void Provider_user_context_redacts_email_phone_iban_and_numeric_identifiers()
    {
        var redacted = ERPAssistantPrivacyFilter.RedactUserText(
            "mail a@example.com, ara +90 532 123 45 67, IBAN TR12 0006 1005 1978 6457 8413 26, ID 12345678901");

        Assert.DoesNotContain("a@example.com", redacted, StringComparison.Ordinal);
        Assert.DoesNotContain("532 123 45 67", redacted, StringComparison.Ordinal);
        Assert.DoesNotContain("TR12 0006", redacted, StringComparison.Ordinal);
        Assert.DoesNotContain("12345678901", redacted, StringComparison.Ordinal);
        Assert.Contains("[redacted-", redacted, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Provider_is_not_called_without_explicit_data_sharing_consent()
    {
        var providerCalled = false;

        await Assert.ThrowsAsync<InvalidOperationException>(() => ERPAssistantSharingConsent.InvokeProviderAsync(false, () =>
        {
            providerCalled = true;
            return Task.FromResult("should not be sent");
        }));

        Assert.False(providerCalled);
    }

    private sealed class RecordingPermissionAuthorizer(bool allowed, Guid? expectedTenant = null) : IPlatformPermissionAuthorizer
    {
        public string? PermissionCode { get; private set; }
        public Guid? ActualTenantId { get; private set; }

        public Task<bool> IsAllowedAsync(Guid tenantId, Guid userId, string role, ResolvedPlatformPermission permission,
            CancellationToken cancellationToken = default)
        {
            PermissionCode = permission.Permission.Code;
            ActualTenantId = tenantId;
            return Task.FromResult(allowed && (expectedTenant is null || expectedTenant == tenantId));
        }
    }
}
