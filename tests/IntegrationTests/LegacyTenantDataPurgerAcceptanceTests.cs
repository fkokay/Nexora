using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace AIERP.Api.IntegrationTests;

public sealed class LegacyTenantDataPurgerAcceptanceTests
{
    [LegacyTenantPurgeAcceptanceFact]
    public async Task Legacy_tenant_data_purge_requires_ready_copy_preview_is_read_only_and_execution_rolls_back_or_clears_only_operational_rows()
    {
        var configured = Environment.GetEnvironmentVariable("AIERP_LEGACY_PURGE_ACCEPTANCE_SQL_CONNECTION_STRING");
        Assert.False(string.IsNullOrWhiteSpace(configured));
        Assert.Equal("YES_CREATE_AND_DROP_ISOLATED_DATABASES",
            Environment.GetEnvironmentVariable("AIERP_LEGACY_PURGE_ACCEPTANCE_DISPOSABLE_INSTANCE"));
        var suffix = Guid.NewGuid().ToString("N");
        var tenantId = Guid.NewGuid();
        var platformConnection = DatabaseConnection(configured!, $"AIERP_LegacyPurgePlatform_{suffix}");
        var tenantConnection = DatabaseConnection(configured!, $"AIERPTenant_{tenantId:N}");
        // Use a uniquely named disposable Studio catalog target; never connect to the canonical AIERPStudio DB.
        var studioConnection = DatabaseConnection(configured!, $"AIERP_LegacyPurgeStudio_{suffix}");
        var createdPlatform = false;
        var createdTenant = false;
        var createdStudio = false;
        var triggerCreated = false;
        var auditTriggerCreated = false;
        try
        {
            await using var platform = new PlatformDbContext(new DbContextOptionsBuilder<PlatformDbContext>().UseSqlServer(platformConnection).Options);
            await using var legacySource = new TenantDbContext(new DbContextOptionsBuilder<TenantDbContext>().UseSqlServer(platformConnection).Options);
            await using var tenantDb = new TenantDbContext(new DbContextOptionsBuilder<TenantDbContext>().UseSqlServer(tenantConnection).Options);
            await using var studio = new AIStudioDbContext(new DbContextOptionsBuilder<AIStudioDbContext>().UseSqlServer(studioConnection).Options);
            createdPlatform = await legacySource.Database.EnsureCreatedAsync();
            createdTenant = await tenantDb.Database.EnsureCreatedAsync();
            createdStudio = await studio.Database.EnsureCreatedAsync();
            Assert.True(createdPlatform && createdTenant && createdStudio);

            var company = new Tenant { Id = tenantId, Name = "Synthetic purge acceptance", Slug = $"purge-{suffix}" };
            await InsertTenantAsync(platformConnection, company);
            await InsertTenantAsync(tenantConnection, company);
            await CreatePlatformCatalogTablesAsync(platformConnection);
            await SetCatalogStateAsync(platformConnection, tenantId, TenantDatabaseProvisioningState.Copying);
            await SetStudioStateAsync(platformConnection, TenantDatabaseProvisioningState.Copying);
            await InsertSettingsAsync(platformConnection, tenantId);
            await InsertSettingsAsync(tenantConnection, tenantId);
            await InsertAuditEventAsync(platformConnection, tenantId, 910001);
            await InsertAuditEventAsync(tenantConnection, tenantId, 910001);
            await CreateAuditAppendOnlyTriggerAsync(platformConnection);
            auditTriggerCreated = true;

            var purger = new LegacyTenantDataPurger(platformConnection, studioConnection);
            await Assert.ThrowsAsync<InvalidOperationException>(() => purger.PreviewAsync());
            Assert.Equal(1, await CountSettingsAsync(platformConnection, tenantId));

            await SetCatalogStateAsync(platformConnection, tenantId, TenantDatabaseProvisioningState.Ready);

            await Assert.ThrowsAsync<InvalidOperationException>(() => purger.PreviewAsync());
            Assert.Equal(1, await CountSettingsAsync(platformConnection, tenantId));

            await SetStudioStateAsync(platformConnection, TenantDatabaseProvisioningState.Ready);

            var preview = await purger.PreviewAsync();
            Assert.Equal(2, preview.TotalRows);
            Assert.Equal(1, await CountSettingsAsync(platformConnection, tenantId));
            Assert.Equal(1, await platform.Tenants.CountAsync(x => x.Id == tenantId));

            var unregisteredTenantId = Guid.NewGuid();
            await InsertAuditEventAsync(platformConnection, unregisteredTenantId, 910002);
            var unregisteredFailure = await Assert.ThrowsAsync<InvalidOperationException>(() => purger.PurgeAsync());
            Assert.Contains("Unregistered tenant IDs", unregisteredFailure.Message);
            Assert.Equal(1, await CountAuditEventsAsync(platformConnection, unregisteredTenantId));
            Assert.Equal(1, await CountSettingsAsync(platformConnection, tenantId));
            await DeleteAuditEventForFixtureAsync(platformConnection, unregisteredTenantId);
            Assert.Equal(0, await CountAuditEventsAsync(platformConnection, unregisteredTenantId));

            await using (var sql = new SqlConnection(platformConnection))
            {
                await sql.OpenAsync();
                await using var trigger = sql.CreateCommand();
                trigger.CommandText = "CREATE TRIGGER dbo.TR_LegacyPurgeAcceptance_Rollback ON dbo.TenantOperationalSettings AFTER DELETE AS THROW 51020, 'Synthetic acceptance rollback', 1;";
                await trigger.ExecuteNonQueryAsync();
                triggerCreated = true;
            }
            var rollbackFailure = await Assert.ThrowsAsync<SqlException>(() => purger.PurgeAsync());
            Assert.Equal(51020, rollbackFailure.Number);
            Assert.Equal(1, await CountSettingsAsync(platformConnection, tenantId));
            Assert.Equal(1, await CountAuditEventsAsync(platformConnection, tenantId));

            await using (var sql = new SqlConnection(platformConnection))
            {
                await sql.OpenAsync();
                await using var drop = sql.CreateCommand();
                drop.CommandText = "DROP TRIGGER dbo.TR_LegacyPurgeAcceptance_Rollback";
                await drop.ExecuteNonQueryAsync();
                triggerCreated = false;
            }

            var deleted = await purger.PurgeAsync();
            Assert.Equal(2, deleted.TotalRows);
            Assert.Equal(0, await CountSettingsAsync(platformConnection, tenantId));
            Assert.Equal(0, await CountAuditEventsAsync(platformConnection, tenantId));
            Assert.Equal(1, await CountAuditEventsAsync(tenantConnection, tenantId));
            Assert.Equal(1, await platform.Tenants.CountAsync(x => x.Id == tenantId));
            Assert.Equal(TenantDatabaseProvisioningState.Ready,
                (await platform.TenantDatabaseCatalog.SingleAsync(x => x.TenantId == tenantId)).State);
        }
        finally
        {
            if (createdPlatform)
            {
                await DropTriggerIfPresent(platformConnection, triggerCreated, auditTriggerCreated);
                await using var cleanup = new PlatformDbContext(new DbContextOptionsBuilder<PlatformDbContext>().UseSqlServer(platformConnection).Options);
                await cleanup.Database.EnsureDeletedAsync();
            }
            if (createdTenant)
            {
                await using var cleanup = new TenantDbContext(new DbContextOptionsBuilder<TenantDbContext>().UseSqlServer(tenantConnection).Options);
                await cleanup.Database.EnsureDeletedAsync();
            }
            if (createdStudio)
            {
                await using var cleanup = new AIStudioDbContext(new DbContextOptionsBuilder<AIStudioDbContext>().UseSqlServer(studioConnection).Options);
                await cleanup.Database.EnsureDeletedAsync();
            }
        }
    }

