using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace AIERP.Platform.Infrastructure.Migrations.Platform
{
    /// <inheritdoc />
    public partial class AddOrganizationalDefinitionsPermission : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.InsertData(
                table: "PermissionDefinitions",
                columns: new[] { "Code", "Action", "Description", "ResourceType" },
                values: new object[,]
                {
                    { "erp.organizational-definitions.create", "create", "create · Tenant workplace, branch and factory definitions", "erp.organizational-definitions" },
                    { "erp.organizational-definitions.delete", "delete", "delete · Tenant workplace, branch and factory definitions", "erp.organizational-definitions" },
                    { "erp.organizational-definitions.execute", "execute", "execute · Tenant workplace, branch and factory definitions", "erp.organizational-definitions" },
                    { "erp.organizational-definitions.read", "read", "read · Tenant workplace, branch and factory definitions", "erp.organizational-definitions" },
                    { "erp.organizational-definitions.update", "update", "update · Tenant workplace, branch and factory definitions", "erp.organizational-definitions" }
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DeleteData(
                table: "PermissionDefinitions",
                keyColumn: "Code",
                keyValue: "erp.organizational-definitions.create");

            migrationBuilder.DeleteData(
                table: "PermissionDefinitions",
                keyColumn: "Code",
                keyValue: "erp.organizational-definitions.delete");

            migrationBuilder.DeleteData(
                table: "PermissionDefinitions",
                keyColumn: "Code",
                keyValue: "erp.organizational-definitions.execute");

            migrationBuilder.DeleteData(
                table: "PermissionDefinitions",
                keyColumn: "Code",
                keyValue: "erp.organizational-definitions.read");

            migrationBuilder.DeleteData(
                table: "PermissionDefinitions",
                keyColumn: "Code",
                keyValue: "erp.organizational-definitions.update");
        }
    }
}
