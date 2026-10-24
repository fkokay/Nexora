using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.Http;
using System.Security.Claims;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Configuration;
using AIERP.Platform.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.Data.SqlClient;

namespace AIERP.Platform.UnitTests;

public sealed class TenantDatabaseRoutingTests
{
    private const string RuntimeConnection = "Server=sql;Database=AIERPTenantRuntime;Integrated Security=True";

    [Fact]
    public void Separated_mode_uses_only_connection_resolved_for_current_request()
    {
        var tenantId = Guid.NewGuid();
        var context = new DefaultHttpContext();
        context.User = new ClaimsPrincipal(new ClaimsIdentity([new Claim("tenant_id", tenantId.ToString("D"))], "test"));
        var tenantConnection = $"Server=sql;Database=AIERPTenant_{tenantId:N};Integrated Security=True";
        context.Items[TenantDatabaseRouting.ConnectionItemKey] = tenantConnection;

        var resolved = TenantDatabaseRouting.Resolve(context);

        Assert.Equal(tenantConnection, resolved);
    }

    [Fact]
    public void Separated_mode_fails_closed_when_tenant_database_was_not_resolved()
    {
        var context = new DefaultHttpContext();

        Assert.Throws<InvalidOperationException>(() =>
            TenantDatabaseRouting.Resolve(context));
        Assert.Throws<InvalidOperationException>(() =>
            TenantDatabaseRouting.Resolve(null));
    }

    [Fact]
    public void Request_connection_cannot_be_bypassed_by_a_legacy_connection_argument()
    {
        var context = new DefaultHttpContext();
        var tenantId = Guid.NewGuid();
        context.User = new ClaimsPrincipal(new ClaimsIdentity([new Claim("tenant_id", tenantId.ToString("D"))], "test"));
        context.Items[TenantDatabaseRouting.ConnectionItemKey] = "Server=sql;Database=AIERPPlatform";
        Assert.Throws<InvalidOperationException>(() => TenantDatabaseRouting.Resolve(context));
    }

    [Fact]
    public void Request_connection_requires_a_selected_tenant_even_when_a_connection_string_is_present()
    {
        var context = new DefaultHttpContext();
        context.Items[TenantDatabaseRouting.ConnectionItemKey] = "Server=sql;Database=AIERPTenant_abc";

        Assert.Throws<InvalidOperationException>(() => TenantDatabaseRouting.Resolve(context));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("false")]
    [InlineData("0")]
    public void Isolation_configuration_fails_closed_when_not_explicitly_true(string? setting)
    {
        var values = new Dictionary<string, string?>();
        if (setting is not null) values["Database:SeparationEnabled"] = setting;
        values["ConnectionStrings:Tenant"] = RuntimeConnection;
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(values).Build();

        var error = Assert.Throws<InvalidOperationException>(() =>
            DatabaseIsolationConfiguration.RequireEnabled(configuration, "Unit Test API", "Tenant"));

        Assert.Contains("Database:SeparationEnabled=true", error.Message);
    }