    private static async Task InsertSettingsAsync(string connectionString, Guid tenantId)
    {
        await using var sql = new SqlConnection(connectionString);
        await sql.OpenAsync();
        await using var insert = sql.CreateCommand();
        insert.CommandText = "INSERT INTO dbo.TenantOperationalSettings (TenantId, AllowNegativeStock, UpdatedAt) VALUES (@tenantId, 0, CONVERT(datetimeoffset,'2026-10-22T00:00:00+00:00'))";
        insert.Parameters.AddWithValue("@tenantId", tenantId);
        await insert.ExecuteNonQueryAsync();
    }

    private static async Task InsertTenantAsync(string connectionString, Tenant company)
    {
        await using var sql = new SqlConnection(connectionString);
        await sql.OpenAsync();
        await using var insert = sql.CreateCommand();
        insert.CommandText = "INSERT INTO dbo.Tenants (Id, Name, Slug, IsActive, BaseCurrencyCode, AuditRetentionDays, AuditLastPurgeAt) VALUES (@id, @name, @slug, 1, N'TRY', 365, NULL)";
        insert.Parameters.AddWithValue("@id", company.Id);
        insert.Parameters.AddWithValue("@name", company.Name);
        insert.Parameters.AddWithValue("@slug", company.Slug);
        await insert.ExecuteNonQueryAsync();
    }

