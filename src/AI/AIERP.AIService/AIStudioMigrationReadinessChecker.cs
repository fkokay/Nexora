using AIERP.Platform.Infrastructure;
using Microsoft.Extensions.Caching.Memory;

namespace AIERP.AIService;

public interface IAIStudioMigrationReadinessChecker
{
    Task<AIStudioMigrationReadinessResult> CheckAsync(AIStudioDbContext database, CancellationToken cancellationToken = default);
}

internal sealed class AIStudioMigrationReadinessChecker(IMemoryCache cache) : IAIStudioMigrationReadinessChecker
{
    public Task<AIStudioMigrationReadinessResult> CheckAsync(AIStudioDbContext database,
        CancellationToken cancellationToken = default) => AIStudioMigrationReadiness.CheckAsync(cache, database, cancellationToken);
}
