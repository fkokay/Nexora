using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace AIERP.Platform.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddTenantModuleMarketplacePermission : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.InsertData(
                table: "PermissionDefinitions",
                columns: new[] { "Code", "Action", "Description", "ResourceType" },
                values: new object[,]
                {
                    { "erp.tenant-modules.create", "create", "create · Published extension catalog and tenant module entitlements", "erp.tenant-modules" },
                    { "erp.tenant-modules.delete", "delete", "delete · Published extension catalog and tenant module entitlements", "erp.tenant-modules" },
                    { "erp.tenant-modules.execute", "execute", "execute · Published extension catalog and tenant module entitlements", "erp.tenant-modules" },
                    { "erp.tenant-modules.read", "read", "read · Published extension catalog and tenant module entitlements", "erp.tenant-modules" },
                    { "erp.tenant-modules.update", "update", "update · Published extension catalog and tenant module entitlements", "erp.tenant-modules" }
                });

            migrationBuilder.Sql("""
                INSERT INTO [dbo].[TenantPermissionRules]
                    ([Id], [TenantId], [SubjectType], [SubjectRole], [SubjectUserId], [PermissionCode], [Effect], [ResourceType],
                     [AttributeName], [AttributeOperator], [AttributeValue], [IsActive], [CreatedByUserId], [CreatedAt])
                SELECT NEWID(), membership.[TenantId], 1, N'TenantUser', NULL, 'erp.tenant-modules.read', 1, NULL,
                       NULL, NULL, NULL, 1, NULL, SYSUTCDATETIME()
                FROM [dbo].[TenantMemberships] AS membership
                WHERE membership.[Role] = N'TenantUser'
                  AND NOT EXISTS (
                    SELECT 1 FROM [dbo].[TenantPermissionRules] AS existingRule
                    WHERE existingRule.[TenantId] = membership.[TenantId]
                      AND existingRule.[SubjectType] = 1 AND existingRule.[SubjectRole] = N'TenantUser'
                      AND existingRule.[PermissionCode] = 'erp.tenant-modules.read' AND existingRule.[Effect] = 1
                  );
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("DELETE FROM [dbo].[TenantPermissionRules] WHERE [PermissionCode] LIKE 'erp.tenant-modules.%';");
            migrationBuilder.DeleteData(
                table: "PermissionDefinitions",
                keyColumn: "Code",
                keyValue: "erp.tenant-modules.create");

            migrationBuilder.DeleteData(
                table: "PermissionDefinitions",
                keyColumn: "Code",
                keyValue: "erp.tenant-modules.delete");

            migrationBuilder.DeleteData(
                table: "PermissionDefinitions",
                keyColumn: "Code",
                keyValue: "erp.tenant-modules.execute");

            migrationBuilder.DeleteData(
                table: "PermissionDefinitions",
                keyColumn: "Code",
                keyValue: "erp.tenant-modules.read");

            migrationBuilder.DeleteData(
                table: "PermissionDefinitions",
                keyColumn: "Code",
                keyValue: "erp.tenant-modules.update");
        }
    }
}
