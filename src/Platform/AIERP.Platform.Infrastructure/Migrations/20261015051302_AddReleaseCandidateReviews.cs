using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddReleaseCandidateReviews : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ReleaseCandidateReviewRecords",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ProjectId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    WorkspaceRequestId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ReleaseCandidateId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ReviewedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Decision = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    Note = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ReleaseCandidateReviewRecords", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ReleaseCandidateReviewRecords_DevelopmentProjects_TenantId_ProjectId",
                        columns: x => new { x.TenantId, x.ProjectId },
                        principalTable: "DevelopmentProjects",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ReleaseCandidateReviewRecords_DevelopmentWorkspaceRequests_TenantId_WorkspaceRequestId",
                        columns: x => new { x.TenantId, x.WorkspaceRequestId },
                        principalTable: "DevelopmentWorkspaceRequests",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ReleaseCandidateReviewRecords_ReleaseCandidateRecords_TenantId_ReleaseCandidateId",
                        columns: x => new { x.TenantId, x.ReleaseCandidateId },
                        principalTable: "ReleaseCandidateRecords",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ReleaseCandidateReviewRecords_TenantMemberships_TenantId_ReviewedByUserId",
                        columns: x => new { x.TenantId, x.ReviewedByUserId },
                        principalTable: "TenantMemberships",
                        principalColumns: new[] { "TenantId", "UserId" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ReleaseCandidateReviewRecords_TenantId_ProjectId_CreatedAt",
                table: "ReleaseCandidateReviewRecords",
                columns: new[] { "TenantId", "ProjectId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_ReleaseCandidateReviewRecords_TenantId_ReleaseCandidateId",
                table: "ReleaseCandidateReviewRecords",
                columns: new[] { "TenantId", "ReleaseCandidateId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ReleaseCandidateReviewRecords_TenantId_ReviewedByUserId",
                table: "ReleaseCandidateReviewRecords",
                columns: new[] { "TenantId", "ReviewedByUserId" });

            migrationBuilder.CreateIndex(
                name: "IX_ReleaseCandidateReviewRecords_TenantId_WorkspaceRequestId",
                table: "ReleaseCandidateReviewRecords",
                columns: new[] { "TenantId", "WorkspaceRequestId" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ReleaseCandidateReviewRecords");
        }
    }
}
