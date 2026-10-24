using AIERP.Platform.Domain;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata;

namespace AIERP.Platform.Infrastructure;

public sealed class TenantDatabaseProvisioner(string platformConnection, string dataRuntimeLogin = "aierp_data_runtime", string? separationBackupPath = null)
{
    private bool _sourceBackupVerified;

    public Task VerifySeparationBackupAsync(CancellationToken cancellationToken = default)
    {
        var sourceDatabase = new SqlConnectionStringBuilder(platformConnection).InitialCatalog;
        if (string.IsNullOrWhiteSpace(sourceDatabase)) throw new InvalidOperationException("Platform connection must specify a database.");
        return EnsureVerifiedSourceBackupAsync(sourceDatabase, cancellationToken);
    }

    public static async Task GrantDatabaseRuntimeAccessAsync(string adminConnection, string databaseName, string loginName, bool readOnly = false, CancellationToken cancellationToken = default)
    {
        if (!System.Text.RegularExpressions.Regex.IsMatch(databaseName, "^AIERP[A-Za-z0-9_]+$", System.Text.RegularExpressions.RegexOptions.CultureInvariant) ||
            !System.Text.RegularExpressions.Regex.IsMatch(loginName, "^[A-Za-z0-9_]+$", System.Text.RegularExpressions.RegexOptions.CultureInvariant))
            throw new InvalidOperationException("Invalid SQL database or login identifier.");
        var builder = new SqlConnectionStringBuilder(adminConnection) { InitialCatalog = databaseName };
        await using var connection = new SqlConnection(builder.ConnectionString);
        await connection.OpenAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        var user = Q(loginName);
        command.CommandText = $"IF DATABASE_PRINCIPAL_ID(N'{loginName}') IS NULL CREATE USER {user} FOR LOGIN {user}; IF IS_ROLEMEMBER(N'db_datareader', N'{loginName}') = 0 ALTER ROLE [db_datareader] ADD MEMBER {user}; {(readOnly ? "" : $"IF IS_ROLEMEMBER(N'db_datawriter', N'{loginName}') = 0 ALTER ROLE [db_datawriter] ADD MEMBER {user};")} IF OBJECT_ID(N'dbo.PurgeExpiredAuditEvents', N'P') IS NOT NULL GRANT EXECUTE ON dbo.PurgeExpiredAuditEvents TO {user};";
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    public async Task ProvisionAsync(Guid tenantId, CancellationToken cancellationToken = default,
        bool sourceDatabaseWasCreatedDuringCurrentBootstrap = false)
    {
        if (tenantId == Guid.Empty) throw new ArgumentException("Tenant id is required.", nameof(tenantId));
        var databaseName = $"AIERPTenant_{tenantId:N}";
        var sourceBuilder = new SqlConnectionStringBuilder(platformConnection);
        var sourceDatabase = sourceBuilder.InitialCatalog;
        if (string.IsNullOrWhiteSpace(sourceDatabase)) throw new InvalidOperationException("Platform connection must specify a database.");
        var entryBuilder = new SqlConnectionStringBuilder(platformConnection) { InitialCatalog = sourceDatabase };
        await using (var platformConnectionHandle = new SqlConnection(entryBuilder.ConnectionString))
        {
            await platformConnectionHandle.OpenAsync(cancellationToken);
            await using var platform = new PlatformDbContext(new DbContextOptionsBuilder<PlatformDbContext>().UseSqlServer(entryBuilder.ConnectionString).Options);
            _ = await platform.Tenants.AsNoTracking().SingleOrDefaultAsync(x => x.Id == tenantId, cancellationToken)
                ?? throw new InvalidOperationException("Tenant does not exist in PlatformDB.");
            var entry = await platform.TenantDatabaseCatalog.FindAsync([tenantId], cancellationToken);
            if (entry is not null)
            {
                var migrationRetryHandled = await DispatchProvisioningAsync(
                    entry.State,
                    entry.ReadyAt,
                    async token =>
                    {
                        if (!string.Equals(entry.DatabaseName, databaseName, StringComparison.Ordinal))
                            throw new InvalidOperationException("Catalog database name does not match the tenant identity.");
                        var readyBuilder = new SqlConnectionStringBuilder(platformConnection) { InitialCatalog = entry.DatabaseName };
                        var readyOptions = new DbContextOptionsBuilder<TenantDbContext>().UseSqlServer(readyBuilder.ConnectionString).Options;
                        await using var readyDatabase = new TenantDbContext(readyOptions);
                        await RunProvisioningStepsAsync(
                            ensureDatabaseExists: async existsToken =>
                            {
                                if (!await TenantDatabaseExistsAsync(platformConnection, entry.DatabaseName, existsToken))
                                    throw new InvalidOperationException($"Tenant database '{entry.DatabaseName}' is missing; migration-only retry cannot recreate or copy it.");
                            },
                            migrate: migrateToken => readyDatabase.Database.MigrateAsync(migrateToken),
                            grantRuntimeAccess: grantToken => GrantDatabaseRuntimeAccessAsync(platformConnection, entry.DatabaseName, dataRuntimeLogin, cancellationToken: grantToken),
                            verifyTenant: verifyToken => TenantDatabaseSeparationVerifier.VerifyTenantForProvisioningAsync(platformConnection, tenantId, verifyToken),
                            persistState: async (state, error, persistToken) =>
                            {
                                entry.State = state;
                                entry.LastError = error;
                                entry.UpdatedAt = DateTimeOffset.UtcNow;
                                // A Ready catalog row is evidence that this tenant was already
                                // provisioned. Keep that evidence if a legacy row lacks ReadyAt.
                                if (state == TenantDatabaseProvisioningState.Copying && entry.ReadyAt is null)
                                    entry.ReadyAt = entry.UpdatedAt;
                                if (state == TenantDatabaseProvisioningState.Ready)
                                    entry.ReadyAt = entry.UpdatedAt;
                                await platform.SaveChangesAsync(persistToken);
                            },
                            token);
                    },
                    () => Task.CompletedTask,
                    cancellationToken);
                if (migrationRetryHandled) return;
            }
            if (!sourceDatabaseWasCreatedDuringCurrentBootstrap)
                await EnsureVerifiedSourceBackupAsync(sourceDatabase, cancellationToken);
            if (entry is null)
            {
                entry = new TenantDatabaseCatalogEntry { TenantId = tenantId, DatabaseName = databaseName };
                platform.TenantDatabaseCatalog.Add(entry);
            }
            if (!string.Equals(entry.DatabaseName, databaseName, StringComparison.Ordinal)) throw new InvalidOperationException("Catalog database name does not match the tenant identity.");
            entry.State = TenantDatabaseProvisioningState.Copying;
            entry.LastError = null;
            entry.UpdatedAt = DateTimeOffset.UtcNow;
            try
            {
                await platform.SaveChangesAsync(cancellationToken);
            }
            catch (Exception ex)
            {
                // SaveChanges can be canceled after the server has committed. Reopen a
                // non-cancelable context and close routing even if the outcome was uncertain.
                await MarkTenantProvisioningFailedAsync(tenantId, ex);
                throw;
            }
        }

        try
        {
            var targetBuilder = new SqlConnectionStringBuilder(platformConnection) { InitialCatalog = databaseName };
            var options = new DbContextOptionsBuilder<TenantDbContext>().UseSqlServer(targetBuilder.ConnectionString).Options;
            await using var target = new TenantDbContext(options);
            await RunProvisioningStepsAsync(
                ensureDatabaseExists: async token =>
                {
                    var masterBuilder = new SqlConnectionStringBuilder(platformConnection) { InitialCatalog = "master" };
                    await using var master = new SqlConnection(masterBuilder.ConnectionString);
                    await master.OpenAsync(token);
                    await using var create = master.CreateCommand();
                    create.CommandText = "IF DB_ID(@db) IS NULL BEGIN DECLARE @sql nvarchar(max) = N'CREATE DATABASE ' + QUOTENAME(@db); EXEC sys.sp_executesql @sql; END";
                    create.Parameters.AddWithValue("@db", databaseName);
                    await create.ExecuteNonQueryAsync(token);
                },
                migrate: token => target.Database.MigrateAsync(token),
                grantRuntimeAccess: token => GrantDatabaseRuntimeAccessAsync(platformConnection, databaseName, dataRuntimeLogin, cancellationToken: token),
                verifyTenant: token => TenantDatabaseSeparationVerifier.VerifyTenantForProvisioningAsync(platformConnection, tenantId, token),
                persistState: async (state, error, token) =>
                {
                    await using var catalog = new PlatformDbContext(new DbContextOptionsBuilder<PlatformDbContext>().UseSqlServer(platformConnection).Options);
                    var row = await catalog.TenantDatabaseCatalog.SingleAsync(x => x.TenantId == tenantId, token);
                    row.State = state;
                    row.LastError = error;
                    row.UpdatedAt = DateTimeOffset.UtcNow;
                    if (state == TenantDatabaseProvisioningState.Ready) row.ReadyAt = row.UpdatedAt;
                    await catalog.SaveChangesAsync(token);
                },
                cancellationToken,
                copyTenantRows: async token =>
                {
                    await using var tenant = new TenantDbContext(options);
                    await CopyTenantRowsAsync(sourceDatabase, databaseName, tenantId, tenant, token);
                });
        }
        catch (Exception ex)
        {
            await MarkTenantProvisioningFailedAsync(tenantId, ex);
            throw;
        }
    }

    private async Task MarkTenantProvisioningFailedAsync(Guid tenantId, Exception exception)
    {
        await using var platform = new PlatformDbContext(new DbContextOptionsBuilder<PlatformDbContext>().UseSqlServer(platformConnection).Options);
        var failed = await platform.TenantDatabaseCatalog.SingleOrDefaultAsync(x => x.TenantId == tenantId, CancellationToken.None);
        if (failed is null) return;
        failed.State = TenantDatabaseProvisioningState.Failed;
        failed.LastError = FormatSafeMigrationError(exception);
        failed.UpdatedAt = DateTimeOffset.UtcNow;
        await platform.SaveChangesAsync(CancellationToken.None);
    }

    internal static async Task RunProvisioningStepsAsync(
        Func<CancellationToken, Task> ensureDatabaseExists,
        Func<CancellationToken, Task> migrate,
        Func<CancellationToken, Task> grantRuntimeAccess,
        Func<CancellationToken, Task> verifyTenant,
        Func<TenantDatabaseProvisioningState, string?, CancellationToken, Task> persistState,
        CancellationToken cancellationToken,
        Func<CancellationToken, Task>? copyTenantRows = null)
    {
        try
        {
            // Persist a non-routable state before changing the schema. If cancellation
            // races with this write, the catch path still records Failed without that token.
            await persistState(TenantDatabaseProvisioningState.Copying, null, cancellationToken);
            await ensureDatabaseExists(cancellationToken);
            await migrate(cancellationToken);
            await grantRuntimeAccess(cancellationToken);
            if (copyTenantRows is not null) await copyTenantRows(cancellationToken);
            await verifyTenant(cancellationToken);
            await persistState(TenantDatabaseProvisioningState.Ready, null, cancellationToken);
        }
        catch (Exception ex)
        {
            await persistState(TenantDatabaseProvisioningState.Failed, FormatSafeMigrationError(ex), CancellationToken.None);
            throw;
        }
    }

    internal static bool ShouldUseMigrationOnlyRetry(TenantDatabaseProvisioningState state, DateTimeOffset? readyAt) =>
        state == TenantDatabaseProvisioningState.Ready || readyAt is not null;

    internal static async Task<bool> DispatchProvisioningAsync(
        TenantDatabaseProvisioningState state,
        DateTimeOffset? readyAt,
        Func<CancellationToken, Task> migrationOnlyRetry,
        Func<Task> legacyCopy,
        CancellationToken cancellationToken)
    {
        if (ShouldUseMigrationOnlyRetry(state, readyAt))
        {
            await migrationOnlyRetry(cancellationToken);
            return true;
        }

        await legacyCopy();
        return false;
    }

    internal static async Task<bool> TenantDatabaseExistsAsync(string adminConnection, string databaseName, CancellationToken cancellationToken)
    {
        var masterBuilder = new SqlConnectionStringBuilder(adminConnection) { InitialCatalog = "master" };
        await using var connection = new SqlConnection(masterBuilder.ConnectionString);
        await connection.OpenAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT CASE WHEN DB_ID(@databaseName) IS NULL THEN CAST(0 AS bit) ELSE CAST(1 AS bit) END";
        command.Parameters.AddWithValue("@databaseName", databaseName);
        return (bool)(await command.ExecuteScalarAsync(cancellationToken) ?? false);
    }

    internal static string FormatSafeMigrationError(Exception exception)
    {
        // Do not persist connection credentials or tokens that may appear in provider errors.
        var message = System.Text.RegularExpressions.Regex.Replace(
            exception.Message,
            @"(?i)\bauthorization\s*[:=]\s*(?:bearer|basic)\s+\S+",
            "Authorization=[REDACTED]",
            System.Text.RegularExpressions.RegexOptions.CultureInvariant);
        message = System.Text.RegularExpressions.Regex.Replace(
            message,
            @"(?i)\bSharedAccessSignature\s+(?:sr|sig)=\S+(?:&\S+)*",
            "SharedAccessSignature=[REDACTED]",
            System.Text.RegularExpressions.RegexOptions.CultureInvariant);
        message = System.Text.RegularExpressions.Regex.Replace(
            message,
            @"(?i)(['""']?\b(?:password|pwd|user\s*id|uid|user\s*name|username|access[_ -]?token|refresh[_ -]?token|token|client[_ -]?secret|secret|api[_ -]?key|apikey|account[_ -]?key|shared[_ -]?access[_ -]?signature|sig)\b['""']?\s*[:=]\s*)(?:bearer\s+\S+|basic\s+\S+|""(?:\\.|[^""\\])*""|'(?:\\.|[^'\\])*'|[^,;\r\n}\]]+?(?=(?:[,;}\]]|\r?$|\n|\s+(?:operation|error|exception|diagnostic|message|details?|command|statement|failure|failed|while|because|during|caused|reason|cause|inner|outer|stack|sqlstate|code|state|provider|database|server|login)\b)))",
            "$1[REDACTED]",
            System.Text.RegularExpressions.RegexOptions.CultureInvariant);
        // Keep account identifiers covered even if a future edit narrows the
        // broader credential-name matcher.
        message = System.Text.RegularExpressions.Regex.Replace(
            message,
            @"(?i)\b(user\s*id|uid|user\s*name|username|account)\s*[:=]\s*[^,;\r\n}\]]+",
            "$1=[REDACTED]",
            System.Text.RegularExpressions.RegexOptions.CultureInvariant);
        var diagnostic = $"{exception.GetType().Name}: {message}";
        return diagnostic.Length > 1900 ? diagnostic[..1900] : diagnostic;
    }

    public async Task ProvisionAIStudioAsync(CancellationToken cancellationToken = default,
        bool sourceDatabaseWasCreatedDuringCurrentBootstrap = false)
    {
        const string component = "AIStudio";
        const string databaseName = "AIERPStudio";
        var sourceDatabase = new SqlConnectionStringBuilder(platformConnection).InitialCatalog;
        if (string.IsNullOrWhiteSpace(sourceDatabase)) throw new InvalidOperationException("Platform connection must specify a database.");
        await using (var platform = new PlatformDbContext(new DbContextOptionsBuilder<PlatformDbContext>().UseSqlServer(platformConnection).Options))
        {
            var state = await platform.DatabaseSeparationComponentStates.FindAsync([component], cancellationToken);
            if (state is not null && ShouldUseMigrationOnlyRetry(state.State, state.ReadyAt))
            {
                if (!string.Equals(state.DatabaseName, databaseName, StringComparison.Ordinal))
                    throw new InvalidOperationException("AIStudio catalog database name is invalid.");
                var readyBuilder = new SqlConnectionStringBuilder(platformConnection) { InitialCatalog = state.DatabaseName };
                var readyOptions = new DbContextOptionsBuilder<AIStudioDbContext>().UseSqlServer(readyBuilder.ConnectionString).Options;
                await using var readyDatabase = new AIStudioDbContext(readyOptions);
                await RunProvisioningStepsAsync(
                    ensureDatabaseExists: async token =>
                    {
                        if (!await TenantDatabaseExistsAsync(platformConnection, state.DatabaseName, token))
                            throw new InvalidOperationException($"AIStudio database '{state.DatabaseName}' is missing; migration-only retry cannot recreate or copy it.");
                    },
                    migrate: token => readyDatabase.Database.MigrateAsync(token),
                    grantRuntimeAccess: token => GrantDatabaseRuntimeAccessAsync(platformConnection, state.DatabaseName, dataRuntimeLogin, cancellationToken: token),
                    verifyTenant: async token => await VerifyAllStudioTenantsForProvisioningAsync(platformConnection, token),
                    persistState: (nextState, error, token) => PersistAIStudioStateAsync(platformConnection, component, databaseName, nextState, error, token),
                    cancellationToken);
                return;
            }
            if (state is not null && state.DatabaseName != databaseName)
                throw new InvalidOperationException("AIStudio catalog database name is invalid.");
            try
            {
                if (!sourceDatabaseWasCreatedDuringCurrentBootstrap && await platform.Tenants.AsNoTracking().AnyAsync(cancellationToken))
                    await EnsureVerifiedSourceBackupAsync(sourceDatabase, cancellationToken);
            }
            catch (Exception ex)
            {
                // A prior interrupted bootstrap may already have left the component in
                // Copying. Close it with an independent write even when this check cancels.
                await PersistAIStudioStateAsync(platformConnection, component, databaseName,
                    TenantDatabaseProvisioningState.Failed, FormatSafeMigrationError(ex), CancellationToken.None);
                throw;
            }
        }
        try
        {
            var masterBuilder = new SqlConnectionStringBuilder(platformConnection) { InitialCatalog = "master" };
            var targetBuilder = new SqlConnectionStringBuilder(platformConnection) { InitialCatalog = databaseName };
            var options = new DbContextOptionsBuilder<AIStudioDbContext>().UseSqlServer(targetBuilder.ConnectionString).Options;
            await using var target = new AIStudioDbContext(options);
            var tenants = new List<Guid>();
            await RunProvisioningStepsAsync(
                ensureDatabaseExists: async token =>
                {
                    await using var master = new SqlConnection(masterBuilder.ConnectionString);
                    await master.OpenAsync(token);
                    await using var create = master.CreateCommand();
                    create.CommandText = "IF DB_ID(@db) IS NULL BEGIN DECLARE @sql nvarchar(max) = N'CREATE DATABASE ' + QUOTENAME(@db); EXEC sys.sp_executesql @sql; END";
                    create.Parameters.AddWithValue("@db", databaseName);
                    await create.ExecuteNonQueryAsync(token);
                },
                migrate: token => target.Database.MigrateAsync(token),
                grantRuntimeAccess: token => GrantDatabaseRuntimeAccessAsync(platformConnection, databaseName, dataRuntimeLogin, cancellationToken: token),
                verifyTenant: async token =>
                {
                    if (tenants.Count == 0)
                    {
                        await TenantDatabaseSeparationVerifier.VerifyDatabaseOnlyStudioForProvisioningAsync(platformConnection, token);
                        return;
                    }
                    foreach (var tenantId in tenants)
                        await TenantDatabaseSeparationVerifier.VerifyStudioTenantForProvisioningAsync(platformConnection, tenantId, token);
                },
                persistState: (nextState, error, token) => PersistAIStudioStateAsync(platformConnection, component, databaseName, nextState, error, token),
                cancellationToken,
                copyTenantRows: async token =>
                {
                    await using (var platform = new PlatformDbContext(new DbContextOptionsBuilder<PlatformDbContext>().UseSqlServer(platformConnection).Options))
                        tenants.AddRange(await platform.Tenants.AsNoTracking().Select(x => x.Id).ToListAsync(token));
                    foreach (var tenantId in tenants)
                    {
                        await using var studio = new AIStudioDbContext(options);
                        await CopyTenantRowsAsync(sourceDatabase, databaseName, tenantId, studio, token);
                    }
                });
        }
        catch (Exception ex)
        {
            await using var catalog = new PlatformDbContext(new DbContextOptionsBuilder<PlatformDbContext>().UseSqlServer(platformConnection).Options);
            var failed = await catalog.DatabaseSeparationComponentStates.SingleOrDefaultAsync(x => x.Component == component, CancellationToken.None);
            if (failed is not null) { failed.State = TenantDatabaseProvisioningState.Failed; failed.LastError = FormatSafeMigrationError(ex); failed.UpdatedAt = DateTimeOffset.UtcNow; await catalog.SaveChangesAsync(CancellationToken.None); }
            throw;
        }
    }

    private static async Task VerifyAllStudioTenantsForProvisioningAsync(string connectionString, CancellationToken cancellationToken)
    {
        List<Guid> tenantIds;
        await using (var platform = new PlatformDbContext(new DbContextOptionsBuilder<PlatformDbContext>().UseSqlServer(connectionString).Options))
            tenantIds = await platform.Tenants.AsNoTracking().Select(x => x.Id).ToListAsync(cancellationToken);
        if (tenantIds.Count == 0)
        {
            await TenantDatabaseSeparationVerifier.VerifyDatabaseOnlyStudioForProvisioningAsync(connectionString, cancellationToken);
            return;
        }
        foreach (var tenantId in tenantIds)
            await TenantDatabaseSeparationVerifier.VerifyStudioTenantForProvisioningAsync(connectionString, tenantId, cancellationToken);
    }

    private static async Task PersistAIStudioStateAsync(string platformConnection, string component, string databaseName,
        TenantDatabaseProvisioningState state, string? error, CancellationToken cancellationToken)
    {
        await using var catalog = new PlatformDbContext(new DbContextOptionsBuilder<PlatformDbContext>().UseSqlServer(platformConnection).Options);
        var row = await catalog.DatabaseSeparationComponentStates.SingleOrDefaultAsync(x => x.Component == component, cancellationToken);
        if (row is null)
        {
            row = new DatabaseSeparationComponentState { Component = component, DatabaseName = databaseName };
            catalog.DatabaseSeparationComponentStates.Add(row);
        }
        if (row.DatabaseName != databaseName)
            throw new InvalidOperationException("AIStudio catalog database name is invalid.");
        ApplyAIStudioProvisioningState(row, state, error, DateTimeOffset.UtcNow);
        await catalog.SaveChangesAsync(cancellationToken);
    }

    internal static void ApplyAIStudioProvisioningState(DatabaseSeparationComponentState row,
        TenantDatabaseProvisioningState state, string? error, DateTimeOffset updatedAt)
    {
        // Preserve evidence of a legacy Ready row before changing its state. Without
        // ReadyAt, a failed migration retry could later be mistaken for first-time copy.
        if (state == TenantDatabaseProvisioningState.Copying &&
            row.State == TenantDatabaseProvisioningState.Ready && row.ReadyAt is null)
            row.ReadyAt = updatedAt;

        row.State = state;
        row.LastError = error;
        row.UpdatedAt = updatedAt;
        if (state == TenantDatabaseProvisioningState.Ready) row.ReadyAt = updatedAt;
    }

    private async Task EnsureVerifiedSourceBackupAsync(string sourceDatabase, CancellationToken cancellationToken)
    {
        if (_sourceBackupVerified) return;
        if (string.IsNullOrWhiteSpace(separationBackupPath))
            throw new InvalidOperationException("Tenant database separation requires Database:SeparationBackupPath pointing to a recent, checksum-verified full backup of the current Platform database. Stop all writers before taking the backup.");

        var builder = new SqlConnectionStringBuilder(platformConnection) { InitialCatalog = "master" };
        await using var connection = new SqlConnection(builder.ConnectionString);
        await connection.OpenAsync(cancellationToken);
        await using (var verify = connection.CreateCommand())
        {
            verify.CommandText = "RESTORE VERIFYONLY FROM DISK = @path WITH CHECKSUM";
            verify.Parameters.AddWithValue("@path", separationBackupPath);
            await verify.ExecuteNonQueryAsync(cancellationToken);
        }

        await using var header = connection.CreateCommand();
        header.CommandText = "RESTORE HEADERONLY FROM DISK = @path";
        header.Parameters.AddWithValue("@path", separationBackupPath);
        await using var reader = await header.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken)) throw new InvalidOperationException("Separation backup has no readable backup header.");
        var databaseNameOrdinal = reader.GetOrdinal("DatabaseName");
        var backupTypeOrdinal = reader.GetOrdinal("BackupType");
        var finishOrdinal = reader.GetOrdinal("BackupFinishDate");
        var checksumsOrdinal = reader.GetOrdinal("HasBackupChecksums");
        var backupSetGuidOrdinal = reader.GetOrdinal("BackupSetGUID");
        var backupDatabase = reader.GetString(databaseNameOrdinal);
        var backupType = Convert.ToInt32(reader.GetValue(backupTypeOrdinal), System.Globalization.CultureInfo.InvariantCulture);
        var finish = reader.GetDateTime(finishOrdinal);
        var hasChecksums = reader.GetBoolean(checksumsOrdinal);
        var backupSetGuid = reader.GetGuid(backupSetGuidOrdinal);
        await reader.DisposeAsync();
        if (!string.Equals(backupDatabase, sourceDatabase, StringComparison.OrdinalIgnoreCase) || backupType != 1 || !hasChecksums)
            throw new InvalidOperationException("Separation backup must be a checksum-protected full backup of the configured Platform database.");

