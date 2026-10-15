using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddStudioProductionPromotionApprovals : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "StudioProductionPromotionApprovalRecords",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ProjectId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    StagingDeploymentId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ReleasePackageId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RequestedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ReviewedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Status = table.Column<string>(type: "nvarchar(24)", maxLength: 24, nullable: false),
                    RequestNote = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    ReviewNote = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    ReviewedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StudioProductionPromotionApprovalRecords", x => x.Id);
                    table.UniqueConstraint("AK_StudioProductionPromotionApprovalRecords_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.ForeignKey(
                        name: "FK_StudioProductionPromotionApprovalRecords_DevelopmentProjects_TenantId_ProjectId",
                        columns: x => new { x.TenantId, x.ProjectId },
                        principalTable: "DevelopmentProjects",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_StudioProductionPromotionApprovalRecords_StudioReleaseDeploymentRecords_TenantId_StagingDeploymentId",
                        columns: x => new { x.TenantId, x.StagingDeploymentId },
                        principalTable: "StudioReleaseDeploymentRecords",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_StudioProductionPromotionApprovalRecords_StudioReleasePackageRecords_TenantId_ReleasePackageId",
                        columns: x => new { x.TenantId, x.ReleasePackageId },
                        principalTable: "StudioReleasePackageRecords",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_StudioProductionPromotionApprovalRecords_TenantMemberships_TenantId_RequestedByUserId",
                        columns: x => new { x.TenantId, x.RequestedByUserId },
                        principalTable: "TenantMemberships",
                        principalColumns: new[] { "TenantId", "UserId" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_StudioProductionPromotionApprovalRecords_TenantMemberships_TenantId_ReviewedByUserId",
                        columns: x => new { x.TenantId, x.ReviewedByUserId },
                        principalTable: "TenantMemberships",
                        principalColumns: new[] { "TenantId", "UserId" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_StudioProductionPromotionApprovalRecords_TenantId_ProjectId_Status_CreatedAt",
                table: "StudioProductionPromotionApprovalRecords",
                columns: new[] { "TenantId", "ProjectId", "Status", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_StudioProductionPromotionApprovalRecords_TenantId_ReleasePackageId",
                table: "StudioProductionPromotionApprovalRecords",
                columns: new[] { "TenantId", "ReleasePackageId" });

            migrationBuilder.CreateIndex(
                name: "IX_StudioProductionPromotionApprovalRecords_TenantId_RequestedByUserId",
                table: "StudioProductionPromotionApprovalRecords",
                columns: new[] { "TenantId", "RequestedByUserId" });

            migrationBuilder.CreateIndex(
                name: "IX_StudioProductionPromotionApprovalRecords_TenantId_ReviewedByUserId",
                table: "StudioProductionPromotionApprovalRecords",
                columns: new[] { "TenantId", "ReviewedByUserId" });

            migrationBuilder.CreateIndex(
                name: "IX_StudioProductionPromotionApprovalRecords_TenantId_StagingDeploymentId",
                table: "StudioProductionPromotionApprovalRecords",
                columns: new[] { "TenantId", "StagingDeploymentId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "StudioProductionPromotionApprovalRecords");
        }
    }
}
