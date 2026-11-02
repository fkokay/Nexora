using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Tenant
{
    /// <inheritdoc />
    public partial class AddOperationalProjectTimeEntries : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "OperationalProjectTimeEntries",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ProjectId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TaskId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    WorkDate = table.Column<DateOnly>(type: "date", nullable: false),
                    Hours = table.Column<decimal>(type: "decimal(5,2)", precision: 5, scale: 2, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OperationalProjectTimeEntries", x => x.Id);
                    table.UniqueConstraint("AK_OperationalProjectTimeEntries_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_OperationalProjectTimeEntries_Hours", "[Hours] > 0 AND [Hours] <= 24");
                    table.ForeignKey(
                        name: "FK_OperationalProjectTimeEntries_OperationalProjectTasks_TenantId_TaskId",
                        columns: x => new { x.TenantId, x.TaskId },
                        principalTable: "OperationalProjectTasks",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_OperationalProjectTimeEntries_OperationalProjects_TenantId_ProjectId",
                        columns: x => new { x.TenantId, x.ProjectId },
                        principalTable: "OperationalProjects",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_OperationalProjectTimeEntries_TenantId_ProjectId_WorkDate_CreatedAt",
                table: "OperationalProjectTimeEntries",
                columns: new[] { "TenantId", "ProjectId", "WorkDate", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_OperationalProjectTimeEntries_TenantId_TaskId",
                table: "OperationalProjectTimeEntries",
                columns: new[] { "TenantId", "TaskId" });

            migrationBuilder.CreateIndex(
                name: "IX_OperationalProjectTimeEntries_TenantId_UserId_WorkDate",
                table: "OperationalProjectTimeEntries",
                columns: new[] { "TenantId", "UserId", "WorkDate" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "OperationalProjectTimeEntries");
        }
    }
}
