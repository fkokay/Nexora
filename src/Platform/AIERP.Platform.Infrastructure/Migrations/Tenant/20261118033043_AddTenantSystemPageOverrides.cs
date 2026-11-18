using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Tenant
{
    /// <inheritdoc />
    public partial class AddTenantSystemPageOverrides : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ScreenKey",
                table: "TenantCustomPages",
                type: "varchar(40)",
                unicode: false,
                maxLength: 40,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "StandardVersion",
                table: "TenantCustomPages",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "StandardVersion",
                table: "TenantCustomPageRevisions",
                type: "int",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_TenantCustomPages_ScreenKey",
                table: "TenantCustomPages",
                columns: new[] { "TenantId", "ScreenKey" },
                filter: "[ScreenKey] IS NOT NULL");

            migrationBuilder.AddCheckConstraint(
                name: "CK_TenantCustomPages_ScreenKey",
                table: "TenantCustomPages",
                sql: "[ScreenKey] IS NULL OR ([Code] = '@' + [ScreenKey] AND [StandardVersion] IS NOT NULL AND [StandardVersion] >= 1)");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_TenantCustomPages_ScreenKey",
                table: "TenantCustomPages");

            migrationBuilder.DropCheckConstraint(
                name: "CK_TenantCustomPages_ScreenKey",
                table: "TenantCustomPages");

            migrationBuilder.DropColumn(
                name: "ScreenKey",
                table: "TenantCustomPages");

            migrationBuilder.DropColumn(
                name: "StandardVersion",
                table: "TenantCustomPages");

            migrationBuilder.DropColumn(
                name: "StandardVersion",
                table: "TenantCustomPageRevisions");
        }
    }
}
