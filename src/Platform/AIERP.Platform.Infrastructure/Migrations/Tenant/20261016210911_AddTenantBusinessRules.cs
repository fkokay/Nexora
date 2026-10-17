using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Tenant
{
    /// <inheritdoc />
    public partial class AddTenantBusinessRules : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "TenantBusinessRuleDefinitions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "varchar(40)", unicode: false, maxLength: 40, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    Trigger = table.Column<string>(type: "varchar(64)", unicode: false, maxLength: 64, nullable: false),
                    Version = table.Column<int>(type: "int", nullable: false),
                    Status = table.Column<string>(type: "varchar(16)", unicode: false, maxLength: 16, nullable: false),
                    ConditionsJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    WorkflowCode = table.Column<string>(type: "varchar(40)", unicode: false, maxLength: 40, nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UpdatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TenantBusinessRuleDefinitions", x => x.Id);
                    table.UniqueConstraint("AK_TenantBusinessRuleDefinitions_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.ForeignKey(
                        name: "FK_TenantBusinessRuleDefinitions_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "TenantBusinessRuleEvaluations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RuleId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    EventId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Matched = table.Column<bool>(type: "bit", nullable: false),
                    WorkflowInstanceId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Details = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TenantBusinessRuleEvaluations", x => x.Id);
                    table.UniqueConstraint("AK_TenantBusinessRuleEvaluations_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.ForeignKey(
                        name: "FK_TenantBusinessRuleEvaluations_TenantBusinessRuleDefinitions_TenantId_RuleId",
                        columns: x => new { x.TenantId, x.RuleId },
                        principalTable: "TenantBusinessRuleDefinitions",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_TenantBusinessRuleEvaluations_TenantWorkflowInstances_TenantId_WorkflowInstanceId",
                        columns: x => new { x.TenantId, x.WorkflowInstanceId },
                        principalTable: "TenantWorkflowInstances",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_TenantBusinessRuleDefinitions_TenantId_Code_Version",
                table: "TenantBusinessRuleDefinitions",
                columns: new[] { "TenantId", "Code", "Version" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_TenantBusinessRuleDefinitions_TenantId_Trigger_Status",
                table: "TenantBusinessRuleDefinitions",
                columns: new[] { "TenantId", "Trigger", "Status" },
                unique: true,
                filter: "[Status] = 'Published'");

            migrationBuilder.CreateIndex(
                name: "IX_TenantBusinessRuleEvaluations_TenantId_CreatedAt",
                table: "TenantBusinessRuleEvaluations",
                columns: new[] { "TenantId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_TenantBusinessRuleEvaluations_TenantId_RuleId_EventId",
                table: "TenantBusinessRuleEvaluations",
                columns: new[] { "TenantId", "RuleId", "EventId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_TenantBusinessRuleEvaluations_TenantId_WorkflowInstanceId",
                table: "TenantBusinessRuleEvaluations",
                columns: new[] { "TenantId", "WorkflowInstanceId" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "TenantBusinessRuleEvaluations");

            migrationBuilder.DropTable(
                name: "TenantBusinessRuleDefinitions");
        }
    }
}
