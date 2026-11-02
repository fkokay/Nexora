using System.Net;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace AIERP.Api.IntegrationTests;

public sealed class CustomerRowVisibilityEndpointFilterTests
{
    private static readonly Guid TenantA = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid TenantB = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid HiddenCustomer = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1");
    private static readonly Guid VisibleCustomer = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2");
    private static readonly Guid ForeignCustomer = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1");

    [Fact]
    public async Task Customer_get_routes_hide_denied_and_cross_tenant_rows_but_preserve_allowed_and_admin_access()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        client.DefaultRequestHeaders.Add("X-Test-Role", "TenantUser");

        using var visible = await client.GetAsync($"/api/customers/{VisibleCustomer:D}/probe");
        Assert.Equal(HttpStatusCode.OK, visible.StatusCode);
        using var denied = await client.GetAsync($"/api/customers/{HiddenCustomer:D}/probe");
        Assert.Equal(HttpStatusCode.NotFound, denied.StatusCode);
        using var crossTenant = await client.GetAsync($"/api/customers/{ForeignCustomer:D}/probe");
        Assert.Equal(HttpStatusCode.NotFound, crossTenant.StatusCode);

        client.DefaultRequestHeaders.Remove("X-Test-Role");
        client.DefaultRequestHeaders.Add("X-Test-Role", "TenantAdmin");
        using var admin = await client.GetAsync($"/api/customers/{HiddenCustomer:D}/probe");
        Assert.Equal(HttpStatusCode.OK, admin.StatusCode);
    }

    private static async Task<WebApplication> StartApplicationAsync()
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        var databaseName = $"customer-row-visibility-{Guid.NewGuid():N}";
        var root = new InMemoryDatabaseRoot();
        builder.Services.AddDbContext<TenantDbContext>(options => options.UseInMemoryDatabase(databaseName, root));
        builder.Services.AddDbContext<PlatformDbContext>(options => options.UseInMemoryDatabase($"{databaseName}-platform", root));
        builder.Services.AddAuthentication("report-test").AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("report-test", _ => { });
        builder.Services.AddAuthorization();
        var app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapGroup("/api/customers").RequireAuthorization().RequireVisibleCustomerRows()
            .MapGet("/{id:guid}/probe", (Guid id) => Results.Ok(new { id }));
        await app.StartAsync();

        await using var scope = app.Services.CreateAsyncScope();
        var tenantDb = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        await tenantDb.Database.EnsureCreatedAsync();
        tenantDb.Tenants.AddRange(
            new Tenant { Id = TenantA, Name = "Synthetic A", Slug = "customer-row-a" },
            new Tenant { Id = TenantB, Name = "Synthetic B", Slug = "customer-row-b" });
        tenantDb.CustomerAccounts.AddRange(
            Customer(TenantA, HiddenCustomer, "A-001"),
            Customer(TenantA, VisibleCustomer, "A-002"),
            Customer(TenantB, ForeignCustomer, "B-001"));
        await tenantDb.SaveChangesAsync();

        var platformDb = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        await platformDb.Database.EnsureCreatedAsync();
        platformDb.Tenants.Add(new Tenant { Id = TenantA, Name = "Synthetic A", Slug = "customer-row-platform-a" });
        var permission = await platformDb.PermissionDefinitions.SingleAsync(x => x.Code == "erp.customers.read");
        platformDb.TenantPermissionRules.AddRange(
            new TenantPermissionRule
            {
                TenantId = TenantA, SubjectType = TenantPermissionSubjectType.Role, SubjectRole = "TenantUser",
                PermissionCode = permission.Code, Permission = permission, Effect = TenantPermissionEffect.Allow,
                ResourceType = "erp.customers"
            },
            new TenantPermissionRule
            {
                TenantId = TenantA, SubjectType = TenantPermissionSubjectType.Role, SubjectRole = "TenantUser",
                PermissionCode = permission.Code, Permission = permission, Effect = TenantPermissionEffect.Deny,
                ResourceType = "erp.customers", AttributeName = "resource.customerId",
                AttributeOperator = TenantPermissionConditionOperator.Equals, AttributeValue = HiddenCustomer.ToString("D")
            });
        await platformDb.SaveChangesAsync();
        return app;
    }

    private static CustomerAccount Customer(Guid tenantId, Guid id, string code) => new()
    {
        TenantId = tenantId, Id = id, Code = code, Name = $"Synthetic {code}", CurrencyCode = "TRY",
        Type = CounterpartyType.Customer, IsActive = true
    };
}
