using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace AIERP.Platform.Infrastructure.Migrations.Tenant;

[DbContext(typeof(TenantDbContext))]
[Migration("20261015200000_AddTenantAuditRetentionProcedure")]
public sealed class AddTenantAuditRetentionProcedure : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        foreach (var batch in Sql.Split("\nGO\n", StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)) migrationBuilder.Sql(batch);
    }
    protected override void Down(MigrationBuilder migrationBuilder) { migrationBuilder.Sql("DROP PROCEDURE IF EXISTS dbo.PurgeExpiredAuditEvents; DROP TRIGGER IF EXISTS dbo.TR_AuditEvents_AppendOnly;"); }
    private const string Sql = """
        CREATE OR ALTER TRIGGER dbo.TR_AuditEvents_AppendOnly ON dbo.AuditEvents AFTER UPDATE, DELETE AS
        BEGIN SET NOCOUNT ON; IF ISNULL(TRY_CONVERT(int, SESSION_CONTEXT(N'AIERP_AuditRetentionPurge')), 0) <> 1 THROW 51001, 'Audit events are append-only outside retention purge.', 1; END;
        GO
        CREATE OR ALTER PROCEDURE dbo.PurgeExpiredAuditEvents @BatchSize int=500, @TenantId uniqueidentifier=NULL, @MaxRowsPerTenant int=10000, @TotalDeleted int OUTPUT AS
        BEGIN
          SET NOCOUNT ON; SET XACT_ABORT ON;
          IF @BatchSize<1 OR @BatchSize>5000 THROW 51002, 'Invalid audit purge batch size.', 1;
          IF @MaxRowsPerTenant<1 OR @MaxRowsPerTenant>100000 THROW 51003, 'Invalid audit purge row limit.', 1;
          DECLARE @CurrentTenantId uniqueidentifier, @RetentionDays int, @Cutoff datetimeoffset, @Deleted int, @TenantDeleted int, @Now datetimeoffset;
          SET @TotalDeleted=0;
          BEGIN TRY
            EXEC sys.sp_set_session_context @key=N'AIERP_AuditRetentionPurge', @value=1;
            DECLARE tenants CURSOR LOCAL FAST_FORWARD FOR SELECT Id, AuditRetentionDays FROM dbo.Tenants WHERE @TenantId IS NULL OR Id=@TenantId;
            OPEN tenants; FETCH NEXT FROM tenants INTO @CurrentTenantId,@RetentionDays;
            WHILE @@FETCH_STATUS=0
            BEGIN
              SET @Cutoff=DATEADD(day,-@RetentionDays,TODATETIMEOFFSET(SYSUTCDATETIME(),'+00:00')); SET @TenantDeleted=0;
              WHILE @TenantDeleted<@MaxRowsPerTenant
              BEGIN
                BEGIN TRANSACTION;
                DELETE TOP (@BatchSize) FROM dbo.AuditEvents WHERE TenantId=@CurrentTenantId AND OccurredAt<@Cutoff;
                SET @Deleted=@@ROWCOUNT; SET @Now=TODATETIMEOFFSET(SYSUTCDATETIME(),'+00:00');
                IF @Deleted>0 INSERT dbo.AuditEvents(TenantId,UserId,Action,Resource,OccurredAt) VALUES(@CurrentTenantId,NULL,N'audit.retention.purged',CONCAT(N'{"cutoffUtc":"',CONVERT(nvarchar(33),@Cutoff,127),N'","deletedCount":',@Deleted,N'}'),@Now);
                COMMIT TRANSACTION; SET @TenantDeleted+=@Deleted; SET @TotalDeleted+=@Deleted; IF @Deleted=0 BREAK;
              END;
              UPDATE dbo.Tenants SET AuditLastPurgeAt=TODATETIMEOFFSET(SYSUTCDATETIME(),'+00:00') WHERE Id=@CurrentTenantId;
              FETCH NEXT FROM tenants INTO @CurrentTenantId,@RetentionDays;
            END;
            CLOSE tenants; DEALLOCATE tenants;
            IF @TenantId IS NULL
            BEGIN
              SET @Cutoff=DATEADD(day,-365,TODATETIMEOFFSET(SYSUTCDATETIME(),'+00:00')); SET @TenantDeleted=0;
              WHILE @TenantDeleted<@MaxRowsPerTenant
              BEGIN
                BEGIN TRANSACTION;
                DELETE TOP (@BatchSize) FROM dbo.AuditEvents WHERE TenantId IS NULL AND OccurredAt<@Cutoff;
                SET @Deleted=@@ROWCOUNT; SET @Now=TODATETIMEOFFSET(SYSUTCDATETIME(),'+00:00');
                IF @Deleted>0 INSERT dbo.AuditEvents(TenantId,UserId,Action,Resource,OccurredAt) VALUES(NULL,NULL,N'audit.retention.purged',CONCAT(N'{"cutoffUtc":"',CONVERT(nvarchar(33),@Cutoff,127),N'","deletedCount":',@Deleted,N'}'),@Now);
                COMMIT TRANSACTION; SET @TenantDeleted+=@Deleted; SET @TotalDeleted+=@Deleted; IF @Deleted=0 BREAK;
              END;
            END;
            EXEC sys.sp_set_session_context @key=N'AIERP_AuditRetentionPurge', @value=NULL;
          END TRY
          BEGIN CATCH
            IF CURSOR_STATUS('local','tenants')>=0 CLOSE tenants;
            IF CURSOR_STATUS('local','tenants')>-3 DEALLOCATE tenants;
            IF XACT_STATE()<>0 ROLLBACK TRANSACTION;
            EXEC sys.sp_set_session_context @key=N'AIERP_AuditRetentionPurge', @value=NULL; THROW;
          END CATCH;
        END;
        """;
}
