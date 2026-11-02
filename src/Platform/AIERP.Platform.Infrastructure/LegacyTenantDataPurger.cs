using AIERP.Platform.Domain;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace AIERP.Platform.Infrastructure;

public sealed record LegacyTenantTableCount(string Schema, string Table, long Rows);

public sealed record LegacyTenantDataPurgeReport(int TenantCount, IReadOnlyList<LegacyTenantTableCount> Tables)
{
    public long TotalRows => Tables.Sum(x => x.Rows);
}

/// <summary>
/// Explicit operator-only cutover utility. This is never called by normal startup or migrations.
/// It removes only rows in TenantDbContext-mapped tables that carry TenantId; Platform metadata stays put.
/// </summary>
public sealed class LegacyTenantDataPurger(string platformConnection, string? isolatedStudioVerificationConnection = null)
{
    private sealed record PurgeTopology(Guid[] TenantIds, IReadOnlyDictionary<Guid, string> TenantDatabases,
        IReadOnlyDictionary<Guid, string> StudioDatabases);
    private sealed record ComparableColumn(string Name, int SystemTypeId, short MaxLength, byte Precision, byte Scale, bool IsComputed, byte GeneratedAlwaysType);

    public async Task<LegacyTenantDataPurgeReport> PreviewAsync(CancellationToken cancellationToken = default)
    {
        var topology = await ValidateReadyTopologyAsync(cancellationToken);
        var tables = await GetTenantScopedTablesAsync(cancellationToken);
        await using var connection = new SqlConnection(platformConnection);
        await connection.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, cancellationToken);
        try
        {
            await LockAndVerifyReadyCatalogAsync(connection, transaction, topology, cancellationToken);
            await LockTablesAsync(connection, transaction, connection.Database, tables, cancellationToken);
            await LockTenantCopiesAsync(connection, transaction, topology, tables, cancellationToken);
            await VerifyCopiesAsync(connection, transaction, topology, tables, cancellationToken);
            var report = await CountLegacyRowsAsync(connection, transaction, topology.TenantIds, tables, cancellationToken);
            var registered = await CountRegisteredRowsAsync(connection, transaction, topology.TenantIds, tables, cancellationToken);
            if (report.TotalRows != registered)
                throw new InvalidOperationException("Unregistered tenant IDs or unscoped operational rows exist in Platform; resolve them before purge.");
            await transaction.RollbackAsync(cancellationToken);
            return report;
        }
        catch
        {
            await transaction.RollbackAsync(CancellationToken.None);
            throw;
        }
    }

    public async Task<LegacyTenantDataPurgeReport> PurgeAsync(CancellationToken cancellationToken = default)
    {
        var topology = await ValidateReadyTopologyAsync(cancellationToken);
        var tables = await GetTenantScopedTablesAsync(cancellationToken);

        var builder = new SqlConnectionStringBuilder(platformConnection);
        await using var connection = new SqlConnection(builder.ConnectionString);
        await connection.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, cancellationToken);
        try
        {
            await ExecuteAsync(connection, transaction, "SET XACT_ABORT ON", cancellationToken);
            await LockAndVerifyReadyCatalogAsync(connection, transaction, topology, cancellationToken);
            await LockTablesAsync(connection, transaction, connection.Database, tables, cancellationToken);
            await LockTenantCopiesAsync(connection, transaction, topology, tables, cancellationToken);
            await VerifyCopiesAsync(connection, transaction, topology, tables, cancellationToken);
            var before = await CountLegacyRowsAsync(connection, transaction, topology.TenantIds, tables, cancellationToken);
            var registeredCount = await CountRegisteredRowsAsync(connection, transaction, topology.TenantIds, tables, cancellationToken);
            if (before.TotalRows != registeredCount)
                throw new InvalidOperationException("Unregistered tenant IDs or unscoped operational rows exist in Platform; resolve them before purge.");
            foreach (var (schema, table) in tables)
                await ExecuteAsync(connection, transaction, $"ALTER TABLE {Q(schema)}.{Q(table)} NOCHECK CONSTRAINT ALL", cancellationToken);

            await ExecuteAsync(connection, transaction, "EXEC sys.sp_set_session_context @key=N'AIERP_AuditRetentionPurge', @value=1", cancellationToken);
            foreach (var tenantId in topology.TenantIds)
            foreach (var (schema, table) in tables)
                await ExecuteAsync(connection, transaction,
                    $"DELETE FROM {Q(schema)}.{Q(table)} WHERE [TenantId]=@tenantId", cancellationToken, tenantId);
            await ClearAuditRetentionPurgeContextAsync(connection, transaction, cancellationToken);

            foreach (var (schema, table) in tables)
                await ExecuteAsync(connection, transaction, $"ALTER TABLE {Q(schema)}.{Q(table)} WITH CHECK CHECK CONSTRAINT ALL", cancellationToken);

            var remaining = await CountLegacyRowsAsync(connection, transaction, topology.TenantIds, tables, cancellationToken);
            if (remaining.TotalRows != 0)
                throw new InvalidOperationException("Legacy operational data remains in Platform after the purge; the transaction was rolled back.");

            await VerifyConstraintsTrustedAsync(connection, transaction, tables, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return before;
        }
        catch
        {
            await transaction.RollbackAsync(CancellationToken.None);
            await ClearAuditRetentionPurgeContextAsync(connection, null, CancellationToken.None);
            throw;
        }
    }

    private async Task<PurgeTopology> ValidateReadyTopologyAsync(CancellationToken cancellationToken)
    {
        await using var platform = new PlatformDbContext(new DbContextOptionsBuilder<PlatformDbContext>().UseSqlServer(platformConnection).Options);
        var tenants = await platform.Tenants.AsNoTracking().Select(x => x.Id).OrderBy(x => x).ToArrayAsync(cancellationToken);
        var catalog = await platform.TenantDatabaseCatalog.AsNoTracking().ToDictionaryAsync(x => x.TenantId, cancellationToken);
        foreach (var tenantId in tenants)
        {
            var expectedName = $"AIERPTenant_{tenantId:N}";
            if (!catalog.TryGetValue(tenantId, out var entry) || entry.State != TenantDatabaseProvisioningState.Ready || entry.DatabaseName != expectedName)
                throw new InvalidOperationException("Purge requires every registered tenant database to be Ready under its canonical database name.");
        }

        var studioCatalog = await platform.DatabaseSeparationComponentStates.AsNoTracking()
            .Where(x => x.Component == "AIStudio" || x.Component.StartsWith("AIStudio:"))
            .ToDictionaryAsync(x => x.Component, cancellationToken);
        if (studioCatalog.ContainsKey("AIStudio"))
            throw new InvalidOperationException("Purge refuses the legacy shared AIERPStudio catalog entry.");
        var studioDatabases = new Dictionary<Guid, string>();
        foreach (var tenantId in tenants)
        {
            var component = TenantDatabaseRouting.StudioComponentKey(tenantId);
            var expectedName = TenantSqlCredentialPath.DatabaseName(tenantId, TenantSqlDatabaseComponent.AiStudio);
            if (!studioCatalog.TryGetValue(component, out var entry) || entry.State != TenantDatabaseProvisioningState.Ready ||
                entry.DatabaseName != expectedName)
                throw new InvalidOperationException("Purge requires every tenant AI Studio database to be Ready under its canonical database name.");
            studioDatabases.Add(tenantId, expectedName);
        }
        if (studioCatalog.Count != tenants.Length)
            throw new InvalidOperationException("Purge refuses an AI Studio catalog with orphaned or unexpected tenant entries.");

        foreach (var tenantId in tenants)
        {
            await TenantDatabaseSeparationVerifier.VerifyTenantAsync(platformConnection, tenantId, cancellationToken);
            await TenantDatabaseSeparationVerifier.VerifyStudioTenantAsync(platformConnection, tenantId, cancellationToken,
                isolatedStudioVerificationConnection);
        }
        return new PurgeTopology(tenants, catalog.ToDictionary(x => x.Key, x => x.Value.DatabaseName), studioDatabases);
    }

    private async Task<(string Schema, string Table)[]> GetTenantScopedTablesAsync(CancellationToken cancellationToken)
    {
        var modelOptions = new DbContextOptionsBuilder<TenantDbContext>().UseSqlServer(platformConnection).Options;
        await using var modelContext = new TenantDbContext(modelOptions);
        var mappedTables = modelContext.Model.GetEntityTypes()
            .Where(e => e.GetTableName() is not null && e.FindProperty("TenantId") is not null)
            .Select(e => (Schema: e.GetSchema() ?? "dbo", Table: e.GetTableName()!))
            .Where(x => !string.Equals(x.Table, "Tenants", StringComparison.OrdinalIgnoreCase))
            .Distinct().OrderBy(x => x.Schema, StringComparer.Ordinal).ThenBy(x => x.Table, StringComparer.Ordinal).ToArray();
        if (mappedTables.Length == 0) throw new InvalidOperationException("TenantDbContext exposes no tenant-scoped tables; refusing to purge.");

        await using var connection = new SqlConnection(platformConnection);
        await connection.OpenAsync(cancellationToken);
        foreach (var table in mappedTables)
        {
            await using var check = connection.CreateCommand();
            check.CommandText = "SELECT CASE WHEN OBJECT_ID(QUOTENAME(@schema)+N'.'+QUOTENAME(@table), N'U') IS NOT NULL AND EXISTS (SELECT 1 FROM sys.columns c JOIN sys.tables t ON t.object_id=c.object_id JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE s.name=@schema AND t.name=@table AND c.name=N'TenantId') THEN 1 ELSE 0 END";
            check.Parameters.AddWithValue("@schema", table.Schema);
            check.Parameters.AddWithValue("@table", table.Table);
            if (Convert.ToInt32(await check.ExecuteScalarAsync(cancellationToken), System.Globalization.CultureInfo.InvariantCulture) != 1)
                throw new InvalidOperationException("A TenantDbContext-mapped table is missing or has no TenantId column; refusing to purge.");
        }
        return mappedTables;
    }

    private static async Task LockAndVerifyReadyCatalogAsync(SqlConnection connection, SqlTransaction transaction, PurgeTopology topology, CancellationToken cancellationToken)
    {
        var currentTenants = new List<Guid>();
        await using (var command = connection.CreateCommand())
        {
            command.Transaction = transaction;
            command.CommandText = "SELECT [Id] FROM dbo.Tenants WITH (UPDLOCK,HOLDLOCK) ORDER BY [Id]";
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken)) currentTenants.Add(reader.GetGuid(0));
        }
        if (!currentTenants.SequenceEqual(topology.TenantIds))
            throw new InvalidOperationException("Tenant registry changed during purge preflight; retry the cutover.");

        foreach (var tenantId in topology.TenantIds)
        {
            await using var catalog = connection.CreateCommand();
            catalog.Transaction = transaction;
            catalog.CommandText = "SELECT [DatabaseName],[State] FROM dbo.TenantDatabaseCatalog WITH (UPDLOCK,HOLDLOCK) WHERE [TenantId]=@tenantId";
            catalog.Parameters.AddWithValue("@tenantId", tenantId);
            await using var reader = await catalog.ExecuteReaderAsync(cancellationToken);
            var expected = $"AIERPTenant_{tenantId:N}";
            if (!await reader.ReadAsync(cancellationToken) || reader.GetString(0) != expected ||
                Convert.ToInt32(reader.GetValue(1), System.Globalization.CultureInfo.InvariantCulture) != (int)TenantDatabaseProvisioningState.Ready ||
                topology.TenantDatabases.GetValueOrDefault(tenantId) != expected)
                throw new InvalidOperationException("Tenant database readiness changed during purge preflight; retry the cutover.");
        }

        var currentStudioCatalog = new Dictionary<string, (string DatabaseName, int State)>(StringComparer.Ordinal);
        await using (var studio = connection.CreateCommand())
        {
            studio.Transaction = transaction;
            studio.CommandText = "SELECT [Component],[DatabaseName],[State] FROM dbo.DatabaseSeparationComponentStates WITH (UPDLOCK,HOLDLOCK) WHERE [Component]=N'AIStudio' OR [Component] LIKE N'AIStudio:%' ORDER BY [Component]";
            await using var studioReader = await studio.ExecuteReaderAsync(cancellationToken);
            while (await studioReader.ReadAsync(cancellationToken))
                currentStudioCatalog.Add(studioReader.GetString(0), (studioReader.GetString(1),
                    Convert.ToInt32(studioReader.GetValue(2), System.Globalization.CultureInfo.InvariantCulture)));
        }
        if (currentStudioCatalog.Count != topology.StudioDatabases.Count || currentStudioCatalog.ContainsKey("AIStudio"))
            throw new InvalidOperationException("AI Studio catalog changed or contains a legacy shared database during purge preflight; retry the cutover.");
        foreach (var (tenantId, databaseName) in topology.StudioDatabases)
        {
            var component = TenantDatabaseRouting.StudioComponentKey(tenantId);
            if (!currentStudioCatalog.TryGetValue(component, out var entry) || entry.DatabaseName != databaseName ||
                entry.State != (int)TenantDatabaseProvisioningState.Ready)
                throw new InvalidOperationException("Tenant AI Studio database readiness changed during purge preflight; retry the cutover.");
        }
    }

    private static async Task LockTablesAsync(SqlConnection connection, SqlTransaction transaction, string database,
        (string Schema, string Table)[] tables, CancellationToken cancellationToken)
    {
        foreach (var (schema, table) in tables)
            await ExecuteAsync(connection, transaction,
                $"SELECT COUNT_BIG(*) FROM {Q(database)}.{Q(schema)}.{Q(table)} WITH (TABLOCKX,HOLDLOCK)", cancellationToken);
    }

    private static async Task LockTenantCopiesAsync(SqlConnection connection, SqlTransaction transaction, PurgeTopology topology,
        (string Schema, string Table)[] tables, CancellationToken cancellationToken)
    {
        foreach (var tenantId in topology.TenantIds)
            await LockTablesAsync(connection, transaction, topology.TenantDatabases[tenantId], tables, cancellationToken);
    }

    private static async Task VerifyCopiesAsync(SqlConnection connection, SqlTransaction transaction, PurgeTopology topology,
        (string Schema, string Table)[] tables, CancellationToken cancellationToken)
    {
        foreach (var tenantId in topology.TenantIds)
        foreach (var (schema, table) in tables)
        {
            var targetDatabase = topology.TenantDatabases[tenantId];
            var sourceDatabase = connection.Database;
            var sourceColumns = await GetComparableColumnsAsync(connection, transaction, sourceDatabase, schema, table, cancellationToken);
            var targetColumns = await GetComparableColumnsAsync(connection, transaction, targetDatabase, schema, table, cancellationToken);
            if (!sourceColumns.SequenceEqual(targetColumns))
                throw new InvalidOperationException($"Copy verification failed for tenant database {targetDatabase} table {schema}.{table}; the column layout differs.");
            if (sourceColumns.Count == 0)
                throw new InvalidOperationException($"Copy verification found no comparable columns for {schema}.{table}.");

            var values = string.Join(",", sourceColumns.Select(x => $"CONVERT(varbinary(max),{Q(x.Name)})"));
            var source = $"{Q(sourceDatabase)}.{Q(schema)}.{Q(table)}";
            var target = $"{Q(targetDatabase)}.{Q(schema)}.{Q(table)}";
            await using var compare = connection.CreateCommand();
            compare.Transaction = transaction;
            compare.CommandText = $"IF EXISTS (SELECT {values} FROM {source} WHERE [TenantId]=@tenantId EXCEPT SELECT {values} FROM {target} WHERE [TenantId]=@tenantId) OR EXISTS (SELECT {values} FROM {target} WHERE [TenantId]=@tenantId EXCEPT SELECT {values} FROM {source} WHERE [TenantId]=@tenantId) THROW 51030, 'Tenant operational data differs between the source and its isolated database.', 1";
            compare.Parameters.AddWithValue("@tenantId", tenantId);
            await compare.ExecuteNonQueryAsync(cancellationToken);
        }
    }

    private static async Task<List<ComparableColumn>> GetComparableColumnsAsync(SqlConnection connection, SqlTransaction transaction,
        string database, string schema, string table, CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = $"SELECT c.name,c.system_type_id,c.max_length,c.precision,c.scale,c.is_computed,c.generated_always_type FROM {Q(database)}.sys.columns c JOIN {Q(database)}.sys.tables t ON t.object_id=c.object_id JOIN {Q(database)}.sys.schemas s ON s.schema_id=t.schema_id WHERE s.name=@schema AND t.name=@table ORDER BY c.column_id";
        command.Parameters.AddWithValue("@schema", schema);
        command.Parameters.AddWithValue("@table", table);
        var columns = new List<ComparableColumn>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var column = new ComparableColumn(reader.GetString(0), reader.GetByte(1), reader.GetInt16(2), reader.GetByte(3), reader.GetByte(4), reader.GetBoolean(5), reader.GetByte(6));
            if (column.SystemTypeId == 189 || column.IsComputed || column.GeneratedAlwaysType != 0) continue;
            columns.Add(column);
        }
        return columns;
    }

    private static async Task<LegacyTenantDataPurgeReport> CountLegacyRowsAsync(SqlConnection connection, SqlTransaction? transaction,
        Guid[] tenantIds, (string Schema, string Table)[] tables, CancellationToken cancellationToken)
    {
        var results = new List<LegacyTenantTableCount>(tables.Length);
        foreach (var (schema, table) in tables)
        {
            await using var command = connection.CreateCommand();
            command.Transaction = transaction;
            command.CommandText = $"SELECT COUNT_BIG(*) FROM {Q(schema)}.{Q(table)}";
            results.Add(new LegacyTenantTableCount(schema, table, Convert.ToInt64(await command.ExecuteScalarAsync(cancellationToken), System.Globalization.CultureInfo.InvariantCulture)));
        }
        return new LegacyTenantDataPurgeReport(tenantIds.Length, results);
    }

    private static async Task<long> CountRegisteredRowsAsync(SqlConnection connection, SqlTransaction transaction,
        Guid[] tenantIds, (string Schema, string Table)[] tables, CancellationToken cancellationToken)
    {
        long total = 0;
        foreach (var (schema, table) in tables)
            foreach (var tenantId in tenantIds)
                total += await CountAsync(connection, transaction, schema, table, tenantId, cancellationToken);
        return total;
    }

    private static async Task<long> CountAsync(SqlConnection connection, SqlTransaction? transaction, string schema, string table, Guid tenantId, CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = $"SELECT COUNT_BIG(*) FROM {Q(schema)}.{Q(table)} WHERE [TenantId]=@tenantId";
        command.Parameters.AddWithValue("@tenantId", tenantId);
        return Convert.ToInt64(await command.ExecuteScalarAsync(cancellationToken), System.Globalization.CultureInfo.InvariantCulture);
    }

    private static async Task ExecuteAsync(SqlConnection connection, SqlTransaction transaction, string sql, CancellationToken cancellationToken, Guid? tenantId = null)
    {
        await using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = sql;
        if (tenantId is Guid id) command.Parameters.AddWithValue("@tenantId", id);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static async Task ClearAuditRetentionPurgeContextAsync(SqlConnection connection, SqlTransaction? transaction,
        CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = "EXEC sys.sp_set_session_context @key=N'AIERP_AuditRetentionPurge', @value=NULL; IF SESSION_CONTEXT(N'AIERP_AuditRetentionPurge') IS NOT NULL THROW 51031, 'Audit retention purge context remained set after purge.', 1;";
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static async Task VerifyConstraintsTrustedAsync(SqlConnection connection, SqlTransaction transaction,
        (string Schema, string Table)[] tables, CancellationToken cancellationToken)
    {
        foreach (var (schema, table) in tables)
        {
            await using var command = connection.CreateCommand();
            command.Transaction = transaction;
            command.CommandText = "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(QUOTENAME(@schema)+N'.'+QUOTENAME(@table), N'U') AND (is_disabled=1 OR is_not_trusted=1)) THROW 51000, 'Purge left an untrusted or disabled foreign key; transaction rolled back.', 1";
            command.Parameters.AddWithValue("@schema", schema);
            command.Parameters.AddWithValue("@table", table);
            await command.ExecuteNonQueryAsync(cancellationToken);
        }
    }

    private static string Q(string value) => $"[{value.Replace("]", "]]", StringComparison.Ordinal)}]";
}
