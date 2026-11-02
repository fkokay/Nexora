using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations;

[DbContext(typeof(PlatformDbContext))]
[Migration("20261023230000_AddOperationalProjectTimeEntryPermission")]
public sealed class AddOperationalProjectTimeEntryPermission : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            IF NOT EXISTS (
                SELECT 1 FROM [dbo].[PermissionDefinitions]
                WHERE [Code] = 'erp.operational-projects.time-entries.create'
            )
            INSERT INTO [dbo].[PermissionDefinitions] ([Code], [Action], [Description], [ResourceType])
            VALUES ('erp.operational-projects.time-entries.create', 'create',
                'Create own operational project time entries', 'erp.operational-projects');
            """);

        // Grant the narrow operation to existing tenant users only when no role rule
        // already exists for it. Existing policy decisions remain authoritative.
        migrationBuilder.Sql("""
            INSERT INTO [dbo].[TenantPermissionRules]
                ([Id], [TenantId], [SubjectType], [SubjectRole], [SubjectUserId], [PermissionCode], [Effect],
                 [ResourceType], [AttributeName], [AttributeOperator], [AttributeValue], [IsActive], [CreatedByUserId], [CreatedAt])
            SELECT NEWID(), tenant.[TenantId], 1, 'TenantUser', NULL, 'erp.operational-projects.time-entries.create', 1,
                   NULL, NULL, NULL, NULL, 1, NULL, SYSUTCDATETIME()
            FROM (SELECT DISTINCT [TenantId] FROM [dbo].[TenantMemberships] WHERE [Role] = 'TenantUser') AS tenant
            WHERE NOT EXISTS (
                SELECT 1 FROM [dbo].[TenantPermissionRules] AS existing
                WHERE existing.[TenantId] = tenant.[TenantId]
                  AND existing.[SubjectType] = 1
                  AND existing.[SubjectRole] = 'TenantUser'
                  AND existing.[SubjectUserId] IS NULL
                  AND existing.[PermissionCode] = 'erp.operational-projects.time-entries.create'
            );
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        // Permission rules have no migration provenance. Keep the additive permission
        // and any administrator-edited grants rather than deleting indistinguishable data.
    }
}
