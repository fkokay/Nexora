using System.Net;
using System.Text.Json;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace AIERP.Api.IntegrationTests;

public sealed class ForeignTradeAssistantEndpointsIntegrationTests
{
    [Fact]
    public async Task Assistant_search_is_bounded_tenant_scoped_permission_gated_and_minimal()
    {
        var tenantAId = Guid.NewGuid();
        var tenantBId = Guid.NewGuid();
        var adminId = Guid.NewGuid();
        var tenantUserId = Guid.NewGuid();
        var databaseName = $"foreign-trade-assistant-{Guid.NewGuid():N}";
        var platformDatabaseName = $"{databaseName}-platform";
        var tenantA = new Tenant { Id = tenantAId, Name = "Synthetic trade A", Slug = $"trade-a-{tenantAId:N}", IsActive = true };
        var tenantB = new Tenant { Id = tenantBId, Name = "Synthetic trade B", Slug = $"trade-b-{tenantBId:N}", IsActive = true };

        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Services.AddDbContext<TenantDbContext>(options => options.UseInMemoryDatabase(databaseName));
        builder.Services.AddDbContext<PlatformDbContext>(options => options.UseInMemoryDatabase(platformDatabaseName));
        builder.Services.AddScoped<AIERP.Platform.Application.IPlatformPermissionAuthorizer, PlatformPermissionAuthorizer>();
        builder.Services.AddAuthentication("trade-assistant-test")
            .AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("trade-assistant-test", _ => { });
        builder.Services.AddAuthorization();

        await using var app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapForeignTradeAssistantEndpoints();
        await app.StartAsync();

        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            await db.Database.EnsureCreatedAsync();
            db.Tenants.AddRange(tenantA, tenantB);
            db.Set<ForeignTradeCase>().AddRange(
                Enumerable.Range(1, 12).Select(index => new ForeignTradeCase
                {
                    TenantId = tenantAId,
                    Direction = ForeignTradeDirection.Export,
                    Status = ForeignTradeStatus.Shipped,
                    PurchaseOrderId = Guid.NewGuid(),
                    SalesOrderId = Guid.NewGuid(),
                    ReferenceCode = $"EXP-ASSIST-{index:00}",
                    OriginCountryCode = "TR",
                    DestinationCountryCode = "DE",
                    IncotermsCode = "FCA",
                    HarmonizedSystemCode = "1234567890",
                    TransportMode = "Road",
                    CarrierReference = "PRIVATE-CARRIER-REF",
                    CustomsReference = "PRIVATE-CUSTOMS-REF",
                    DeclaredValue = 999999m,
                    CurrencyCode = "EUR",
                    PlannedShipDate = new DateOnly(2026, 10, 24),
                    ActualShipDate = new DateOnly(2026, 10, 25),
                    PlannedArrivalDate = new DateOnly(2026, 10, 29),
                    Notes = "PRIVATE-NOTE"
                })
                .Append(new ForeignTradeCase
                {
                    TenantId = tenantBId,
                    Direction = ForeignTradeDirection.Export,
                    Status = ForeignTradeStatus.Shipped,
                    ReferenceCode = "EXP-ASSIST-TENANT-B-ONLY",
                    OriginCountryCode = "TR",
                    DestinationCountryCode = "DE",
                    TransportMode = "Road"
                }));
            await db.SaveChangesAsync();
        }

        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            var platformTenantA = new Tenant { Id = tenantAId, Name = tenantA.Name, Slug = tenantA.Slug, IsActive = true };
            var platformTenantB = new Tenant { Id = tenantBId, Name = tenantB.Name, Slug = tenantB.Slug, IsActive = true };
            var admin = new AppUser { Id = adminId, Email = "foreign-trade-admin@example.test", DisplayName = "Synthetic Admin", IsActive = true };
            var tenantUser = new AppUser { Id = tenantUserId, Email = "foreign-trade-user@example.test", DisplayName = "Synthetic User", IsActive = true };
            db.Tenants.AddRange(platformTenantA, platformTenantB);
            db.Users.AddRange(admin, tenantUser);
            db.TenantMemberships.AddRange(
                new TenantMembership { Tenant = platformTenantA, TenantId = tenantAId, User = admin, UserId = adminId, Role = "TenantAdmin" },
                new TenantMembership { Tenant = platformTenantB, TenantId = tenantBId, User = tenantUser, UserId = tenantUserId, Role = "TenantUser" });
            await db.SaveChangesAsync();
        }

        using var adminClient = app.GetTestClient();
        adminClient.DefaultRequestHeaders.Add("X-Test-Tenant", tenantAId.ToString("D"));
        adminClient.DefaultRequestHeaders.Add("X-Test-User", adminId.ToString("D"));
        using var tooShort = await adminClient.GetAsync("/api/foreign-trade/assistant-cases?term=x");
        Assert.Equal(HttpStatusCode.BadRequest, tooShort.StatusCode);
        using var tooLong = await adminClient.GetAsync($"/api/foreign-trade/assistant-cases?term={new string('x', 101)}");
        Assert.Equal(HttpStatusCode.BadRequest, tooLong.StatusCode);

        using var response = await adminClient.GetAsync("/api/foreign-trade/assistant-cases?term=EXP-ASSIST");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = document.RootElement;
        Assert.Equal(12, root.GetProperty("total").GetInt32());
        var items = root.GetProperty("items").EnumerateArray().ToArray();
        Assert.Equal(10, items.Length);
        Assert.All(items, item =>
        {
            Assert.StartsWith("EXP-ASSIST-", item.GetProperty("referenceCode").GetString());
            Assert.Equal("Shipped", item.GetProperty("status").GetString());
            Assert.Equal("2026-10-25", item.GetProperty("actualShipDate").GetString());
            Assert.False(item.TryGetProperty("id", out _));
            Assert.False(item.TryGetProperty("purchaseOrderId", out _));
            Assert.False(item.TryGetProperty("salesOrderId", out _));
            Assert.False(item.TryGetProperty("declaredValue", out _));
            Assert.False(item.TryGetProperty("currencyCode", out _));
            Assert.False(item.TryGetProperty("harmonizedSystemCode", out _));
            Assert.False(item.TryGetProperty("customsReference", out _));
            Assert.False(item.TryGetProperty("carrierReference", out _));
            Assert.False(item.TryGetProperty("notes", out _));
        });
        Assert.DoesNotContain("TENANT-B-ONLY", await response.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        using var unprivilegedClient = app.GetTestClient();
        unprivilegedClient.DefaultRequestHeaders.Add("X-Test-Tenant", tenantBId.ToString("D"));
        unprivilegedClient.DefaultRequestHeaders.Add("X-Test-User", tenantUserId.ToString("D"));
        unprivilegedClient.DefaultRequestHeaders.Add("X-Test-Role", "TenantUser");
        using var denied = await unprivilegedClient.GetAsync("/api/foreign-trade/assistant-cases?term=EXP-ASSIST");
        Assert.Equal(HttpStatusCode.Forbidden, denied.StatusCode);
    }
}
