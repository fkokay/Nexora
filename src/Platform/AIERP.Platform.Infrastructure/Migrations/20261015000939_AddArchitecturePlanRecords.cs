using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddArchitecturePlanRecords : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddUniqueConstraint(
                name: "AK_DevelopmentWorkspaceRequests_TenantId_Id",
                table: "DevelopmentWorkspaceRequests",
                columns: new[] { "TenantId", "Id" });

            migrationBuilder.CreateTable(
                name: "ArchitecturePlanRecords",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ProjectId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    WorkspaceRequestId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    BranchName = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: false),
                    CommitSha = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    Summary = table.Column<string>(type: "nvarchar(3000)", maxLength: 3000, nullable: false),
                    PlanJson = table.Column<string>(type: "nvarchar(max)", maxLength: 64000, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ArchitecturePlanRecords", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ArchitecturePlanRecords_DevelopmentProjects_TenantId_ProjectId",
                        columns: x => new { x.TenantId, x.ProjectId },
                        principalTable: "DevelopmentProjects",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ArchitecturePlanRecords_DevelopmentWorkspaceRequests_TenantId_WorkspaceRequestId",
                        columns: x => new { x.TenantId, x.WorkspaceRequestId },
                        principalTable: "DevelopmentWorkspaceRequests",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ArchitecturePlanRecords_TenantMemberships_TenantId_CreatedByUserId",
                        columns: x => new { x.TenantId, x.CreatedByUserId },
                        principalTable: "TenantMemberships",
                        principalColumns: new[] { "TenantId", "UserId" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ArchitecturePlanRecords_TenantId_CreatedByUserId",
                table: "ArchitecturePlanRecords",
                columns: new[] { "TenantId", "CreatedByUserId" });

            migrationBuilder.CreateIndex(
                name: "IX_ArchitecturePlanRecords_TenantId_ProjectId_CreatedAt",
                table: "ArchitecturePlanRecords",
                columns: new[] { "TenantId", "ProjectId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_ArchitecturePlanRecords_TenantId_WorkspaceRequestId_CreatedAt",
                table: "ArchitecturePlanRecords",
                columns: new[] { "TenantId", "WorkspaceRequestId", "CreatedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ArchitecturePlanRecords");

            migrationBuilder.DropUniqueConstraint(
                name: "AK_DevelopmentWorkspaceRequests_TenantId_Id",
                table: "DevelopmentWorkspaceRequests");
        }
    }
}
