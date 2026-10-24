using System.Net;
using System.Net.Http.Json;
using AIERP.Api;
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
using Xunit;

namespace AIERP.Api.IntegrationTests;

public sealed class ExchangeRateEndpointsIntegrationTests
{
    private static readonly Guid TenantId = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid OtherTenantId = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid AdminId = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");

    [Theory]
    [InlineData("demoted")]
    [InlineData("removed")]
    [InlineData("inactive-user")]
    [InlineData("inactive-tenant")]
    [InlineData("other-tenant-membership")]
    public async Task Stale_or_mismatched_admin_membership_cannot_write_or_import_rates(string state)
    {
        await using var app = await StartAsync();
        await SeedMembershipAsync(app, state);
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantId.ToString("D"));

        using var manual = await client.PostAsJsonAsync("/api/finance/exchange-rates", new
        {
            currencyCode = "USD", rateDate = new DateOnly(2026, 10, 21), rate = 42m, source = "manual"
        });
        using var import = await client.PostAsync("/api/finance/exchange-rates/import-tcmb", content: null);

        Assert.Equal(HttpStatusCode.Forbidden, manual.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, import.StatusCode);
        await using var scope = app.Services.CreateAsyncScope();
        Assert.Empty(await scope.ServiceProvider.GetRequiredService<TenantDbContext>().TenantExchangeRates.ToListAsync());
    }

    [Fact]
    public async Task Active_tenant_admin_reaches_importer_and_future_feed_date_is_rejected()
    {
        await using var app = await StartAsync("<Tarih_Date Tarih=\"31.12.2099\"><Currency CurrencyCode=\"USD\"><Unit>1</Unit><ForexSelling>50</ForexSelling></Currency></Tarih_Date>");
        await SeedMembershipAsync(app, "active");
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantId.ToString("D"));

        using var response = await client.PostAsync("/api/finance/exchange-rates/import-tcmb", content: null);
        using var manual = await client.PostAsJsonAsync("/api/finance/exchange-rates", new
        {
            currencyCode = "USD",
            rateDate = TcmbExchangeRateImporter.IstanbulLocalDate(DateTimeOffset.UtcNow).AddDays(1),
            rate = 50m,
            source = "future manual rate"
        });

        Assert.Equal(HttpStatusCode.BadGateway, response.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, manual.StatusCode);
        await using var scope = app.Services.CreateAsyncScope();
        Assert.Empty(await scope.ServiceProvider.GetRequiredService<TenantDbContext>().TenantExchangeRates.ToListAsync());
    }

    [Fact]
    public async Task Rate_list_is_tenant_scoped_and_a_date_filter_returns_only_latest_revision()
    {
        await using var app = await StartAsync();
        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            var tenant = new Tenant { Id = TenantId, Name = "Rate tenant", Slug = $"rate-{TenantId:N}" };
            var otherTenant = new Tenant { Id = OtherTenantId, Name = "Other rate tenant", Slug = $"rate-{OtherTenantId:N}" };
            var date = TcmbExchangeRateImporter.IstanbulLocalDate(DateTimeOffset.UtcNow).AddDays(-1);
            db.Tenants.AddRange(tenant, otherTenant);
            db.TenantExchangeRates.AddRange(
                new TenantExchangeRate { TenantId = TenantId, Tenant = tenant, CurrencyCode = "USD", RateDate = date, Revision = 1, Rate = 40m, Source = "old" },
                new TenantExchangeRate { TenantId = TenantId, Tenant = tenant, CurrencyCode = "USD", RateDate = date, Revision = 2, Rate = 41m, Source = "latest" },
                new TenantExchangeRate { TenantId = OtherTenantId, Tenant = otherTenant, CurrencyCode = "EUR", RateDate = date, Revision = 1, Rate = 45m, Source = "other tenant" });
            await db.SaveChangesAsync();
        }

        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantId.ToString("D"));
        var dateText = TcmbExchangeRateImporter.IstanbulLocalDate(DateTimeOffset.UtcNow).AddDays(-1).ToString("yyyy-MM-dd");

        var allResponse = await client.GetFromJsonAsync<TenantExchangeRateView[]>("/api/finance/exchange-rates");
        var filteredResponse = await client.GetFromJsonAsync<TenantExchangeRateView[]>(
            $"/api/finance/exchange-rates?currencyCode=usd&rateDate={dateText}");

        Assert.NotNull(allResponse);
        Assert.All(allResponse, rate => Assert.Equal("USD", rate.CurrencyCode));
        Assert.Equal(2, allResponse.Length);
        var latest = Assert.Single(filteredResponse!);
        Assert.Equal("USD", latest.CurrencyCode);
        Assert.Equal(2, latest.Revision);
        Assert.Equal(41m, latest.Rate);
    }

    private static async Task<WebApplication> StartAsync(string? xml = null)
    {
        var tenantDatabaseName = $"exchange-rates-{Guid.NewGuid():N}";
        var platformDatabaseName = $"exchange-rates-platform-{Guid.NewGuid():N}";
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Services.AddDbContext<TenantDbContext>(options => options.UseInMemoryDatabase(tenantDatabaseName)
            .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning)));
        builder.Services.AddDbContext<PlatformDbContext>(options => options.UseInMemoryDatabase(platformDatabaseName));
        builder.Services.AddHttpClient("tcmb-rates")
            .ConfigurePrimaryHttpMessageHandler(() => new CountingXmlHandler(xml ?? "<Tarih_Date Tarih=\"22.10.2026\" />"));
        builder.Services.AddAuthentication("exchange-rate-test")
            .AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("exchange-rate-test", _ => { });
        builder.Services.AddAuthorization();
        var app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapExchangeRateEndpoints();
        await app.StartAsync();
        return app;
    }

    private static async Task SeedMembershipAsync(WebApplication app, string state)
    {
        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        var tenant = new Tenant { Id = TenantId, Name = "Exchange rate test", Slug = $"rate-{TenantId:N}", IsActive = true };
        var otherTenant = new Tenant { Id = OtherTenantId, Name = "Other rate test", Slug = $"rate-{OtherTenantId:N}", IsActive = true };
        var admin = new AppUser { Id = AdminId, Email = "admin@example.invalid", DisplayName = "Admin", IsActive = true };
        db.Tenants.AddRange(tenant, otherTenant);
        db.Users.Add(admin);
        if (state != "removed")
        {
            var memberTenant = state == "other-tenant-membership" ? otherTenant : tenant;
            db.TenantMemberships.Add(new TenantMembership
            {
                TenantId = memberTenant.Id, Tenant = memberTenant, UserId = admin.Id, User = admin,
                Role = state == "demoted" ? "TenantUser" : "TenantAdmin"
            });
        }
        if (state == "inactive-user") admin.IsActive = false;
        if (state == "inactive-tenant") tenant.IsActive = false;
        await db.SaveChangesAsync();
    }

    private sealed class CountingXmlHandler(string xml) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) =>
            Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(xml) });
    }
}
