using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations;

public sealed partial class AddDirectCashBudgetPermissions : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            INSERT INTO [dbo].[PermissionDefinitions] ([Code], [Action], [Description], [ResourceType])
            SELECT permission.[Code], permission.[Action], permission.[Description], permission.[ResourceType]
            FROM (VALUES
                ('erp.finance-cash-budgets.read', 'read', N'read · Tenant direct cash budgets', 'erp.finance-cash-budgets'),
                ('erp.finance-cash-budgets.create', 'create', N'create · Tenant direct cash budgets', 'erp.finance-cash-budgets'),
                ('erp.finance-cash-budgets.update', 'update', N'update · Tenant direct cash budgets', 'erp.finance-cash-budgets'),
                ('erp.finance-cash-budgets.delete', 'delete', N'delete · Tenant direct cash budgets', 'erp.finance-cash-budgets'),
                ('erp.finance-cash-budgets.execute', 'execute', N'execute · Tenant direct cash budgets', 'erp.finance-cash-budgets')
            ) AS permission([Code], [Action], [Description], [ResourceType])
            WHERE NOT EXISTS (
                SELECT 1 FROM [dbo].[PermissionDefinitions] AS existing WHERE existing.[Code] = permission.[Code]);
            """);

        // Existing tenants receive only read access for TenantUser. The direct cash
        // budget endpoints retain their TenantAdmin write checks.
        migrationBuilder.Sql("""
            INSERT INTO [dbo].[TenantPermissionRules]
                ([Id], [TenantId], [SubjectType], [SubjectRole], [SubjectUserId], [PermissionCode], [Effect],
                 [ResourceType], [AttributeName], [AttributeOperator], [AttributeValue], [IsActive], [CreatedByUserId], [CreatedAt])
            SELECT NEWID(), tenant.[TenantId], 1, 'TenantUser', NULL, 'erp.finance-cash-budgets.read', 1,
                   NULL, NULL, NULL, NULL, 1, NULL, SYSUTCDATETIME()
            FROM (SELECT DISTINCT [TenantId] FROM [dbo].[TenantMemberships] WHERE [Role] = 'TenantUser') AS tenant
            WHERE NOT EXISTS (
                SELECT 1 FROM [dbo].[TenantPermissionRules] AS existing
                WHERE existing.[TenantId] = tenant.[TenantId]
                  AND existing.[SubjectType] = 1
                  AND existing.[SubjectRole] = 'TenantUser'
                  AND existing.[SubjectUserId] IS NULL
                  AND existing.[PermissionCode] = 'erp.finance-cash-budgets.read'
            );
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        // Intentionally irreversible: permission definitions and rules have no seed
        // provenance, so deleting matching rows could erase administrator data.
    }
}
