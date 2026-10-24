using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations;

public partial class AddTenantProvisioningJobsAndPlatformAdminRefreshSessions : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "PlatformAdminRefreshSessions",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                TokenHash = table.Column<string>(type: "char(64)", unicode: false, fixedLength: true, maxLength: 64, nullable: false),
                ExpiresAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                RevokedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false),
                CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_PlatformAdminRefreshSessions", x => x.Id);
                table.ForeignKey("FK_PlatformAdminRefreshSessions_Users_UserId", x => x.UserId, "Users", "Id", onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateTable(
            name: "TenantProvisioningJobs",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                RequestedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                IdempotencyKeyHash = table.Column<string>(type: "char(64)", unicode: false, fixedLength: true, maxLength: 64, nullable: false),
                PayloadSha256 = table.Column<string>(type: "char(64)", unicode: false, fixedLength: true, maxLength: 64, nullable: false),
                Status = table.Column<int>(type: "int", nullable: false),
                AttemptCount = table.Column<int>(type: "int", nullable: false),
                CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                NextAttemptAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                LeaseExpiresAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                LeaseOwner = table.Column<string>(type: "varchar(64)", unicode: false, maxLength: 64, nullable: true),
                CompletedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                ErrorCode = table.Column<string>(type: "varchar(80)", unicode: false, maxLength: 80, nullable: true),
                RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_TenantProvisioningJobs", x => x.Id);
                table.ForeignKey("FK_TenantProvisioningJobs_Tenants_TenantId", x => x.TenantId, "Tenants", "Id", onDelete: ReferentialAction.Restrict);
                table.ForeignKey("FK_TenantProvisioningJobs_Users_RequestedByUserId", x => x.RequestedByUserId, "Users", "Id", onDelete: ReferentialAction.Restrict);
            });

        migrationBuilder.InsertData(
            table: "PermissionDefinitions",
            columns: new[] { "Code", "Action", "Description", "ResourceType" },
            values: new object[,]
            {
                { "erp.e-documents.create", "create", "create · Electronic document preparation and submission approvals", "erp.e-documents" },
                { "erp.e-documents.delete", "delete", "delete · Electronic document preparation and submission approvals", "erp.e-documents" },
                { "erp.e-documents.execute", "execute", "execute · Electronic document preparation and submission approvals", "erp.e-documents" },
                { "erp.e-documents.read", "read", "read · Electronic document preparation and submission approvals", "erp.e-documents" },
                { "erp.e-documents.update", "update", "update · Electronic document preparation and submission approvals", "erp.e-documents" }
            });

        migrationBuilder.CreateIndex("IX_PlatformRefreshSessions_TenantId", "PlatformRefreshSessions", "TenantId");
        migrationBuilder.CreateIndex("IX_PlatformAdminRefreshSessions_TokenHash", "PlatformAdminRefreshSessions", "TokenHash", unique: true);
        migrationBuilder.CreateIndex("IX_PlatformAdminRefreshSessions_UserId_ExpiresAt", "PlatformAdminRefreshSessions", new[] { "UserId", "ExpiresAt" });
        migrationBuilder.CreateIndex("IX_TenantProvisioningJobs_IdempotencyKeyHash", "TenantProvisioningJobs", "IdempotencyKeyHash", unique: true);
        migrationBuilder.CreateIndex("IX_TenantProvisioningJobs_RequestedByUserId", "TenantProvisioningJobs", "RequestedByUserId");
        migrationBuilder.CreateIndex("IX_TenantProvisioningJobs_Status_NextAttemptAt_CreatedAt", "TenantProvisioningJobs", new[] { "Status", "NextAttemptAt", "CreatedAt" });
        migrationBuilder.CreateIndex("IX_TenantProvisioningJobs_TenantId", "TenantProvisioningJobs", "TenantId");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable("TenantProvisioningJobs");
        migrationBuilder.DropTable("PlatformAdminRefreshSessions");
        migrationBuilder.DropIndex("IX_PlatformRefreshSessions_TenantId", "PlatformRefreshSessions");

        foreach (var code in new[] { "erp.e-documents.create", "erp.e-documents.delete", "erp.e-documents.execute", "erp.e-documents.read", "erp.e-documents.update" })
        {
            migrationBuilder.DeleteData("PermissionDefinitions", "Code", code);
        }
    }
}
