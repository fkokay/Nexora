using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace AIERP.Platform.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddTenantWorkflowEngine : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "TenantWorkflowDefinitions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "varchar(40)", unicode: false, maxLength: 40, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    Version = table.Column<int>(type: "int", nullable: false),
                    Status = table.Column<string>(type: "varchar(16)", unicode: false, maxLength: 16, nullable: false),
                    StepsJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UpdatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TenantWorkflowDefinitions", x => x.Id);
                    table.UniqueConstraint("AK_TenantWorkflowDefinitions_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.ForeignKey(
                        name: "FK_TenantWorkflowDefinitions_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "TenantWorkflowInstances",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DefinitionId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DefinitionCode = table.Column<string>(type: "varchar(40)", unicode: false, maxLength: 40, nullable: false),
                    DefinitionName = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    DefinitionVersion = table.Column<int>(type: "int", nullable: false),
                    StepsJsonSnapshot = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    SubjectType = table.Column<string>(type: "varchar(80)", unicode: false, maxLength: 80, nullable: false),
                    SubjectTitle = table.Column<string>(type: "nvarchar(160)", maxLength: 160, nullable: false),
                    SubjectId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ContextJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Status = table.Column<string>(type: "varchar(16)", unicode: false, maxLength: 16, nullable: false),
                    CurrentStepIndex = table.Column<int>(type: "int", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false),
                    StartedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    StartedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CompletedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TenantWorkflowInstances", x => x.Id);
                    table.UniqueConstraint("AK_TenantWorkflowInstances_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.ForeignKey(
                        name: "FK_TenantWorkflowInstances_TenantWorkflowDefinitions_TenantId_DefinitionId",
                        columns: x => new { x.TenantId, x.DefinitionId },
                        principalTable: "TenantWorkflowDefinitions",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "TenantWorkflowActions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    InstanceId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    StepIndex = table.Column<int>(type: "int", nullable: false),
                    StepName = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    Decision = table.Column<string>(type: "varchar(16)", unicode: false, maxLength: 16, nullable: false),
                    Comment = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    ActorUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ActorRole = table.Column<string>(type: "varchar(64)", unicode: false, maxLength: 64, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TenantWorkflowActions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TenantWorkflowActions_TenantWorkflowInstances_TenantId_InstanceId",
                        columns: x => new { x.TenantId, x.InstanceId },
                        principalTable: "TenantWorkflowInstances",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.InsertData(
                table: "PermissionDefinitions",
                columns: new[] { "Code", "Action", "Description", "ResourceType" },
                values: new object[,]
                {
                    { "erp.workflows.create", "create", "create · Tenant workflow definitions, instances and approvals", "erp.workflows" },
                    { "erp.workflows.delete", "delete", "delete · Tenant workflow definitions, instances and approvals", "erp.workflows" },
                    { "erp.workflows.execute", "execute", "execute · Tenant workflow definitions, instances and approvals", "erp.workflows" },
                    { "erp.workflows.read", "read", "read · Tenant workflow definitions, instances and approvals", "erp.workflows" },
                    { "erp.workflows.update", "update", "update · Tenant workflow definitions, instances and approvals", "erp.workflows" }
                });

            migrationBuilder.CreateIndex(
                name: "IX_TenantWorkflowActions_TenantId_InstanceId_StepIndex_CreatedAt",
                table: "TenantWorkflowActions",
                columns: new[] { "TenantId", "InstanceId", "StepIndex", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_TenantWorkflowDefinitions_TenantId_Code_Version",
                table: "TenantWorkflowDefinitions",
                columns: new[] { "TenantId", "Code", "Version" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_TenantWorkflowDefinitions_TenantId_Status_UpdatedAt",
                table: "TenantWorkflowDefinitions",
                columns: new[] { "TenantId", "Status", "UpdatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_TenantWorkflowInstances_TenantId_DefinitionId",
                table: "TenantWorkflowInstances",
                columns: new[] { "TenantId", "DefinitionId" });

            migrationBuilder.CreateIndex(
                name: "IX_TenantWorkflowInstances_TenantId_StartedByUserId_StartedAt",
                table: "TenantWorkflowInstances",
                columns: new[] { "TenantId", "StartedByUserId", "StartedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_TenantWorkflowInstances_TenantId_Status_StartedAt",
                table: "TenantWorkflowInstances",
                columns: new[] { "TenantId", "Status", "StartedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "TenantWorkflowActions");

            migrationBuilder.DropTable(
                name: "TenantWorkflowInstances");

            migrationBuilder.DropTable(
                name: "TenantWorkflowDefinitions");

            migrationBuilder.DeleteData(
                table: "PermissionDefinitions",
                keyColumn: "Code",
                keyValue: "erp.workflows.create");

            migrationBuilder.DeleteData(
                table: "PermissionDefinitions",
                keyColumn: "Code",
                keyValue: "erp.workflows.delete");

            migrationBuilder.DeleteData(
                table: "PermissionDefinitions",
                keyColumn: "Code",
                keyValue: "erp.workflows.execute");

            migrationBuilder.DeleteData(
                table: "PermissionDefinitions",
                keyColumn: "Code",
                keyValue: "erp.workflows.read");

            migrationBuilder.DeleteData(
                table: "PermissionDefinitions",
                keyColumn: "Code",
                keyValue: "erp.workflows.update");
        }
    }
}