    private static async Task SetCatalogStateAsync(string connectionString, Guid tenantId, TenantDatabaseProvisioningState state)
    {
        await using var sql = new SqlConnection(connectionString);
        await sql.OpenAsync();
        await using var command = sql.CreateCommand();
        command.CommandText = "IF EXISTS (SELECT 1 FROM dbo.TenantDatabaseCatalog WHERE TenantId=@tenantId) UPDATE dbo.TenantDatabaseCatalog SET State=@state,ReadyAt=CASE WHEN @state=3 THEN TODATETIMEOFFSET(SYSUTCDATETIME(),'+00:00') ELSE NULL END,UpdatedAt=TODATETIMEOFFSET(SYSUTCDATETIME(),'+00:00') WHERE TenantId=@tenantId ELSE INSERT dbo.TenantDatabaseCatalog(TenantId,DatabaseName,State,CreatedAt,UpdatedAt,ReadyAt) VALUES(@tenantId,@databaseName,@state,TODATETIMEOFFSET(SYSUTCDATETIME(),'+00:00'),TODATETIMEOFFSET(SYSUTCDATETIME(),'+00:00'),CASE WHEN @state=3 THEN TODATETIMEOFFSET(SYSUTCDATETIME(),'+00:00') ELSE NULL END)";
        command.Parameters.AddWithValue("@tenantId", tenantId);
        command.Parameters.AddWithValue("@databaseName", $"AIERPTenant_{tenantId:N}");
        command.Parameters.AddWithValue("@state", (int)state);
        await command.ExecuteNonQueryAsync();
    }

    private static async Task SetStudioStateAsync(string connectionString, TenantDatabaseProvisioningState state)
    {
        await using var sql = new SqlConnection(connectionString);
        await sql.OpenAsync();
        await using var command = sql.CreateCommand();
        command.CommandText = "IF EXISTS (SELECT 1 FROM dbo.DatabaseSeparationComponentStates WHERE Component=N'AIStudio') UPDATE dbo.DatabaseSeparationComponentStates SET State=@state,ReadyAt=CASE WHEN @state=3 THEN TODATETIMEOFFSET(SYSUTCDATETIME(),'+00:00') ELSE NULL END,UpdatedAt=TODATETIMEOFFSET(SYSUTCDATETIME(),'+00:00') WHERE Component=N'AIStudio' ELSE INSERT dbo.DatabaseSeparationComponentStates(Component,DatabaseName,State,UpdatedAt,ReadyAt) VALUES(N'AIStudio',N'AIERPStudio',@state,TODATETIMEOFFSET(SYSUTCDATETIME(),'+00:00'),CASE WHEN @state=3 THEN TODATETIMEOFFSET(SYSUTCDATETIME(),'+00:00') ELSE NULL END)";
        command.Parameters.AddWithValue("@state", (int)state);
        await command.ExecuteNonQueryAsync();
    }

    private static async Task InsertAuditEventAsync(string connectionString, Guid tenantId, long id)
    {
        await using var sql = new SqlConnection(connectionString);
        await sql.OpenAsync();
        await using var insert = sql.CreateCommand();
        insert.CommandText = "SET IDENTITY_INSERT dbo.AuditEvents ON; INSERT dbo.AuditEvents(Id,TenantId,UserId,Action,Resource,OccurredAt) VALUES(@id,@tenantId,NULL,N'acceptance.seed',N'purge audit context',CONVERT(datetimeoffset,'2026-10-22T00:00:00+00:00')); SET IDENTITY_INSERT dbo.AuditEvents OFF;";
        insert.Parameters.AddWithValue("@id", id);
        insert.Parameters.AddWithValue("@tenantId", tenantId);
        await insert.ExecuteNonQueryAsync();
    }

    private static async Task DeleteAuditEventForFixtureAsync(string connectionString, Guid tenantId)
    {
        await using var sql = new SqlConnection(connectionString);
        await sql.OpenAsync();
        await using var command = sql.CreateCommand();
        command.CommandText = "EXEC sys.sp_set_session_context @key=N'AIERP_AuditRetentionPurge',@value=1; DELETE dbo.AuditEvents WHERE TenantId=@tenantId; EXEC sys.sp_set_session_context @key=N'AIERP_AuditRetentionPurge',@value=NULL; IF SESSION_CONTEXT(N'AIERP_AuditRetentionPurge') IS NOT NULL THROW 51032,'Fixture failed to clear audit context.',1;";
        command.Parameters.AddWithValue("@tenantId", tenantId);
        await command.ExecuteNonQueryAsync();
    }

    private static async Task CreateAuditAppendOnlyTriggerAsync(string connectionString)
    {
        await using var sql = new SqlConnection(connectionString);
        await sql.OpenAsync();
        await using var command = sql.CreateCommand();
        command.CommandText = "CREATE TRIGGER dbo.TR_AuditEvents_AppendOnly ON dbo.AuditEvents AFTER UPDATE,DELETE AS BEGIN SET NOCOUNT ON; IF ISNULL(TRY_CONVERT(int,SESSION_CONTEXT(N'AIERP_AuditRetentionPurge')),0)<>1 THROW 51001,'Audit events are append-only outside retention purge.',1; END;";
        await command.ExecuteNonQueryAsync();
    }