    [Fact]
    public void Isolation_configuration_requires_the_dedicated_tenant_connection()
    {
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Database:SeparationEnabled"] = "true"
        }).Build();

        var error = Assert.Throws<InvalidOperationException>(() =>
            DatabaseIsolationConfiguration.RequireEnabled(configuration, "Unit Test API", "Tenant"));

        Assert.Contains("ConnectionStrings:Tenant", error.Message);
    }

    [Fact]
    public async Task Authenticated_company_data_request_without_tenant_selection_is_marked_for_403_handling()
    {
        var context = new DefaultHttpContext();
        context.Request.Path = "/api/customers";
        context.User = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, "user")], "test"));

        await TenantDatabaseRouting.ResolveRequestAsync(context, new ServiceCollection().BuildServiceProvider(), RuntimeConnection);

        Assert.True(context.Items.ContainsKey(TenantDatabaseRouting.TenantSelectionRequiredKey));
    }

    [Fact]
    public async Task Authenticated_studio_request_without_tenant_selection_is_marked_for_403_handling()
    {
        var context = new DefaultHttpContext();
        context.Request.Path = "/studio/projects";
        context.User = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, "user")], "test"));

        await TenantDatabaseRouting.ResolveAIStudioRequestAsync(context, new ServiceCollection().BuildServiceProvider(), RuntimeConnection);

        Assert.True(context.Items.ContainsKey(TenantDatabaseRouting.TenantSelectionRequiredKey));
    }

    [Theory]
    [InlineData("/api/auth/me")]
    [InlineData("/api/platform/modules")]
    [InlineData("/health")]
    public async Task Control_plane_or_health_requests_do_not_require_a_tenant_selection(string path)
    {
        var context = new DefaultHttpContext();
        context.Request.Path = path;
        context.User = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, "user")], "test"));

        await TenantDatabaseRouting.ResolveRequestAsync(context, new ServiceCollection().BuildServiceProvider(), RuntimeConnection);

        Assert.False(context.Items.ContainsKey(TenantDatabaseRouting.TenantSelectionRequiredKey));
    }

    [Fact]
    public async Task Anonymous_request_without_tenant_selection_is_left_for_authentication_to_reject()
    {
        var context = new DefaultHttpContext();
        context.Request.Path = "/api/customers";

        await TenantDatabaseRouting.ResolveRequestAsync(context, new ServiceCollection().BuildServiceProvider(), RuntimeConnection);

        Assert.False(context.Items.ContainsKey(TenantDatabaseRouting.TenantSelectionRequiredKey));
    }

    [Fact]
    public async Task Tenant_catalog_routes_to_only_the_tenant_deterministic_database()
    {
        var tenantId = Guid.NewGuid();
        var options = new DbContextOptionsBuilder<PlatformDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        await using (var seed = new PlatformDbContext(options))
        {
            var tenant = new Tenant { Id = tenantId, Name = "Test", Slug = "test" };
            seed.Tenants.Add(tenant);
            seed.TenantDatabaseCatalog.Add(new TenantDatabaseCatalogEntry
            {
                TenantId = tenantId, Tenant = tenant, DatabaseName = $"AIERPTenant_{tenantId:N}", State = TenantDatabaseProvisioningState.Ready
            });
            await seed.SaveChangesAsync();
        }

        var services = new ServiceCollection()
            .AddScoped(_ => new PlatformDbContext(options))
            .BuildServiceProvider();
        var context = new DefaultHttpContext();
        context.Request.Path = "/api/customers";
        context.User = new ClaimsPrincipal(new ClaimsIdentity([new Claim("tenant_id", tenantId.ToString("D"))], "test"));

        await TenantDatabaseRouting.ResolveRequestAsync(context, services, RuntimeConnection);

        var routed = Assert.IsType<string>(context.Items[TenantDatabaseRouting.ConnectionItemKey]);
        Assert.Equal($"AIERPTenant_{tenantId:N}", new SqlConnectionStringBuilder(routed).InitialCatalog);
        await services.DisposeAsync();
    }

    [Fact]
    public async Task Tenant_catalog_cannot_route_company_data_to_the_shared_platform_database()
    {
        var tenantId = Guid.NewGuid();
        var options = new DbContextOptionsBuilder<PlatformDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        await using (var seed = new PlatformDbContext(options))
        {
            var tenant = new Tenant { Id = tenantId, Name = "Test", Slug = "test" };
            seed.Tenants.Add(tenant);
            seed.TenantDatabaseCatalog.Add(new TenantDatabaseCatalogEntry
            {
                TenantId = tenantId, Tenant = tenant, DatabaseName = "AIERPPlatform", State = TenantDatabaseProvisioningState.Ready
            });
            await seed.SaveChangesAsync();
        }

        var services = new ServiceCollection()
            .AddScoped(_ => new PlatformDbContext(options))
            .BuildServiceProvider();
        var context = new DefaultHttpContext();
        context.Request.Path = "/api/customers";
        context.User = new ClaimsPrincipal(new ClaimsIdentity([new Claim("tenant_id", tenantId.ToString("D"))], "test"));

        await TenantDatabaseRouting.ResolveRequestAsync(context, services, RuntimeConnection);

        Assert.True(context.Items.ContainsKey("AIERP.TenantDatabaseUnavailable"));
        Assert.False(context.Items.ContainsKey(TenantDatabaseRouting.ConnectionItemKey));
        await services.DisposeAsync();
    }

    [Theory]
    [InlineData(TenantDatabaseProvisioningState.Copying)]
    [InlineData(TenantDatabaseProvisioningState.Failed)]
    public async Task Non_ready_tenant_catalog_state_is_never_routed(TenantDatabaseProvisioningState state)
    {
        var tenantId = Guid.NewGuid();
        var options = new DbContextOptionsBuilder<PlatformDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        await using (var seed = new PlatformDbContext(options))
        {
            var tenant = new Tenant { Id = tenantId, Name = "Test", Slug = "test" };
            seed.Tenants.Add(tenant);
            seed.TenantDatabaseCatalog.Add(new TenantDatabaseCatalogEntry
            {
                TenantId = tenantId,
                Tenant = tenant,
                DatabaseName = $"AIERPTenant_{tenantId:N}",
                State = state,
                LastError = "Migration failed"
            });
            await seed.SaveChangesAsync();
        }

        var services = new ServiceCollection()
            .AddScoped(_ => new PlatformDbContext(options))
            .BuildServiceProvider();
        var context = new DefaultHttpContext();
        context.Request.Path = "/api/customers";
        context.User = new ClaimsPrincipal(new ClaimsIdentity([new Claim("tenant_id", tenantId.ToString("D"))], "test"));

        await TenantDatabaseRouting.ResolveRequestAsync(context, services, RuntimeConnection);

        Assert.True(context.Items.ContainsKey("AIERP.TenantDatabaseUnavailable"));
        Assert.False(context.Items.ContainsKey(TenantDatabaseRouting.ConnectionItemKey));
        await services.DisposeAsync();
    }
}
