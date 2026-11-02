using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.EntityFrameworkCore;
using System.Collections.Concurrent;
using System.Runtime.CompilerServices;
using System.Security.Cryptography;
using System.Text;

namespace AIERP.Platform.Infrastructure;

public sealed record AIStudioMigrationReadinessResult(bool Ready, string? RequiredMigration)
{
    public static AIStudioMigrationReadinessResult Evaluate(IEnumerable<string> pendingMigrations)
    {
        ArgumentNullException.ThrowIfNull(pendingMigrations);
        var firstPending = pendingMigrations.OrderBy(migration => migration, StringComparer.Ordinal).FirstOrDefault();
        return firstPending is null
            ? new AIStudioMigrationReadinessResult(true, null)
            : new AIStudioMigrationReadinessResult(false, firstPending);
    }

    public static bool ShouldCheckRequest(PathString path, Endpoint? endpoint)
    {
        if (endpoint is null || endpoint.Metadata.GetMetadata<IAllowAnonymous>() is not null
            || endpoint.Metadata.GetOrderedMetadata<IAuthorizeData>().Count == 0)
            return false;

        if (path.StartsWithSegments("/api/ai/erp-assistant", StringComparison.OrdinalIgnoreCase)) return true;
        if (!path.StartsWithSegments("/studio", StringComparison.OrdinalIgnoreCase)) return false;

        // These authorized endpoints use PlatformDB only and do not need AIStudio schema readiness.
        var route = path.Value?.TrimEnd('/');
        return !string.Equals(route, "/studio/capabilities", StringComparison.OrdinalIgnoreCase)
            && !string.Equals(route, "/studio/modules/active", StringComparison.OrdinalIgnoreCase);
    }
}

public static class AIStudioMigrationReadiness
{
    private static readonly ConditionalWeakTable<IMemoryCache, ConcurrentDictionary<string, SemaphoreSlim>> Gates = new();
    private static readonly TimeSpan CacheDuration = TimeSpan.FromSeconds(30);

    public static async Task<AIStudioMigrationReadinessResult> CheckAsync(IMemoryCache cache,
        AIStudioDbContext database, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(cache);
        ArgumentNullException.ThrowIfNull(database);

        var connectionString = database.Database.GetConnectionString();
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            // A context without a configured connection cannot safely share a readiness result.
            return AIStudioMigrationReadinessResult.Evaluate(
                await database.Database.GetPendingMigrationsAsync(cancellationToken));
        }

        var connectionIdentity = CreateConnectionIdentity(database.Database.ProviderName, connectionString);
        return await CheckAsync(cache, connectionIdentity,
            token => database.Database.GetPendingMigrationsAsync(token), cancellationToken);
    }

    public static async Task<AIStudioMigrationReadinessResult> CheckAsync(IMemoryCache cache,
        string connectionIdentity, Func<CancellationToken, Task<IEnumerable<string>>> getPendingMigrations,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(cache);
        ArgumentException.ThrowIfNullOrWhiteSpace(connectionIdentity);
        ArgumentNullException.ThrowIfNull(getPendingMigrations);

        var cacheKey = $"AIStudio:MigrationReadiness:{connectionIdentity}";
        if (cache.TryGetValue<AIStudioMigrationReadinessResult>(cacheKey, out var cached) && cached is not null)
            return cached;

        var gates = Gates.GetValue(cache, _ => new ConcurrentDictionary<string, SemaphoreSlim>(StringComparer.Ordinal));
        var gate = gates.GetOrAdd(cacheKey, static _ => new SemaphoreSlim(1, 1));
        await gate.WaitAsync(cancellationToken);
        try
        {
            if (cache.TryGetValue<AIStudioMigrationReadinessResult>(cacheKey, out cached) && cached is not null)
                return cached;

            var pending = await getPendingMigrations(cancellationToken);
            cancellationToken.ThrowIfCancellationRequested();
            var result = AIStudioMigrationReadinessResult.Evaluate(pending);
            cache.Set(cacheKey, result, CacheDuration);
            return result;
        }
        finally
        {
            gate.Release();
        }
    }

    private static string CreateConnectionIdentity(string? providerName, string connectionString)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes($"{providerName}\n{connectionString}"));
        return Convert.ToHexString(bytes);
    }
}
