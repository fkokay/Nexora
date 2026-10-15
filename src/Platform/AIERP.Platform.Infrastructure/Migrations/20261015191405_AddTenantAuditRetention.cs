using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace AIERP.Platform.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddTenantAuditRetention : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "AuditLastPurgeAt",
                table: "Tenants",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "AuditRetentionDays",
                table: "Tenants",
                type: "int",
                nullable: false,
                defaultValue: 365);

            migrationBuilder.InsertData(
                table: "PermissionDefinitions",
                columns: new[] { "Code", "Action", "Description", "ResourceType" },
                values: new object[,]
                {
                    { "erp.audit-retention.create", "create", "create · Tenant audit retention policy", "erp.audit-retention" },
                    { "erp.audit-retention.delete", "delete", "delete · Tenant audit retention policy", "erp.audit-retention" },
                    { "erp.audit-retention.execute", "execute", "execute · Tenant audit retention policy", "erp.audit-retention" },
                    { "erp.audit-retention.read", "read", "read · Tenant audit retention policy", "erp.audit-retention" },
                    { "erp.audit-retention.update", "update", "update · Tenant audit retention policy", "erp.audit-retention" }
                });

            migrationBuilder.AddCheckConstraint(
                name: "CK_Tenants_AuditRetentionDays",
                table: "Tenants",
                sql: "[AuditRetentionDays] >= 30 AND [AuditRetentionDays] <= 3650");

            migrationBuilder.Sql("""
                CREATE OR ALTER TRIGGER dbo.TR_AuditEvents_AppendOnly
                ON dbo.AuditEvents
                AFTER UPDATE, DELETE
                AS
                BEGIN
                    SET NOCOUNT ON;
                    IF ISNULL(TRY_CONVERT(int, SESSION_CONTEXT(N'AIERP_AuditRetentionPurge')), 0) <> 1
                        THROW 51001, 'Audit events are append-only outside the retention purge procedure.', 1;
                END;
                """);

            migrationBuilder.Sql("""
                CREATE OR ALTER PROCEDURE dbo.PurgeExpiredAuditEvents
                    @BatchSize int = 500,
                    @TenantId uniqueidentifier = NULL,
                    @MaxRowsPerTenant int = 10000,
                    @TotalDeleted int OUTPUT
                AS
                BEGIN
                    SET NOCOUNT ON;
                    SET XACT_ABORT ON;

                    IF @BatchSize < 1 OR @BatchSize > 5000
                        THROW 51002, 'Batch size must be between 1 and 5000.', 1;
                    IF @MaxRowsPerTenant < 1 OR @MaxRowsPerTenant > 100000
                        THROW 51003, 'Maximum rows per tenant must be between 1 and 100000.', 1;

                    DECLARE @CurrentTenantId uniqueidentifier;
                    DECLARE @RetentionDays int;
                    DECLARE @Cutoff datetimeoffset;
                    DECLARE @Deleted int;
                    DECLARE @TenantDeleted int;
                    DECLARE @ThisBatch int;
                    DECLARE @Now datetimeoffset;
                    DECLARE @DeletedRows TABLE (Id bigint NOT NULL);
                    SET @TotalDeleted = 0;

                    BEGIN TRY
                        EXEC sys.sp_set_session_context @key=N'AIERP_AuditRetentionPurge', @value=1;

                        DECLARE tenant_cursor CURSOR LOCAL FAST_FORWARD FOR
                            SELECT Id, AuditRetentionDays
                            FROM dbo.Tenants
                            WHERE @TenantId IS NULL OR Id = @TenantId;
                        OPEN tenant_cursor;
                        FETCH NEXT FROM tenant_cursor INTO @CurrentTenantId, @RetentionDays;
                        WHILE @@FETCH_STATUS = 0
                        BEGIN
                            SET @Cutoff = DATEADD(day, -@RetentionDays, TODATETIMEOFFSET(SYSUTCDATETIME(), '+00:00'));
                            SET @TenantDeleted = 0;
                            WHILE @TenantDeleted < @MaxRowsPerTenant
                            BEGIN
                                SET @ThisBatch = CASE WHEN @BatchSize < @MaxRowsPerTenant - @TenantDeleted
                                    THEN @BatchSize ELSE @MaxRowsPerTenant - @TenantDeleted END;
                                DELETE TOP (@BatchSize) FROM @DeletedRows;
                                BEGIN TRANSACTION;
                                DELETE TOP (@ThisBatch) FROM dbo.AuditEvents
                                    OUTPUT deleted.Id INTO @DeletedRows(Id)
                                    WHERE TenantId = @CurrentTenantId AND OccurredAt < @Cutoff;
                                SET @Deleted = @@ROWCOUNT;
                                IF @Deleted > 0
                                BEGIN
                                    SET @Now = TODATETIMEOFFSET(SYSUTCDATETIME(), '+00:00');
                                    INSERT dbo.AuditEvents (TenantId, UserId, Action, Resource, OccurredAt)
                                    VALUES (@CurrentTenantId, NULL, N'audit.retention.purged',
                                        CONCAT(N'{"cutoffUtc":"', CONVERT(nvarchar(33), @Cutoff, 127),
                                            N'","deletedCount":', @Deleted, N'}'), @Now);
                                END;
                                COMMIT TRANSACTION;
                                SET @TenantDeleted += @Deleted;
                                SET @TotalDeleted += @Deleted;
                                IF @Deleted = 0 BREAK;
                            END;
                            UPDATE dbo.Tenants SET AuditLastPurgeAt = TODATETIMEOFFSET(SYSUTCDATETIME(), '+00:00')
                                WHERE Id = @CurrentTenantId;
                            FETCH NEXT FROM tenant_cursor INTO @CurrentTenantId, @RetentionDays;
                        END;
                        CLOSE tenant_cursor;
                        DEALLOCATE tenant_cursor;

                        IF @TenantId IS NULL
                        BEGIN
                            SET @CurrentTenantId = NULL;
                            SET @RetentionDays = 365;
                            SET @Cutoff = DATEADD(day, -@RetentionDays, TODATETIMEOFFSET(SYSUTCDATETIME(), '+00:00'));
                            SET @TenantDeleted = 0;
                            WHILE @TenantDeleted < @MaxRowsPerTenant
                            BEGIN
                                SET @ThisBatch = CASE WHEN @BatchSize < @MaxRowsPerTenant - @TenantDeleted
                                    THEN @BatchSize ELSE @MaxRowsPerTenant - @TenantDeleted END;
                                DELETE TOP (@BatchSize) FROM @DeletedRows;
                                BEGIN TRANSACTION;
                                DELETE TOP (@ThisBatch) FROM dbo.AuditEvents
                                    OUTPUT deleted.Id INTO @DeletedRows(Id)
                                    WHERE TenantId IS NULL AND OccurredAt < @Cutoff;
                                SET @Deleted = @@ROWCOUNT;
                                IF @Deleted > 0
                                BEGIN
                                    SET @Now = TODATETIMEOFFSET(SYSUTCDATETIME(), '+00:00');
                                    INSERT dbo.AuditEvents (TenantId, UserId, Action, Resource, OccurredAt)
                                    VALUES (NULL, NULL, N'audit.retention.purged',
                                        CONCAT(N'{"cutoffUtc":"', CONVERT(nvarchar(33), @Cutoff, 127),
                                            N'","deletedCount":', @Deleted, N'}'), @Now);
                                END;
                                COMMIT TRANSACTION;
                                SET @TenantDeleted += @Deleted;
                                SET @TotalDeleted += @Deleted;
                                IF @Deleted = 0 BREAK;
                            END;
                        END;

                        EXEC sys.sp_set_session_context @key=N'AIERP_AuditRetentionPurge', @value=NULL;
                    END TRY
                    BEGIN CATCH
                        IF CURSOR_STATUS('local', 'tenant_cursor') >= 0 CLOSE tenant_cursor;
                        IF CURSOR_STATUS('local', 'tenant_cursor') > -3 DEALLOCATE tenant_cursor;
                        IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
                        EXEC sys.sp_set_session_context @key=N'AIERP_AuditRetentionPurge', @value=NULL;
                        THROW;
                    END CATCH;
                END;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("DROP PROCEDURE IF EXISTS dbo.PurgeExpiredAuditEvents;");
            migrationBuilder.Sql("DROP TRIGGER IF EXISTS dbo.TR_AuditEvents_AppendOnly;");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Tenants_AuditRetentionDays",
                table: "Tenants");

            migrationBuilder.DeleteData(
                table: "PermissionDefinitions",
                keyColumn: "Code",
                keyValue: "erp.audit-retention.create");

            migrationBuilder.DeleteData(
                table: "PermissionDefinitions",
                keyColumn: "Code",
                keyValue: "erp.audit-retention.delete");

            migrationBuilder.DeleteData(
                table: "PermissionDefinitions",
                keyColumn: "Code",
                keyValue: "erp.audit-retention.execute");

            migrationBuilder.DeleteData(
                table: "PermissionDefinitions",
                keyColumn: "Code",
                keyValue: "erp.audit-retention.read");

            migrationBuilder.DeleteData(
                table: "PermissionDefinitions",
                keyColumn: "Code",
                keyValue: "erp.audit-retention.update");

            migrationBuilder.DropColumn(
                name: "AuditLastPurgeAt",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "AuditRetentionDays",
                table: "Tenants");
        }
    }
}
