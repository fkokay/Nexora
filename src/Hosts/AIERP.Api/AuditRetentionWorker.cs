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
                var configuration = scope.ServiceProvider.GetRequiredService<IConfiguration>();
                var tenantConnection = configuration.GetConnectionString("Tenant")
                    ?? throw new InvalidOperationException("ConnectionStrings:Tenant is required for audit retention.");
                var credentialReader = scope.ServiceProvider.GetRequiredService<ITenantSqlCredentialReader>();
                var tenants = await db.TenantDatabaseCatalog.AsNoTracking().Where(x => x.State == AIERP.Platform.Domain.TenantDatabaseProvisioningState.Ready)
                    .Select(x => new { x.TenantId, x.DatabaseName }).ToListAsync(stoppingToken);
                foreach (var entry in tenants)
                {
                    if (entry.DatabaseName != $"AIERPTenant_{entry.TenantId:N}")
                        throw new InvalidOperationException("Tenant database catalog entry does not match its tenant identity.");
                    var secretReference = TenantSqlCredentialPath.ForTenant(entry.TenantId, TenantSqlDatabaseComponent.Erp);
                    var credential = await credentialReader.ReadAsync(entry.TenantId, TenantSqlDatabaseComponent.Erp, secretReference, stoppingToken);
                    var connection = TenantDatabaseRouting.BuildTenantConnectionString(tenantConnection, entry.TenantId, credential);
                    var options = new DbContextOptionsBuilder<TenantDbContext>().UseSqlServer(connection).Options;
                    await using var tenantDb = new TenantDbContext(options);
                    deletedTotal += await PurgeAsync(tenantDb, entry.TenantId, stoppingToken);
                }
                var studioRuntimeConnection = configuration.GetConnectionString("AIStudio")
                    ?? throw new InvalidOperationException("ConnectionStrings:AIStudio is required for audit retention.");
                var studioStates = await db.DatabaseSeparationComponentStates.AsNoTracking()
                    .Where(x => x.Component.StartsWith("AIStudio:") && x.State == AIERP.Platform.Domain.TenantDatabaseProvisioningState.Ready)
                    .Select(x => new { x.Component, x.DatabaseName })
                    .ToListAsync(stoppingToken);
                foreach (var studioState in studioStates)
                {
                    var suffix = studioState.Component["AIStudio:".Length..];
                    if (!Guid.TryParseExact(suffix, "N", out var studioTenantId)
                        || TenantDatabaseRouting.StudioComponentKey(studioTenantId) != studioState.Component
                        || TenantSqlCredentialPath.DatabaseName(studioTenantId, TenantSqlDatabaseComponent.AiStudio) != studioState.DatabaseName)
                        throw new InvalidOperationException("AIStudio tenant catalog entry is not canonical; audit retention stopped.");
                    var secretReference = TenantSqlCredentialPath.ForTenant(studioTenantId, TenantSqlDatabaseComponent.AiStudio);
                    var credential = await credentialReader.ReadAsync(studioTenantId, TenantSqlDatabaseComponent.AiStudio,
                        secretReference, stoppingToken);
                    var connection = TenantDatabaseRouting.BuildComponentConnectionString(studioRuntimeConnection,
                        studioTenantId, TenantSqlDatabaseComponent.AiStudio, credential);
                    var options = new DbContextOptionsBuilder<AIStudioDbContext>().UseSqlServer(connection).Options;
                    await using var studioDb = new AIStudioDbContext(options);
                    deletedTotal += await PurgeAsync(studioDb, studioTenantId, stoppingToken);
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
