using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddStudioCodeReviewThreadsPlatform : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "StudioCodeReviewThreads",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ProjectId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    WorkspaceRequestId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Path = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    LineNumber = table.Column<int>(type: "int", nullable: false),
                    HeadCommitSha = table.Column<string>(type: "varchar(64)", unicode: false, maxLength: 64, nullable: false),
                    Status = table.Column<string>(type: "varchar(16)", unicode: false, maxLength: 16, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StudioCodeReviewThreads", x => x.Id);
                    table.UniqueConstraint("AK_StudioCodeReviewThreads_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.ForeignKey(
                        name: "FK_StudioCodeReviewThreads_DevelopmentProjects_TenantId_ProjectId",
                        columns: x => new { x.TenantId, x.ProjectId },
                        principalTable: "DevelopmentProjects",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_StudioCodeReviewThreads_DevelopmentWorkspaceRequests_TenantId_WorkspaceRequestId",
                        columns: x => new { x.TenantId, x.WorkspaceRequestId },
                        principalTable: "DevelopmentWorkspaceRequests",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_StudioCodeReviewThreads_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "StudioCodeReviewComments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ThreadId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Body = table.Column<string>(type: "nvarchar(4000)", maxLength: 4000, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StudioCodeReviewComments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_StudioCodeReviewComments_StudioCodeReviewThreads_TenantId_ThreadId",
                        columns: x => new { x.TenantId, x.ThreadId },
                        principalTable: "StudioCodeReviewThreads",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_StudioCodeReviewComments_TenantId_ThreadId_CreatedAt",
                table: "StudioCodeReviewComments",
                columns: new[] { "TenantId", "ThreadId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_StudioCodeReviewThreads_TenantId_ProjectId_WorkspaceRequestId_Path_LineNumber_Status",
                table: "StudioCodeReviewThreads",
                columns: new[] { "TenantId", "ProjectId", "WorkspaceRequestId", "Path", "LineNumber", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_StudioCodeReviewThreads_TenantId_WorkspaceRequestId",
                table: "StudioCodeReviewThreads",
                columns: new[] { "TenantId", "WorkspaceRequestId" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "StudioCodeReviewComments");

            migrationBuilder.DropTable(
                name: "StudioCodeReviewThreads");
        }
    }
}
