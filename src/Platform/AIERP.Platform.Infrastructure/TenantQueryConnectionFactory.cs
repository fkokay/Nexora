using AIERP.Platform.Domain;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace AIERP.Platform.Infrastructure;

public enum TenantQueryAccess { Read, Write }

public sealed class TenantQueryUnavailableException(string message) : Exception(message);

public interface ITenantQueryConnectionFactory
{
    /// <summary>Açık bir SqlConnection döner; çağıran dispose eder.</summary>
    Task<SqlConnection> OpenAsync(Guid tenantId, TenantQueryAccess access, CancellationToken cancellationToken);
}

/// <summary>
/// Kiracı sorgu (salt-okunur / yazma) SQL login'leri için bağlantı açar. Ayrım kapalıysa, katalog kaydı hazır değilse
/// ya da Vault kimliği beklenenle uyuşmuyorsa başarısız-kapalı davranır ve ayrıntı sızdırmaz.
/// </summary>
public sealed class TenantQueryConnectionFactory(string connectionTemplate, bool separationEnabled,
    ITenantSqlCredentialReader credentialReader, Func<PlatformDbContext> platformDbFactory,
    ILogger<TenantQueryConnectionFactory>? logger = null) : ITenantQueryConnectionFactory
{
    private const string UnavailableMessage = "Sorgu veritabanı erişimi bu firma için hazır değil.";

    public async Task<SqlConnection> OpenAsync(Guid tenantId, TenantQueryAccess access, CancellationToken cancellationToken)
    {
        if (!separationEnabled || tenantId == Guid.Empty) throw new TenantQueryUnavailableException(UnavailableMessage);
        var component = ComponentFor(access);
        SqlConnection? connection = null;
        try
        {
            var expectedDatabase = TenantSqlCredentialPath.DatabaseName(tenantId, component);
            var entry = await platformDbFactory().TenantDatabaseCatalog.AsNoTracking()
                .Where(x => x.TenantId == tenantId).SingleOrDefaultAsync(cancellationToken);
            if (entry is null || entry.State != TenantDatabaseProvisioningState.Ready
                || !string.Equals(entry.DatabaseName, expectedDatabase, StringComparison.Ordinal))
            {
                logger?.LogWarning("Tenant query connection unavailable for tenant {TenantId} ({Access}): ERP catalog entry is missing, not Ready or not canonical.",
                    tenantId, access);
                throw new TenantQueryUnavailableException(UnavailableMessage);
            }

            var credential = await credentialReader.ReadAsync(tenantId, component,
                TenantSqlCredentialPath.ForTenant(tenantId, component), cancellationToken);
            connection = new SqlConnection(BuildConnectionString(tenantId, access, credential));
            await connection.OpenAsync(cancellationToken);
            return connection;
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            connection?.Dispose();
            throw;
        }
        catch (TenantQueryUnavailableException)
        {
            connection?.Dispose();
            throw;
        }
        catch (Exception exception)
        {
            // Vault/SQL ayrıntıları çağırana sızdırılmaz; sunucu günlüğüne yalnız tür ve SQL hata numarası yazılır
            // (ileti, bağlantı dizesi veya kimlik bilgisi yazılmaz).
            logger?.LogWarning("Tenant query connection failed for tenant {TenantId} ({Access}): {ExceptionType} SqlNumber={SqlNumber}.",
                tenantId, access, exception.GetType().FullName, (exception as SqlException)?.Number);
            connection?.Dispose();
            throw new TenantQueryUnavailableException(UnavailableMessage);
        }
    }

    internal string BuildConnectionString(Guid tenantId, TenantQueryAccess access, TenantSqlCredential credential)
    {
        var baseConnection = TenantDatabaseRouting.BuildComponentConnectionString(
            connectionTemplate, tenantId, ComponentFor(access), credential);
        return new SqlConnectionStringBuilder(baseConnection)
        {
            ApplicationName = access == TenantQueryAccess.Read ? "Nexora.TenantQuery.Read" : "Nexora.TenantQuery.Write",
            ConnectTimeout = 10,
            Pooling = true
        }.ConnectionString;
    }

    private static TenantSqlDatabaseComponent ComponentFor(TenantQueryAccess access) => access switch
    {
        TenantQueryAccess.Read => TenantSqlDatabaseComponent.ErpQueryRead,
        TenantQueryAccess.Write => TenantSqlDatabaseComponent.ErpQueryWrite,
        _ => throw new ArgumentOutOfRangeException(nameof(access))
    };
}
