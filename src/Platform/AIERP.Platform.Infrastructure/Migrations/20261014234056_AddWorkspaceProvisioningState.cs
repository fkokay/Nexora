using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddWorkspaceProvisioningState : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "CommitSha",
                table: "DevelopmentWorkspaceRequests",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ProvisionedAt",
                table: "DevelopmentWorkspaceRequests",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ProvisioningError",
                table: "DevelopmentWorkspaceRequests",
                type: "nvarchar(500)",
                maxLength: 500,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CommitSha",
                table: "DevelopmentWorkspaceRequests");

            migrationBuilder.DropColumn(
                name: "ProvisionedAt",
                table: "DevelopmentWorkspaceRequests");

            migrationBuilder.DropColumn(
                name: "ProvisioningError",
                table: "DevelopmentWorkspaceRequests");
        }
    }
}
