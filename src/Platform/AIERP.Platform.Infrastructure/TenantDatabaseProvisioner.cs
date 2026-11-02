using AIERP.Platform.Domain;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata;

namespace AIERP.Platform.Infrastructure;

public sealed class TenantDatabaseProvisioner(string platformConnection, string? separationBackupPath = null,
    ITenantSqlCredentialWriter? credentialWriter = null, ITenantSqlCredentialReader? credentialReader = null)
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

    private static async Task EnsureTenantIdentityRowAsync(string platformConnection, string tenantDatabase, Guid tenantId, CancellationToken cancellationToken)
    {
        var sourceDatabase = new SqlConnectionStringBuilder(platformConnection).InitialCatalog;
        var targetConnection = new SqlConnectionStringBuilder(platformConnection) { InitialCatalog = tenantDatabase };
        await using var connection = new SqlConnection(targetConnection.ConnectionString);
        await connection.OpenAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = $"""
            IF NOT EXISTS (SELECT 1 FROM [dbo].[Tenants] WITH (UPDLOCK, HOLDLOCK) WHERE [Id] = @tenantId)
            BEGIN
                INSERT INTO [dbo].[Tenants] ([Id], [Name], [Slug], [IsActive], [BaseCurrencyCode], [AuditRetentionDays], [AuditLastPurgeAt])
                SELECT [Id], [Name], [Slug], [IsActive], [BaseCurrencyCode], [AuditRetentionDays], [AuditLastPurgeAt]
                FROM {Q(sourceDatabase)}.[dbo].[Tenants]
                WHERE [Id] = @tenantId;
            END;
            IF NOT EXISTS (SELECT 1 FROM [dbo].[Tenants] WHERE [Id] = @tenantId)
                THROW 51000, 'Tenant identity row is missing from PlatformDB.', 1;
            """;
        command.Parameters.AddWithValue("@tenantId", tenantId);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    public async Task ProvisionAsync(Guid tenantId, CancellationToken cancellationToken = default,
        bool sourceDatabaseWasCreatedDuringCurrentBootstrap = false)
    {
        if (tenantId == Guid.Empty) throw new ArgumentException("Tenant id is required.", nameof(tenantId));
        if (credentialWriter is null || credentialReader is null)
            throw new InvalidOperationException("Tenant provisioning requires a dedicated Vault writer and read-back reader.");

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
                                if (!await TenantDatabaseExistsAsync(platformConnection, tenantId, TenantSqlDatabaseComponent.Erp, existsToken))
                                    throw new InvalidOperationException($"Tenant database '{entry.DatabaseName}' is missing; migration-only retry cannot recreate or copy it.");
                            },
                            migrate: migrateToken => readyDatabase.Database.MigrateAsync(migrateToken),
                            grantRuntimeAccess: async grantToken =>
                            {
                                _ = await EnsureTenantRuntimeCredentialAsync(tenantId, TenantSqlDatabaseComponent.Erp, entry.DatabaseName, grantToken);
                            },
                            verifyTenant: async verifyToken =>
                            {
                                await EnsureTenantIdentityRowAsync(platformConnection, entry.DatabaseName, tenantId, verifyToken);
                                var credential = await ReadTenantRuntimeCredentialAsync(tenantId, TenantSqlDatabaseComponent.Erp, verifyToken);
                                var isolatedConnection = TenantDatabaseRouting.BuildComponentConnectionString(platformConnection, tenantId,
                                    TenantSqlDatabaseComponent.Erp, credential);
                                await TenantDatabaseSeparationVerifier.VerifyTenantForProvisioningAsync(platformConnection, tenantId, verifyToken, isolatedConnection);
                                await VerifyTenantCredentialCannotReadOtherDatabasesAsync(tenantId, TenantSqlDatabaseComponent.Erp,
                                    credential, entry.DatabaseName, verifyToken);
                            },
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
                    await EnsureTenantDatabaseAsync(platformConnection, tenantId, TenantSqlDatabaseComponent.Erp, token);
                },
                migrate: token => target.Database.MigrateAsync(token),
                grantRuntimeAccess: async token =>
                {
                    _ = await EnsureTenantRuntimeCredentialAsync(tenantId, TenantSqlDatabaseComponent.Erp, databaseName, token);
                },
                verifyTenant: async token =>
                {
                    await EnsureTenantIdentityRowAsync(platformConnection, databaseName, tenantId, token);
                    var credential = await ReadTenantRuntimeCredentialAsync(tenantId, TenantSqlDatabaseComponent.Erp, token);
                    var isolatedConnection = TenantDatabaseRouting.BuildComponentConnectionString(platformConnection, tenantId,
                        TenantSqlDatabaseComponent.Erp, credential);
                    await TenantDatabaseSeparationVerifier.VerifyTenantForProvisioningAsync(platformConnection, tenantId, token, isolatedConnection);
                    await VerifyTenantCredentialCannotReadOtherDatabasesAsync(tenantId, TenantSqlDatabaseComponent.Erp,
                        credential, databaseName, token);
                },
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
                copyTenantRows: sourceDatabaseWasCreatedDuringCurrentBootstrap ? null : async token =>
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

    internal static TenantSqlCredential CreateTenantRuntimeCredential(Guid tenantId, TenantSqlDatabaseComponent component) =>
        new(TenantSqlCredentialPath.DatabaseName(tenantId, component),
            component switch
            {
                TenantSqlDatabaseComponent.Erp => $"aierp_t_{tenantId:N}",
                TenantSqlDatabaseComponent.AiStudio => $"aierp_s_{tenantId:N}",
                _ => throw new ArgumentOutOfRangeException(nameof(component))
            }, Convert.ToBase64String(System.Security.Cryptography.RandomNumberGenerator.GetBytes(48)), 1);

    private async Task<TenantSqlCredential> EnsureTenantRuntimeCredentialAsync(Guid tenantId,
        TenantSqlDatabaseComponent component, string databaseName, CancellationToken cancellationToken,
        bool configureDatabaseAccess = true)
    {
        if (credentialWriter is null || credentialReader is null)
            throw new InvalidOperationException("Tenant provisioning requires a dedicated Vault writer and read-back reader.");
        var credential = CreateTenantRuntimeCredential(tenantId, component);
        if (!string.Equals(credential.DatabaseName, databaseName, StringComparison.Ordinal))
            throw new InvalidOperationException("Tenant database name does not match the credential identity.");
        await EnsureTenantSqlPrincipalAsync(credential, cancellationToken, configureDatabaseAccess);
        var secretPath = TenantSqlCredentialPath.ForTenant(tenantId, component);
        await credentialWriter.WriteAsync(tenantId, component, credential, cancellationToken);
        var stored = await credentialReader.ReadAsync(tenantId, component, secretPath, cancellationToken);
        if (!string.Equals(stored.DatabaseName, credential.DatabaseName, StringComparison.Ordinal)
            || !string.Equals(stored.UserName, credential.UserName, StringComparison.Ordinal)
            || !string.Equals(stored.Password, credential.Password, StringComparison.Ordinal))
            throw new InvalidOperationException("Vault credential read-back did not match the provisioned SQL principal.");
        return stored;
    }

    private async Task<TenantSqlCredential> ReadTenantRuntimeCredentialAsync(Guid tenantId,
        TenantSqlDatabaseComponent component, CancellationToken cancellationToken)
    {
        if (credentialReader is null)
            throw new InvalidOperationException("Tenant provisioning requires a dedicated Vault read-back reader.");
        return await credentialReader.ReadAsync(tenantId, component, TenantSqlCredentialPath.ForTenant(tenantId, component), cancellationToken);
    }

    private async Task EnsureTenantSqlPrincipalAsync(TenantSqlCredential credential, CancellationToken cancellationToken,
        bool configureDatabaseAccess = true)
    {
        var tenantId = ExtractTenantId(credential);
        var component = credential.DatabaseName.StartsWith("AIERPStudio_", StringComparison.Ordinal)
            ? TenantSqlDatabaseComponent.AiStudio
            : TenantSqlDatabaseComponent.Erp;
        if (!TenantSqlCredentialPath.IsValidUserName(tenantId, component, credential.UserName))
            throw new InvalidOperationException("Tenant SQL principal does not match the tenant identity.");
        var masterBuilder = new SqlConnectionStringBuilder(platformConnection) { InitialCatalog = "master" };
        await using (var master = new SqlConnection(masterBuilder.ConnectionString))
        {
            await master.OpenAsync(cancellationToken);
            await using var command = master.CreateCommand();
            command.CommandText = "EXEC dbo.NexoraEnsureTenantSqlLogin @TenantId = @tenantId, @Component = @component, @Password = @password;";
            command.Parameters.Add("@tenantId", System.Data.SqlDbType.UniqueIdentifier).Value = tenantId;
            command.Parameters.Add("@component", System.Data.SqlDbType.TinyInt).Value = ComponentCode(component);
            command.Parameters.Add("@password", System.Data.SqlDbType.NVarChar, 512).Value = credential.Password;
            await command.ExecuteNonQueryAsync(cancellationToken);
        }

        // Ready tenant databases already have their canonical SQL user and role
        // memberships. The provisioning principal intentionally has no access to
        // tenant databases, so credential rotation must not use it to grant roles.
        if (!configureDatabaseAccess) return;

        var targetBuilder = new SqlConnectionStringBuilder(platformConnection) { InitialCatalog = credential.DatabaseName };
        await using var target = new SqlConnection(targetBuilder.ConnectionString);
        await target.OpenAsync(cancellationToken);
        await using var grant = target.CreateCommand();
        var user = Q(credential.UserName);
        grant.CommandText = $"""
            IF DATABASE_PRINCIPAL_ID(@login) IS NULL CREATE USER {user} FOR LOGIN {user};
            ELSE IF NOT EXISTS
            (
                SELECT 1
                FROM sys.database_principals AS [databasePrincipal]
                INNER JOIN sys.server_principals AS [serverPrincipal]
                    ON [serverPrincipal].[sid] = [databasePrincipal].[sid]
                WHERE [databasePrincipal].[name] = @login
                  AND [serverPrincipal].[name] = @login
            )
                THROW 51001, 'Tenant database principal is not mapped to the tenant login.', 1;
            IF NOT EXISTS
            (
                SELECT 1
                FROM sys.database_role_members AS [membership]
                INNER JOIN sys.database_principals AS [role]
                    ON [role].[principal_id] = [membership].[role_principal_id]
                INNER JOIN sys.database_principals AS [member]
                    ON [member].[principal_id] = [membership].[member_principal_id]
                WHERE [role].[name] = N'db_datareader' AND [member].[name] = @login
            ) ALTER ROLE [db_datareader] ADD MEMBER {user};
            IF NOT EXISTS
            (
                SELECT 1
                FROM sys.database_role_members AS [membership]
                INNER JOIN sys.database_principals AS [role]
                    ON [role].[principal_id] = [membership].[role_principal_id]
                INNER JOIN sys.database_principals AS [member]
                    ON [member].[principal_id] = [membership].[member_principal_id]
                WHERE [role].[name] = N'db_datawriter' AND [member].[name] = @login
            ) ALTER ROLE [db_datawriter] ADD MEMBER {user};
            IF OBJECT_ID(N'dbo.PurgeExpiredAuditEvents', N'P') IS NOT NULL GRANT EXECUTE ON dbo.PurgeExpiredAuditEvents TO {user};
            """;
        grant.Parameters.AddWithValue("@login", credential.UserName);
        await grant.ExecuteNonQueryAsync(cancellationToken);
    }

    private static Guid ExtractTenantId(TenantSqlCredential credential)
    {
        const string erpPrefix = "AIERPTenant_";
        const string studioPrefix = "AIERPStudio_";
        var databaseName = credential.DatabaseName;
        var prefix = databaseName.StartsWith(erpPrefix, StringComparison.Ordinal) ? erpPrefix
            : databaseName.StartsWith(studioPrefix, StringComparison.Ordinal) ? studioPrefix : null;
        if (prefix is null || !Guid.TryParseExact(databaseName[prefix.Length..], "N", out var tenantId) || tenantId == Guid.Empty)
            throw new InvalidOperationException("Tenant SQL credential database name is invalid.");
        return tenantId;
    }

    private async Task VerifyTenantCredentialCannotReadOtherDatabasesAsync(Guid tenantId, TenantSqlDatabaseComponent component,
        TenantSqlCredential credential, string ownDatabase, CancellationToken cancellationToken)
    {
        var platformOptions = new DbContextOptionsBuilder<PlatformDbContext>().UseSqlServer(platformConnection).Options;
        await using var platform = new PlatformDbContext(platformOptions);
        List<string> otherDatabases;
        if (component == TenantSqlDatabaseComponent.AiStudio)
        {
            var ownComponent = $"AIStudio:{tenantId:N}";
            otherDatabases = await platform.DatabaseSeparationComponentStates.AsNoTracking()
                .Where(x => x.Component.StartsWith("AIStudio:") && x.Component != ownComponent
                    && x.State == TenantDatabaseProvisioningState.Ready)
                .Select(x => x.DatabaseName).ToListAsync(cancellationToken);
        }
        else
        {
            otherDatabases = await platform.TenantDatabaseCatalog.AsNoTracking()
                .Where(x => x.TenantId != tenantId && x.State == TenantDatabaseProvisioningState.Ready)
                .Select(x => x.DatabaseName).ToListAsync(cancellationToken);
        }
        var platformDatabase = new SqlConnectionStringBuilder(platformConnection).InitialCatalog;
        if (string.IsNullOrWhiteSpace(platformDatabase))
            throw new InvalidOperationException("Provisioning connection must specify the Platform database for denial verification.");
        otherDatabases.Add(platformDatabase);
        foreach (var otherDatabase in otherDatabases.Distinct(StringComparer.OrdinalIgnoreCase))
        {
            if (string.Equals(otherDatabase, ownDatabase, StringComparison.OrdinalIgnoreCase)) continue;
            var builder = new SqlConnectionStringBuilder(platformConnection)
            {
                InitialCatalog = otherDatabase,
                UserID = credential.UserName,
                Password = credential.Password,
                IntegratedSecurity = false,
                PersistSecurityInfo = false
            };
            try
            {
                await using var connection = new SqlConnection(builder.ConnectionString);
                await connection.OpenAsync(cancellationToken);
                await using var command = connection.CreateCommand();
                command.CommandText = "SELECT TOP (1) [Id] FROM [dbo].[Tenants];";
                _ = await command.ExecuteScalarAsync(cancellationToken);
                throw new InvalidOperationException("Tenant SQL credential can read outside its own database.");
            }
            catch (SqlException exception) when (exception.Number is 229 or 916 or 4060) { }
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

    internal static async Task<bool> TenantDatabaseExistsAsync(string workerConnection, Guid tenantId,
        TenantSqlDatabaseComponent component, CancellationToken cancellationToken)
    {
        if (tenantId == Guid.Empty) throw new ArgumentException("Tenant id is required.", nameof(tenantId));
        var masterBuilder = new SqlConnectionStringBuilder(workerConnection) { InitialCatalog = "master" };
        await using var connection = new SqlConnection(masterBuilder.ConnectionString);
        await connection.OpenAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = "EXEC dbo.NexoraTenantDatabaseExists @TenantId = @tenantId, @Component = @component;";
        command.Parameters.Add("@tenantId", System.Data.SqlDbType.UniqueIdentifier).Value = tenantId;
        command.Parameters.Add("@component", System.Data.SqlDbType.TinyInt).Value = ComponentCode(component);
        return (bool)(await command.ExecuteScalarAsync(cancellationToken) ?? false);
    }

    private static async Task EnsureTenantDatabaseAsync(string workerConnection, Guid tenantId,
        TenantSqlDatabaseComponent component, CancellationToken cancellationToken)
    {
        if (tenantId == Guid.Empty) throw new ArgumentException("Tenant id is required.", nameof(tenantId));
        var masterBuilder = new SqlConnectionStringBuilder(workerConnection) { InitialCatalog = "master" };
        await using var connection = new SqlConnection(masterBuilder.ConnectionString);
        await connection.OpenAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = "EXEC dbo.NexoraEnsureTenantDatabase @TenantId = @tenantId, @Component = @component;";
        command.Parameters.Add("@tenantId", System.Data.SqlDbType.UniqueIdentifier).Value = tenantId;
        command.Parameters.Add("@component", System.Data.SqlDbType.TinyInt).Value = ComponentCode(component);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    internal static byte ComponentCode(TenantSqlDatabaseComponent component) => component switch
    {
        TenantSqlDatabaseComponent.Erp => 1,
        TenantSqlDatabaseComponent.AiStudio => 2,
        _ => throw new ArgumentOutOfRangeException(nameof(component))
    };

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

    public async Task ProvisionAIStudioTenantAsync(Guid tenantId, CancellationToken cancellationToken = default)
    {
        if (tenantId == Guid.Empty) throw new ArgumentException("Tenant id is required.", nameof(tenantId));
        if (credentialWriter is null || credentialReader is null)
            throw new InvalidOperationException("Tenant provisioning requires a dedicated Vault writer and read-back reader.");

        var component = TenantDatabaseRouting.StudioComponentKey(tenantId);
        var databaseName = TenantSqlCredentialPath.DatabaseName(tenantId, TenantSqlDatabaseComponent.AiStudio);
        var platformOptions = new DbContextOptionsBuilder<PlatformDbContext>().UseSqlServer(platformConnection).Options;
        DatabaseSeparationComponentState state;
        bool migrationOnlyRetry;
        await using (var platform = new PlatformDbContext(platformOptions))
        {
            var tenant = await platform.Tenants.AsNoTracking().SingleOrDefaultAsync(x => x.Id == tenantId, cancellationToken)
                ?? throw new InvalidOperationException("Tenant does not exist in PlatformDB.");
            if (tenant.IsActive)
                throw new InvalidOperationException("AIStudio database bootstrap is restricted to inactive tenant provisioning jobs.");
            var erpReady = await platform.TenantDatabaseCatalog.AsNoTracking()
                .AnyAsync(x => x.TenantId == tenantId && x.State == TenantDatabaseProvisioningState.Ready, cancellationToken);
            if (!erpReady)
                throw new InvalidOperationException("The tenant ERP database must be Ready before its AIStudio database is provisioned.");
            var runningJob = await platform.TenantProvisioningJobs.AsNoTracking()
                .AnyAsync(x => x.TenantId == tenantId && x.Status == TenantProvisioningJobStatus.Running, cancellationToken);
            if (!runningJob)
                throw new InvalidOperationException("A running tenant provisioning job is required to create an empty AIStudio database.");

            var existingState = await platform.DatabaseSeparationComponentStates
                .SingleOrDefaultAsync(x => x.Component == component, cancellationToken);
            state = existingState ?? new DatabaseSeparationComponentState { Component = component, DatabaseName = databaseName };
            if (!string.Equals(state.DatabaseName, databaseName, StringComparison.Ordinal))
                throw new InvalidOperationException("AIStudio catalog database name does not match the tenant identity.");
            migrationOnlyRetry = existingState is not null
                && ShouldUseMigrationOnlyRetry(existingState.State, existingState.ReadyAt);
            if (existingState is null) platform.DatabaseSeparationComponentStates.Add(state);
            ApplyAIStudioProvisioningState(state, TenantDatabaseProvisioningState.Copying, null, DateTimeOffset.UtcNow);
            await platform.SaveChangesAsync(cancellationToken);
        }

        try
        {
            var connection = new SqlConnectionStringBuilder(platformConnection) { InitialCatalog = databaseName }.ConnectionString;
            var options = new DbContextOptionsBuilder<AIStudioDbContext>().UseSqlServer(connection).Options;
            await using var target = new AIStudioDbContext(options);
            await RunProvisioningStepsAsync(
                ensureDatabaseExists: async token =>
                {
                    if (migrationOnlyRetry)
                    {
                        if (!await TenantDatabaseExistsAsync(platformConnection, tenantId, TenantSqlDatabaseComponent.AiStudio, token))
                            throw new InvalidOperationException($"AIStudio database '{databaseName}' is missing; migration-only retry cannot recreate or copy it.");
                        return;
                    }
                    await EnsureTenantDatabaseAsync(platformConnection, tenantId, TenantSqlDatabaseComponent.AiStudio, token);
                },
                migrate: token => target.Database.MigrateAsync(token),
                grantRuntimeAccess: async token =>
                {
                    _ = await EnsureTenantRuntimeCredentialAsync(tenantId, TenantSqlDatabaseComponent.AiStudio, databaseName, token);
                },
                verifyTenant: async token =>
                {
                    await EnsureTenantIdentityRowAsync(platformConnection, databaseName, tenantId, token);
                    var credential = await ReadTenantRuntimeCredentialAsync(tenantId, TenantSqlDatabaseComponent.AiStudio, token);
                    var isolatedConnection = TenantDatabaseRouting.BuildComponentConnectionString(platformConnection, tenantId,
                        TenantSqlDatabaseComponent.AiStudio, credential);
                    await TenantDatabaseSeparationVerifier.VerifyStudioTenantForProvisioningAsync(
                        platformConnection, tenantId, token, isolatedConnection);
                    await VerifyTenantCredentialCannotReadOtherDatabasesAsync(tenantId, TenantSqlDatabaseComponent.AiStudio,
                        credential, databaseName, token);
                },
                persistState: (nextState, error, token) => PersistAIStudioStateAsync(
                    platformConnection, component, databaseName, nextState, error, token),
                cancellationToken);
        }
        catch (Exception exception)
        {
            await PersistAIStudioStateAsync(platformConnection, component, databaseName,
                TenantDatabaseProvisioningState.Failed, FormatSafeMigrationError(exception), CancellationToken.None);
            throw;
        }
    }

    /// <summary>
    /// Replaces the SQL passwords for already isolated, Ready tenant databases and publishes
    /// the resulting credentials to Vault. This does not copy data, run migrations, or change
    /// catalog readiness. Run it only while API, AI Service, and tenant-aware workers are stopped.
    /// </summary>
    public async Task<TenantSqlCredentialCutoverResult> MigrateExistingReadyTenantCredentialsAsync(
        CancellationToken cancellationToken = default)
    {
        if (credentialWriter is null || credentialReader is null)
            throw new InvalidOperationException("Tenant SQL credential cutover requires a dedicated Vault writer and read-back reader.");

        var platformOptions = new DbContextOptionsBuilder<PlatformDbContext>().UseSqlServer(platformConnection).Options;
        List<(Guid TenantId, string DatabaseName)> erpDatabases;
        List<(Guid TenantId, string DatabaseName)> studioDatabases;
        List<Guid> activeTenantIds;
        await using (var platform = new PlatformDbContext(platformOptions))
        {
            activeTenantIds = await platform.Tenants.AsNoTracking().Where(x => x.IsActive)
                .Select(x => x.Id).ToListAsync(cancellationToken);
            var erpStates = await platform.TenantDatabaseCatalog.AsNoTracking()
                .Where(x => x.State == TenantDatabaseProvisioningState.Ready)
                .Select(x => new { x.TenantId, x.DatabaseName })
                .ToListAsync(cancellationToken);
            erpDatabases = erpStates.Select(x => (x.TenantId, x.DatabaseName)).ToList();
            var studioStates = await platform.DatabaseSeparationComponentStates.AsNoTracking()
                .Where(x => x.State == TenantDatabaseProvisioningState.Ready && x.Component.StartsWith("AIStudio:"))
                .Select(x => new { x.Component, x.DatabaseName })
                .ToListAsync(cancellationToken);
            studioDatabases = studioStates.Select(x =>
            {
                const string prefix = "AIStudio:";
                if (!x.Component.StartsWith(prefix, StringComparison.Ordinal)
                    || !Guid.TryParseExact(x.Component[prefix.Length..], "N", out var id) || id == Guid.Empty)
                    throw new InvalidOperationException("A Ready AIStudio catalog component has an invalid tenant identity.");
                if (!string.Equals(x.Component, TenantDatabaseRouting.StudioComponentKey(id), StringComparison.Ordinal))
                    throw new InvalidOperationException("A Ready AIStudio catalog component is not in canonical tenant form.");
                return (id, x.DatabaseName);
            }).ToList();
        }

        if (erpDatabases.Count == 0 && studioDatabases.Count == 0)
            throw new InvalidOperationException("No Ready tenant SQL databases were found for Vault credential cutover.");

        var readyErpTenantIds = erpDatabases.Select(x => x.TenantId).ToHashSet();
        var readyStudioTenantIds = studioDatabases.Select(x => x.TenantId).ToHashSet();
        if (activeTenantIds.Any(tenantId => !readyErpTenantIds.Contains(tenantId)))
            throw new InvalidOperationException("Vault credential cutover requires every active tenant to have a Ready isolated ERP database; complete legacy separation first.");
        if (!readyErpTenantIds.SetEquals(readyStudioTenantIds))
            throw new InvalidOperationException("Vault credential cutover requires a Ready isolated AIStudio database for every Ready ERP tenant; complete missing Studio separation first.");

        // Validate every target before changing any SQL password or Vault value. This keeps
        // legacy shared databases and stale catalog entries outside this one-time operation.
        foreach (var entry in erpDatabases)
        {
            if (entry.TenantId == Guid.Empty || !string.Equals(entry.DatabaseName,
                    TenantSqlCredentialPath.DatabaseName(entry.TenantId, TenantSqlDatabaseComponent.Erp), StringComparison.Ordinal)
                || !await TenantDatabaseExistsAsync(platformConnection, entry.TenantId, TenantSqlDatabaseComponent.Erp, cancellationToken))
                throw new InvalidOperationException("ERP credential cutover preflight found a missing or non-canonical Ready tenant database.");
        }
        foreach (var entry in studioDatabases)
        {
            if (!readyErpTenantIds.Contains(entry.TenantId)
                || !string.Equals(entry.DatabaseName,
                    TenantSqlCredentialPath.DatabaseName(entry.TenantId, TenantSqlDatabaseComponent.AiStudio), StringComparison.Ordinal)
                || !await TenantDatabaseExistsAsync(platformConnection, entry.TenantId, TenantSqlDatabaseComponent.AiStudio, cancellationToken))
                throw new InvalidOperationException("AIStudio credential cutover preflight found a missing ERP catalog row or non-canonical Ready tenant database.");
        }

        foreach (var entry in erpDatabases)
        {
            var credential = await EnsureTenantRuntimeCredentialAsync(entry.TenantId, TenantSqlDatabaseComponent.Erp,
                entry.DatabaseName, cancellationToken, configureDatabaseAccess: false);
            var connection = TenantDatabaseRouting.BuildComponentConnectionString(platformConnection, entry.TenantId,
                TenantSqlDatabaseComponent.Erp, credential);
            await TenantDatabaseSeparationVerifier.VerifyReadyTenantForCredentialCutoverAsync(platformConnection, entry.TenantId,
                cancellationToken, connection);
            await VerifyTenantCredentialCannotReadOtherDatabasesAsync(entry.TenantId, TenantSqlDatabaseComponent.Erp,
                credential, entry.DatabaseName, cancellationToken);
        }
        foreach (var entry in studioDatabases)
        {
            var credential = await EnsureTenantRuntimeCredentialAsync(entry.TenantId, TenantSqlDatabaseComponent.AiStudio,
                entry.DatabaseName, cancellationToken, configureDatabaseAccess: false);
            var connection = TenantDatabaseRouting.BuildComponentConnectionString(platformConnection, entry.TenantId,
                TenantSqlDatabaseComponent.AiStudio, credential);
            await TenantDatabaseSeparationVerifier.VerifyReadyStudioTenantForCredentialCutoverAsync(platformConnection, entry.TenantId,
                cancellationToken, connection);
            await VerifyTenantCredentialCannotReadOtherDatabasesAsync(entry.TenantId, TenantSqlDatabaseComponent.AiStudio,
                credential, entry.DatabaseName, cancellationToken);
        }

        return new TenantSqlCredentialCutoverResult(erpDatabases.Count, studioDatabases.Count);
    }

    public async Task ProvisionAIStudioAsync(CancellationToken cancellationToken = default,
        bool sourceDatabaseWasCreatedDuringCurrentBootstrap = false)
    {
        // A single AIERPStudio database contains multiple companies and is not an
        // acceptable target. The per-tenant migration/provisioning path must be
        // used before any SQL connection or catalog state is changed.
        throw new InvalidOperationException("Shared AIStudio provisioning is disabled. Provision a separate AIERPStudio_{tenant-guid} database for each tenant.");
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

public sealed record TenantSqlCredentialCutoverResult(int ErpDatabaseCount, int AiStudioDatabaseCount);
