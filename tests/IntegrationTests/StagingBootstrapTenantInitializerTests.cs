using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

public sealed class StagingBootstrapTenantInitializerTests
{
    [Fact]
    public async Task Staging_initializer_creates_one_inactive_isolated_tenant_and_resumes_idempotently()
    {
        var tenantId = Guid.NewGuid();
        var databaseName = $"staging-bootstrap-{Guid.NewGuid():N}";
        var services = new ServiceCollection();
        services.AddDbContext<PlatformDbContext>(options => options.UseInMemoryDatabase(databaseName));
        await using var provider = services.BuildServiceProvider();
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["StagingBootstrap:Enabled"] = "true",
            ["StagingBootstrap:TenantId"] = tenantId.ToString("D"),
            ["Database:SeparationEnabled"] = "true",
            ["Bootstrap:Email"] = "staging-admin@example.test",
            ["Bootstrap:Password"] = "a-long-random-staging-password",
            ["Bootstrap:DisplayName"] = "Staging Admin",
            ["Bootstrap:TenantName"] = "Nexora Staging"
        }).Build();
        var environment = new TestHostEnvironment();
        var initializer = new StagingBootstrapTenantInitializer(provider.GetRequiredService<IServiceScopeFactory>(),
            configuration, environment, NullLogger<StagingBootstrapTenantInitializer>.Instance);
        await using (var seedScope = provider.CreateAsyncScope())
        {
            var seed = seedScope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            seed.PermissionDefinitions.Add(new PermissionDefinition
            {
                Code = "erp.test.read",
                ResourceType = "erp.test",
                Action = "read",
                Description = "Test permission"
            });
            await seed.SaveChangesAsync();
        }

        await initializer.StartAsync(CancellationToken.None);
        await initializer.StartAsync(CancellationToken.None);

        await using var scope = provider.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        var tenant = await db.Tenants.SingleAsync(x => x.Id == tenantId);
        var admin = await db.Users.SingleAsync(x => x.Email == "staging-admin@example.test");
        Assert.False(tenant.IsActive);
        Assert.Equal($"staging-{tenantId:N}", tenant.Slug);
        Assert.Equal("AIERPTenant_" + tenantId.ToString("N"),
            (await db.TenantDatabaseCatalog.SingleAsync(x => x.TenantId == tenantId)).DatabaseName);
        Assert.Equal(TenantDatabaseProvisioningState.Provisioning,
            (await db.TenantDatabaseCatalog.SingleAsync(x => x.TenantId == tenantId)).State);
        Assert.Equal(TenantProvisioningJobStatus.Queued,
            (await db.TenantProvisioningJobs.SingleAsync(x => x.TenantId == tenantId)).Status);
        Assert.Contains(await db.TenantMemberships.ToListAsync(), x => x.TenantId == tenantId && x.UserId == admin.Id && x.Role == "TenantAdmin");
        Assert.DoesNotContain(await db.PlatformUserRoles.ToListAsync(), x => x.UserId == admin.Id && x.Role == "PlatformSuperAdmin");
        Assert.Equal(1, await db.AuditEvents.CountAsync(x => x.Action == "staging.tenant.bootstrap"));
        Assert.Equal(1, await db.TenantPermissionRules.CountAsync(x => x.TenantId == tenantId));

        var catalog = await db.TenantDatabaseCatalog.SingleAsync(x => x.TenantId == tenantId);
        catalog.State = TenantDatabaseProvisioningState.Ready;
        var studio = new DatabaseSeparationComponentState
        {
            Component = TenantDatabaseRouting.StudioComponentKey(tenantId),
            DatabaseName = TenantSqlCredentialPath.DatabaseName(tenantId, TenantSqlDatabaseComponent.AiStudio),
            State = TenantDatabaseProvisioningState.Ready
        };
        db.DatabaseSeparationComponentStates.Add(studio);
        var job = await db.TenantProvisioningJobs.SingleAsync(x => x.TenantId == tenantId);
        job.Status = TenantProvisioningJobStatus.Completed;
        job.CompletedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync();

        await initializer.StartAsync(CancellationToken.None);

        db.ChangeTracker.Clear();
        Assert.True((await db.Tenants.SingleAsync(x => x.Id == tenantId)).IsActive);
        Assert.Equal(1, await db.TenantProvisioningJobs.CountAsync(x => x.TenantId == tenantId));
        Assert.Equal(1, await db.TenantPermissionRules.CountAsync(x => x.TenantId == tenantId));
        Assert.Equal(1, await db.AuditEvents.CountAsync(x => x.Action == "staging.tenant.bootstrap"));
    }

    [Fact]
    public async Task Staging_initializer_refuses_to_run_outside_staging()
    {
        var services = new ServiceCollection();
        services.AddDbContext<PlatformDbContext>(options => options.UseInMemoryDatabase(Guid.NewGuid().ToString("N")));
        await using var provider = services.BuildServiceProvider();
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["StagingBootstrap:Enabled"] = "true"
        }).Build();
        var environment = new TestHostEnvironment { EnvironmentName = "Production" };
        var initializer = new StagingBootstrapTenantInitializer(provider.GetRequiredService<IServiceScopeFactory>(),
            configuration, environment, NullLogger<StagingBootstrapTenantInitializer>.Instance);

        await Assert.ThrowsAsync<InvalidOperationException>(() => initializer.StartAsync(CancellationToken.None));
    }

    private sealed class TestHostEnvironment : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = "Staging";
        public string ApplicationName { get; set; } = "AIERP.Api.Tests";
        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}
