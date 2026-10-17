using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace AIERP.Platform.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddAiUiDesignerPermission : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.InsertData(
                table: "PermissionDefinitions",
                columns: new[] { "Code", "Action", "Description", "ResourceType" },
                values: new object[,]
                {
                    { "studio.ai-design.create", "create", "create · AI ERP screen design proposals", "studio.ai-design" },
                    { "studio.ai-design.delete", "delete", "delete · AI ERP screen design proposals", "studio.ai-design" },
                    { "studio.ai-design.execute", "execute", "execute · AI ERP screen design proposals", "studio.ai-design" },
                    { "studio.ai-design.read", "read", "read · AI ERP screen design proposals", "studio.ai-design" },
                    { "studio.ai-design.update", "update", "update · AI ERP screen design proposals", "studio.ai-design" }
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DeleteData(
                table: "PermissionDefinitions",
                keyColumn: "Code",
                keyValue: "studio.ai-design.create");

            migrationBuilder.DeleteData(
                table: "PermissionDefinitions",
                keyColumn: "Code",
                keyValue: "studio.ai-design.delete");

            migrationBuilder.DeleteData(
                table: "PermissionDefinitions",
                keyColumn: "Code",
                keyValue: "studio.ai-design.execute");

            migrationBuilder.DeleteData(
                table: "PermissionDefinitions",
                keyColumn: "Code",
                keyValue: "studio.ai-design.read");

            migrationBuilder.DeleteData(
                table: "PermissionDefinitions",
                keyColumn: "Code",
                keyValue: "studio.ai-design.update");
        }
    }
}
