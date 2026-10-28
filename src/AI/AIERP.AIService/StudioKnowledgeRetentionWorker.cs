using AIERP.Platform.Infrastructure;
using AIERP.Platform.Domain;
using Microsoft.EntityFrameworkCore;

namespace AIERP.AIService;

/// <summary>
/// Removes explicitly indexed source snapshots after their configured retention period.
/// The newest snapshot is not exempt: retained source code must be re-indexed by a
/// project contributor, with the normal AI-sharing confirmation, after it expires.
/// </summary>
public sealed class StudioKnowledgeRetentionWorker : BackgroundService
{
    private readonly ILogger<StudioKnowledgeRetentionWorker> _logger;
    private readonly int _retentionDays;
    private readonly string _platformConnection;
    private readonly string _studioRuntimeConnection;
    private readonly ITenantSqlCredentialReader _credentialReader;

    public StudioKnowledgeRetentionWorker(IConfiguration configuration, ITenantSqlCredentialReader credentialReader,
        ILogger<StudioKnowledgeRetentionWorker> logger)
    {
        _logger = logger;
        _credentialReader = credentialReader;
        _retentionDays = ReadRetentionDays(configuration);
        _platformConnection = configuration.GetConnectionString("Platform")
            ?? throw new InvalidOperationException("ConnectionStrings:Platform is required for Studio knowledge retention.");
        _studioRuntimeConnection = configuration.GetConnectionString("AIStudio")
            ?? throw new InvalidOperationException("ConnectionStrings:AIStudio is required for Studio knowledge retention.");
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            // Let the API become ready before the first potentially large cleanup.
            await Task.Delay(TimeSpan.FromMinutes(10), stoppingToken);
            using var timer = new PeriodicTimer(TimeSpan.FromHours(24));
            do
            {
                await PurgeExpiredAsync(stoppingToken);
            }
            while (await timer.WaitForNextTickAsync(stoppingToken));
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Normal host shutdown.
        }
    }

    private async Task PurgeExpiredAsync(CancellationToken cancellationToken)
    {
        try
        {
            var states = await GetReadyStudioTenantsAsync(cancellationToken);
            var cutoff = DateTimeOffset.UtcNow.AddDays(-_retentionDays);
            var deleted = 0;
            var expiredConsents = 0;
            foreach (var tenantId in states)
            {
                var secretReference = TenantSqlCredentialPath.ForTenant(tenantId, TenantSqlDatabaseComponent.AiStudio);
                var credential = await _credentialReader.ReadAsync(tenantId, TenantSqlDatabaseComponent.AiStudio,
                    secretReference, cancellationToken);
                var connection = TenantDatabaseRouting.BuildComponentConnectionString(_studioRuntimeConnection,
                    tenantId, TenantSqlDatabaseComponent.AiStudio, credential);
                var options = new DbContextOptionsBuilder<AIStudioDbContext>().UseSqlServer(connection).Options;
                await using var db = new AIStudioDbContext(options);
                deleted += await db.StudioKnowledgeDocuments
                    .Where(document => document.IndexedAt < cutoff)
                    .ExecuteDeleteAsync(cancellationToken);
                expiredConsents += await db.StudioKnowledgeRefreshConsents
                    .Where(consent => consent.LastRefreshedAt < cutoff)
                    .ExecuteDeleteAsync(cancellationToken);
            }

            _logger.LogInformation(
                "Studio source index retention completed. Deleted {DeletedCount} expired snapshots and {ExpiredConsentCount} inactive refresh consents older than {RetentionDays} days.",
                deleted,
                expiredConsents,
                _retentionDays);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception exception)
        {
            // Do not stop the AI service. The next daily pass retries the cleanup.
            _logger.LogError(exception, "Studio source index retention failed; the next daily pass will retry.");
        }
    }

    private async Task<IReadOnlyList<Guid>> GetReadyStudioTenantsAsync(CancellationToken cancellationToken)
    {
        var platformOptions = new DbContextOptionsBuilder<PlatformDbContext>()
            .UseSqlServer(_platformConnection)
            .Options;
        await using var platform = new PlatformDbContext(platformOptions);
        var states = await platform.DatabaseSeparationComponentStates.AsNoTracking()
            .Where(x => x.Component.StartsWith("AIStudio:") && x.State == TenantDatabaseProvisioningState.Ready)
            .Select(x => new { x.Component, x.DatabaseName })
            .ToListAsync(cancellationToken);
        var tenants = new List<Guid>(states.Count);
        foreach (var state in states)
        {
            var suffix = state.Component["AIStudio:".Length..];
            if (!Guid.TryParseExact(suffix, "N", out var tenantId)
                || TenantDatabaseRouting.StudioComponentKey(tenantId) != state.Component
                || TenantSqlCredentialPath.DatabaseName(tenantId, TenantSqlDatabaseComponent.AiStudio) != state.DatabaseName)
                throw new InvalidOperationException("AIStudio tenant catalog entry is not canonical; retention stopped.");
            tenants.Add(tenantId);
        }
        return tenants;
    }

    private static int ReadRetentionDays(IConfiguration configuration)
    {
        var configured = configuration.GetValue<int?>("StudioKnowledge:RetentionDays");
        return configured is >= 30 and <= 3650 ? configured.Value : 180;
    }
}
