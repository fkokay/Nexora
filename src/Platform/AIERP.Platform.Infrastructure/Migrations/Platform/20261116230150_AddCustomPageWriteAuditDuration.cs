using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Platform
{
    /// <inheritdoc />
    public partial class AddCustomPageWriteAuditDuration : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "DurationMs",
                table: "TenantCustomPageWriteAudits",
                type: "int",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DurationMs",
                table: "TenantCustomPageWriteAudits");
        }
    }
}