        await using var freshness = connection.CreateCommand();
        freshness.CommandText = "SELECT CASE WHEN @finish >= DATEADD(MINUTE, -30, GETDATE()) AND @backupSet = (SELECT TOP (1) backup_set_uuid FROM msdb.dbo.backupset WHERE database_name = @database AND type = 'D' ORDER BY backup_finish_date DESC, backup_set_id DESC) THEN 1 ELSE 0 END";
        freshness.Parameters.AddWithValue("@finish", DateTime.SpecifyKind(finish, DateTimeKind.Utc));
        freshness.Parameters.AddWithValue("@database", sourceDatabase);
        freshness.Parameters.AddWithValue("@backupSet", backupSetGuid);
        if (Convert.ToInt32(await freshness.ExecuteScalarAsync(cancellationToken), System.Globalization.CultureInfo.InvariantCulture) != 1)
            throw new InvalidOperationException("Separation backup is not the most recent full backup or is older than 30 minutes. Stop writers and take a fresh backup immediately before migration.");
        _sourceBackupVerified = true;
    }

    private static async Task CopyTenantRowsAsync(string sourceDatabase, string targetDatabase, Guid tenantId, DbContext target, CancellationToken cancellationToken)
    {
        var tables = target.Model.GetEntityTypes().Where(x => x.GetTableName() is not null)
            .Select(x => (Schema: x.GetSchema() ?? "dbo", Name: x.GetTableName()!)).Distinct()
            .OrderBy(x => x.Name == "Tenants" ? 0 : 1).ToArray();
        var connection = (SqlConnection)target.Database.GetDbConnection();
        await connection.OpenAsync(cancellationToken);
        await using var tx = await connection.BeginTransactionAsync(cancellationToken);
        try
        {
            await ExecuteAsync(connection, (SqlTransaction)tx, "EXEC sys.sp_set_session_context @key=N'AIERP_AuditRetentionPurge', @value=1", cancellationToken);
            var eligible = new List<(string Schema, string Name, string Filter, string[] Columns, bool Identity)>();
            foreach (var (schema, name) in tables)
            {
                await using var metadata = connection.CreateCommand(); metadata.Transaction = (SqlTransaction)tx;
                metadata.CommandText = "SELECT c.name, c.is_identity, c.system_type_id, c.is_computed, c.generated_always_type FROM sys.columns c JOIN sys.tables t ON t.object_id=c.object_id JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE s.name=@s AND t.name=@t ORDER BY c.column_id";
                metadata.Parameters.AddWithValue("@s", schema); metadata.Parameters.AddWithValue("@t", name);
                var columns = new List<string>(); var identity = false;
                await using (var reader = await metadata.ExecuteReaderAsync(cancellationToken))
                {
                    while (await reader.ReadAsync(cancellationToken))
                    {
                        // Rowversion/timestamp, computed, and generated-always columns are
                        // owned by SQL Server and cannot be supplied in an INSERT SELECT.
                        if (reader.GetByte(2) == 189 || reader.GetBoolean(3) || reader.GetByte(4) != 0) continue;
                        columns.Add(reader.GetString(0));
                        identity |= reader.GetBoolean(1);
                    }
                }
                var filter = name == "Tenants" ? "Id" : columns.Contains("TenantId", StringComparer.OrdinalIgnoreCase) ? "TenantId" : null;
                if (filter is not null) eligible.Add((schema, name, filter, columns.ToArray(), identity));
            }
            foreach (var table in eligible)
                await ExecuteAsync(connection, (SqlTransaction)tx, $"ALTER TABLE {Q(table.Schema)}.{Q(table.Name)} NOCHECK CONSTRAINT ALL", cancellationToken);
            foreach (var table in eligible.AsEnumerable().Reverse())
                await ExecuteAsync(connection, (SqlTransaction)tx, $"DELETE FROM {Q(table.Schema)}.{Q(table.Name)} WHERE {Q(table.Filter)}=@tenant", cancellationToken, tenantId);
            foreach (var table in eligible)
            {
                var cols = string.Join(",", table.Columns.Select(Q));
                var dest = $"{Q(table.Schema)}.{Q(table.Name)}";
                var source = $"{Q(sourceDatabase)}.{Q(table.Schema)}.{Q(table.Name)}";
                if (table.Identity) await ExecuteAsync(connection, (SqlTransaction)tx, $"SET IDENTITY_INSERT {dest} ON", cancellationToken);
                await ExecuteAsync(connection, (SqlTransaction)tx, $"INSERT INTO {dest} ({cols}) SELECT {cols} FROM {source} WHERE {Q(table.Filter)}=@tenant", cancellationToken, tenantId);
                if (table.Identity) await ExecuteAsync(connection, (SqlTransaction)tx, $"SET IDENTITY_INSERT {dest} OFF", cancellationToken);
                await VerifyTableCountAsync(connection, (SqlTransaction)tx, sourceDatabase, table, tenantId, cancellationToken);
            }
            foreach (var table in eligible)
                await ExecuteAsync(connection, (SqlTransaction)tx, $"ALTER TABLE {Q(table.Schema)}.{Q(table.Name)} WITH CHECK CHECK CONSTRAINT ALL", cancellationToken);
            await ExecuteAsync(connection, (SqlTransaction)tx, "EXEC sys.sp_set_session_context @key=N'AIERP_AuditRetentionPurge', @value=NULL", cancellationToken);
            await tx.CommitAsync(cancellationToken);
        }
        catch
        {
            await tx.RollbackAsync(cancellationToken);
            await ExecuteAsync(connection, null!, "EXEC sys.sp_set_session_context @key=N'AIERP_AuditRetentionPurge', @value=NULL", cancellationToken);
            throw;
        }
        finally { await connection.CloseAsync(); }
    }

    private static async Task VerifyTableCountAsync(SqlConnection connection, SqlTransaction transaction, string sourceDatabase,
        (string Schema, string Name, string Filter, string[] Columns, bool Identity) table, Guid tenantId, CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand();
        command.Transaction = transaction;
        var source = $"{Q(sourceDatabase)}.{Q(table.Schema)}.{Q(table.Name)}";
        var target = $"{Q(table.Schema)}.{Q(table.Name)}";
        command.CommandText = $"SELECT (SELECT COUNT_BIG(*) FROM {source} WHERE {Q(table.Filter)}=@tenant), (SELECT COUNT_BIG(*) FROM {target} WHERE {Q(table.Filter)}=@tenant)";
        command.Parameters.AddWithValue("@tenant", tenantId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken) || reader.GetInt64(0) != reader.GetInt64(1))
            throw new InvalidOperationException($"Tenant row count verification failed for {table.Schema}.{table.Name}.");
    }

    private static async Task ExecuteAsync(SqlConnection connection, SqlTransaction tx, string sql, CancellationToken cancellationToken, Guid? tenantId = null)
    {
        await using var command = connection.CreateCommand(); command.Transaction = tx; command.CommandText = sql;
        if (tenantId is not null) command.Parameters.AddWithValue("@tenant", tenantId.Value);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }
    private static string Q(string value) => $"[{value.Replace("]", "]]", StringComparison.Ordinal)}]";
}
