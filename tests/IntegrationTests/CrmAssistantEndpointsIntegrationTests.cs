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

public sealed class CrmAssistantEndpointsIntegrationTests
{
    [Fact]
    public async Task Opportunity_lookup_is_bounded_tenant_scoped_permission_gated_and_minimal()
    {
        var tenantAId = Guid.NewGuid();
        var tenantBId = Guid.NewGuid();
        var adminId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        var databaseName = $"crm-assistant-{Guid.NewGuid():N}";
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Services.AddDbContext<TenantDbContext>(options => options.UseInMemoryDatabase(databaseName));
        builder.Services.AddDbContext<PlatformDbContext>(options => options.UseInMemoryDatabase($"{databaseName}-platform"));
        builder.Services.AddScoped<AIERP.Platform.Application.IPlatformPermissionAuthorizer, PlatformPermissionAuthorizer>();
        builder.Services.AddAuthentication("crm-assistant-test").AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("crm-assistant-test", _ => { });
        builder.Services.AddAuthorization();
        await using var app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapCrmAssistantEndpoints();
        await app.StartAsync();

        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            await db.Database.EnsureCreatedAsync();
            db.Tenants.AddRange(
                new Tenant { Id = tenantAId, Name = "CRM A", Slug = $"crm-a-{tenantAId:N}", IsActive = true },
                new Tenant { Id = tenantBId, Name = "CRM B", Slug = $"crm-b-{tenantBId:N}", IsActive = true });
            db.CrmOpportunities.AddRange(Enumerable.Range(1, 12).Select(i => new CrmOpportunity
            {
                TenantId = tenantAId, Code = $"OP-ASSIST-{i:00}", Name = $"ERP rollout {i}", Stage = CrmOpportunityStage.Proposal,
                EstimatedValue = 1000m + i, CurrencyCode = "TRY", ProbabilityPercent = 50, ExpectedCloseDate = new DateOnly(2026, 12, 31),
                Notes = "PRIVATE-CRM-NOTE", NextActivityAt = DateTimeOffset.UtcNow
            }).Append(new CrmOpportunity { TenantId = tenantBId, Code = "OP-TENANT-B-ONLY", Name = "Private B opportunity" }));
            await db.SaveChangesAsync();
        }
        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            var tenantA = new Tenant { Id = tenantAId, Name = "CRM A", Slug = $"crm-a-{tenantAId:N}", IsActive = true };
            var tenantB = new Tenant { Id = tenantBId, Name = "CRM B", Slug = $"crm-b-{tenantBId:N}", IsActive = true };
            var admin = new AppUser { Id = adminId, Email = "crm-admin@example.test", DisplayName = "CRM Admin", IsActive = true };
            var regular = new AppUser { Id = userId, Email = "crm-user@example.test", DisplayName = "CRM User", IsActive = true };
            db.Tenants.AddRange(tenantA, tenantB);
            db.Users.AddRange(admin, regular);
            db.TenantMemberships.AddRange(
                new TenantMembership { Tenant = tenantA, TenantId = tenantAId, User = admin, UserId = adminId, Role = "TenantAdmin" },
                new TenantMembership { Tenant = tenantB, TenantId = tenantBId, User = regular, UserId = userId, Role = "TenantUser" });
            await db.SaveChangesAsync();
        }

        using var adminClient = app.GetTestClient();
        adminClient.DefaultRequestHeaders.Add("X-Test-Tenant", tenantAId.ToString("D"));
        adminClient.DefaultRequestHeaders.Add("X-Test-User", adminId.ToString("D"));
        using var shortTerm = await adminClient.GetAsync("/api/crm/assistant-opportunities?term=x");
        using var longTerm = await adminClient.GetAsync($"/api/crm/assistant-opportunities?term={new string('x', 101)}");
        Assert.Equal(HttpStatusCode.BadRequest, shortTerm.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, longTerm.StatusCode);

        using var response = await adminClient.GetAsync("/api/crm/assistant-opportunities?term=OP-ASSIST");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var content = await response.Content.ReadAsStringAsync();
        using var document = JsonDocument.Parse(content);
        var root = document.RootElement;
        Assert.Equal(12, root.GetProperty("total").GetInt32());
        var items = root.GetProperty("items").EnumerateArray().ToArray();
        Assert.Equal(10, items.Length);
        Assert.All(items, item =>
        {
            Assert.StartsWith("OP-ASSIST-", item.GetProperty("code").GetString());
            Assert.Equal("Proposal", item.GetProperty("stage").GetString());
            Assert.False(item.TryGetProperty("id", out _));
            Assert.False(item.TryGetProperty("customerName", out _));
            Assert.False(item.TryGetProperty("notes", out _));
            Assert.False(item.TryGetProperty("nextActivityAt", out _));
        });
        Assert.DoesNotContain("TENANT-B-ONLY", content, StringComparison.Ordinal);

        using var unprivilegedClient = app.GetTestClient();
        unprivilegedClient.DefaultRequestHeaders.Add("X-Test-Tenant", tenantBId.ToString("D"));
        unprivilegedClient.DefaultRequestHeaders.Add("X-Test-User", userId.ToString("D"));
        unprivilegedClient.DefaultRequestHeaders.Add("X-Test-Role", "TenantUser");
        using var denied = await unprivilegedClient.GetAsync("/api/crm/assistant-opportunities?term=OP");
        Assert.Equal(HttpStatusCode.Forbidden, denied.StatusCode);
    }
}
