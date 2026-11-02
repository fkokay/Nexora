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
    public void Tenant_credential_guard_accepts_only_configured_https_vault_reader()
    {
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Database:SeparationEnabled"] = "true",
            ["Vault:Address"] = "https://vault.example.test:8200",
            ["Vault:Mount"] = "secret",
            ["Vault:TenantSqlCredentialReader:RoleId"] = "role",
            ["Vault:TenantSqlCredentialReader:SecretId"] = "secret-id",
            ["ASPNETCORE_ENVIRONMENT"] = "Production"
        }).Build();

        var exception = Record.Exception(() =>
            DatabaseIsolationConfiguration.RequireTenantCredentialIsolation("Unit Test API", configuration));

        Assert.Null(exception);
    }

    [Theory]
    [InlineData("http://vault.example.test:8200", "Production", false)]
    [InlineData("http://vault.example.test:8200", "Development", false)]
    public void Tenant_credential_guard_rejects_insecure_or_unapproved_vault_transport(string address,
        string environment, bool allowHttp)
    {
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Database:SeparationEnabled"] = "true",
            ["Vault:Address"] = address,
            ["Vault:AllowHttpForLocalDevelopment"] = allowHttp.ToString(),
            ["Vault:TenantSqlCredentialReader:RoleId"] = "role",
            ["Vault:TenantSqlCredentialReader:SecretId"] = "secret-id",
            ["ASPNETCORE_ENVIRONMENT"] = environment
        }).Build();

        Assert.Throws<InvalidOperationException>(() =>
            DatabaseIsolationConfiguration.RequireTenantCredentialIsolation("Unit Test API", configuration));
    }

    [Fact]
    public void Tenant_credential_guard_requires_a_separate_writer_for_provisioning()
    {
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Database:SeparationEnabled"] = "true",
            ["Vault:Address"] = "https://vault.example.test:8200",
            ["Vault:TenantSqlCredentialReader:RoleId"] = "reader-role",
            ["Vault:TenantSqlCredentialReader:SecretId"] = "reader-secret",
            ["Vault:TenantSqlCredentialWriter:RoleId"] = "writer-role"
        }).Build();

        Assert.Throws<InvalidOperationException>(() =>
            DatabaseIsolationConfiguration.RequireTenantCredentialIsolation("Provisioner", configuration,
                requireProvisioningWriter: true));
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

    [Fact]
    public async Task Studio_catalog_routes_to_the_selected_tenants_separate_database_and_login()
    {
        var tenantId = Guid.NewGuid();
        var options = new DbContextOptionsBuilder<PlatformDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        await using (var seed = new PlatformDbContext(options))
        {
            seed.Tenants.Add(new Tenant { Id = tenantId, Name = "Test", Slug = "test" });
            seed.DatabaseSeparationComponentStates.Add(new DatabaseSeparationComponentState
            {
                Component = TenantDatabaseRouting.StudioComponentKey(tenantId),
                DatabaseName = TenantSqlCredentialPath.DatabaseName(tenantId, TenantSqlDatabaseComponent.AiStudio),
                State = TenantDatabaseProvisioningState.Ready
            });
            await seed.SaveChangesAsync();
        }
        var services = new ServiceCollection()
            .AddScoped(_ => new PlatformDbContext(options))
            .AddSingleton<ITenantSqlCredentialReader>(new TestTenantSqlCredentialReader(tenantId, expectedComponent: TenantSqlDatabaseComponent.AiStudio))
            .BuildServiceProvider();
        var context = new DefaultHttpContext();
        context.Request.Path = "/studio/projects";
        context.User = new ClaimsPrincipal(new ClaimsIdentity([new Claim("tenant_id", tenantId.ToString("D"))], "test"));

        await TenantDatabaseRouting.ResolveAIStudioRequestAsync(context, services, "Server=sql;Database=AIERPStudio;Integrated Security=True");

        var routed = Assert.IsType<string>(context.Items[TenantDatabaseRouting.StudioConnectionItemKey]);
        var routedBuilder = new SqlConnectionStringBuilder(routed);
        Assert.Equal($"AIERPStudio_{tenantId:N}", routedBuilder.InitialCatalog);
        Assert.Equal($"aierp_s_{tenantId:N}", routedBuilder.UserID);
        Assert.False(routedBuilder.IntegratedSecurity);
        Assert.Equal(routed, TenantDatabaseRouting.ResolveStudio(context));
        await services.DisposeAsync();
    }

    [Fact]
    public async Task Legacy_shared_studio_database_is_never_routed_for_a_tenant()
    {
        var tenantId = Guid.NewGuid();
        var options = new DbContextOptionsBuilder<PlatformDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        await using (var seed = new PlatformDbContext(options))
        {
            seed.DatabaseSeparationComponentStates.Add(new DatabaseSeparationComponentState
            {
                Component = "AIStudio", DatabaseName = "AIERPStudio", State = TenantDatabaseProvisioningState.Ready
            });
            await seed.SaveChangesAsync();
        }
        var services = new ServiceCollection()
            .AddScoped(_ => new PlatformDbContext(options))
            .AddSingleton<ITenantSqlCredentialReader>(new TestTenantSqlCredentialReader(tenantId, expectedComponent: TenantSqlDatabaseComponent.AiStudio))
            .BuildServiceProvider();
        var context = new DefaultHttpContext();
        context.Request.Path = "/studio/projects";
        context.User = new ClaimsPrincipal(new ClaimsIdentity([new Claim("tenant_id", tenantId.ToString("D"))], "test"));

        await TenantDatabaseRouting.ResolveAIStudioRequestAsync(context, services, RuntimeConnection);

        Assert.True(context.Items.ContainsKey("AIERP.AIStudioDatabaseUnavailable"));
        Assert.False(context.Items.ContainsKey(TenantDatabaseRouting.StudioConnectionItemKey));
        await services.DisposeAsync();
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
            .AddSingleton<ITenantSqlCredentialReader>(new TestTenantSqlCredentialReader(tenantId))
            .BuildServiceProvider();
        var context = new DefaultHttpContext();
        context.Request.Path = "/api/customers";
        context.User = new ClaimsPrincipal(new ClaimsIdentity([new Claim("tenant_id", tenantId.ToString("D"))], "test"));

        await TenantDatabaseRouting.ResolveRequestAsync(context, services, RuntimeConnection);

        var routed = Assert.IsType<string>(context.Items[TenantDatabaseRouting.ConnectionItemKey]);
        var routedBuilder = new SqlConnectionStringBuilder(routed);
        Assert.Equal($"AIERPTenant_{tenantId:N}", routedBuilder.InitialCatalog);
        Assert.Equal($"aierp_t_{tenantId:N}", routedBuilder.UserID);
        Assert.Equal("tenant-secret", routedBuilder.Password);
        Assert.False(routedBuilder.IntegratedSecurity);
        await services.DisposeAsync();
    }

    [Fact]
    public async Task Tenant_credential_for_another_database_is_never_routed()
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
            .AddSingleton<ITenantSqlCredentialReader>(new TestTenantSqlCredentialReader(tenantId, databaseName: "AIERPPlatform"))
            .BuildServiceProvider();
        var context = new DefaultHttpContext();
        context.Request.Path = "/api/customers";
        context.User = new ClaimsPrincipal(new ClaimsIdentity([new Claim("tenant_id", tenantId.ToString("D"))], "test"));

        await TenantDatabaseRouting.ResolveRequestAsync(context, services, RuntimeConnection);

        Assert.True(context.Items.ContainsKey("AIERP.TenantDatabaseUnavailable"));
        Assert.False(context.Items.ContainsKey(TenantDatabaseRouting.ConnectionItemKey));
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

internal sealed class TestTenantSqlCredentialReader(Guid tenantId, string? databaseName = null,
    TenantSqlDatabaseComponent expectedComponent = TenantSqlDatabaseComponent.Erp) : ITenantSqlCredentialReader
{
    public Task<TenantSqlCredential> ReadAsync(Guid requestedTenantId, TenantSqlDatabaseComponent component,
        string secretReference, CancellationToken cancellationToken = default)
    {
        Assert.Equal(tenantId, requestedTenantId);
        Assert.Equal(expectedComponent, component);
        Assert.Equal(TenantSqlCredentialPath.ForTenant(tenantId, component), secretReference);
        return Task.FromResult(new TenantSqlCredential(
            databaseName ?? TenantSqlCredentialPath.DatabaseName(tenantId, component),
            component == TenantSqlDatabaseComponent.Erp ? $"aierp_t_{tenantId:N}" : $"aierp_s_{tenantId:N}", "tenant-secret", 1));
    }
}
