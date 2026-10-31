using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace AIERP.Api.IntegrationTests;

public sealed class FinanceCreditFacilityIntegrationTests
{
    [Fact]
    public async Task Credit_facility_securities_are_tenant_scoped_validated_and_expiry_alerts_ignore_released_records()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var request = new CreditFacilitySecurityCreateRequest(CreditSecurityType.Guarantee, "TEM-001", "Banka A", "Nexora Demo",
            25000m, "TRY", 125m, today.AddDays(-5), today.AddDays(10), "Temsilî kayıt");
        using var created = await client.PostAsJsonAsync($"/api/finance/credit-facilities/{FacilityA}/securities", request);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);

        using var list = await client.GetAsync("/api/finance/credit-facilities/securities?expiryWithinDays=30");
        Assert.Equal(HttpStatusCode.OK, list.StatusCode);
        using var json = JsonDocument.Parse(await list.Content.ReadAsStringAsync());
        Assert.Equal(1, json.RootElement.GetProperty("expiringCount").GetInt32());
        var item = Assert.Single(json.RootElement.GetProperty("items").EnumerateArray());
        Assert.Equal("Expiring", item.GetProperty("alert").GetString());
        Assert.Equal("TEM-001", item.GetProperty("code").GetString());
        var securityId = item.GetProperty("id").GetGuid();

        var userA = Guid.Parse("11111111-aaaa-aaaa-aaaa-111111111111");
        var userB = Guid.Parse("22222222-bbbb-bbbb-bbbb-222222222222");
        client.DefaultRequestHeaders.Add("X-Test-User", userA.ToString());
        using var dismiss = await client.PostAsync($"/api/finance/credit-facilities/securities/{securityId}/alerts/Expiring/dismiss", null);
        Assert.Equal(HttpStatusCode.NoContent, dismiss.StatusCode);
        using var dismissedAlerts = await client.GetAsync("/api/finance/credit-facilities/securities/alerts?expiryWithinDays=30");
        using var dismissedJson = JsonDocument.Parse(await dismissedAlerts.Content.ReadAsStringAsync());
        Assert.Equal(0, dismissedJson.RootElement.GetProperty("expiringCount").GetInt32());
        Assert.Empty(dismissedJson.RootElement.GetProperty("items").EnumerateArray());
        using var duplicateDismiss = await client.PostAsync($"/api/finance/credit-facilities/securities/{securityId}/alerts/Expiring/dismiss", null);
        Assert.Equal(HttpStatusCode.NoContent, duplicateDismiss.StatusCode);

        using var otherUser = app.GetTestClient();
        otherUser.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        otherUser.DefaultRequestHeaders.Add("X-Test-User", userB.ToString());
        using var otherUserAlerts = await otherUser.GetAsync("/api/finance/credit-facilities/securities/alerts?expiryWithinDays=30");
        using var otherUserJson = JsonDocument.Parse(await otherUserAlerts.Content.ReadAsStringAsync());
        Assert.Equal(1, otherUserJson.RootElement.GetProperty("expiringCount").GetInt32());
        Assert.Single(otherUserJson.RootElement.GetProperty("items").EnumerateArray());
        using var otherTenant = app.GetTestClient();
        otherTenant.DefaultRequestHeaders.Add("X-Test-Tenant", TenantB.ToString());
        otherTenant.DefaultRequestHeaders.Add("X-Test-User", userA.ToString());
        using var crossTenantDismiss = await otherTenant.PostAsync($"/api/finance/credit-facilities/securities/{securityId}/alerts/Expiring/dismiss", null);
        Assert.Equal(HttpStatusCode.NotFound, crossTenantDismiss.StatusCode);
        using var invalidDismiss = await client.PostAsync($"/api/finance/credit-facilities/securities/{securityId}/alerts/invalid/dismiss", null);
        Assert.Equal(HttpStatusCode.BadRequest, invalidDismiss.StatusCode);

        await using (var expiryScope = app.Services.CreateAsyncScope())
        {
            var expiryDb = expiryScope.ServiceProvider.GetRequiredService<TenantDbContext>();
            var security = await expiryDb.CreditFacilitySecurities.SingleAsync(x => x.TenantId == TenantA && x.Id == securityId);
            security.ExpiryDate = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(-1);
            await expiryDb.SaveChangesAsync();
        }
        using var transitionedAlerts = await client.GetAsync("/api/finance/credit-facilities/securities/alerts?expiryWithinDays=30");
        using var transitionedJson = JsonDocument.Parse(await transitionedAlerts.Content.ReadAsStringAsync());
        Assert.Equal(1, transitionedJson.RootElement.GetProperty("expiredCount").GetInt32());
        Assert.Equal("Expired", Assert.Single(transitionedJson.RootElement.GetProperty("items").EnumerateArray()).GetProperty("alert").GetString());

        using var exposure = await client.GetAsync("/api/finance/credit-facilities/exposure-summary");
        Assert.Equal(HttpStatusCode.OK, exposure.StatusCode);
        using var exposureJson = JsonDocument.Parse(await exposure.Content.ReadAsStringAsync());
        var exposureCurrency = Assert.Single(exposureJson.RootElement.GetProperty("currencies").EnumerateArray());
        Assert.Equal("TRY", exposureCurrency.GetProperty("currencyCode").GetString());
        Assert.Equal(25000m, exposureCurrency.GetProperty("activeGuarantees").GetDecimal());
        Assert.Equal(0m, exposureCurrency.GetProperty("calledAmount").GetDecimal());
        var exposureFacility = Assert.Single(exposureJson.RootElement.GetProperty("facilities").EnumerateArray());
        Assert.Equal(25000m, exposureFacility.GetProperty("activeGuarantees").GetDecimal());

        using var clientB = app.GetTestClient();
        clientB.DefaultRequestHeaders.Add("X-Test-Tenant", TenantB.ToString());
        using var foreignList = await clientB.GetAsync("/api/finance/credit-facilities/securities");
        using var foreignJson = JsonDocument.Parse(await foreignList.Content.ReadAsStringAsync());
        Assert.Empty(foreignJson.RootElement.GetProperty("items").EnumerateArray());
        using var foreignExposure = await clientB.GetAsync("/api/finance/credit-facilities/exposure-summary");
        using var foreignExposureJson = JsonDocument.Parse(await foreignExposure.Content.ReadAsStringAsync());
        var foreignCurrency = Assert.Single(foreignExposureJson.RootElement.GetProperty("currencies").EnumerateArray());
        Assert.Equal(0m, foreignCurrency.GetProperty("activeGuarantees").GetDecimal());
        Assert.Equal(0m, foreignCurrency.GetProperty("activeCollateral").GetDecimal());

        using var released = await client.PutAsJsonAsync($"/api/finance/credit-facilities/{FacilityA}/securities/{securityId}/status",
            new CreditFacilitySecurityStatusRequest("Released"));
        Assert.Equal(HttpStatusCode.NoContent, released.StatusCode);
        using var afterRelease = await client.GetAsync("/api/finance/credit-facilities/securities?expiryWithinDays=30");
        using var afterJson = JsonDocument.Parse(await afterRelease.Content.ReadAsStringAsync());
        Assert.Equal(0, afterJson.RootElement.GetProperty("expiringCount").GetInt32());
        using var afterReleaseExposure = await client.GetAsync("/api/finance/credit-facilities/exposure-summary");
        using var afterReleaseExposureJson = JsonDocument.Parse(await afterReleaseExposure.Content.ReadAsStringAsync());
        Assert.Equal(0m, Assert.Single(afterReleaseExposureJson.RootElement.GetProperty("currencies").EnumerateArray())
            .GetProperty("activeGuarantees").GetDecimal());

        using var calledCreated = await client.PostAsJsonAsync($"/api/finance/credit-facilities/{FacilityA}/securities",
            request with { Type = CreditSecurityType.Collateral, Code = "TEM-002" });
        Assert.Equal(HttpStatusCode.Created, calledCreated.StatusCode);
        using var calledJson = JsonDocument.Parse(await calledCreated.Content.ReadAsStringAsync());
        var calledId = calledJson.RootElement.GetProperty("id").GetGuid();
        using var called = await client.PutAsJsonAsync($"/api/finance/credit-facilities/{FacilityA}/securities/{calledId}/status",
            new CreditFacilitySecurityStatusRequest("Called"));
        Assert.Equal(HttpStatusCode.NoContent, called.StatusCode);
        using var calledExposure = await client.GetAsync("/api/finance/credit-facilities/exposure-summary");
        using var calledExposureJson = JsonDocument.Parse(await calledExposure.Content.ReadAsStringAsync());
        var calledCurrency = Assert.Single(calledExposureJson.RootElement.GetProperty("currencies").EnumerateArray());
        Assert.Equal(25000m, calledCurrency.GetProperty("calledAmount").GetDecimal());
        Assert.Equal(0m, calledCurrency.GetProperty("activeCollateral").GetDecimal());
    }

    [Fact]
    public async Task Security_alert_summary_is_tenant_scoped_bounded_and_excludes_released_securities()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        var today = DateOnly.FromDateTime(DateTime.UtcNow.AddHours(3));
        var request = new CreditFacilitySecurityCreateRequest(CreditSecurityType.Guarantee, "ALERT-OLD", "Banka A", "Nexora Demo",
            1000m, "TRY", 0m, today.AddDays(-30), today.AddDays(-1), null);
        using var expiredCreate = await client.PostAsJsonAsync($"/api/finance/credit-facilities/{FacilityA}/securities", request);
        Assert.Equal(HttpStatusCode.Created, expiredCreate.StatusCode);
        using var expiringCreate = await client.PostAsJsonAsync($"/api/finance/credit-facilities/{FacilityA}/securities",
            request with { Code = "ALERT-SOON", ExpiryDate = today.AddDays(5) });
        Assert.Equal(HttpStatusCode.Created, expiringCreate.StatusCode);
        using var releasedCreate = await client.PostAsJsonAsync($"/api/finance/credit-facilities/{FacilityA}/securities",
            request with { Code = "ALERT-RELEASED", ExpiryDate = today.AddDays(2) });
        Assert.Equal(HttpStatusCode.Created, releasedCreate.StatusCode);
        using var releasedJson = JsonDocument.Parse(await releasedCreate.Content.ReadAsStringAsync());
        using var released = await client.PutAsJsonAsync(
            $"/api/finance/credit-facilities/{FacilityA}/securities/{releasedJson.RootElement.GetProperty("id").GetGuid()}/status",
            new CreditFacilitySecurityStatusRequest("Released"));
        Assert.Equal(HttpStatusCode.NoContent, released.StatusCode);

        using var summary = await client.GetAsync("/api/finance/credit-facilities/securities/alerts?expiryWithinDays=30");
        Assert.Equal(HttpStatusCode.OK, summary.StatusCode);
        using var summaryJson = JsonDocument.Parse(await summary.Content.ReadAsStringAsync());
        Assert.Equal(1, summaryJson.RootElement.GetProperty("expiredCount").GetInt32());
        Assert.Equal(1, summaryJson.RootElement.GetProperty("expiringCount").GetInt32());
        var items = summaryJson.RootElement.GetProperty("items").EnumerateArray().ToArray();
        Assert.Equal(2, items.Length);
        Assert.Equal("ALERT-OLD", items[0].GetProperty("code").GetString());
        Assert.Equal("Expired", items[0].GetProperty("alert").GetString());
        Assert.Equal("ALERT-SOON", items[1].GetProperty("code").GetString());
        Assert.Equal("Expiring", items[1].GetProperty("alert").GetString());

        using var invalidRange = await client.GetAsync("/api/finance/credit-facilities/securities/alerts?expiryWithinDays=366");
        Assert.Equal(HttpStatusCode.BadRequest, invalidRange.StatusCode);
        using var clientB = app.GetTestClient();
        clientB.DefaultRequestHeaders.Add("X-Test-Tenant", TenantB.ToString());
        using var foreignSummary = await clientB.GetAsync("/api/finance/credit-facilities/securities/alerts");
        using var foreignJson = JsonDocument.Parse(await foreignSummary.Content.ReadAsStringAsync());
        Assert.Equal(0, foreignJson.RootElement.GetProperty("expiredCount").GetInt32());
        Assert.Equal(0, foreignJson.RootElement.GetProperty("expiringCount").GetInt32());
        Assert.Empty(foreignJson.RootElement.GetProperty("items").EnumerateArray());
    }

    [Theory]
    [InlineData(2026, 1, 2025, 12)]
    [InlineData(2026, 3, 2026, 2)]
    [InlineData(2024, 3, 2024, 2)]
    public void Automatic_interest_worker_targets_previous_closed_month(int year, int month, int expectedYear, int expectedMonth)
    {
        var period = CreditFacilityInterestAccrualWorker.PreviousClosedMonth(new DateOnly(year, month, 1));

        Assert.Equal(new DateOnly(expectedYear, expectedMonth, 1), period);
    }

    private static readonly Guid TenantA = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid TenantB = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid FacilityA = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private static readonly Guid AccountA = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    private static readonly Guid AccountB = Guid.Parse("cccccccc-cccc-cccc-cccc-cccccccccccc");
    private static readonly Guid CashLedgerA = Guid.Parse("dddddddd-dddd-dddd-dddd-dddddddddddd");
    private static readonly Guid PrincipalLedgerA = Guid.Parse("eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee");
    private static readonly Guid InterestLedgerA = Guid.Parse("ffffffff-ffff-ffff-ffff-ffffffffffff");
    private static readonly Guid FeeLedgerA = Guid.Parse("abababab-abab-abab-abab-abababababab");
    private static readonly Guid AccruedInterestLedgerA = Guid.Parse("cdcdcdcd-cdcd-cdcd-cdcd-cdcdcdcdcdcd");

    [Fact]
    public async Task Facility_cannot_close_with_outstanding_principal_after_schedules_are_cancelled()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        var scheduleIds = await GetScheduleIdsAsync(app, TenantA, FacilityA);
        foreach (var scheduleId in scheduleIds)
        {
            using var cancelled = await client.PutAsJsonAsync($"/api/finance/credit-facilities/schedule/{scheduleId}/status", new { status = "Cancelled" });
            Assert.Equal(HttpStatusCode.NoContent, cancelled.StatusCode);
        }
        using var drawdown = await client.PostAsJsonAsync($"/api/finance/credit-facilities/{FacilityA}/drawdowns", new
        {
            requestId = Guid.NewGuid(), financialAccountId = AccountA, transactionDate = "2026-01-01", principalAmount = 100m, notes = "Outstanding balance"
        });
        Assert.Equal(HttpStatusCode.Created, drawdown.StatusCode);

        using var close = await client.PutAsJsonAsync($"/api/finance/credit-facilities/{FacilityA}/status", new { status = "Closed" });
        Assert.Equal(HttpStatusCode.Conflict, close.StatusCode);
        using var list = await client.GetAsync("/api/finance/credit-facilities/");
        using var json = JsonDocument.Parse(await list.Content.ReadAsStringAsync());
        Assert.Equal("Active", json.RootElement[0].GetProperty("status").GetString());
    }

    [Fact]
    public async Task Facilities_are_tenant_isolated_admin_managed_and_planned_repayments_enter_cash_forecast()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/finance/credit-facilities/")).StatusCode);

        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        client.DefaultRequestHeaders.Add("X-Test-Role", "TenantUser");
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync("/api/finance/credit-facilities/", new
        {
            code = "NEW-1", lenderName = "Banka", facilityType = "Loan", currencyCode = "TRY", approvedLimit = 10000m,
            startDate = "2026-01-01", maturityDate = "2026-12-31", annualInterestRatePercent = 30m, notes = (string?)null
        })).StatusCode);

        client.DefaultRequestHeaders.Remove("X-Test-Role");
        using var listed = await client.GetAsync("/api/finance/credit-facilities/");
        Assert.True(listed.IsSuccessStatusCode, await listed.Content.ReadAsStringAsync());
        using var listJson = JsonDocument.Parse(await listed.Content.ReadAsStringAsync());
        Assert.Equal(1, listJson.RootElement.GetArrayLength());
        Assert.Equal("A-LOAN", listJson.RootElement[0].GetProperty("code").GetString());

        var drawdownRequestId = Guid.NewGuid();
        await using (var missingMappingScope = app.Services.CreateAsyncScope())
        {
            var mappingDb = missingMappingScope.ServiceProvider.GetRequiredService<TenantDbContext>();
            mappingDb.LedgerAccountMappings.Remove(await mappingDb.LedgerAccountMappings.SingleAsync(x => x.TenantId == TenantA && x.MappingKey == LedgerMappingKeys.CreditFacilityPrincipal));
            await mappingDb.SaveChangesAsync();
        }
        using (var missingMapping = await client.PostAsJsonAsync($"/api/finance/credit-facilities/{FacilityA}/drawdowns", new
        {
            requestId = drawdownRequestId, financialAccountId = AccountA, transactionDate = "2026-01-01", principalAmount = 100m, notes = "First utilization"
        })) Assert.Equal(HttpStatusCode.Conflict, missingMapping.StatusCode);
        using (var foreignAccount = await client.PostAsJsonAsync($"/api/finance/credit-facilities/{FacilityA}/drawdowns", new
        {
            requestId = Guid.NewGuid(), financialAccountId = AccountB, transactionDate = "2026-01-01", principalAmount = 100m, notes = "Cross tenant"
        })) Assert.Equal(HttpStatusCode.NotFound, foreignAccount.StatusCode);
        await using (var restoreMappingScope = app.Services.CreateAsyncScope())
        {
            var mappingDb = restoreMappingScope.ServiceProvider.GetRequiredService<TenantDbContext>();
            mappingDb.LedgerAccountMappings.Add(new LedgerAccountMapping { TenantId = TenantA, MappingKey = LedgerMappingKeys.CreditFacilityPrincipal, AccountId = PrincipalLedgerA });
            await mappingDb.SaveChangesAsync();
        }
        using var drawdown = await client.PostAsJsonAsync($"/api/finance/credit-facilities/{FacilityA}/drawdowns", new
        {
            requestId = drawdownRequestId, financialAccountId = AccountA, transactionDate = "2026-01-01", principalAmount = 100m, notes = "First utilization"
        });
        Assert.Equal(HttpStatusCode.Created, drawdown.StatusCode);
        using var drawdownRetry = await client.PostAsJsonAsync($"/api/finance/credit-facilities/{FacilityA}/drawdowns", new
        {
            requestId = drawdownRequestId, financialAccountId = AccountA, transactionDate = "2026-01-01", principalAmount = 100m, notes = "First utilization"
        });
        Assert.Equal(HttpStatusCode.OK, drawdownRetry.StatusCode);
        using var drawdownJson = JsonDocument.Parse(await drawdown.Content.ReadAsStringAsync());
        using var drawdownRetryJson = JsonDocument.Parse(await drawdownRetry.Content.ReadAsStringAsync());
        Assert.Equal(drawdownJson.RootElement.GetProperty("journalEntryId").GetGuid(), drawdownRetryJson.RootElement.GetProperty("journalEntryId").GetGuid());
        using var overLimit = await client.PostAsJsonAsync($"/api/finance/credit-facilities/{FacilityA}/drawdowns", new
        {
            requestId = Guid.NewGuid(), financialAccountId = AccountA, transactionDate = "2026-01-01", principalAmount = 100001m, notes = (string?)null
        });
        Assert.Equal(HttpStatusCode.Conflict, overLimit.StatusCode);

        using var addedSchedule = await client.PostAsJsonAsync($"/api/finance/credit-facilities/{FacilityA}/schedule", new
        {
            dueDate = "2026-02-20", principalAmount = 20m, interestAmount = 2m, feeAmount = 1m, notes = "Additional installment"
        });
        Assert.Equal(HttpStatusCode.Created, addedSchedule.StatusCode);

        using var forecast = await client.GetAsync("/api/finance/cash-flow/forecast?from=2026-01-01&months=2");
        Assert.True(forecast.IsSuccessStatusCode, await forecast.Content.ReadAsStringAsync());
        using var forecastJson = JsonDocument.Parse(await forecast.Content.ReadAsStringAsync());
        var months = forecastJson.RootElement.GetProperty("currencies")[0].GetProperty("months");
        Assert.Equal(120m, months[0].GetProperty("creditFacilityPayments").GetDecimal());
        Assert.Equal(15m, months[0].GetProperty("overdueCreditFacilityPayments").GetDecimal());
        Assert.Equal(100m, months[0].GetProperty("postedMovements").GetDecimal());
        Assert.Equal(1, months[0].GetProperty("postedMovementCount").GetInt32());
        Assert.Equal(113m, months[1].GetProperty("creditFacilityPayments").GetDecimal());

        var overdueSchedule = listJson.RootElement[0].GetProperty("schedule").EnumerateArray()
            .Single(x => x.GetProperty("dueDate").GetString() == "2025-12-15");
        using var markPaid = await client.PutAsJsonAsync($"/api/finance/credit-facilities/schedule/{overdueSchedule.GetProperty("id").GetGuid()}/status",
            new { status = "Paid", paidDate = "2025-12-20" });
        Assert.Equal(HttpStatusCode.Conflict, markPaid.StatusCode);
        await using (var missingInterestScope = app.Services.CreateAsyncScope())
        {
            var mappingDb = missingInterestScope.ServiceProvider.GetRequiredService<TenantDbContext>();
            mappingDb.LedgerAccountMappings.Remove(await mappingDb.LedgerAccountMappings.SingleAsync(x => x.TenantId == TenantA && x.MappingKey == LedgerMappingKeys.CreditFacilityInterestExpense));
            await mappingDb.SaveChangesAsync();
        }
        using (var missingInterestMapping = await client.PostAsJsonAsync($"/api/finance/credit-facilities/{FacilityA}/repayments", new
        {
            requestId = Guid.NewGuid(), financialAccountId = AccountA, creditFacilityScheduleId = overdueSchedule.GetProperty("id").GetGuid(),
            transactionDate = "2025-12-20", principalAmount = 10m, interestAmount = 5m, feeAmount = 0m, notes = "Scheduled payment"
        })) Assert.Equal(HttpStatusCode.Conflict, missingInterestMapping.StatusCode);
        await using (var restoreInterestScope = app.Services.CreateAsyncScope())
        {
            var mappingDb = restoreInterestScope.ServiceProvider.GetRequiredService<TenantDbContext>();
            mappingDb.LedgerAccountMappings.Add(new LedgerAccountMapping { TenantId = TenantA, MappingKey = LedgerMappingKeys.CreditFacilityInterestExpense, AccountId = InterestLedgerA });
            await mappingDb.SaveChangesAsync();
        }
        using var repayment = await client.PostAsJsonAsync($"/api/finance/credit-facilities/{FacilityA}/repayments", new
        {
            requestId = Guid.NewGuid(), financialAccountId = AccountA, creditFacilityScheduleId = overdueSchedule.GetProperty("id").GetGuid(),
            transactionDate = "2025-12-20", principalAmount = 10m, interestAmount = 5m, feeAmount = 0m, notes = "Scheduled payment"
        });
        Assert.Equal(HttpStatusCode.Created, repayment.StatusCode);
        using var forecastAfterPayment = await client.GetAsync("/api/finance/cash-flow/forecast?from=2026-01-01&months=2");
        using var forecastAfterPaymentJson = JsonDocument.Parse(await forecastAfterPayment.Content.ReadAsStringAsync());
        Assert.Equal(105m, forecastAfterPaymentJson.RootElement.GetProperty("currencies")[0].GetProperty("months")[0].GetProperty("creditFacilityPayments").GetDecimal());
        Assert.Equal(0m, forecastAfterPaymentJson.RootElement.GetProperty("currencies")[0].GetProperty("months")[0].GetProperty("overdueCreditFacilityPayments").GetDecimal());
        using var refreshed = await client.GetAsync("/api/finance/credit-facilities/");
        using var refreshedJson = JsonDocument.Parse(await refreshed.Content.ReadAsStringAsync());
        Assert.Equal(90m, refreshedJson.RootElement[0].GetProperty("outstandingPrincipal").GetDecimal());
        Assert.Equal(2, refreshedJson.RootElement[0].GetProperty("movements").GetArrayLength());
        await using var verificationScope = app.Services.CreateAsyncScope();
        var verificationDb = verificationScope.ServiceProvider.GetRequiredService<TenantDbContext>();
        var posted = await verificationDb.FinancialAccountTransactions.Where(x => x.TenantId == TenantA && x.FinancialAccountId == AccountA).OrderBy(x => x.TransactionDate).ToListAsync();
        Assert.Equal(2, posted.Count);
        var drawdownEntry = posted.Single(x => x.Direction == FinancialDirection.Inflow);
        Assert.Equal(100m, drawdownEntry.Amount);
        Assert.Equal(CashFlowCategory.Financing, drawdownEntry.CashFlowCategory);
        var repaymentEntry = posted.Single(x => x.Direction == FinancialDirection.Outflow);
        Assert.Equal(15m, repaymentEntry.Amount);
        Assert.Equal(CashFlowCategory.Financing, repaymentEntry.CashFlowCategory);
        var drawdownJournalId = drawdownJson.RootElement.GetProperty("journalEntryId").GetGuid();
        var drawdownJournal = await verificationDb.JournalEntries.Include(x => x.Lines).SingleAsync(x => x.TenantId == TenantA && x.Id == drawdownJournalId);
        Assert.Equal("CreditFacilityMovement", drawdownJournal.SourceType);
        Assert.Equal(100m, drawdownJournal.Lines.Sum(x => x.Debit));
        Assert.Equal(100m, drawdownJournal.Lines.Sum(x => x.Credit));
        Assert.Contains(drawdownJournal.Lines, x => x.AccountId == CashLedgerA && x.Debit == 100m);
        Assert.Contains(drawdownJournal.Lines, x => x.AccountId == PrincipalLedgerA && x.Credit == 100m);
        using var repaymentJson = JsonDocument.Parse(await repayment.Content.ReadAsStringAsync());
        var repaymentJournal = await verificationDb.JournalEntries.Include(x => x.Lines)
            .SingleAsync(x => x.TenantId == TenantA && x.Id == repaymentJson.RootElement.GetProperty("journalEntryId").GetGuid());
        Assert.Equal(15m, repaymentJournal.Lines.Sum(x => x.Debit));
        Assert.Equal(15m, repaymentJournal.Lines.Sum(x => x.Credit));
        Assert.Contains(repaymentJournal.Lines, x => x.AccountId == PrincipalLedgerA && x.Debit == 10m);
        Assert.Contains(repaymentJournal.Lines, x => x.AccountId == InterestLedgerA && x.Debit == 5m);
        Assert.Contains(repaymentJournal.Lines, x => x.AccountId == CashLedgerA && x.Credit == 15m);

        using var repaymentResponse = await client.PostAsJsonAsync($"/api/finance/credit-facilities/{FacilityA}/repayments", new
        {
            requestId = Guid.NewGuid(), financialAccountId = AccountA, creditFacilityScheduleId = overdueSchedule.GetProperty("id").GetGuid(),
            transactionDate = "2025-12-20", principalAmount = 10m, interestAmount = 5m, feeAmount = 0m, notes = "Scheduled payment"
        });
        Assert.Equal(HttpStatusCode.Conflict, repaymentResponse.StatusCode);

        using var scheduleBeforeReversal = JsonDocument.Parse(await refreshed.Content.ReadAsStringAsync());
        var repaymentMovement = scheduleBeforeReversal.RootElement[0].GetProperty("movements").EnumerateArray()
            .Single(x => x.GetProperty("type").GetString() == "Repayment");
        var repaymentMovementId = repaymentMovement.GetProperty("id").GetGuid();
        var reversalRequestId = Guid.NewGuid();
        using var reversal = await client.PostAsJsonAsync($"/api/finance/credit-facilities/{FacilityA}/movements/{repaymentMovementId}/reversals", new
        {
            requestId = reversalRequestId, transactionDate = "2026-03-01", notes = "Payment correction"
        });
        Assert.Equal(HttpStatusCode.Created, reversal.StatusCode);
        using var reversalJson = JsonDocument.Parse(await reversal.Content.ReadAsStringAsync());
        var reversalJournal = await verificationDb.JournalEntries.Include(x => x.Lines)
            .SingleAsync(x => x.TenantId == TenantA && x.Id == reversalJson.RootElement.GetProperty("journalEntryId").GetGuid());
        Assert.Equal(15m, reversalJournal.Lines.Sum(x => x.Debit));
        Assert.Equal(15m, reversalJournal.Lines.Sum(x => x.Credit));
        Assert.Contains(reversalJournal.Lines, x => x.AccountId == PrincipalLedgerA && x.Credit == 10m);
        Assert.Contains(reversalJournal.Lines, x => x.AccountId == InterestLedgerA && x.Credit == 5m);
        Assert.Contains(reversalJournal.Lines, x => x.AccountId == CashLedgerA && x.Debit == 15m);
        using var reversalRetry = await client.PostAsJsonAsync($"/api/finance/credit-facilities/{FacilityA}/movements/{repaymentMovementId}/reversals", new
        {
            requestId = reversalRequestId, transactionDate = "2026-03-01", notes = "Payment correction"
        });
        Assert.Equal(HttpStatusCode.OK, reversalRetry.StatusCode);
        using var reversalRetryJson = JsonDocument.Parse(await reversalRetry.Content.ReadAsStringAsync());
        Assert.Equal(reversalJson.RootElement.GetProperty("journalEntryId").GetGuid(), reversalRetryJson.RootElement.GetProperty("journalEntryId").GetGuid());
        using var afterReversal = await client.GetAsync("/api/finance/credit-facilities/");
        using var afterReversalJson = JsonDocument.Parse(await afterReversal.Content.ReadAsStringAsync());
        Assert.Equal(100m, afterReversalJson.RootElement[0].GetProperty("outstandingPrincipal").GetDecimal());
        var reopenedSchedule = afterReversalJson.RootElement[0].GetProperty("schedule").EnumerateArray()
            .Single(x => x.GetProperty("id").GetGuid() == overdueSchedule.GetProperty("id").GetGuid());
        Assert.Equal("Planned", reopenedSchedule.GetProperty("status").GetString());
        var movementHistory = afterReversalJson.RootElement[0].GetProperty("movements").EnumerateArray().ToArray();
        Assert.Equal(3, movementHistory.Length);
        Assert.All(movementHistory, x => Assert.False(x.GetProperty("journalEntryId").ValueKind == JsonValueKind.Null));
        Assert.Contains(movementHistory, x => x.GetProperty("type").GetString() == "Reversal" &&
            x.GetProperty("reversesMovementId").GetGuid() == repaymentMovementId);
        Assert.Contains(movementHistory, x => x.GetProperty("id").GetGuid() == repaymentMovementId && x.GetProperty("isReversed").GetBoolean());

        using var retrySchedulePayment = await client.PostAsJsonAsync($"/api/finance/credit-facilities/{FacilityA}/repayments", new
        {
            requestId = Guid.NewGuid(), financialAccountId = AccountA, creditFacilityScheduleId = overdueSchedule.GetProperty("id").GetGuid(),
            transactionDate = "2026-03-02", principalAmount = 10m, interestAmount = 5m, feeAmount = 0m, notes = "Repayment after reversal"
        });
        Assert.Equal(HttpStatusCode.Created, retrySchedulePayment.StatusCode);
        var drawdownMovement = movementHistory.Single(x => x.GetProperty("type").GetString() == "Drawdown");
        using var prematureDrawdownReversal = await client.PostAsJsonAsync($"/api/finance/credit-facilities/{FacilityA}/movements/{drawdownMovement.GetProperty("id").GetGuid()}/reversals", new
        {
            requestId = Guid.NewGuid(), transactionDate = "2026-03-03", notes = (string?)null
        });
        Assert.Equal(HttpStatusCode.Conflict, prematureDrawdownReversal.StatusCode);

        using var reverseSecondPayment = await client.GetAsync("/api/finance/credit-facilities/");
        using var reverseSecondPaymentJson = JsonDocument.Parse(await reverseSecondPayment.Content.ReadAsStringAsync());
        var secondPaymentMovementId = reverseSecondPaymentJson.RootElement[0].GetProperty("movements").EnumerateArray()
            .Single(x => x.GetProperty("type").GetString() == "Repayment" && x.GetProperty("id").GetGuid() != repaymentMovementId).GetProperty("id").GetGuid();
        using var secondPaymentReversal = await client.PostAsJsonAsync($"/api/finance/credit-facilities/{FacilityA}/movements/{secondPaymentMovementId}/reversals", new
        {
            requestId = Guid.NewGuid(), transactionDate = "2026-03-04", notes = "Payment correction"
        });
        Assert.Equal(HttpStatusCode.Created, secondPaymentReversal.StatusCode);
        using var drawdownReversal = await client.PostAsJsonAsync($"/api/finance/credit-facilities/{FacilityA}/movements/{drawdownMovement.GetProperty("id").GetGuid()}/reversals", new
        {
            requestId = Guid.NewGuid(), transactionDate = "2026-03-05", notes = "Drawdown correction"
        });
        Assert.Equal(HttpStatusCode.Created, drawdownReversal.StatusCode);
        using var finalState = await client.GetAsync("/api/finance/credit-facilities/");
        using var finalStateJson = JsonDocument.Parse(await finalState.Content.ReadAsStringAsync());
        Assert.Equal(0m, finalStateJson.RootElement[0].GetProperty("totalDrawdown").GetDecimal());
        Assert.Equal(0m, finalStateJson.RootElement[0].GetProperty("principalRepaid").GetDecimal());
        Assert.Equal(0m, finalStateJson.RootElement[0].GetProperty("outstandingPrincipal").GetDecimal());
        var allMovements = finalStateJson.RootElement[0].GetProperty("movements").EnumerateArray().ToArray();
        Assert.Equal(6, allMovements.Length);
        await using var finalScope = app.Services.CreateAsyncScope();
        var finalDb = finalScope.ServiceProvider.GetRequiredService<TenantDbContext>();
        var reversals = await finalDb.CreditFacilityMovements.Where(x => x.TenantId == TenantA && x.Type == CreditFacilityMovementType.Reversal).ToListAsync();
        Assert.Equal(3, reversals.Count);
        var originalFinancialMovementIds = reversals.Select(x => x.ReversesMovementId!.Value).ToArray();
        var reversedTransactions = await finalDb.FinancialAccountTransactions.Where(x => x.TenantId == TenantA && x.ReversalOfId != null).ToListAsync();
        Assert.Equal(3, reversedTransactions.Count);
        Assert.All(reversals, x => Assert.Contains(x.ReversesMovementId!.Value, finalDb.CreditFacilityMovements.Where(m => m.TenantId == TenantA).Select(m => m.Id).ToArray()));
        Assert.Equal(3, originalFinancialMovementIds.Distinct().Count());

        client.DefaultRequestHeaders.Remove("X-Test-Tenant"); client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantB.ToString());
        using var otherTenant = await client.GetAsync("/api/finance/credit-facilities/");
        Assert.True(otherTenant.IsSuccessStatusCode, await otherTenant.Content.ReadAsStringAsync());
        using var otherJson = JsonDocument.Parse(await otherTenant.Content.ReadAsStringAsync());
        Assert.Equal(1, otherJson.RootElement.GetArrayLength());
        Assert.Equal("B-LOAN", otherJson.RootElement[0].GetProperty("code").GetString());
    }

    [Fact]
    public async Task Interest_accrual_preview_uses_actual_365_daily_balance_reversals_and_tenant_scope()
    {
        await using var app = await StartApplicationAsync();
        var drawdownTransaction = new FinancialAccountTransaction { TenantId = TenantA, FinancialAccountId = AccountA,
            CurrencyCode = "TRY", TransactionDate = new DateOnly(2026, 1, 1), Direction = FinancialDirection.Inflow,
            CashFlowCategory = CashFlowCategory.Financing, Amount = 1000m, Description = "Test drawdown" };
        var repaymentTransaction = new FinancialAccountTransaction { TenantId = TenantA, FinancialAccountId = AccountA,
            CurrencyCode = "TRY", TransactionDate = new DateOnly(2026, 1, 2), Direction = FinancialDirection.Outflow,
            CashFlowCategory = CashFlowCategory.Financing, Amount = 365m, Description = "Test repayment" };
        var reversalTransaction = new FinancialAccountTransaction { TenantId = TenantA, FinancialAccountId = AccountA,
            CurrencyCode = "TRY", TransactionDate = new DateOnly(2026, 1, 4), Direction = FinancialDirection.Inflow,
            CashFlowCategory = CashFlowCategory.Financing, Amount = 365m, Description = "Test reversal", ReversalOf = repaymentTransaction };
        var repayment = new CreditFacilityMovement { TenantId = TenantA, CreditFacilityId = FacilityA, Type = CreditFacilityMovementType.Repayment,
            TransactionDate = new DateOnly(2026, 1, 2), PrincipalAmount = 365m, RequestId = Guid.NewGuid(), FinancialAccountTransaction = repaymentTransaction };
        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            db.CreditFacilityMovements.AddRange(
                new CreditFacilityMovement { TenantId = TenantA, CreditFacilityId = FacilityA, Type = CreditFacilityMovementType.Drawdown,
                    TransactionDate = new DateOnly(2026, 1, 1), PrincipalAmount = 1000m, RequestId = Guid.NewGuid(), FinancialAccountTransaction = drawdownTransaction },
                repayment,
                new CreditFacilityMovement { TenantId = TenantA, CreditFacilityId = FacilityA, Type = CreditFacilityMovementType.Reversal,
                    TransactionDate = new DateOnly(2026, 1, 4), PrincipalAmount = 365m, RequestId = Guid.NewGuid(),
                    ReversesMovement = repayment, FinancialAccountTransaction = reversalTransaction });
            await db.SaveChangesAsync();
        }

        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        using var preview = await client.GetAsync($"/api/finance/credit-facilities/{FacilityA}/interest-accrual-preview?from=2026-01-01&to=2026-01-04");
        Assert.Equal(HttpStatusCode.OK, preview.StatusCode);
        using var json = JsonDocument.Parse(await preview.Content.ReadAsStringAsync());
        Assert.Equal("Actual/365", json.RootElement.GetProperty("dayCountConvention").GetString());
        Assert.Equal(3.27m, json.RootElement.GetProperty("totalAccruedInterest").GetDecimal());
        Assert.False(json.RootElement.GetProperty("accountingPosted").GetBoolean());

        await using (var mappingScope = app.Services.CreateAsyncScope())
        {
            var db = mappingScope.ServiceProvider.GetRequiredService<TenantDbContext>();
            db.LedgerAccounts.Add(new LedgerAccount { Id = AccruedInterestLedgerA, TenantId = TenantA, Code = "381", Name = "Accrued interest payable", StatementSection = LedgerAccountStatementSection.Liability });
            db.LedgerAccountMappings.Add(new LedgerAccountMapping { TenantId = TenantA, MappingKey = LedgerMappingKeys.CreditFacilityAccruedInterest, AccountId = AccruedInterestLedgerA });
            await db.SaveChangesAsync();
        }
        using var posted = await client.PostAsync($"/api/finance/credit-facilities/{FacilityA}/interest-accruals/2026/1", null);
        Assert.Equal(HttpStatusCode.Created, posted.StatusCode);
        using var postedJson = JsonDocument.Parse(await posted.Content.ReadAsStringAsync());
        Assert.Equal(30.27m, postedJson.RootElement.GetProperty("accruedInterest").GetDecimal());
        using var replayed = await client.PostAsync($"/api/finance/credit-facilities/{FacilityA}/interest-accruals/2026/1", null);
        Assert.Equal(HttpStatusCode.OK, replayed.StatusCode);
        using var replayJson = JsonDocument.Parse(await replayed.Content.ReadAsStringAsync());
        Assert.True(replayJson.RootElement.GetProperty("replayed").GetBoolean());
        await using (var journalScope = app.Services.CreateAsyncScope())
        {
            var db = journalScope.ServiceProvider.GetRequiredService<TenantDbContext>();
            var journals = await db.JournalEntries.Include(x => x.Lines).Where(x => x.TenantId == TenantA && x.SourceType == "CreditFacilityInterestAccrual").ToListAsync();
            var journal = Assert.Single(journals);
            Assert.Equal(30.27m, journal.Lines.Sum(x => x.Debit));
            Assert.Equal(30.27m, journal.Lines.Sum(x => x.Credit));
            Assert.Contains(journal.Lines, x => x.AccountId == InterestLedgerA && x.Debit == 30.27m);
            Assert.Contains(journal.Lines, x => x.AccountId == AccruedInterestLedgerA && x.Credit == 30.27m);
        }

        using var foreignClient = app.GetTestClient();
        foreignClient.DefaultRequestHeaders.Add("X-Test-Tenant", TenantB.ToString());
        using var foreign = await foreignClient.GetAsync($"/api/finance/credit-facilities/{FacilityA}/interest-accrual-preview?from=2026-01-01&to=2026-01-04");
        Assert.Equal(HttpStatusCode.NotFound, foreign.StatusCode);
    }

    [Fact]
    public async Task Assistant_credit_summary_is_tenant_scoped_and_excludes_sensitive_facility_fields()
    {
        await using var app = await StartApplicationAsync();
        using var clientA = app.GetTestClient();
        using var unauthorized = await clientA.GetAsync("/api/finance/credit-facilities/assistant-summary?term=LOAN");
        Assert.Equal(HttpStatusCode.Unauthorized, unauthorized.StatusCode);

        clientA.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        using var responseA = await clientA.GetAsync("/api/finance/credit-facilities/assistant-summary?term=LOAN");
        Assert.True(responseA.IsSuccessStatusCode, await responseA.Content.ReadAsStringAsync());
        using var jsonA = JsonDocument.Parse(await responseA.Content.ReadAsStringAsync());
        var itemA = Assert.Single(jsonA.RootElement.GetProperty("items").EnumerateArray());
        Assert.Equal("A-LOAN", itemA.GetProperty("code").GetString());
        Assert.Equal("TRY", itemA.GetProperty("currencyCode").GetString());
        Assert.False(itemA.TryGetProperty("id", out _));
        Assert.False(itemA.TryGetProperty("lenderName", out _));
        Assert.False(itemA.TryGetProperty("approvedLimit", out _));
        Assert.False(itemA.TryGetProperty("notes", out _));

        using var clientB = app.GetTestClient();
        clientB.DefaultRequestHeaders.Add("X-Test-Tenant", TenantB.ToString());
        using var responseB = await clientB.GetAsync("/api/finance/credit-facilities/assistant-summary?term=LOAN");
        using var jsonB = JsonDocument.Parse(await responseB.Content.ReadAsStringAsync());
        var itemB = Assert.Single(jsonB.RootElement.GetProperty("items").EnumerateArray());
        Assert.Equal("B-LOAN", itemB.GetProperty("code").GetString());
        Assert.Equal("USD", itemB.GetProperty("currencyCode").GetString());
    }

    private static async Task<WebApplication> StartApplicationAsync()
    {
        var builder = WebApplication.CreateBuilder(); builder.WebHost.UseTestServer();
        var dbName = $"credit-facility-{Guid.NewGuid():N}"; var root = new InMemoryDatabaseRoot();
        builder.Services.AddDbContext<TenantDbContext>(o => o.UseInMemoryDatabase(dbName, root));
        builder.Services.AddAuthentication("report-test").AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("report-test", _ => { });
        builder.Services.AddAuthorization(); var app = builder.Build(); app.UseAuthentication(); app.UseAuthorization();
        app.MapFinanceCreditFacilityEndpoints(); app.MapTenantCashForecastEndpoints(); await app.StartAsync();
        await using var scope = app.Services.CreateAsyncScope(); var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        await db.Database.EnsureCreatedAsync();
        db.Tenants.AddRange(new Tenant { Id = TenantA, Name = "A", Slug = "credit-a" }, new Tenant { Id = TenantB, Name = "B", Slug = "credit-b" });
        db.CreditFacilities.AddRange(
            new CreditFacility { Id = FacilityA, TenantId = TenantA, Code = "A-LOAN", LenderName = "A Bank", FacilityType = "Loan", CurrencyCode = "TRY", ApprovedLimit = 100000m, StartDate = new DateOnly(2025, 1, 1), MaturityDate = new DateOnly(2027, 12, 31), AnnualInterestRatePercent = 36.5m },
            new CreditFacility { TenantId = TenantB, Code = "B-LOAN", LenderName = "B Bank", FacilityType = "Loan", CurrencyCode = "USD", ApprovedLimit = 100000m, StartDate = new DateOnly(2025, 1, 1), MaturityDate = new DateOnly(2027, 12, 31) });
        db.FinancialAccounts.Add(new FinancialAccount { Id = AccountA, TenantId = TenantA, Code = "BANK-TRY", Name = "TRY Bank", Type = FinancialAccountType.Bank, CurrencyCode = "TRY" });
        db.FinancialAccounts.Add(new FinancialAccount { Id = AccountB, TenantId = TenantB, Code = "BANK-USD", Name = "USD Bank", Type = FinancialAccountType.Bank, CurrencyCode = "USD" });
        db.LedgerAccounts.AddRange(
            new LedgerAccount { Id = CashLedgerA, TenantId = TenantA, Code = "102", Name = "Bank", StatementSection = LedgerAccountStatementSection.Asset },
            new LedgerAccount { Id = PrincipalLedgerA, TenantId = TenantA, Code = "300", Name = "Credit facility principal", StatementSection = LedgerAccountStatementSection.Liability },
            new LedgerAccount { Id = InterestLedgerA, TenantId = TenantA, Code = "780", Name = "Interest expense", StatementSection = LedgerAccountStatementSection.Expense },
            new LedgerAccount { Id = FeeLedgerA, TenantId = TenantA, Code = "780.1", Name = "Credit fees", StatementSection = LedgerAccountStatementSection.Expense });
        db.LedgerAccountMappings.AddRange(
            new LedgerAccountMapping { TenantId = TenantA, MappingKey = LedgerMappingKeys.FinancialAccountPrefix + AccountA.ToString("D"), AccountId = CashLedgerA },
            new LedgerAccountMapping { TenantId = TenantA, MappingKey = LedgerMappingKeys.CreditFacilityPrincipal, AccountId = PrincipalLedgerA },
            new LedgerAccountMapping { TenantId = TenantA, MappingKey = LedgerMappingKeys.CreditFacilityInterestExpense, AccountId = InterestLedgerA },
            new LedgerAccountMapping { TenantId = TenantA, MappingKey = LedgerMappingKeys.CreditFacilityFeeExpense, AccountId = FeeLedgerA });
        db.CreditFacilitySchedules.AddRange(
            new CreditFacilitySchedule { TenantId = TenantA, CreditFacilityId = FacilityA, DueDate = new DateOnly(2025, 12, 15), PrincipalAmount = 10m, InterestAmount = 5m },
            new CreditFacilitySchedule { TenantId = TenantA, CreditFacilityId = FacilityA, DueDate = new DateOnly(2026, 1, 15), PrincipalAmount = 80m, InterestAmount = 20m, FeeAmount = 5m },
            new CreditFacilitySchedule { TenantId = TenantA, CreditFacilityId = FacilityA, DueDate = new DateOnly(2026, 2, 15), PrincipalAmount = 70m, InterestAmount = 15m, FeeAmount = 5m },
            new CreditFacilitySchedule { TenantId = TenantB, CreditFacilityId = db.CreditFacilities.Local.Single(x => x.TenantId == TenantB).Id, DueDate = new DateOnly(2026, 1, 15), PrincipalAmount = 500m });
        await db.SaveChangesAsync(); return app;
    }

    private static async Task<Guid[]> GetScheduleIdsAsync(WebApplication app, Guid tenantId, Guid facilityId)
    {
        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        return await db.CreditFacilitySchedules.Where(x => x.TenantId == tenantId && x.CreditFacilityId == facilityId).Select(x => x.Id).ToArrayAsync();
    }
}
