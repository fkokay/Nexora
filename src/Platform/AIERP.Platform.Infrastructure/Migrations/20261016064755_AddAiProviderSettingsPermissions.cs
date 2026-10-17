using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace AIERP.Platform.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddAiProviderSettingsPermissions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.InsertData(
                table: "PermissionDefinitions",
                columns: new[] { "Code", "Action", "Description", "ResourceType" },
                values: new object[,]
                {
                    { "erp.ai-settings.create", "create", "create · Tenant AI provider settings and API credentials", "erp.ai-settings" },
                    { "erp.ai-settings.delete", "delete", "delete · Tenant AI provider settings and API credentials", "erp.ai-settings" },
                    { "erp.ai-settings.execute", "execute", "execute · Tenant AI provider settings and API credentials", "erp.ai-settings" },
                    { "erp.ai-settings.read", "read", "read · Tenant AI provider settings and API credentials", "erp.ai-settings" },
                    { "erp.ai-settings.update", "update", "update · Tenant AI provider settings and API credentials", "erp.ai-settings" }
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DeleteData(
                table: "PermissionDefinitions",
                keyColumn: "Code",
                keyValue: "erp.ai-settings.create");

            migrationBuilder.DeleteData(
                table: "PermissionDefinitions",
                keyColumn: "Code",
                keyValue: "erp.ai-settings.delete");

            migrationBuilder.DeleteData(
                table: "PermissionDefinitions",
                keyColumn: "Code",
                keyValue: "erp.ai-settings.execute");

            migrationBuilder.DeleteData(
                table: "PermissionDefinitions",
                keyColumn: "Code",
                keyValue: "erp.ai-settings.read");

            migrationBuilder.DeleteData(
                table: "PermissionDefinitions",
                keyColumn: "Code",
                keyValue: "erp.ai-settings.update");
        }
    }
}
