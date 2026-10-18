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
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace AIERP.Api.IntegrationTests;

public sealed class CrmOpportunityIntegrationTests
{
    private static readonly Guid TenantA = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid TenantB = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid UserId = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private static readonly Guid CustomerA = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    private static readonly Guid CustomerB = Guid.Parse("cccccccc-cccc-cccc-cccc-cccccccccccc");

    [Fact]
    public async Task Crm_opportunities_are_tenant_scoped_validated_and_follow_a_winning_pipeline()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/crm/opportunities/")).StatusCode);

        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        var invalid = await client.PostAsJsonAsync("/api/crm/opportunities/", Write("bad", CustomerA, 100));
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);

        var create = await client.PostAsJsonAsync("/api/crm/opportunities/", Write("ERP-2026-001", CustomerA, 40));
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        using var created = JsonDocument.Parse(await create.Content.ReadAsStringAsync());
        var id = created.RootElement.GetProperty("id").GetGuid();
        Assert.Equal("Prospecting", created.RootElement.GetProperty("stage").GetString());
        Assert.Equal("Tenant A Customer", created.RootElement.GetProperty("customerName").GetString());
        Assert.Equal(HttpStatusCode.Conflict,
            (await client.PostAsJsonAsync("/api/crm/opportunities/", Write("ERP-2026-001", null, 10))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await client.PostAsJsonAsync("/api/crm/opportunities/", Write("ERP-2026-002", CustomerB, 10))).StatusCode);

        foreach (var stage in new[] { "Qualified", "Proposal", "Negotiation", "Won" })
        {
            var response = await client.PostAsJsonAsync($"/api/crm/opportunities/{id}/stage", new { stage });
            response.EnsureSuccessStatusCode();
            using var stageResult = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            Assert.Equal(stage, stageResult.RootElement.GetProperty("stage").GetString());
        }
        using (var won = await client.GetAsync($"/api/crm/opportunities/{id}"))
        {
            using var document = JsonDocument.Parse(await won.Content.ReadAsStringAsync());
            Assert.Equal(100, document.RootElement.GetProperty("probabilityPercent").GetInt32());
        }
        Assert.Equal(HttpStatusCode.Conflict,
            (await client.PutAsJsonAsync($"/api/crm/opportunities/{id}", Write("ERP-2026-001", CustomerA, 60))).StatusCode);

        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantB.ToString());
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/crm/opportunities/{id}")).StatusCode);
        var emptyPage = await client.GetFromJsonAsync<JsonElement>("/api/crm/opportunities/");
        Assert.Equal(0, emptyPage.GetProperty("total").GetInt32());

        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        Assert.Equal(4, await db.AuditEvents.CountAsync(x => x.TenantId == TenantA && x.Action == "erp.crm-opportunity.stage-changed"));
    }

    [Fact]
    public async Task Crm_winning_stage_requires_customer_and_rejects_skipped_or_terminal_transitions()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());

        var create = await client.PostAsJsonAsync("/api/crm/opportunities/", Write("ERP-LOST-001", null, 15));
        create.EnsureSuccessStatusCode();
        using var created = JsonDocument.Parse(await create.Content.ReadAsStringAsync());
        var id = created.RootElement.GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.Conflict,
            (await client.PostAsJsonAsync($"/api/crm/opportunities/{id}/stage", new { stage = "Won" })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,
            (await client.PostAsJsonAsync($"/api/crm/opportunities/{id}/stage", new { stage = "Proposal" })).StatusCode);

        Assert.Equal(HttpStatusCode.OK,
            (await client.PostAsJsonAsync($"/api/crm/opportunities/{id}/stage", new { stage = "Lost" })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,
            (await client.PostAsJsonAsync($"/api/crm/opportunities/{id}/stage", new { stage = "Qualified" })).StatusCode);
    }

    private static object Write(string code, Guid? customerId, int probability) => new
    {
        code, name = "ERP renewal", customerId, estimatedValue = 12500.50m, currencyCode = "USD",
        probabilityPercent = probability, expectedCloseDate = "2026-12-31", nextActivityAt = "2026-11-01T10:00:00+03:00", notes = "Initial opportunity"
    };

    private static async Task<WebApplication> StartApplicationAsync()
    {
        var databaseName = $"crm-opportunities-{Guid.NewGuid():N}";
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Services.AddDbContext<TenantDbContext>(options => options.UseInMemoryDatabase(databaseName));
        builder.Services.AddAuthentication("report-test").AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("report-test", _ => { });
        builder.Services.AddAuthorization();
        var app = builder.Build();
        app.UseAuthentication(); app.UseAuthorization(); app.MapCrmEndpoints();
        await app.StartAsync();
        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        await db.Database.EnsureCreatedAsync();
        var tenantA = new Tenant { Id = TenantA, Name = "Tenant A", Slug = "tenant-a" };
        var tenantB = new Tenant { Id = TenantB, Name = "Tenant B", Slug = "tenant-b" };
        db.Tenants.AddRange(tenantA, tenantB);
        db.CustomerAccounts.AddRange(
            new CustomerAccount { Id = CustomerA, TenantId = TenantA, Tenant = tenantA, Code = "CUS-A", Name = "Tenant A Customer", Type = CounterpartyType.Customer },
            new CustomerAccount { Id = CustomerB, TenantId = TenantB, Tenant = tenantB, Code = "CUS-B", Name = "Tenant B Customer", Type = CounterpartyType.Customer });
        await db.SaveChangesAsync();
        return app;
    }
}
