using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddWorkspaceApprovalRequests : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "DevelopmentWorkspaceRequests",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ProjectId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RequestedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    BranchName = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: false),
                    Status = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    ReviewedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ReviewedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ReviewNote = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DevelopmentWorkspaceRequests", x => x.Id);
                    table.ForeignKey(
                        name: "FK_DevelopmentWorkspaceRequests_DevelopmentProjects_TenantId_ProjectId",
                        columns: x => new { x.TenantId, x.ProjectId },
                        principalTable: "DevelopmentProjects",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_DevelopmentWorkspaceRequests_TenantMemberships_TenantId_RequestedByUserId",
                        columns: x => new { x.TenantId, x.RequestedByUserId },
                        principalTable: "TenantMemberships",
                        principalColumns: new[] { "TenantId", "UserId" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_DevelopmentWorkspaceRequests_TenantMemberships_TenantId_ReviewedByUserId",
                        columns: x => new { x.TenantId, x.ReviewedByUserId },
                        principalTable: "TenantMemberships",
                        principalColumns: new[] { "TenantId", "UserId" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_DevelopmentWorkspaceRequests_TenantId_ProjectId_CreatedAt",
                table: "DevelopmentWorkspaceRequests",
                columns: new[] { "TenantId", "ProjectId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_DevelopmentWorkspaceRequests_TenantId_RequestedByUserId",
                table: "DevelopmentWorkspaceRequests",
                columns: new[] { "TenantId", "RequestedByUserId" });

            migrationBuilder.CreateIndex(
                name: "IX_DevelopmentWorkspaceRequests_TenantId_ReviewedByUserId",
                table: "DevelopmentWorkspaceRequests",
                columns: new[] { "TenantId", "ReviewedByUserId" });

            migrationBuilder.CreateIndex(
                name: "IX_DevelopmentWorkspaceRequests_TenantId_Status_CreatedAt",
                table: "DevelopmentWorkspaceRequests",
                columns: new[] { "TenantId", "Status", "CreatedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "DevelopmentWorkspaceRequests");
        }
    }
}
