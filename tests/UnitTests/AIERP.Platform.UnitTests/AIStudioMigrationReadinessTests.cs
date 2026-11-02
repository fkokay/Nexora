using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Caching.Memory;

namespace AIERP.Platform.UnitTests;

public sealed class AIStudioMigrationReadinessTests
{
    [Fact]
    public void Empty_pending_migration_list_is_ready()
    {
        var readiness = AIStudioMigrationReadinessResult.Evaluate([]);

        Assert.True(readiness.Ready);
        Assert.Null(readiness.RequiredMigration);
    }

    [Fact]
    public void Pending_migration_list_reports_the_first_required_migration()
    {
        var readiness = AIStudioMigrationReadinessResult.Evaluate([
            "20261015193036_InitialAIStudioDatabase",
            "20261023150000_AddStudioModuleSourceMappings"
        ]);

        Assert.False(readiness.Ready);
        Assert.Equal("20261015193036_InitialAIStudioDatabase", readiness.RequiredMigration);
    }

    [Fact]
    public void Migration_check_is_limited_to_authorized_studio_data_endpoints()
    {
        var authorized = new Endpoint(_ => Task.CompletedTask,
            new EndpointMetadataCollection(new AuthorizeAttribute()), "authorized");
        var anonymous = new Endpoint(_ => Task.CompletedTask,
            new EndpointMetadataCollection(new AuthorizeAttribute(), new AllowAnonymousAttribute()), "anonymous");

        Assert.True(AIStudioMigrationReadinessResult.ShouldCheckRequest("/studio/requests/", authorized));
        Assert.True(AIStudioMigrationReadinessResult.ShouldCheckRequest("/api/ai/erp-assistant", authorized));
        Assert.False(AIStudioMigrationReadinessResult.ShouldCheckRequest("/studio/github/setup-callback", anonymous));
        Assert.False(AIStudioMigrationReadinessResult.ShouldCheckRequest("/studio/capabilities", authorized));
        Assert.False(AIStudioMigrationReadinessResult.ShouldCheckRequest("/health", authorized));
    }

    [Fact]
    public async Task Concurrent_cold_checks_for_same_connection_share_one_migration_query()
    {
        using var cache = new MemoryCache(new MemoryCacheOptions());
        var queryStarted = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var releaseQuery = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var queryCount = 0;

        Task<IEnumerable<string>> GetPending(CancellationToken cancellationToken)
        {
            Interlocked.Increment(ref queryCount);
            queryStarted.TrySetResult();
            return WaitAndReturnPendingAsync(cancellationToken);
        }

        async Task<IEnumerable<string>> WaitAndReturnPendingAsync(CancellationToken cancellationToken)
        {
            await releaseQuery.Task.WaitAsync(cancellationToken);
            return [];
        }

        var checks = Enumerable.Range(0, 12)
            .Select(_ => AIStudioMigrationReadiness.CheckAsync(cache, "connection-a", GetPending))
            .ToArray();

        await queryStarted.Task.WaitAsync(TimeSpan.FromSeconds(5));
        releaseQuery.TrySetResult();
        var results = await Task.WhenAll(checks);

        Assert.Equal(1, queryCount);
        Assert.All(results, result => Assert.True(result.Ready));
    }

    [Fact]
    public async Task Readiness_cache_is_scoped_to_connection_identity()
    {
        using var cache = new MemoryCache(new MemoryCacheOptions());
        var connectionAQueries = 0;
        var connectionBQueries = 0;

        var connectionA = await AIStudioMigrationReadiness.CheckAsync(cache, "connection-a", _ =>
        {
            Interlocked.Increment(ref connectionAQueries);
            return Task.FromResult<IEnumerable<string>>([]);
        });
        var connectionB = await AIStudioMigrationReadiness.CheckAsync(cache, "connection-b", _ =>
        {
            Interlocked.Increment(ref connectionBQueries);
            return Task.FromResult<IEnumerable<string>>(["pending-migration"]);
        });

        Assert.True(connectionA.Ready);
        Assert.False(connectionB.Ready);
        Assert.Equal(1, connectionAQueries);
        Assert.Equal(1, connectionBQueries);
    }
}
