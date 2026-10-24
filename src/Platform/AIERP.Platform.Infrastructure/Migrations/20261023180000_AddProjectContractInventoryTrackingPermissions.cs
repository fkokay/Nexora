using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations;

[DbContext(typeof(PlatformDbContext))]
[Migration("20261023180000_AddProjectContractInventoryTrackingPermissions")]
public sealed class AddProjectContractInventoryTrackingPermissions : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            INSERT INTO [PermissionDefinitions] ([Code], [Action], [Description], [ResourceType])
            SELECT permission.[Code], permission.[Action], permission.[Description], permission.[ResourceType]
            FROM (VALUES
                ('erp.operational-projects.read', 'read', N'read · Tenant operational projects, tasks, allocations, and time entries', 'erp.operational-projects'),
                ('erp.operational-projects.create', 'create', N'create · Tenant operational projects, tasks, allocations, and time entries', 'erp.operational-projects'),
                ('erp.operational-projects.update', 'update', N'update · Tenant operational projects, tasks, allocations, and time entries', 'erp.operational-projects'),
                ('erp.operational-projects.delete', 'delete', N'delete · Tenant operational projects, tasks, allocations, and time entries', 'erp.operational-projects'),
                ('erp.operational-projects.execute', 'execute', N'execute · Tenant operational projects, tasks, allocations, and time entries', 'erp.operational-projects'),
                ('erp.commercial-contracts.read', 'read', N'read · Tenant commercial sales and purchase contracts', 'erp.commercial-contracts'),
                ('erp.commercial-contracts.create', 'create', N'create · Tenant commercial sales and purchase contracts', 'erp.commercial-contracts'),
                ('erp.commercial-contracts.update', 'update', N'update · Tenant commercial sales and purchase contracts', 'erp.commercial-contracts'),
                ('erp.commercial-contracts.delete', 'delete', N'delete · Tenant commercial sales and purchase contracts', 'erp.commercial-contracts'),
                ('erp.commercial-contracts.execute', 'execute', N'execute · Tenant commercial sales and purchase contracts', 'erp.commercial-contracts'),
                ('erp.inventory-tracking.read', 'read', N'read · Tenant lot and serial inventory traceability inquiries', 'erp.inventory-tracking'),
                ('erp.inventory-tracking.create', 'create', N'create · Tenant lot and serial inventory traceability inquiries', 'erp.inventory-tracking'),
                ('erp.inventory-tracking.update', 'update', N'update · Tenant lot and serial inventory traceability inquiries', 'erp.inventory-tracking'),
                ('erp.inventory-tracking.delete', 'delete', N'delete · Tenant lot and serial inventory traceability inquiries', 'erp.inventory-tracking'),
                ('erp.inventory-tracking.execute', 'execute', N'execute · Tenant lot and serial inventory traceability inquiries', 'erp.inventory-tracking')
            ) AS permission([Code], [Action], [Description], [ResourceType])
            WHERE NOT EXISTS (
                SELECT 1 FROM [PermissionDefinitions] AS existing WHERE existing.[Code] = permission.[Code]);
            """);

        // Preserve tenant-user read access already allowed by the endpoint checks.
        // Project create grants only the existing self-service time-entry path to
        // the authorization layer; every administrative project write still has
        // its existing TenantAdmin check inside OperationalProjectEndpoints.
        migrationBuilder.Sql("""
            INSERT INTO [TenantPermissionRules]
                ([Id], [TenantId], [SubjectType], [SubjectRole], [SubjectUserId], [PermissionCode], [Effect],
                 [ResourceType], [AttributeName], [AttributeOperator], [AttributeValue], [IsActive], [CreatedByUserId], [CreatedAt])
            SELECT NEWID(), tenant.[TenantId], 1, 'TenantUser', NULL, permission.[PermissionCode], 1,
                   NULL, NULL, NULL, NULL, 1, NULL, SYSUTCDATETIME()
            FROM (SELECT DISTINCT [TenantId] FROM [TenantMemberships] WHERE [Role] = 'TenantUser') AS tenant
            CROSS JOIN (VALUES
                ('erp.operational-projects.read'),
                ('erp.operational-projects.create'),
                ('erp.commercial-contracts.read'),
                ('erp.inventory-tracking.read')) AS permission([PermissionCode])
            WHERE NOT EXISTS (
                SELECT 1 FROM [TenantPermissionRules] AS existing
                WHERE existing.[TenantId] = tenant.[TenantId]
                  AND existing.[SubjectType] = 1
                  AND existing.[SubjectRole] = 'TenantUser'
                  AND existing.[PermissionCode] = permission.[PermissionCode]
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
