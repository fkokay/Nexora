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

public sealed class DirectCashBudgetIntegrationTests
{
    private static readonly Guid TenantA = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid TenantB = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid Creator = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private static readonly Guid Approver = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");

    [Fact]
    public async Task Direct_cash_plan_is_tenant_scoped_separately_approved_immutable_and_forecast_only_as_cash_plan()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/finance/cash-budgets/")).StatusCode);
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        client.DefaultRequestHeaders.Add("X-Test-User", Creator.ToString());

        var payload = new DirectCashBudgetWriteRequest("2026 cash plan", 2026, "TRY", [
            new(new DateOnly(2026, 1, 1), "Inflow", "Sales", "Uncommitted new sales", 1200m),
            new(new DateOnly(2026, 1, 1), "Outflow", "Payroll", "Monthly payroll", 400m)]);
        client.DefaultRequestHeaders.Add("X-Test-Role", "TenantUser");
        using var forbidden = await client.PostAsJsonAsync("/api/finance/cash-budgets/", payload);
        Assert.Equal(HttpStatusCode.Forbidden, forbidden.StatusCode);
        client.DefaultRequestHeaders.Remove("X-Test-Role"); client.DefaultRequestHeaders.Add("X-Test-Role", "TenantAdmin");
        using var created = await client.PostAsJsonAsync("/api/finance/cash-budgets/", payload);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        using var createdJson = JsonDocument.Parse(await created.Content.ReadAsStringAsync());
        var planId = createdJson.RootElement.GetProperty("id").GetGuid();
        Assert.Equal("Draft", createdJson.RootElement.GetProperty("status").GetString());
        Assert.Equal(2, createdJson.RootElement.GetProperty("lines").GetArrayLength());

        using var stale = await client.PutAsJsonAsync($"/api/finance/cash-budgets/{planId}", payload with { Revision = 0 });
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
        using var updated = await client.PutAsJsonAsync($"/api/finance/cash-budgets/{planId}", payload with { Name = "2026 cash plan revised", Revision = 1 });
        Assert.True(updated.StatusCode == HttpStatusCode.OK, await updated.Content.ReadAsStringAsync());
        using var updatedJson = JsonDocument.Parse(await updated.Content.ReadAsStringAsync());
        Assert.Equal(2, updatedJson.RootElement.GetProperty("revision").GetInt32());
        using var selfApproval = await client.PostAsJsonAsync($"/api/finance/cash-budgets/{planId}/approve", new DirectCashBudgetApprovalRequest(2));
        Assert.Equal(HttpStatusCode.Conflict, selfApproval.StatusCode);

        client.DefaultRequestHeaders.Remove("X-Test-User"); client.DefaultRequestHeaders.Add("X-Test-User", Approver.ToString());
        using var approved = await client.PostAsJsonAsync($"/api/finance/cash-budgets/{planId}/approve", new DirectCashBudgetApprovalRequest(2));
        Assert.Equal(HttpStatusCode.OK, approved.StatusCode);
        using var approvedJson = JsonDocument.Parse(await approved.Content.ReadAsStringAsync());
        Assert.Equal("Approved", approvedJson.RootElement.GetProperty("status").GetString());
        Assert.Equal(Approver, approvedJson.RootElement.GetProperty("approvedByUserId").GetGuid());
        using var immutable = await client.PutAsJsonAsync($"/api/finance/cash-budgets/{planId}", payload with { Revision = 3 });
        Assert.Equal(HttpStatusCode.Conflict, immutable.StatusCode);

        client.DefaultRequestHeaders.Remove("X-Test-User"); client.DefaultRequestHeaders.Add("X-Test-User", Creator.ToString());
        var alternatePayload = payload with { Name = "Alternate plan", Lines = [new(new DateOnly(2026, 1, 1), "Inflow", "Sales", "Alternative scenario only", 9000m)] };
        using var alternateCreated = await client.PostAsJsonAsync("/api/finance/cash-budgets/", alternatePayload);
        Assert.Equal(HttpStatusCode.Created, alternateCreated.StatusCode);
        using var alternateJson = JsonDocument.Parse(await alternateCreated.Content.ReadAsStringAsync());
        var alternateId = alternateJson.RootElement.GetProperty("id").GetGuid();
        client.DefaultRequestHeaders.Remove("X-Test-User"); client.DefaultRequestHeaders.Add("X-Test-User", Approver.ToString());
        using var duplicateApproval = await client.PostAsJsonAsync($"/api/finance/cash-budgets/{alternateId}/approve", new DirectCashBudgetApprovalRequest(1));
        Assert.Equal(HttpStatusCode.Conflict, duplicateApproval.StatusCode);

        using var forecastResponse = await client.GetAsync("/api/finance/cash-flow/forecast?from=2026-01-01&months=1");
        Assert.Equal(HttpStatusCode.OK, forecastResponse.StatusCode);
        using var forecast = JsonDocument.Parse(await forecastResponse.Content.ReadAsStringAsync());
        var month = forecast.RootElement.GetProperty("currencies").EnumerateArray().Single().GetProperty("months")[0];
        Assert.Equal(1200m, month.GetProperty("directCashBudgetInflows").GetDecimal());
        Assert.Equal(400m, month.GetProperty("directCashBudgetOutflows").GetDecimal());
        Assert.Equal(800m, month.GetProperty("netChange").GetDecimal());

        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            Assert.Equal(0, await db.JournalEntries.CountAsync());
            Assert.Equal(0, await db.FinancialAccountTransactions.CountAsync());
        }
        client.DefaultRequestHeaders.Remove("X-Test-Tenant"); client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantB.ToString());
        using var foreignTenant = await client.GetAsync($"/api/finance/cash-budgets/{planId}");
        Assert.Equal(HttpStatusCode.NotFound, foreignTenant.StatusCode);
    }

    private static async Task<WebApplication> StartApplicationAsync()
    {
        var builder = WebApplication.CreateBuilder(); builder.WebHost.UseTestServer();
        var dbName = $"direct-cash-budget-{Guid.NewGuid():N}"; var root = new InMemoryDatabaseRoot();
        builder.Services.AddDbContext<TenantDbContext>(o => o.UseInMemoryDatabase(dbName, root));
        builder.Services.AddAuthentication("report-test").AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("report-test", _ => { });
        builder.Services.AddAuthorization(); var app = builder.Build(); app.UseAuthentication(); app.UseAuthorization();
        app.MapDirectCashBudgetEndpoints(); app.MapTenantCashForecastEndpoints(); await app.StartAsync();
        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        await db.Database.EnsureCreatedAsync();
        db.Tenants.AddRange(new Tenant { Id = TenantA, Name = "A", Slug = "direct-cash-a" }, new Tenant { Id = TenantB, Name = "B", Slug = "direct-cash-b" });
        await db.SaveChangesAsync();
        return app;
    }
}
