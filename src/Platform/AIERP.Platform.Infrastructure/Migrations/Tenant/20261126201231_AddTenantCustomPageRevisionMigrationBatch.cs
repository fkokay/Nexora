using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Tenant
{
    /// <inheritdoc />
    public partial class AddTenantCustomPageRevisionMigrationBatch : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "MigrationBatch",
                table: "TenantCustomPageRevisions",
                type: "varchar(64)",
                unicode: false,
                maxLength: 64,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_TenantCustomPageRevisions_TenantId_MigrationBatch",
                table: "TenantCustomPageRevisions",
                columns: new[] { "TenantId", "MigrationBatch" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_TenantCustomPageRevisions_TenantId_MigrationBatch",
                table: "TenantCustomPageRevisions");

            migrationBuilder.DropColumn(
                name: "MigrationBatch",
                table: "TenantCustomPageRevisions");
        }
    }
}
