using System.Security.Cryptography;
using AIERP.Platform.Infrastructure;
using Microsoft.Data.SqlClient;

namespace AIERP.Api.IntegrationTests;

/// <summary>
/// Creates a real, narrowly scoped test principal for SQL acceptance tests that exercise
/// the production tenant-routing middleware. The SQL admin connection is used only by
/// the fixture for setup/cleanup; the API receives the per-tenant credential below.
/// </summary>
internal sealed class SqlAcceptanceTenantCredential : IAsyncDisposable
{
    private readonly string _adminConnection;
    private readonly string _tenantDatabase;
    private bool _created;

    private SqlAcceptanceTenantCredential(string adminConnection, Guid tenantId, string password)
    {
        _adminConnection = adminConnection;
        TenantId = tenantId;
        Password = password;
        UserName = $"aierp_t_{tenantId:N}";
        _tenantDatabase = TenantSqlCredentialPath.DatabaseName(tenantId, TenantSqlDatabaseComponent.Erp);
        CredentialReader = new Reader(this);
    }

    public Guid TenantId { get; }
    public string UserName { get; }
    public string Password { get; }
    public ITenantSqlCredentialReader CredentialReader { get; }

    public static async Task<SqlAcceptanceTenantCredential> CreateAsync(string administratorConnection, Guid tenantId)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(administratorConnection);
        ArgumentOutOfRangeException.ThrowIfEqual(tenantId, Guid.Empty);

        var password = $"Nexora!{Convert.ToHexString(RandomNumberGenerator.GetBytes(32))}aA9";
        var fixture = new SqlAcceptanceTenantCredential(administratorConnection, tenantId, password);
        await fixture.CreatePrincipalAsync();
        return fixture;
    }

    private async Task CreatePrincipalAsync()
    {
        var master = new SqlConnectionStringBuilder(_adminConnection)
        {
            InitialCatalog = "master",
            Pooling = false
        };
        await using var connection = new SqlConnection(master.ConnectionString);
        await connection.OpenAsync();

        var escapedPassword = Password.Replace("'", "''", StringComparison.Ordinal);
        var quotedLogin = $"[{UserName.Replace("]", "]]", StringComparison.Ordinal)}]";
        await using (var command = connection.CreateCommand())
        {
            command.CommandText = $"CREATE LOGIN {quotedLogin} WITH PASSWORD=N'{escapedPassword}', CHECK_POLICY=ON, CHECK_EXPIRATION=OFF;";
            await command.ExecuteNonQueryAsync();
        }

        var quotedDatabase = $"[{_tenantDatabase.Replace("]", "]]", StringComparison.Ordinal)}]";
        await using (var command = connection.CreateCommand())
        {
            command.CommandText = $"USE {quotedDatabase}; CREATE USER {quotedLogin} FOR LOGIN {quotedLogin}; ALTER ROLE [db_owner] ADD MEMBER {quotedLogin};";
            await command.ExecuteNonQueryAsync();
        }

        _created = true;
    }

    public async ValueTask DisposeAsync()
    {
        if (!_created) return;

        // The API has already disposed its tenant connections, but SqlClient keeps
        // them pooled under this temporary login. Flush the pools before dropping
        // the principal so SQL Server does not reject cleanup for an active session.
        SqlConnection.ClearAllPools();

        var master = new SqlConnectionStringBuilder(_adminConnection)
        {
            InitialCatalog = "master",
            Pooling = false
        };
        await using var connection = new SqlConnection(master.ConnectionString);
        await connection.OpenAsync();
        var quotedLogin = $"[{UserName.Replace("]", "]]", StringComparison.Ordinal)}]";
        await using var command = connection.CreateCommand();
        command.CommandText = $"IF SUSER_ID(@login) IS NOT NULL DROP LOGIN {quotedLogin};";
        command.Parameters.AddWithValue("@login", UserName);
        await command.ExecuteNonQueryAsync();
        _created = false;
    }

    private sealed class Reader(SqlAcceptanceTenantCredential fixture) : ITenantSqlCredentialReader
    {
        public Task<TenantSqlCredential> ReadAsync(Guid tenantId, TenantSqlDatabaseComponent component,
            string secretReference, CancellationToken cancellationToken = default)
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (tenantId != fixture.TenantId || component != TenantSqlDatabaseComponent.Erp
                || !string.Equals(secretReference, TenantSqlCredentialPath.ForTenant(tenantId, component), StringComparison.Ordinal))
                throw new InvalidOperationException("The SQL acceptance credential is scoped to one ERP tenant.");

            return Task.FromResult(new TenantSqlCredential(
                TenantSqlCredentialPath.DatabaseName(tenantId, component), fixture.UserName, fixture.Password, 1));
        }
    }
}
