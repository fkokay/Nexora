using System.Data;
using AIERP.Platform.Infrastructure;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

internal sealed class AuditRetentionWorker(IServiceScopeFactory scopeFactory, ILogger<AuditRetentionWorker> logger)
    : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await Task.Delay(DelayUntilNextRun(DateTimeOffset.UtcNow), stoppingToken);
                await using var scope = scopeFactory.CreateAsyncScope();
                var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
                var deleted = await PurgeAsync(db, null, stoppingToken);
                var deletedTotal = deleted;
                if (scope.ServiceProvider.GetRequiredService<IConfiguration>().GetValue<bool>("Database:SeparationEnabled"))
                {
                    var configuration = scope.ServiceProvider.GetRequiredService<IConfiguration>();
                    var tenantConnection = configuration.GetConnectionString("Tenant") ?? db.Database.GetDbConnection().ConnectionString;
                    var tenants = await db.TenantDatabaseCatalog.AsNoTracking().Where(x => x.State == AIERP.Platform.Domain.TenantDatabaseProvisioningState.Ready)
                        .Select(x => new { x.TenantId, x.DatabaseName }).ToListAsync(stoppingToken);
                    foreach (var entry in tenants)
                    {
                        var connection = new SqlConnectionStringBuilder(tenantConnection) { InitialCatalog = entry.DatabaseName }.ConnectionString;
                        var options = new DbContextOptionsBuilder<TenantDbContext>().UseSqlServer(connection).Options;
                        await using var tenantDb = new TenantDbContext(options);
                        deletedTotal += await PurgeAsync(tenantDb, entry.TenantId, stoppingToken);
                    }
                    var studioConnection = configuration.GetConnectionString("AIStudio") ?? tenantConnection;
                    var studioState = await db.DatabaseSeparationComponentStates.AsNoTracking().SingleOrDefaultAsync(x => x.Component == "AIStudio" && x.State == AIERP.Platform.Domain.TenantDatabaseProvisioningState.Ready, stoppingToken);
                    if (studioState is not null)
                    {
                        var connection = new SqlConnectionStringBuilder(studioConnection) { InitialCatalog = studioState.DatabaseName }.ConnectionString;
                        var options = new DbContextOptionsBuilder<AIStudioDbContext>().UseSqlServer(connection).Options;
                        await using var studioDb = new AIStudioDbContext(options);
                        deletedTotal += await PurgeAsync(studioDb, null, stoppingToken);
                    }
                }
                logger.LogInformation("Daily audit retention completed. Expired rows removed: {DeletedCount}.", deletedTotal);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception exception)
            {
                logger.LogError(exception, "Daily audit retention failed. The next scheduled run will retry.");
            }
        }
    }

    private static async Task<int> PurgeAsync(DbContext db, Guid? tenantId, CancellationToken cancellationToken)
    {
        var deletedCount = new SqlParameter("@TotalDeleted", SqlDbType.Int) { Direction = ParameterDirection.Output };
        var tenant = new SqlParameter("@TenantId", SqlDbType.UniqueIdentifier) { Value = (object?)tenantId ?? DBNull.Value };
        await db.Database.ExecuteSqlRawAsync(
            "EXEC dbo.PurgeExpiredAuditEvents @BatchSize = 500, @TenantId = @TenantId, @TotalDeleted = @TotalDeleted OUTPUT",
            new object[] { tenant, deletedCount }, cancellationToken);
        return deletedCount.Value is int count ? count : 0;
    }

    private static TimeSpan DelayUntilNextRun(DateTimeOffset now)
    {
        var nextRun = new DateTimeOffset(now.Year, now.Month, now.Day, 2, 0, 0, TimeSpan.Zero);
        if (nextRun <= now) nextRun = nextRun.AddDays(1);
        return nextRun - now;
    }
}
