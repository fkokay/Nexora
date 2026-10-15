using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class LinkWorkspaceRequestsToDevelopmentRequests : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "DevelopmentRequestId",
                table: "DevelopmentWorkspaceRequests",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddUniqueConstraint(
                name: "AK_DevelopmentRequests_TenantId_Id",
                table: "DevelopmentRequests",
                columns: new[] { "TenantId", "Id" });

            migrationBuilder.CreateIndex(
                name: "IX_DevelopmentWorkspaceRequests_TenantId_DevelopmentRequestId",
                table: "DevelopmentWorkspaceRequests",
                columns: new[] { "TenantId", "DevelopmentRequestId" });

            migrationBuilder.AddForeignKey(
                name: "FK_DevelopmentWorkspaceRequests_DevelopmentRequests_TenantId_DevelopmentRequestId",
                table: "DevelopmentWorkspaceRequests",
                columns: new[] { "TenantId", "DevelopmentRequestId" },
                principalTable: "DevelopmentRequests",
                principalColumns: new[] { "TenantId", "Id" },
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_DevelopmentWorkspaceRequests_DevelopmentRequests_TenantId_DevelopmentRequestId",
                table: "DevelopmentWorkspaceRequests");

            migrationBuilder.DropIndex(
                name: "IX_DevelopmentWorkspaceRequests_TenantId_DevelopmentRequestId",
                table: "DevelopmentWorkspaceRequests");

            migrationBuilder.DropUniqueConstraint(
                name: "AK_DevelopmentRequests_TenantId_Id",
                table: "DevelopmentRequests");

            migrationBuilder.DropColumn(
                name: "DevelopmentRequestId",
                table: "DevelopmentWorkspaceRequests");
        }
    }
}
