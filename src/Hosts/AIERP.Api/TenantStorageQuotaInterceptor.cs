using System.Data;
using System.Data.Common;
using System.Globalization;
using System.Runtime.CompilerServices;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.EntityFrameworkCore.Storage;

namespace AIERP.Api;

/// <summary>
/// Enforces the licensed SQL data-page limit immediately around tenant writes.
/// The tenant lock serializes writes across API replicas; the Platform lock keeps a
/// concurrent license downgrade from changing the profile during the tenant commit.
/// </summary>
internal sealed class TenantStorageQuotaInterceptor(
    PlatformDbContext platformDb,
    ITenantStorageLimitProvider limitProvider,
    ILogger<TenantStorageQuotaInterceptor> logger) : SaveChangesInterceptor, IAsyncDisposable, IDisposable
{
    private const int LockTimeoutMilliseconds = 10_000;
    private readonly ConditionalWeakTable<TenantDbContext, PendingQuotaCheck> _pending = new();
    private readonly List<PendingQuotaCheck> _activeChecks = [];
    private readonly object _sync = new();
    private bool _disposed;

    public override InterceptionResult<int> SavingChanges(DbContextEventData eventData, InterceptionResult<int> result)
    {
        Prepare(eventData.Context, CancellationToken.None).GetAwaiter().GetResult();
        return result;
    }

    public override async ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData eventData, InterceptionResult<int> result, CancellationToken cancellationToken = default)
    {
        await Prepare(eventData.Context, cancellationToken);
        return result;
    }

    public override int SavedChanges(SaveChangesCompletedEventData eventData, int result)
    {
        Complete(eventData.Context, CancellationToken.None).GetAwaiter().GetResult();
        return result;
    }

    public override async ValueTask<int> SavedChangesAsync(
        SaveChangesCompletedEventData eventData, int result, CancellationToken cancellationToken = default)
    {
        await Complete(eventData.Context, cancellationToken);
        return result;
    }

    public override void SaveChangesFailed(DbContextErrorEventData eventData)
    {
        Fail(eventData.Context, CancellationToken.None).GetAwaiter().GetResult();
    }

    public override async Task SaveChangesFailedAsync(DbContextErrorEventData eventData, CancellationToken cancellationToken = default)
    {
        await Fail(eventData.Context, cancellationToken);
    }

    private async Task Prepare(DbContext? context, CancellationToken cancellationToken)
    {
        if (context is not TenantDbContext tenantDb || !HasGrowthWrites(tenantDb)) return;
        if (!tenantDb.Database.IsSqlServer()) return; // In-memory TestServer and model-only tooling have no SQL allocation meter.

        var tenantId = ResolveTenantId(tenantDb);
        var state = GetOrCreate(tenantDb, tenantId);
        try
        {
            await AcquirePlatformLicenseLockAsync(tenantId, state, cancellationToken);
            var maxBytes = await limitProvider.GetLimitBytesAsync(tenantId, cancellationToken);

            // A caller-owned transaction stays caller-owned. Otherwise create a transaction here so
            // the tenant application lock remains held through the post-write measurement and commit.
            if (tenantDb.Database.CurrentTransaction is null)
            {
                state.OwnsTenantTransaction = true;
                state.TenantTransaction = await tenantDb.Database.BeginTransactionAsync(cancellationToken);
            }
            else
            {
                state.OwnsTenantTransaction = false;
                state.TenantTransaction = tenantDb.Database.CurrentTransaction;
            }

            await AcquireTenantWriteLockAsync(tenantDb, tenantId, state, cancellationToken);
            var usedBytes = await ReadSqlDataBytesAsync(tenantDb, state.TenantTransaction, cancellationToken);
            if (usedBytes >= maxBytes)
                throw new TenantStorageQuotaExceededException(usedBytes, maxBytes);

            state.MaxBytes = maxBytes;
        }
        catch (Exception exception)
        {
            await RollbackAndReleaseAfterRejectedWriteAsync(tenantDb, state, cancellationToken);
            if (exception is TenantStorageQuotaExceededException) throw;
            logger.LogWarning("Tenant storage quota could not be verified for {TenantId} ({FailureType}); the write was rejected.",
                tenantId, exception.GetType().Name);
            throw new TenantStorageQuotaUnavailableException(tenantId, exception);
        }
    }

    private async Task Complete(DbContext? context, CancellationToken cancellationToken)
    {
        if (context is not TenantDbContext tenantDb || !_pending.TryGetValue(tenantDb, out var state)) return;
        try
        {
            var usedBytes = await ReadSqlDataBytesAsync(tenantDb, state.TenantTransaction, cancellationToken);
            if (usedBytes >= state.MaxBytes)
            {
                await RollbackAndReleaseAfterRejectedWriteAsync(tenantDb, state, cancellationToken);
                throw new TenantStorageQuotaExceededException(usedBytes, state.MaxBytes);
            }

            if (state.OwnsTenantTransaction)
            {
                await state.TenantTransaction!.CommitAsync(cancellationToken);
                await state.TenantTransaction.DisposeAsync();
                state.TenantTransaction = null;
                await ReleaseAndRemoveAsync(tenantDb, state);
            }
            // An explicit caller transaction remains open. Keep the Platform session lock until
            // the scoped interceptor is disposed, which occurs after the tenant transaction scope.
        }
        catch (TenantStorageQuotaExceededException) { throw; }
        catch (Exception exception)
        {
            await RollbackAndReleaseAfterRejectedWriteAsync(tenantDb, state, cancellationToken);
            logger.LogWarning("Tenant storage quota post-write check failed for {TenantId} ({FailureType}); the tenant transaction was rolled back.",
                state.TenantId, exception.GetType().Name);
            throw new TenantStorageQuotaUnavailableException(state.TenantId, exception);
        }
    }

    private async Task Fail(DbContext? context, CancellationToken cancellationToken)
    {
        if (context is TenantDbContext tenantDb && _pending.TryGetValue(tenantDb, out var state))
            await RollbackAndReleaseAfterRejectedWriteAsync(tenantDb, state, cancellationToken);
    }

    private PendingQuotaCheck GetOrCreate(TenantDbContext tenantDb, Guid tenantId)
    {
        if (_pending.TryGetValue(tenantDb, out var existing))
        {
            if (existing.TenantId != tenantId)
                throw new TenantStorageQuotaUnavailableException(tenantId, new InvalidOperationException("Tenant identity changed during a database context lifetime."));
            return existing;
        }

        var state = new PendingQuotaCheck(tenantId);
        _pending.Add(tenantDb, state);
        lock (_sync) _activeChecks.Add(state);
        return state;
    }

    private static bool HasGrowthWrites(TenantDbContext db) => db.ChangeTracker.Entries()
        .Any(entry => entry.State is EntityState.Added or EntityState.Modified);

    private static Guid ResolveTenantId(TenantDbContext tenantDb)
    {
        var connection = new SqlConnectionStringBuilder(tenantDb.Database.GetConnectionString());
        var databaseName = connection.InitialCatalog;
        const string prefix = "AIERPTenant_";
        if (!databaseName.StartsWith(prefix, StringComparison.Ordinal) ||
            !Guid.TryParseExact(databaseName[prefix.Length..], "N", out var tenantId) || tenantId == Guid.Empty)
            throw new TenantStorageQuotaUnavailableException(Guid.Empty,
                new InvalidOperationException("Tenant data writes require a canonical separated tenant database."));

        if (tenantDb.ExecutionTenantId is { } executionTenantId && executionTenantId != tenantId)
            throw new TenantStorageQuotaUnavailableException(tenantId,
                new InvalidOperationException("Tenant execution identity does not match the routed database."));
        return tenantId;
    }

    private async Task AcquirePlatformLicenseLockAsync(Guid tenantId, PendingQuotaCheck state, CancellationToken cancellationToken)
    {
        if (state.PlatformLockHeld) return;
        var connection = platformDb.Database.GetDbConnection();
        state.PlatformConnection = connection;
        state.PlatformConnectionWasClosed = connection.State != ConnectionState.Open;
        if (state.PlatformConnectionWasClosed) await connection.OpenAsync(cancellationToken);

        await using var command = connection.CreateCommand();
        command.Transaction = platformDb.Database.CurrentTransaction?.GetDbTransaction();
        command.CommandText = "DECLARE @lockResult int; EXEC @lockResult = sys.sp_getapplock @Resource = @resource, @LockMode = N'Exclusive', @LockOwner = N'Session', @LockTimeout = @timeout; SELECT @lockResult;";
        command.CommandTimeout = 15;
        AddParameter(command, "@resource", DbType.String, $"Nexora:TenantQuota:{tenantId:N}", 255);
        AddParameter(command, "@timeout", DbType.Int32, LockTimeoutMilliseconds);
        var result = Convert.ToInt32(await command.ExecuteScalarAsync(cancellationToken), CultureInfo.InvariantCulture);
        if (result < 0)
            throw new TenantStorageQuotaUnavailableException(tenantId,
                new TimeoutException("The tenant license quota lock could not be acquired."));
        state.PlatformLockHeld = true;
    }

    private static async Task AcquireTenantWriteLockAsync(TenantDbContext tenantDb, Guid tenantId,
        PendingQuotaCheck state, CancellationToken cancellationToken)
    {
        var connection = tenantDb.Database.GetDbConnection();
        await using var command = connection.CreateCommand();
        command.Transaction = state.TenantTransaction!.GetDbTransaction();
        command.CommandText = "DECLARE @lockResult int; EXEC @lockResult = sys.sp_getapplock @Resource = @resource, @LockMode = N'Exclusive', @LockOwner = N'Transaction', @LockTimeout = @timeout; SELECT @lockResult;";
        command.CommandTimeout = 15;
        AddParameter(command, "@resource", DbType.String, $"Nexora:TenantStorageQuota:{tenantId:N}", 255);
        AddParameter(command, "@timeout", DbType.Int32, LockTimeoutMilliseconds);
        var result = Convert.ToInt32(await command.ExecuteScalarAsync(cancellationToken), CultureInfo.InvariantCulture);
        if (result < 0)
            throw new TenantStorageQuotaUnavailableException(tenantId,
                new TimeoutException("The tenant storage quota lock could not be acquired."));
    }

    private static async Task<long> ReadSqlDataBytesAsync(TenantDbContext db, IDbContextTransaction? transaction,
        CancellationToken cancellationToken)
    {
        await using var command = db.Database.GetDbConnection().CreateCommand();
        command.Transaction = transaction?.GetDbTransaction();
        command.CommandText = "SELECT COUNT_BIG(*), COALESCE(SUM(CASE WHEN FILEPROPERTY([name], 'SpaceUsed') IS NULL THEN 1 ELSE 0 END), 0), COALESCE(SUM(CONVERT(bigint, FILEPROPERTY([name], 'SpaceUsed')) * CONVERT(bigint, 8192)), 0) FROM sys.database_files WHERE [type_desc] = N'ROWS';";
        command.CommandTimeout = 15;
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken) || reader.GetInt64(0) < 1 || reader.GetInt64(1) != 0 || reader.IsDBNull(2))
            throw new InvalidOperationException("SQL Server did not return a complete tenant data-page measurement.");
        return reader.GetInt64(2);
    }

    private async Task RollbackAndReleaseAfterRejectedWriteAsync(TenantDbContext tenantDb, PendingQuotaCheck state,
        CancellationToken cancellationToken)
    {
        try
        {
            var transaction = tenantDb.Database.CurrentTransaction;
            if (transaction is not null) await transaction.RollbackAsync(cancellationToken);
            if (state.OwnsTenantTransaction && state.TenantTransaction is not null)
            {
                await state.TenantTransaction.DisposeAsync();
                state.TenantTransaction = null;
            }
        }
        catch (Exception exception)
        {
            logger.LogWarning("Tenant storage quota rollback failed for {TenantId} ({FailureType}).", state.TenantId, exception.GetType().Name);
        }
        await ReleaseAndRemoveAsync(tenantDb, state);
    }

    private async Task ReleaseAndRemoveAsync(TenantDbContext tenantDb, PendingQuotaCheck state)
    {
        if (state.PlatformLockHeld && state.PlatformConnection is not null)
        {
            try
            {
                await using var command = state.PlatformConnection.CreateCommand();
                command.CommandText = "DECLARE @releaseResult int; EXEC @releaseResult = sys.sp_releaseapplock @Resource = @resource, @LockOwner = N'Session'; SELECT @releaseResult;";
                command.CommandTimeout = 15;
                AddParameter(command, "@resource", DbType.String, $"Nexora:TenantQuota:{state.TenantId:N}", 255);
                await command.ExecuteScalarAsync(CancellationToken.None);
            }
            catch (Exception exception)
            {
                logger.LogWarning("Tenant storage quota lock release failed for {TenantId} ({FailureType}); the SQL session will release it when closed.",
                    state.TenantId, exception.GetType().Name);
            }
        }
        if (state.PlatformConnectionWasClosed && state.PlatformConnection?.State == ConnectionState.Open)
        {
            try { await state.PlatformConnection.CloseAsync(); }
            catch (Exception exception) { logger.LogWarning("Tenant storage quota connection close failed ({FailureType}).", exception.GetType().Name); }
        }
        _pending.Remove(tenantDb);
        lock (_sync) _activeChecks.Remove(state);
        state.PlatformLockHeld = false;
    }

    private static void AddParameter(System.Data.Common.DbCommand command, string name, DbType type, object value, int? size = null)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.DbType = type;
        parameter.Value = value;
        if (size is not null) parameter.Size = size.Value;
        command.Parameters.Add(parameter);
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        PendingQuotaCheck[] pending;
        lock (_sync) pending = _activeChecks.ToArray();
        foreach (var state in pending)
        {
            try
            {
                var connection = state.PlatformConnection;
                if (state.PlatformLockHeld && connection?.State == ConnectionState.Open)
                {
                    using var command = connection.CreateCommand();
                    command.CommandText = "EXEC sys.sp_releaseapplock @Resource = @resource, @LockOwner = N'Session';";
                    AddParameter(command, "@resource", DbType.String, $"Nexora:TenantQuota:{state.TenantId:N}", 255);
                    command.ExecuteNonQuery();
                }
                if (state.PlatformConnectionWasClosed && connection?.State == ConnectionState.Open) connection.Close();
            }
            catch (Exception exception)
            {
                logger.LogWarning("Tenant storage quota scoped lock cleanup failed for {TenantId} ({FailureType}).", state.TenantId, exception.GetType().Name);
            }
        }
        lock (_sync) _activeChecks.Clear();
    }

    public async ValueTask DisposeAsync()
    {
        if (_disposed) return;
        PendingQuotaCheck[] pending;
        lock (_sync) pending = _activeChecks.ToArray();
        foreach (var state in pending)
        {
            try
            {
                var connection = state.PlatformConnection;
                if (state.PlatformLockHeld && connection?.State == ConnectionState.Open)
                {
                    await using var command = connection.CreateCommand();
                    command.CommandText = "EXEC sys.sp_releaseapplock @Resource = @resource, @LockOwner = N'Session';";
                    AddParameter(command, "@resource", DbType.String, $"Nexora:TenantQuota:{state.TenantId:N}", 255);
                    await command.ExecuteNonQueryAsync();
                }
                if (state.PlatformConnectionWasClosed && connection?.State == ConnectionState.Open)
                    await connection.CloseAsync();
            }
            catch (Exception exception)
            {
                logger.LogWarning("Tenant storage quota scoped lock cleanup failed for {TenantId} ({FailureType}).", state.TenantId, exception.GetType().Name);
            }
        }
        lock (_sync) _activeChecks.Clear();
        _disposed = true;
    }

    private sealed class PendingQuotaCheck(Guid tenantId)
    {
        public Guid TenantId { get; } = tenantId;
        public DbConnection? PlatformConnection { get; set; }
        public bool PlatformConnectionWasClosed { get; set; }
        public bool PlatformLockHeld { get; set; }
        public IDbContextTransaction? TenantTransaction { get; set; }
        public bool OwnsTenantTransaction { get; set; }
        public long MaxBytes { get; set; }
    }
}

