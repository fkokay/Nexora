using AIERP.Platform.Domain;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata;

namespace AIERP.Platform.Infrastructure;

public sealed class TenantDatabaseProvisioner(string platformConnection, string dataRuntimeLogin = "aierp_data_runtime")
{
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

    public async Task ProvisionAsync(Guid tenantId, CancellationToken cancellationToken = default)
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
            if (entry is null)
            {
                entry = new TenantDatabaseCatalogEntry { TenantId = tenantId, DatabaseName = databaseName };
                platform.TenantDatabaseCatalog.Add(entry);
            }
            if (!string.Equals(entry.DatabaseName, databaseName, StringComparison.Ordinal)) throw new InvalidOperationException("Catalog database name does not match the tenant identity.");
            if (entry.State == TenantDatabaseProvisioningState.Ready) return;
            entry.State = TenantDatabaseProvisioningState.Copying;
            entry.LastError = null;
            entry.UpdatedAt = DateTimeOffset.UtcNow;
            await platform.SaveChangesAsync(cancellationToken);
        }

        try
        {
            var masterBuilder = new SqlConnectionStringBuilder(platformConnection) { InitialCatalog = "master" };
            await using (var master = new SqlConnection(masterBuilder.ConnectionString))
            {
                await master.OpenAsync(cancellationToken);
                await using var create = master.CreateCommand();
                create.CommandText = "IF DB_ID(@db) IS NULL EXEC('CREATE DATABASE ' + QUOTENAME(@db))";
                create.Parameters.AddWithValue("@db", databaseName);
                await create.ExecuteNonQueryAsync(cancellationToken);
            }
            var targetBuilder = new SqlConnectionStringBuilder(platformConnection) { InitialCatalog = databaseName };
            var options = new DbContextOptionsBuilder<TenantDbContext>().UseSqlServer(targetBuilder.ConnectionString).Options;
            await using (var target = new TenantDbContext(options)) await target.Database.MigrateAsync(cancellationToken);
            await GrantDatabaseRuntimeAccessAsync(platformConnection, databaseName, dataRuntimeLogin, cancellationToken: cancellationToken);
            await CopyTenantRowsAsync(sourceDatabase, databaseName, tenantId, new TenantDbContext(options), cancellationToken);
            await using var platform = new PlatformDbContext(new DbContextOptionsBuilder<PlatformDbContext>().UseSqlServer(platformConnection).Options);
            var ready = await platform.TenantDatabaseCatalog.SingleAsync(x => x.TenantId == tenantId, cancellationToken);
            ready.State = TenantDatabaseProvisioningState.Ready;
            ready.LastError = null;
            ready.ReadyAt = ready.UpdatedAt = DateTimeOffset.UtcNow;
            await platform.SaveChangesAsync(cancellationToken);
        }
        catch (Exception ex)
        {
            await using var platform = new PlatformDbContext(new DbContextOptionsBuilder<PlatformDbContext>().UseSqlServer(platformConnection).Options);
            var failed = await platform.TenantDatabaseCatalog.SingleOrDefaultAsync(x => x.TenantId == tenantId, cancellationToken);
            if (failed is not null)
            {
                failed.State = TenantDatabaseProvisioningState.Failed;
                failed.LastError = ex.Message.Length > 1900 ? ex.Message[..1900] : ex.Message;
                failed.UpdatedAt = DateTimeOffset.UtcNow;
                await platform.SaveChangesAsync(cancellationToken);
            }
            throw;
        }
    }

    public async Task ProvisionAIStudioAsync(CancellationToken cancellationToken = default)
    {
        const string component = "AIStudio";
        const string databaseName = "AIERPStudio";
        var sourceDatabase = new SqlConnectionStringBuilder(platformConnection).InitialCatalog;
        if (string.IsNullOrWhiteSpace(sourceDatabase)) throw new InvalidOperationException("Platform connection must specify a database.");
        await using (var platform = new PlatformDbContext(new DbContextOptionsBuilder<PlatformDbContext>().UseSqlServer(platformConnection).Options))
        {
            var state = await platform.DatabaseSeparationComponentStates.FindAsync([component], cancellationToken);
            if (state?.State == TenantDatabaseProvisioningState.Ready) return;
            if (state is null) platform.DatabaseSeparationComponentStates.Add(state = new DatabaseSeparationComponentState { Component = component, DatabaseName = databaseName });
            if (state.DatabaseName != databaseName) throw new InvalidOperationException("AIStudio catalog database name is invalid.");
            state.State = TenantDatabaseProvisioningState.Copying; state.LastError = null; state.UpdatedAt = DateTimeOffset.UtcNow;
            await platform.SaveChangesAsync(cancellationToken);
        }
        try
        {
            var masterBuilder = new SqlConnectionStringBuilder(platformConnection) { InitialCatalog = "master" };
            await using (var master = new SqlConnection(masterBuilder.ConnectionString))
            {
                await master.OpenAsync(cancellationToken); await using var create = master.CreateCommand();
                create.CommandText = "IF DB_ID(@db) IS NULL EXEC('CREATE DATABASE ' + QUOTENAME(@db))"; create.Parameters.AddWithValue("@db", databaseName);
                await create.ExecuteNonQueryAsync(cancellationToken);
            }
            var targetBuilder = new SqlConnectionStringBuilder(platformConnection) { InitialCatalog = databaseName };
            var options = new DbContextOptionsBuilder<AIStudioDbContext>().UseSqlServer(targetBuilder.ConnectionString).Options;
            await using (var target = new AIStudioDbContext(options)) await target.Database.MigrateAsync(cancellationToken);
            await GrantDatabaseRuntimeAccessAsync(platformConnection, databaseName, dataRuntimeLogin, cancellationToken: cancellationToken);
            List<Guid> tenants;
            await using (var platform = new PlatformDbContext(new DbContextOptionsBuilder<PlatformDbContext>().UseSqlServer(platformConnection).Options))
                tenants = await platform.Tenants.AsNoTracking().Select(x => x.Id).ToListAsync(cancellationToken);
            foreach (var tenantId in tenants)
            {
                await using var studio = new AIStudioDbContext(options);
                await CopyTenantRowsAsync(sourceDatabase, databaseName, tenantId, studio, cancellationToken);
            }
            await using var catalog = new PlatformDbContext(new DbContextOptionsBuilder<PlatformDbContext>().UseSqlServer(platformConnection).Options);
            var ready = await catalog.DatabaseSeparationComponentStates.SingleAsync(x => x.Component == component, cancellationToken);
            ready.State = TenantDatabaseProvisioningState.Ready; ready.LastError = null; ready.ReadyAt = ready.UpdatedAt = DateTimeOffset.UtcNow;
            await catalog.SaveChangesAsync(cancellationToken);
        }
        catch (Exception ex)
        {
            await using var catalog = new PlatformDbContext(new DbContextOptionsBuilder<PlatformDbContext>().UseSqlServer(platformConnection).Options);
            var failed = await catalog.DatabaseSeparationComponentStates.SingleOrDefaultAsync(x => x.Component == component, cancellationToken);
            if (failed is not null) { failed.State = TenantDatabaseProvisioningState.Failed; failed.LastError = ex.Message.Length > 1900 ? ex.Message[..1900] : ex.Message; failed.UpdatedAt = DateTimeOffset.UtcNow; await catalog.SaveChangesAsync(cancellationToken); }
            throw;
        }
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
                metadata.CommandText = "SELECT c.name, c.is_identity FROM sys.columns c JOIN sys.tables t ON t.object_id=c.object_id JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE s.name=@s AND t.name=@t ORDER BY c.column_id";
                metadata.Parameters.AddWithValue("@s", schema); metadata.Parameters.AddWithValue("@t", name);
                var columns = new List<string>(); var identity = false;
                await using (var reader = await metadata.ExecuteReaderAsync(cancellationToken)) while (await reader.ReadAsync(cancellationToken)) { columns.Add(reader.GetString(0)); identity |= reader.GetBoolean(1); }
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

    private static async Task ExecuteAsync(SqlConnection connection, SqlTransaction tx, string sql, CancellationToken cancellationToken, Guid? tenantId = null)
    {
        await using var command = connection.CreateCommand(); command.Transaction = tx; command.CommandText = sql;
        if (tenantId is not null) command.Parameters.AddWithValue("@tenant", tenantId.Value);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }
    private static string Q(string value) => $"[{value.Replace("]", "]]", StringComparison.Ordinal)}]";
}
