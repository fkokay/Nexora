using AIERP.Platform.Domain;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace AIERP.Platform.Infrastructure;

public static class TenantDatabaseSeparationVerifier
{
    public static async Task VerifyTenantAsync(string platformConnection, Guid tenantId, CancellationToken cancellationToken = default)
    {
        var platformOptions = new DbContextOptionsBuilder<PlatformDbContext>().UseSqlServer(platformConnection).Options;
        await using var platform = new PlatformDbContext(platformOptions);
        var entry = await platform.TenantDatabaseCatalog.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId, cancellationToken)
            ?? throw new InvalidOperationException($"Tenant {tenantId:D} has no database catalog entry.");
        if (entry.State != TenantDatabaseProvisioningState.Ready)
            throw new InvalidOperationException($"Tenant {tenantId:D} database is not Ready.");
        var targetConnection = new SqlConnectionStringBuilder(platformConnection) { InitialCatalog = entry.DatabaseName };
        var options = new DbContextOptionsBuilder<TenantDbContext>().UseSqlServer(targetConnection.ConnectionString).Options;
        await using var target = new TenantDbContext(options);
        await VerifyTenantIsolationAsync(target, tenantId, cancellationToken);
        await VerifyDatabaseAsync(targetConnection.ConnectionString, cancellationToken);
    }

    public static async Task VerifyStudioTenantAsync(string platformConnection, Guid tenantId, CancellationToken cancellationToken = default)
    {
        var platformOptions = new DbContextOptionsBuilder<PlatformDbContext>().UseSqlServer(platformConnection).Options;
        await using var platform = new PlatformDbContext(platformOptions);
        var state = await platform.DatabaseSeparationComponentStates.AsNoTracking()
            .SingleOrDefaultAsync(x => x.Component == "AIStudio", cancellationToken);
        if (state?.State != TenantDatabaseProvisioningState.Ready || state.DatabaseName != "AIERPStudio")
            throw new InvalidOperationException("AIStudio database catalog is not Ready or has an unexpected database name.");
        var studioConnection = new SqlConnectionStringBuilder(platformConnection) { InitialCatalog = state.DatabaseName };
        var options = new DbContextOptionsBuilder<AIStudioDbContext>().UseSqlServer(studioConnection.ConnectionString).Options;
        await using var target = new AIStudioDbContext(options);
        await VerifyDatabaseAsync(studioConnection.ConnectionString, cancellationToken);
    }

    public static async Task VerifyAllAsync(string platformConnection, CancellationToken cancellationToken = default)
    {
        var options = new DbContextOptionsBuilder<PlatformDbContext>().UseSqlServer(platformConnection).Options;
        await using var platform = new PlatformDbContext(options);
        var tenantIds = await platform.Tenants.AsNoTracking().Select(x => x.Id).ToListAsync(cancellationToken);
        foreach (var tenantId in tenantIds)
        {
            await VerifyTenantAsync(platformConnection, tenantId, cancellationToken);
            await VerifyStudioTenantAsync(platformConnection, tenantId, cancellationToken);
        }
    }

    private static async Task VerifyTenantIsolationAsync(DbContext target, Guid tenantId, CancellationToken cancellationToken)
    {
        var connection = (SqlConnection)target.Database.GetDbConnection();
        await connection.OpenAsync(cancellationToken);
        try
        {
            var tables = target.Model.GetEntityTypes().Where(x => x.GetTableName() is not null)
                .Select(x => (Schema: x.GetSchema() ?? "dbo", Name: x.GetTableName()!)).Distinct();
            foreach (var table in tables)
            {
                await using var columnsCommand = connection.CreateCommand();
                columnsCommand.CommandText = "SELECT c.name FROM sys.columns c JOIN sys.tables t ON t.object_id=c.object_id JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE s.name=@schema AND t.name=@table";
                columnsCommand.Parameters.AddWithValue("@schema", table.Schema);
                columnsCommand.Parameters.AddWithValue("@table", table.Name);
                var columns = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                await using (var reader = await columnsCommand.ExecuteReaderAsync(cancellationToken))
                    while (await reader.ReadAsync(cancellationToken)) columns.Add(reader.GetString(0));
                var filter = table.Name == "Tenants" ? "Id" : columns.Contains("TenantId") ? "TenantId" : null;
                if (filter is null) continue;
                await using var count = connection.CreateCommand();
                count.CommandText = $"SELECT COUNT_BIG(*) FROM {Q(table.Schema)}.{Q(table.Name)} WHERE {Q(filter)}<>@tenant";
                count.Parameters.AddWithValue("@tenant", tenantId);
                var outOfScopeRows = Convert.ToInt64(await count.ExecuteScalarAsync(cancellationToken), System.Globalization.CultureInfo.InvariantCulture);
                if (outOfScopeRows != 0)
                    throw new InvalidOperationException($"Tenant database {connection.Database} contains {outOfScopeRows} rows outside tenant scope in {table.Schema}.{table.Name}.");
            }
        }
        finally { await connection.CloseAsync(); }
    }

    private static async Task VerifyDatabaseAsync(string connectionString, CancellationToken cancellationToken)
    {
        await using var connection = new SqlConnection(connectionString);
        await connection.OpenAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE is_disabled=1 OR is_not_trusted=1) THROW 51000, 'Database has disabled or untrusted foreign keys.', 1; SELECT COUNT(*) FROM sys.tables";
        var tables = Convert.ToInt32(await command.ExecuteScalarAsync(cancellationToken), System.Globalization.CultureInfo.InvariantCulture);
        if (tables == 0) throw new InvalidOperationException($"Separated database {connection.Database} has no tables.");
    }

    private static string Q(string value) => $"[{value.Replace("]", "]]", StringComparison.Ordinal)}]";
}
