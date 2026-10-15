using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddStudioReleaseDeployments : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "StudioReleaseDeploymentRecords",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ProjectId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ReleasePackageId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RollbackOfDeploymentId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    IdempotencyKey = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Environment = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    Provider = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    Status = table.Column<string>(type: "nvarchar(24)", maxLength: 24, nullable: false),
                    PackageSha256 = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    CommitSha = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    ProviderDeploymentId = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: true),
                    FailureCode = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    StartedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    CompletedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StudioReleaseDeploymentRecords", x => x.Id);
                    table.UniqueConstraint("AK_StudioReleaseDeploymentRecords_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.ForeignKey(
                        name: "FK_StudioReleaseDeploymentRecords_DevelopmentProjects_TenantId_ProjectId",
                        columns: x => new { x.TenantId, x.ProjectId },
                        principalTable: "DevelopmentProjects",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_StudioReleaseDeploymentRecords_StudioReleaseDeploymentRecords_TenantId_RollbackOfDeploymentId",
                        columns: x => new { x.TenantId, x.RollbackOfDeploymentId },
                        principalTable: "StudioReleaseDeploymentRecords",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_StudioReleaseDeploymentRecords_StudioReleasePackageRecords_TenantId_ReleasePackageId",
                        columns: x => new { x.TenantId, x.ReleasePackageId },
                        principalTable: "StudioReleasePackageRecords",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_StudioReleaseDeploymentRecords_TenantMemberships_TenantId_CreatedByUserId",
                        columns: x => new { x.TenantId, x.CreatedByUserId },
                        principalTable: "TenantMemberships",
                        principalColumns: new[] { "TenantId", "UserId" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_StudioReleaseDeploymentRecords_TenantId_CreatedByUserId",
                table: "StudioReleaseDeploymentRecords",
                columns: new[] { "TenantId", "CreatedByUserId" });

            migrationBuilder.CreateIndex(
                name: "IX_StudioReleaseDeploymentRecords_TenantId_IdempotencyKey",
                table: "StudioReleaseDeploymentRecords",
                columns: new[] { "TenantId", "IdempotencyKey" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_StudioReleaseDeploymentRecords_TenantId_ProjectId_Environment_CreatedAt",
                table: "StudioReleaseDeploymentRecords",
                columns: new[] { "TenantId", "ProjectId", "Environment", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_StudioReleaseDeploymentRecords_TenantId_ReleasePackageId",
                table: "StudioReleaseDeploymentRecords",
                columns: new[] { "TenantId", "ReleasePackageId" });

            migrationBuilder.CreateIndex(
                name: "IX_StudioReleaseDeploymentRecords_TenantId_RollbackOfDeploymentId",
                table: "StudioReleaseDeploymentRecords",
                columns: new[] { "TenantId", "RollbackOfDeploymentId" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "StudioReleaseDeploymentRecords");
        }
    }
}
