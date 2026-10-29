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
public sealed class CreditFacilitySecuritiesSqlAcceptanceTests
{
    [SqlServerAcceptanceFact]
    public async Task Credit_facility_securities_persist_with_tenant_scope_and_exposure_rollups()
    {
        var configuredConnection = Environment.GetEnvironmentVariable("AIERP_REPORT_TEST_SQL_CONNECTION_STRING");
        Assert.False(string.IsNullOrWhiteSpace(configuredConnection));
        var tenantId = Guid.NewGuid();
        var otherTenantId = Guid.NewGuid();
        var suffix = Guid.NewGuid().ToString("N");
        var databaseName = $"AIERP_CreditSecurityAcceptance_{suffix}";
        var connectionString = new SqlConnectionStringBuilder(configuredConnection)
        {
            InitialCatalog = databaseName,
            ConnectTimeout = 15,
            TrustServerCertificate = true
        }.ConnectionString;
        var options = new DbContextOptionsBuilder<TenantDbContext>().UseSqlServer(connectionString).Options;
        await using var seedDb = new TenantDbContext(options);
        var databaseCreated = false;
        try
        {
            databaseCreated = await seedDb.Database.EnsureCreatedAsync();
            Assert.True(databaseCreated);
            var tenant = new Tenant { Id = tenantId, Name = "Synthetic securities tenant", Slug = $"security-{suffix}", BaseCurrencyCode = "TRY" };
            var facility = new CreditFacility { TenantId = tenantId, Code = "SEC-LOAN", LenderName = "Synthetic lender",
                FacilityType = "Loan", CurrencyCode = "TRY", ApprovedLimit = 100000m, StartDate = new DateOnly(2026, 1, 1) };
            var otherTenant = new Tenant { Id = otherTenantId, Name = "Synthetic other tenant", Slug = $"security-other-{suffix}", BaseCurrencyCode = "USD" };
            var otherFacility = new CreditFacility { TenantId = otherTenantId, Code = "SEC-OTHER", LenderName = "Other lender",
                FacilityType = "Loan", CurrencyCode = "USD", ApprovedLimit = 50000m, StartDate = new DateOnly(2026, 1, 1) };
            seedDb.Tenants.AddRange(tenant, otherTenant);
            seedDb.CreditFacilities.AddRange(facility, otherFacility);
            await seedDb.SaveChangesAsync();

            var builder = WebApplication.CreateBuilder();
            builder.WebHost.UseTestServer();
            builder.Services.AddDbContext<TenantDbContext>(db => db.UseSqlServer(connectionString));
            builder.Services.AddAuthentication("report-test")
                .AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("report-test", _ => { });
            builder.Services.AddAuthorization();
            await using var app = builder.Build();
            app.UseAuthentication();
            app.UseAuthorization();
            app.MapFinanceCreditFacilityEndpoints();
            await app.StartAsync();

            using var tenantClient = app.GetTestClient();
            tenantClient.DefaultRequestHeaders.Add("X-Test-Tenant", tenantId.ToString("D"));
            var request = new CreditFacilitySecurityCreateRequest(CreditSecurityType.Guarantee, "SEC-G-001", "Synthetic bank",
                "Synthetic beneficiary", 25000m, "TRY", 125m, new DateOnly(2026, 10, 1), new DateOnly(2026, 12, 31), "SQL acceptance");
            using var created = await tenantClient.PostAsJsonAsync($"/api/finance/credit-facilities/{facility.Id}/securities", request);
            Assert.Equal(HttpStatusCode.Created, created.StatusCode);
            using var duplicate = await tenantClient.PostAsJsonAsync($"/api/finance/credit-facilities/{facility.Id}/securities", request);
            Assert.Equal(HttpStatusCode.Conflict, duplicate.StatusCode);

            using var exposure = await tenantClient.GetAsync("/api/finance/credit-facilities/exposure-summary");
            Assert.Equal(HttpStatusCode.OK, exposure.StatusCode);
            using var exposureJson = JsonDocument.Parse(await exposure.Content.ReadAsStringAsync());
            var currency = Assert.Single(exposureJson.RootElement.GetProperty("currencies").EnumerateArray());
            Assert.Equal("TRY", currency.GetProperty("currencyCode").GetString());
            Assert.Equal(25000m, currency.GetProperty("activeGuarantees").GetDecimal());

            using var createdJson = JsonDocument.Parse(await created.Content.ReadAsStringAsync());
            var securityId = createdJson.RootElement.GetProperty("id").GetGuid();
            using var released = await tenantClient.PutAsJsonAsync($"/api/finance/credit-facilities/{facility.Id}/securities/{securityId}/status",
                new CreditFacilitySecurityStatusRequest("Released"));
            Assert.Equal(HttpStatusCode.NoContent, released.StatusCode);
            using var releasedExposure = await tenantClient.GetAsync("/api/finance/credit-facilities/exposure-summary");
            using var releasedJson = JsonDocument.Parse(await releasedExposure.Content.ReadAsStringAsync());
            Assert.Equal(0m, Assert.Single(releasedJson.RootElement.GetProperty("currencies").EnumerateArray())
                .GetProperty("activeGuarantees").GetDecimal());

            using var otherClient = app.GetTestClient();
            otherClient.DefaultRequestHeaders.Add("X-Test-Tenant", otherTenantId.ToString("D"));
            using var otherList = await otherClient.GetAsync("/api/finance/credit-facilities/securities");
            using var otherListJson = JsonDocument.Parse(await otherList.Content.ReadAsStringAsync());
            Assert.Empty(otherListJson.RootElement.GetProperty("items").EnumerateArray());
            using var otherExposure = await otherClient.GetAsync("/api/finance/credit-facilities/exposure-summary");
            using var otherExposureJson = JsonDocument.Parse(await otherExposure.Content.ReadAsStringAsync());
            var otherCurrency = Assert.Single(otherExposureJson.RootElement.GetProperty("currencies").EnumerateArray());
            Assert.Equal("USD", otherCurrency.GetProperty("currencyCode").GetString());
            Assert.Equal(0m, otherCurrency.GetProperty("activeGuarantees").GetDecimal());

            await using var verifyDb = new TenantDbContext(options);
            Assert.Equal(1, await verifyDb.CreditFacilitySecurities.CountAsync(x => x.TenantId == tenantId));
            Assert.Equal(0, await verifyDb.CreditFacilitySecurities.CountAsync(x => x.TenantId == otherTenantId));
            Assert.Equal(1, await verifyDb.AuditEvents.CountAsync(x => x.TenantId == tenantId && x.Action == "finance.credit-facility.security-created"));
            Assert.Equal(CreditSecurityStatus.Released, await verifyDb.CreditFacilitySecurities.Where(x => x.TenantId == tenantId)
                .Select(x => x.Status).SingleAsync());
        }
        finally
        {
            if (databaseCreated)
                await seedDb.Database.EnsureDeletedAsync();
        }
    }
}
