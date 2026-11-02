using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations;

[DbContext(typeof(PlatformDbContext))]
[Migration("20261023160000_AddFinanceEndpointPermissions")]
public sealed class AddFinanceEndpointPermissions : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            INSERT INTO [PermissionDefinitions] ([Code], [Action], [Description], [ResourceType])
            SELECT permission.[Code], permission.[Action], permission.[Description], permission.[ResourceType]
            FROM (VALUES
                ('erp.finance-budgets.read', 'read', N'read · Tenant financial budgets and actuals', 'erp.finance-budgets'),
                ('erp.finance-budgets.create', 'create', N'create · Tenant financial budgets and actuals', 'erp.finance-budgets'),
                ('erp.finance-budgets.update', 'update', N'update · Tenant financial budgets and actuals', 'erp.finance-budgets'),
                ('erp.finance-budgets.delete', 'delete', N'delete · Tenant financial budgets and actuals', 'erp.finance-budgets'),
                ('erp.finance-budgets.execute', 'execute', N'execute · Tenant financial budgets and actuals', 'erp.finance-budgets'),
                ('erp.finance-cash-flow.read', 'read', N'read · Cash-flow forecast aggregated from tenant financial activity', 'erp.finance-cash-flow'),
                ('erp.finance-cash-flow.create', 'create', N'create · Cash-flow forecast aggregated from tenant financial activity', 'erp.finance-cash-flow'),
                ('erp.finance-cash-flow.update', 'update', N'update · Cash-flow forecast aggregated from tenant financial activity', 'erp.finance-cash-flow'),
                ('erp.finance-cash-flow.delete', 'delete', N'delete · Cash-flow forecast aggregated from tenant financial activity', 'erp.finance-cash-flow'),
                ('erp.finance-cash-flow.execute', 'execute', N'execute · Cash-flow forecast aggregated from tenant financial activity', 'erp.finance-cash-flow'),
                ('erp.finance-payment-instruments.read', 'read', N'read · Tenant checks and promissory notes', 'erp.finance-payment-instruments'),
                ('erp.finance-payment-instruments.create', 'create', N'create · Tenant checks and promissory notes', 'erp.finance-payment-instruments'),
                ('erp.finance-payment-instruments.update', 'update', N'update · Tenant checks and promissory notes', 'erp.finance-payment-instruments'),
                ('erp.finance-payment-instruments.delete', 'delete', N'delete · Tenant checks and promissory notes', 'erp.finance-payment-instruments'),
                ('erp.finance-payment-instruments.execute', 'execute', N'execute · Tenant checks and promissory notes', 'erp.finance-payment-instruments')
            ) AS permission([Code], [Action], [Description], [ResourceType])
            WHERE NOT EXISTS (
                SELECT 1 FROM [PermissionDefinitions] AS existing WHERE existing.[Code] = permission.[Code]);
            """);

        // Legacy tenants receive read-only access to these tenant-scoped finance views.
        // Writes remain protected by the endpoint's TenantAdmin checks.
        migrationBuilder.Sql("""
            INSERT INTO [TenantPermissionRules]
                ([Id], [TenantId], [SubjectType], [SubjectRole], [SubjectUserId], [PermissionCode], [Effect],
                 [ResourceType], [AttributeName], [AttributeOperator], [AttributeValue], [IsActive], [CreatedByUserId], [CreatedAt])
            SELECT NEWID(), tenant.[TenantId], 1, 'TenantUser', NULL, permission.[Code], 1,
                   NULL, NULL, NULL, NULL, 1, NULL, SYSUTCDATETIME()
            FROM (SELECT DISTINCT [TenantId] FROM [TenantMemberships] WHERE [Role] = 'TenantUser') AS tenant
            INNER JOIN [PermissionDefinitions] AS permission
                ON permission.[Code] IN (
                    'erp.finance-budgets.read',
                    'erp.finance-cash-flow.read',
                    'erp.finance-payment-instruments.read')
            WHERE NOT EXISTS (
                SELECT 1 FROM [TenantPermissionRules] AS existing
                WHERE existing.[TenantId] = tenant.[TenantId]
                  AND existing.[SubjectType] = 1
                  AND existing.[SubjectRole] = 'TenantUser'
                  AND existing.[PermissionCode] = permission.[Code]
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
