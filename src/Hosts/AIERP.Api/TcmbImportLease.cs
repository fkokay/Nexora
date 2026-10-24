using Microsoft.Data.SqlClient;

namespace AIERP.Api;

internal enum TcmbAppLockResult
{
    Acquired,
    Unavailable,
    Canceled,
    DeadlockVictim,
    InvalidRequest,
    UnknownFailure
}

/// <summary>
/// A SQL Server session lock shared by API replicas using the same platform database.
/// The open connection owns the lock, so SQL Server releases it if the worker process exits.
/// </summary>
internal sealed class TcmbImportLease : IAsyncDisposable
{
    internal const string ResourceName = "AIERP:TCMB:DailyExchangeRateImport";

    private readonly SqlConnection connection;
    private bool disposed;

    private TcmbImportLease(SqlConnection connection) => this.connection = connection;

    internal static async Task<TcmbImportLease?> TryAcquireAsync(string connectionString, CancellationToken cancellationToken)
    {
        var connection = new SqlConnection(connectionString);
        try
        {
            await connection.OpenAsync(cancellationToken);
            await using var command = connection.CreateCommand();
            command.CommandText = "DECLARE @result int; EXEC @result = sys.sp_getapplock @Resource = @resource, @LockMode = 'Exclusive', @LockOwner = 'Session', @LockTimeout = 0; SELECT @result;";
            command.Parameters.AddWithValue("@resource", ResourceName);
            var result = Convert.ToInt32(await command.ExecuteScalarAsync(cancellationToken), System.Globalization.CultureInfo.InvariantCulture);
            switch (ClassifyAppLockResult(result))
            {
                case TcmbAppLockResult.Acquired:
                    return new TcmbImportLease(connection);
                case TcmbAppLockResult.Unavailable:
                    await connection.DisposeAsync();
                    return null;
                case TcmbAppLockResult.Canceled:
                    throw new OperationCanceledException("SQL Server canceled the TCMB import lease request.", cancellationToken);
                case TcmbAppLockResult.DeadlockVictim:
                    throw new InvalidOperationException("SQL Server selected the TCMB import lease request as a deadlock victim.");
                case TcmbAppLockResult.InvalidRequest:
                    throw new InvalidOperationException("SQL Server rejected the TCMB import lease request.");
                default:
                    throw new InvalidOperationException($"SQL Server returned an unexpected sp_getapplock result ({result}).");
            }
        }
        catch
        {
            await connection.DisposeAsync();
            throw;
        }
    }

    internal static TcmbAppLockResult ClassifyAppLockResult(int result) => result switch
    {
        >= 0 => TcmbAppLockResult.Acquired,
        -1 => TcmbAppLockResult.Unavailable,
        -2 => TcmbAppLockResult.Canceled,
        -3 => TcmbAppLockResult.DeadlockVictim,
        -999 => TcmbAppLockResult.InvalidRequest,
        _ => TcmbAppLockResult.UnknownFailure
    };

    public async ValueTask DisposeAsync()
    {
        if (disposed) return;
        disposed = true;
        try
        {
            await using var command = connection.CreateCommand();
            command.CommandText = "EXEC sys.sp_releaseapplock @Resource = @resource, @LockOwner = 'Session';";
            command.Parameters.AddWithValue("@resource", ResourceName);
            await command.ExecuteNonQueryAsync();
        }
        finally
        {
            await connection.DisposeAsync();
        }
    }
}
