using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations;

[DbContext(typeof(PlatformDbContext))]
[Migration("20261023220000_BackfillManufacturingReadForTenantUsers")]
public sealed class BackfillManufacturingReadForTenantUsers : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        // Manufacturing definitions are already catalogued. Add only the baseline
        // role-level read allow for existing TenantUser memberships that have no
        // rule for this exact permission. Any existing allow/deny, active/inactive,
        // scoped/unscoped rule is administrator-owned and must remain authoritative.
        migrationBuilder.Sql("""
            INSERT INTO [dbo].[TenantPermissionRules]
                ([Id], [TenantId], [SubjectType], [SubjectRole], [SubjectUserId], [PermissionCode], [Effect],
                 [ResourceType], [AttributeName], [AttributeOperator], [AttributeValue], [IsActive], [CreatedByUserId], [CreatedAt])
            SELECT NEWID(), tenant.[TenantId], 1, 'TenantUser', NULL, 'erp.manufacturing.read', 1,
                   NULL, NULL, NULL, NULL, 1, NULL, SYSUTCDATETIME()
            FROM (SELECT DISTINCT [TenantId] FROM [TenantMemberships] WHERE [Role] = 'TenantUser') AS tenant
            WHERE NOT EXISTS (
                SELECT 1
                FROM [dbo].[TenantPermissionRules] AS existing
                WHERE existing.[TenantId] = tenant.[TenantId]
                  AND existing.[SubjectType] = 1
                  AND existing.[SubjectRole] = 'TenantUser'
                  AND existing.[SubjectUserId] IS NULL
                  AND existing.[PermissionCode] = 'erp.manufacturing.read'
            );
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        // Intentionally irreversible: rule rows have no migration provenance, so a
        // matching rule cannot safely be distinguished from an administrator edit.
    }
}
