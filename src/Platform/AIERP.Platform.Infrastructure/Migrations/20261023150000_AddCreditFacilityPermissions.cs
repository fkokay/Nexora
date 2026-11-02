using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations;

[DbContext(typeof(PlatformDbContext))]
[Migration("20261023150000_AddCreditFacilityPermissions")]
public sealed class AddCreditFacilityPermissions : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            INSERT INTO [PermissionDefinitions] ([Code], [Action], [Description], [ResourceType])
            SELECT permission.[Code], permission.[Action], permission.[Description], permission.[ResourceType]
            FROM (VALUES
                ('erp.finance.credit-facilities.create', 'create', N'create · Credit facilities and repayment schedules', 'erp.finance.credit-facilities'),
                ('erp.finance.credit-facilities.delete', 'delete', N'delete · Credit facilities and repayment schedules', 'erp.finance.credit-facilities'),
                ('erp.finance.credit-facilities.execute', 'execute', N'execute · Credit facilities and repayment schedules', 'erp.finance.credit-facilities'),
                ('erp.finance.credit-facilities.read', 'read', N'read · Credit facilities and repayment schedules', 'erp.finance.credit-facilities'),
                ('erp.finance.credit-facilities.update', 'update', N'update · Credit facilities and repayment schedules', 'erp.finance.credit-facilities')
            ) AS permission([Code], [Action], [Description], [ResourceType])
            WHERE NOT EXISTS (
                SELECT 1 FROM [PermissionDefinitions] AS existing WHERE existing.[Code] = permission.[Code]);
            """);

        // The underlying endpoints restrict writes to TenantAdmin. TenantUser receives
        // only the read permission, following least-privilege defaults for this resource.
        migrationBuilder.Sql("""
            INSERT INTO [TenantPermissionRules]
                ([Id], [TenantId], [SubjectType], [SubjectRole], [SubjectUserId], [PermissionCode], [Effect],
                 [ResourceType], [AttributeName], [AttributeOperator], [AttributeValue], [IsActive], [CreatedByUserId], [CreatedAt])
            SELECT NEWID(), tenant.[TenantId], 1, 'TenantUser', NULL, 'erp.finance.credit-facilities.read', 1,
                   NULL, NULL, NULL, NULL, 1, NULL, SYSUTCDATETIME()
            FROM (SELECT DISTINCT [TenantId] FROM [TenantMemberships] WHERE [Role] = 'TenantUser') AS tenant
            WHERE NOT EXISTS (
                SELECT 1 FROM [TenantPermissionRules] AS existing
                WHERE existing.[TenantId] = tenant.[TenantId]
                  AND existing.[SubjectType] = 1
                  AND existing.[SubjectRole] = 'TenantUser'
                  AND existing.[PermissionCode] = 'erp.finance.credit-facilities.read'
                  AND existing.[SubjectUserId] IS NULL
            );
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        // Intentionally irreversible: the schema has no seed provenance, so matching
        // rules/definitions cannot be distinguished safely from pre-existing admin data.
    }
}
