using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace AIERP.Platform.Infrastructure.Migrations.Platform
{
    /// <inheritdoc />
    public partial class AddAgendaPermissions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.InsertData(
                table: "PermissionDefinitions",
                columns: new[] { "Code", "Action", "Description", "ResourceType" },
                values: new object[,]
                {
                    { "erp.agenda.create", "create", "create · Personal agenda entries on the ERP home screen", "erp.agenda" },
                    { "erp.agenda.delete", "delete", "delete · Personal agenda entries on the ERP home screen", "erp.agenda" },
                    { "erp.agenda.execute", "execute", "execute · Personal agenda entries on the ERP home screen", "erp.agenda" },
                    { "erp.agenda.read", "read", "read · Personal agenda entries on the ERP home screen", "erp.agenda" },
                    { "erp.agenda.update", "update", "update · Personal agenda entries on the ERP home screen", "erp.agenda" }
                });

            // Agenda entries are personal; grant the new resource to existing tenant users unless an
            // administrator already configured a role rule for the same permission code.
            migrationBuilder.Sql("""
                INSERT INTO [TenantPermissionRules]
                    ([Id], [TenantId], [SubjectType], [SubjectRole], [SubjectUserId], [PermissionCode], [Effect],
                     [ResourceType], [AttributeName], [AttributeOperator], [AttributeValue], [IsActive], [CreatedByUserId], [CreatedAt])
                SELECT NEWID(), tenant.[TenantId], 1, 'TenantUser', NULL, permission.[Code], 1,
                       NULL, NULL, NULL, NULL, 1, NULL, SYSUTCDATETIME()
                FROM (SELECT DISTINCT [TenantId] FROM [TenantMemberships] WHERE [Role] = 'TenantUser') AS tenant
                CROSS JOIN [PermissionDefinitions] AS permission
                WHERE permission.[ResourceType] = 'erp.agenda'
                  AND NOT EXISTS (
                      SELECT 1 FROM [TenantPermissionRules] AS existing
                      WHERE existing.[TenantId] = tenant.[TenantId]
                        AND existing.[SubjectType] = 1
                        AND existing.[SubjectRole] = 'TenantUser'
                        AND existing.[PermissionCode] = permission.[Code]
                  );
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("DELETE FROM [TenantPermissionRules] WHERE [PermissionCode] LIKE 'erp.agenda.%';");

            migrationBuilder.DeleteData(
                table: "PermissionDefinitions",
                keyColumn: "Code",
                keyValue: "erp.agenda.create");

            migrationBuilder.DeleteData(
                table: "PermissionDefinitions",
                keyColumn: "Code",
                keyValue: "erp.agenda.delete");

            migrationBuilder.DeleteData(
                table: "PermissionDefinitions",
                keyColumn: "Code",
                keyValue: "erp.agenda.execute");

            migrationBuilder.DeleteData(
                table: "PermissionDefinitions",
                keyColumn: "Code",
                keyValue: "erp.agenda.read");

            migrationBuilder.DeleteData(
                table: "PermissionDefinitions",
                keyColumn: "Code",
                keyValue: "erp.agenda.update");
        }
    }
}
