using System.Text.Json;
using AIERP.AIService.AI;
using AIERP.Platform.Application;

namespace AIERP.Platform.UnitTests;

public sealed class ERPAssistantCreditFacilityToolsTests
{
    [Theory]
    [InlineData(null, false)]
    [InlineData("x", false)]
    [InlineData(" LN-01 ", true)]
    [InlineData("01234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890", false)]
    public void Search_term_is_trimmed_and_bounded(string? input, bool expected)
    {
        Assert.Equal(expected, ERPAssistantCreditFacilityTools.TryValidateSearchTerm(input, out var term));
        Assert.Equal(input?.Trim() ?? string.Empty, term);
    }

    [Fact]
    public async Task Read_requires_credit_facility_permission_and_matching_tenant()
    {
        var tenantId = Guid.NewGuid();
        var authorizer = new RecordingPermissionAuthorizer(tenantId);
        Assert.True(await ERPAssistantCreditFacilityTools.IsReadAllowedAsync(tenantId, Guid.NewGuid(), "TenantAdmin", authorizer, CancellationToken.None));
        Assert.Equal("erp.finance.credit-facilities.read", authorizer.PermissionCode);
        Assert.False(await ERPAssistantCreditFacilityTools.IsReadAllowedAsync(Guid.NewGuid(), Guid.NewGuid(), "TenantAdmin", authorizer, CancellationToken.None));
    }

    [Fact]
    public void Summary_preserves_each_facility_currency_and_omits_sensitive_fields()
    {
        using var response = JsonDocument.Parse("""
            {"totalCount":1,"items":[{"id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","code":"LN-01","lenderName":"Secret Bank","facilityType":"Loan","currencyCode":"USD","status":"Active","maturityDate":"2027-12-31","approvedLimit":1000000,"drawnPrincipal":15000,"repaidPrincipal":5000,"outstandingPrincipal":10000,"plannedInstallmentCount":2,"plannedInstallmentTotal":12000,"notes":"secret note","financialAccountCode":"BANK-USD"}]}
            """);
        using var result = JsonDocument.Parse(ERPAssistantCreditFacilityTools.SummarizeFacilities(response.RootElement));
        var root = result.RootElement;
        Assert.Equal(1, root.GetProperty("totalCount").GetInt32());
        Assert.False(root.GetProperty("hasMore").GetBoolean());
        var item = Assert.Single(root.GetProperty("items").EnumerateArray());
        Assert.Equal("USD", item.GetProperty("currencyCode").GetString());
        Assert.Equal(10000m, item.GetProperty("outstandingPrincipal").GetDecimal());
        Assert.Equal(12000m, item.GetProperty("plannedInstallmentTotal").GetDecimal());
        Assert.False(item.TryGetProperty("id", out _));
        Assert.False(item.TryGetProperty("lenderName", out _));
        Assert.False(item.TryGetProperty("approvedLimit", out _));
        Assert.False(item.TryGetProperty("notes", out _));
        Assert.False(item.TryGetProperty("financialAccountCode", out _));
    }

    [Fact]
    public void Summary_rejects_more_than_ten_rows()
    {
        using var response = JsonDocument.Parse("""{"totalCount":11,"items":[{"code":"AA","facilityType":"Loan","currencyCode":"TRY","status":"Active","maturityDate":null,"drawnPrincipal":0,"repaidPrincipal":0,"outstandingPrincipal":0,"plannedInstallmentCount":0,"plannedInstallmentTotal":0},{"code":"AB","facilityType":"Loan","currencyCode":"TRY","status":"Active","maturityDate":null,"drawnPrincipal":0,"repaidPrincipal":0,"outstandingPrincipal":0,"plannedInstallmentCount":0,"plannedInstallmentTotal":0},{"code":"AC","facilityType":"Loan","currencyCode":"TRY","status":"Active","maturityDate":null,"drawnPrincipal":0,"repaidPrincipal":0,"outstandingPrincipal":0,"plannedInstallmentCount":0,"plannedInstallmentTotal":0},{"code":"AD","facilityType":"Loan","currencyCode":"TRY","status":"Active","maturityDate":null,"drawnPrincipal":0,"repaidPrincipal":0,"outstandingPrincipal":0,"plannedInstallmentCount":0,"plannedInstallmentTotal":0},{"code":"AE","facilityType":"Loan","currencyCode":"TRY","status":"Active","maturityDate":null,"drawnPrincipal":0,"repaidPrincipal":0,"outstandingPrincipal":0,"plannedInstallmentCount":0,"plannedInstallmentTotal":0},{"code":"AF","facilityType":"Loan","currencyCode":"TRY","status":"Active","maturityDate":null,"drawnPrincipal":0,"repaidPrincipal":0,"outstandingPrincipal":0,"plannedInstallmentCount":0,"plannedInstallmentTotal":0},{"code":"AG","facilityType":"Loan","currencyCode":"TRY","status":"Active","maturityDate":null,"drawnPrincipal":0,"repaidPrincipal":0,"outstandingPrincipal":0,"plannedInstallmentCount":0,"plannedInstallmentTotal":0},{"code":"AH","facilityType":"Loan","currencyCode":"TRY","status":"Active","maturityDate":null,"drawnPrincipal":0,"repaidPrincipal":0,"outstandingPrincipal":0,"plannedInstallmentCount":0,"plannedInstallmentTotal":0},{"code":"AI","facilityType":"Loan","currencyCode":"TRY","status":"Active","maturityDate":null,"drawnPrincipal":0,"repaidPrincipal":0,"outstandingPrincipal":0,"plannedInstallmentCount":0,"plannedInstallmentTotal":0},{"code":"AJ","facilityType":"Loan","currencyCode":"TRY","status":"Active","maturityDate":null,"drawnPrincipal":0,"repaidPrincipal":0,"outstandingPrincipal":0,"plannedInstallmentCount":0,"plannedInstallmentTotal":0},{"code":"AK","facilityType":"Loan","currencyCode":"TRY","status":"Active","maturityDate":null,"drawnPrincipal":0,"repaidPrincipal":0,"outstandingPrincipal":0,"plannedInstallmentCount":0,"plannedInstallmentTotal":0}]}""");
        Assert.Throws<JsonException>(() => ERPAssistantCreditFacilityTools.SummarizeFacilities(response.RootElement));
    }

    private sealed class RecordingPermissionAuthorizer(Guid tenantId) : IPlatformPermissionAuthorizer
    {
        public string? PermissionCode { get; private set; }
        public Task<bool> IsAllowedAsync(Guid requestedTenantId, Guid userId, string role, ResolvedPlatformPermission permission, CancellationToken cancellationToken = default)
        {
            PermissionCode = permission.Permission.Code;
            return Task.FromResult(requestedTenantId == tenantId && role == "TenantAdmin");
        }
    }
}
