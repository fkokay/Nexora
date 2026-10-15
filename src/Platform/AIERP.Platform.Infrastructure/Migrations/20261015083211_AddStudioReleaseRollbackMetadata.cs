using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddStudioReleaseRollbackMetadata : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "EnvironmentUrl",
                table: "StudioReleaseDeploymentRecords",
                type: "nvarchar(256)",
                maxLength: 256,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "RollbackTargetDeploymentId",
                table: "StudioReleaseDeploymentRecords",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_StudioReleaseDeploymentRecords_TenantId_RollbackTargetDeploymentId",
                table: "StudioReleaseDeploymentRecords",
                columns: new[] { "TenantId", "RollbackTargetDeploymentId" });

            migrationBuilder.AddForeignKey(
                name: "FK_StudioReleaseDeploymentRecords_StudioReleaseDeploymentRecords_TenantId_RollbackTargetDeploymentId",
                table: "StudioReleaseDeploymentRecords",
                columns: new[] { "TenantId", "RollbackTargetDeploymentId" },
                principalTable: "StudioReleaseDeploymentRecords",
                principalColumns: new[] { "TenantId", "Id" },
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_StudioReleaseDeploymentRecords_StudioReleaseDeploymentRecords_TenantId_RollbackTargetDeploymentId",
                table: "StudioReleaseDeploymentRecords");

            migrationBuilder.DropIndex(
                name: "IX_StudioReleaseDeploymentRecords_TenantId_RollbackTargetDeploymentId",
                table: "StudioReleaseDeploymentRecords");

            migrationBuilder.DropColumn(
                name: "EnvironmentUrl",
                table: "StudioReleaseDeploymentRecords");

            migrationBuilder.DropColumn(
                name: "RollbackTargetDeploymentId",
                table: "StudioReleaseDeploymentRecords");
        }
    }
}
