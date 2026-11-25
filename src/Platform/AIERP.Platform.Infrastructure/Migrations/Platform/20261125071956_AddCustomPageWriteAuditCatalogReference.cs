using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Platform
{
    /// <inheritdoc />
    public partial class AddCustomPageWriteAuditCatalogReference : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "CatalogReference",
                table: "TenantCustomPageWriteAudits",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CatalogReference",
                table: "TenantCustomPageWriteAudits");
        }
    }
}