internal sealed class TenantStorageQuotaExceededException(long usedBytes, long maxBytes)
    : Exception("Tenant SQL data-page storage quota is full.")
{
    public long UsedBytes { get; } = usedBytes;
    public long MaxBytes { get; } = maxBytes;
}

internal interface ITenantStorageLimitProvider
{
    Task<long> GetLimitBytesAsync(Guid tenantId, CancellationToken cancellationToken);
}

internal sealed class TenantStorageLimitProvider(PlatformDbContext platformDb) : ITenantStorageLimitProvider
{
    public async Task<long> GetLimitBytesAsync(Guid tenantId, CancellationToken cancellationToken)
    {
        var catalog = await platformDb.TenantDatabaseCatalog.AsNoTracking()
            .SingleOrDefaultAsync(x => x.TenantId == tenantId, cancellationToken);
        if (catalog is null || catalog.State != TenantDatabaseProvisioningState.Ready ||
            catalog.DatabaseName != $"AIERPTenant_{tenantId:N}")
            throw new InvalidOperationException("Tenant database catalog does not match the current company.");

        var license = await platformDb.TenantLicenses.AsNoTracking()
            .SingleOrDefaultAsync(x => x.TenantId == tenantId, cancellationToken);
        var policy = LicenseTierCatalog.All["Small"];
        if (license is not null)
        {
            if (!LicenseTierCatalog.IsValidStoredLicense(license))
                throw new InvalidOperationException("Stored tenant license profile is invalid.");
            if (license.ExpiresAt > DateTimeOffset.UtcNow)
                policy = LicenseTierCatalog.All[license.Tier];
        }

        if (policy.MaxStorageGb == int.MaxValue) return long.MaxValue;
        return checked((long)policy.MaxStorageGb * 1024L * 1024L * 1024L);
    }
}

internal sealed class TenantStorageQuotaUnavailableException(Guid tenantId, Exception innerException)
    : Exception("Tenant storage quota could not be verified; the write was rejected.", innerException)
{
    public Guid TenantId { get; } = tenantId;
}
