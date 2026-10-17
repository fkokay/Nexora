using AIERP.Platform.Infrastructure;
using AIERP.Platform.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.Data.SqlClient;

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
    private readonly bool _separationEnabled;
    private readonly string _studioConnection;

    public StudioKnowledgeRetentionWorker(IConfiguration configuration, ILogger<StudioKnowledgeRetentionWorker> logger)
    {
        _logger = logger;
        _retentionDays = ReadRetentionDays(configuration);
        _platformConnection = configuration.GetConnectionString("Platform")
            ?? throw new InvalidOperationException("ConnectionStrings:Platform is required for Studio knowledge retention.");
        _separationEnabled = configuration.GetValue<bool>("Database:SeparationEnabled");
        _studioConnection = _separationEnabled
            ? configuration.GetConnectionString("AIStudio") ?? _platformConnection
            : _platformConnection;
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
            var studioConnection = await ResolveStudioConnectionAsync(cancellationToken);
            if (studioConnection is null) return;
            var options = new DbContextOptionsBuilder<AIStudioDbContext>()
                .UseSqlServer(studioConnection)
                .Options;
            await using var db = new AIStudioDbContext(options);
            var cutoff = DateTimeOffset.UtcNow.AddDays(-_retentionDays);
            var deleted = await db.StudioKnowledgeDocuments
                .Where(document => document.IndexedAt < cutoff)
                .ExecuteDeleteAsync(cancellationToken);

            _logger.LogInformation(
                "Studio source index retention completed. Deleted {DeletedCount} expired snapshots older than {RetentionDays} days.",
                deleted,
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

    private async Task<string?> ResolveStudioConnectionAsync(CancellationToken cancellationToken)
    {
        if (!_separationEnabled) return _studioConnection;

        var platformOptions = new DbContextOptionsBuilder<PlatformDbContext>()
            .UseSqlServer(_platformConnection)
            .Options;
        await using var platform = new PlatformDbContext(platformOptions);
        var state = await platform.DatabaseSeparationComponentStates.AsNoTracking()
            .SingleOrDefaultAsync(x => x.Component == "AIStudio", cancellationToken);
        if (state is null || state.State != TenantDatabaseProvisioningState.Ready)
        {
            _logger.LogInformation("Studio source index retention skipped because the separated AIStudio database is not ready.");
            return null;
        }

        var builder = new SqlConnectionStringBuilder(_studioConnection)
        {
            InitialCatalog = state.DatabaseName
        };
        return builder.ConnectionString;
    }

    private static int ReadRetentionDays(IConfiguration configuration)
    {
        var configured = configuration.GetValue<int?>("StudioKnowledge:RetentionDays");
        return configured is >= 30 and <= 3650 ? configured.Value : 180;
    }
}
