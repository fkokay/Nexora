using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class LinkStudioRequestsToProjects : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "ProjectId",
                table: "DevelopmentRequests",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_DevelopmentRequests_TenantId_ProjectId_CreatedAt",
                table: "DevelopmentRequests",
                columns: new[] { "TenantId", "ProjectId", "CreatedAt" });

            migrationBuilder.AddForeignKey(
                name: "FK_DevelopmentRequests_DevelopmentProjects_TenantId_ProjectId",
                table: "DevelopmentRequests",
                columns: new[] { "TenantId", "ProjectId" },
                principalTable: "DevelopmentProjects",
                principalColumns: new[] { "TenantId", "Id" },
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_DevelopmentRequests_DevelopmentProjects_TenantId_ProjectId",
                table: "DevelopmentRequests");

            migrationBuilder.DropIndex(
                name: "IX_DevelopmentRequests_TenantId_ProjectId_CreatedAt",
                table: "DevelopmentRequests");

            migrationBuilder.DropColumn(
                name: "ProjectId",
                table: "DevelopmentRequests");
        }
    }
}