    private static async Task<long> CountAuditEventsAsync(string connectionString, Guid tenantId)
    {
        await using var sql = new SqlConnection(connectionString);
        await sql.OpenAsync();
        await using var count = sql.CreateCommand();
        count.CommandText = "SELECT COUNT_BIG(*) FROM dbo.AuditEvents WHERE TenantId=@tenantId";
        count.Parameters.AddWithValue("@tenantId", tenantId);
        return Convert.ToInt64(await count.ExecuteScalarAsync());
    }

    private static async Task CreatePlatformCatalogTablesAsync(string connectionString)
    {
        await using var sql = new SqlConnection(connectionString);
        await sql.OpenAsync();
        await using var command = sql.CreateCommand();
        command.CommandText = """
            CREATE TABLE dbo.TenantDatabaseCatalog (
                TenantId uniqueidentifier NOT NULL CONSTRAINT PK_TenantDatabaseCatalog PRIMARY KEY,
                DatabaseName nvarchar(128) NOT NULL,
                State int NOT NULL,
                LastError nvarchar(2000) NULL,
                CreatedAt datetimeoffset NOT NULL,
                UpdatedAt datetimeoffset NOT NULL,
                ReadyAt datetimeoffset NULL,
                CONSTRAINT FK_TenantDatabaseCatalog_Tenants_TenantId FOREIGN KEY (TenantId) REFERENCES dbo.Tenants(Id)
            );
            CREATE UNIQUE INDEX IX_TenantDatabaseCatalog_DatabaseName ON dbo.TenantDatabaseCatalog(DatabaseName);
            CREATE TABLE dbo.DatabaseSeparationComponentStates (
                Component nvarchar(64) NOT NULL CONSTRAINT PK_DatabaseSeparationComponentStates PRIMARY KEY,
                DatabaseName nvarchar(128) NOT NULL,
                State int NOT NULL,
                LastError nvarchar(2000) NULL,
                UpdatedAt datetimeoffset NOT NULL,
                ReadyAt datetimeoffset NULL
            );
            """;
        await command.ExecuteNonQueryAsync();
    }

    private static async Task<long> CountSettingsAsync(string connectionString, Guid tenantId)
    {
        await using var sql = new SqlConnection(connectionString);
        await sql.OpenAsync();
        await using var count = sql.CreateCommand();
        count.CommandText = "SELECT COUNT_BIG(*) FROM dbo.TenantOperationalSettings WHERE TenantId=@tenantId";
        count.Parameters.AddWithValue("@tenantId", tenantId);
        return Convert.ToInt64(await count.ExecuteScalarAsync());
    }

    private static async Task DropTriggerIfPresent(string connectionString, bool rollbackCreated, bool auditCreated)
    {
        if (!rollbackCreated && !auditCreated) return;
        await using var sql = new SqlConnection(connectionString);
        await sql.OpenAsync();
        await using var command = sql.CreateCommand();
        command.CommandText = "IF OBJECT_ID(N'dbo.TR_LegacyPurgeAcceptance_Rollback', N'TR') IS NOT NULL DROP TRIGGER dbo.TR_LegacyPurgeAcceptance_Rollback; IF OBJECT_ID(N'dbo.TR_AuditEvents_AppendOnly', N'TR') IS NOT NULL DROP TRIGGER dbo.TR_AuditEvents_AppendOnly";
        await command.ExecuteNonQueryAsync();
    }

    private static string DatabaseConnection(string source, string name)
    {
        var builder = new SqlConnectionStringBuilder(source) { InitialCatalog = name, ConnectTimeout = 15, TrustServerCertificate = true };
        return builder.ConnectionString;
    }
}

internal sealed class LegacyTenantPurgeAcceptanceFactAttribute : FactAttribute
{
    public LegacyTenantPurgeAcceptanceFactAttribute()
    {
        if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("AIERP_LEGACY_PURGE_ACCEPTANCE_SQL_CONNECTION_STRING")) ||
            Environment.GetEnvironmentVariable("AIERP_LEGACY_PURGE_ACCEPTANCE_DISPOSABLE_INSTANCE") != "YES_CREATE_AND_DROP_ISOLATED_DATABASES")
            Skip = "Set AIERP_LEGACY_PURGE_ACCEPTANCE_SQL_CONNECTION_STRING and explicitly acknowledge AIERP_LEGACY_PURGE_ACCEPTANCE_DISPOSABLE_INSTANCE=YES_CREATE_AND_DROP_ISOLATED_DATABASES for a dedicated disposable SQL Server instance; this test creates and drops unique isolated acceptance databases.";
    }
}
