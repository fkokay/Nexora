using System.Net;
using System.Text.Json;
using AIERP.Api;
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

public sealed class PurchaseRequestAssistantSearchIntegrationTests
{
    [Fact]
    public async Task Search_requires_authentication_scopes_to_tenant_caps_rows_and_omits_sensitive_fields()
    {
        var tenantAId = Guid.NewGuid();
        var tenantBId = Guid.NewGuid();
        var databaseName = $"purchase-request-search-{Guid.NewGuid():N}";
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Services.AddDbContext<TenantDbContext>(options => options.UseInMemoryDatabase(databaseName));
        builder.Services.AddDbContext<PlatformDbContext>(options => options.UseInMemoryDatabase($"platform-{databaseName}"));
        builder.Services.AddAuthentication("purchase-request-search-test")
            .AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("purchase-request-search-test", _ => { });
        builder.Services.AddAuthorization();
        await using var app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapGroup("/api/purchasing/requests").RequireAuthorization().MapPurchaseRequestAssistantSearchEndpoint();
        await app.StartAsync();

        var tenantA = new Tenant { Id = tenantAId, Name = "Tenant A", Slug = $"tenant-a-{tenantAId:N}" };
        var tenantB = new Tenant { Id = tenantBId, Name = "Tenant B", Slug = $"tenant-b-{tenantBId:N}" };
        var userAId = Guid.NewGuid();
        var userBId = Guid.NewGuid();
        var requestsA = Enumerable.Range(1, 12).Select(index => new PurchaseRequest
        {
            TenantId = tenantAId, Tenant = tenantA, RequestedByUserId = userAId,
            Code = $"PR-BOUNDED-{index:000}", RequestDate = new DateOnly(2026, 10, 25),
            NeededByDate = new DateOnly(2026, 11, 5), Description = "private request description",
            CreatedAt = DateTimeOffset.Parse("2026-10-25T10:00:00Z")
        }).ToArray();
        var requestB = new PurchaseRequest
        {
            TenantId = tenantBId, Tenant = tenantB, RequestedByUserId = userBId,
            Code = "PR-BOUNDED-999", RequestDate = new DateOnly(2026, 10, 25), Description = "private request description",
            CreatedAt = DateTimeOffset.Parse("2026-10-25T10:00:00Z")
        };

        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            await db.Database.EnsureCreatedAsync();
            db.Tenants.AddRange(tenantA, tenantB);
            db.PurchaseRequests.AddRange(requestsA);
            db.PurchaseRequests.Add(requestB);
            await db.SaveChangesAsync();
        }

        using var client = app.GetTestClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/purchasing/requests/search?q=PR-BOUNDED")).StatusCode);
        client.DefaultRequestHeaders.Add("X-Test-Tenant", tenantAId.ToString());
        using var response = JsonDocument.Parse(await (await client.GetAsync("/api/purchasing/requests/search?q=PR-BOUNDED")).Content.ReadAsStringAsync());
        Assert.Equal(12, response.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(10, response.RootElement.GetProperty("returned").GetInt32());
        Assert.True(response.RootElement.GetProperty("hasMore").GetBoolean());
        var first = response.RootElement.GetProperty("items")[0];
        Assert.Equal("PR-BOUNDED-001", first.GetProperty("code").GetString());
        Assert.False(first.TryGetProperty("id", out _));
        Assert.False(first.TryGetProperty("requestedByUserId", out _));
        Assert.False(first.TryGetProperty("requestedByName", out _));
        Assert.False(first.TryGetProperty("description", out _));
        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", tenantBId.ToString());
        using var otherTenant = JsonDocument.Parse(await (await client.GetAsync("/api/purchasing/requests/search?q=PR-BOUNDED")).Content.ReadAsStringAsync());
        Assert.Equal(1, otherTenant.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal("PR-BOUNDED-999", otherTenant.RootElement.GetProperty("items")[0].GetProperty("code").GetString());
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/purchasing/requests/search?q=x")).StatusCode);
    }
}
