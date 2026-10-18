using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace AIERP.Platform.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddCrmOpportunityPermissions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.InsertData(
                table: "PermissionDefinitions",
                columns: new[] { "Code", "Action", "Description", "ResourceType" },
                values: new object[,]
                {
                    { "erp.crm-opportunities.create", "create", "create · CRM sales opportunities", "erp.crm-opportunities" },
                    { "erp.crm-opportunities.delete", "delete", "delete · CRM sales opportunities", "erp.crm-opportunities" },
                    { "erp.crm-opportunities.execute", "execute", "execute · CRM sales opportunities", "erp.crm-opportunities" },
                    { "erp.crm-opportunities.read", "read", "read · CRM sales opportunities", "erp.crm-opportunities" },
                    { "erp.crm-opportunities.update", "update", "update · CRM sales opportunities", "erp.crm-opportunities" }
                });

            migrationBuilder.Sql("""
                INSERT INTO [TenantPermissionRules]
                    ([Id], [TenantId], [SubjectType], [SubjectRole], [SubjectUserId], [PermissionCode], [Effect],
                     [ResourceType], [AttributeName], [AttributeOperator], [AttributeValue], [IsActive], [CreatedByUserId], [CreatedAt])
                SELECT NEWID(), tenant.[TenantId], 1, 'TenantUser', NULL, permission.[Code], 1,
                       NULL, NULL, NULL, NULL, 1, NULL, SYSUTCDATETIME()
                FROM (SELECT DISTINCT [TenantId] FROM [TenantMemberships] WHERE [Role] = 'TenantUser') AS tenant
                CROSS JOIN [PermissionDefinitions] AS permission
                WHERE permission.[ResourceType] = 'erp.crm-opportunities'
                  AND NOT EXISTS (
                      SELECT 1 FROM [TenantPermissionRules] AS existing
                      WHERE existing.[TenantId] = tenant.[TenantId]
                        AND existing.[SubjectType] = 1
                        AND existing.[SubjectRole] = 'TenantUser'
                        AND existing.[PermissionCode] = permission.[Code]
                        AND existing.[Effect] = 1
                        AND existing.[IsActive] = 1
                  );
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("DELETE FROM [TenantPermissionRules] WHERE [SubjectType] = 1 AND [SubjectRole] = 'TenantUser' AND [PermissionCode] LIKE 'erp.crm-opportunities.%';");

            migrationBuilder.DeleteData(
                table: "PermissionDefinitions",
                keyColumn: "Code",
                keyValue: "erp.crm-opportunities.create");

            migrationBuilder.DeleteData(
                table: "PermissionDefinitions",
                keyColumn: "Code",
                keyValue: "erp.crm-opportunities.delete");

            migrationBuilder.DeleteData(
                table: "PermissionDefinitions",
                keyColumn: "Code",
                keyValue: "erp.crm-opportunities.execute");

            migrationBuilder.DeleteData(
                table: "PermissionDefinitions",
                keyColumn: "Code",
                keyValue: "erp.crm-opportunities.read");

            migrationBuilder.DeleteData(
                table: "PermissionDefinitions",
                keyColumn: "Code",
                keyValue: "erp.crm-opportunities.update");
        }
    }
}
