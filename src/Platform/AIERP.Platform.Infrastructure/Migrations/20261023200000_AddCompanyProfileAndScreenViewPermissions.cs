using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations;

[DbContext(typeof(PlatformDbContext))]
[Migration("20261023200000_AddCompanyProfileAndScreenViewPermissions")]
public sealed class AddCompanyProfileAndScreenViewPermissions : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            INSERT INTO [PermissionDefinitions] ([Code], [Action], [Description], [ResourceType])
            SELECT permission.[Code], permission.[Action], permission.[Description], permission.[ResourceType]
            FROM (VALUES
                ('erp.tenant-company-profile.read', 'read', N'read · Tenant legal company profile', 'erp.tenant-company-profile'),
                ('erp.tenant-company-profile.create', 'create', N'create · Tenant legal company profile', 'erp.tenant-company-profile'),
                ('erp.tenant-company-profile.update', 'update', N'update · Tenant legal company profile', 'erp.tenant-company-profile'),
                ('erp.tenant-company-profile.delete', 'delete', N'delete · Tenant legal company profile', 'erp.tenant-company-profile'),
                ('erp.tenant-company-profile.execute', 'execute', N'execute · Tenant legal company profile', 'erp.tenant-company-profile'),
                ('erp.screen-views.read', 'read', N'read · Tenant built-in ERP screen layouts', 'erp.screen-views'),
                ('erp.screen-views.create', 'create', N'create · Tenant built-in ERP screen layouts', 'erp.screen-views'),
                ('erp.screen-views.update', 'update', N'update · Tenant built-in ERP screen layouts', 'erp.screen-views'),
                ('erp.screen-views.delete', 'delete', N'delete · Tenant built-in ERP screen layouts', 'erp.screen-views'),
                ('erp.screen-views.execute', 'execute', N'execute · Tenant built-in ERP screen layouts', 'erp.screen-views')
            ) AS permission([Code], [Action], [Description], [ResourceType])
            WHERE NOT EXISTS (
                SELECT 1 FROM [PermissionDefinitions] AS existing WHERE existing.[Code] = permission.[Code]);
            """);

        // Preserve the read access permitted by the endpoint membership checks.
        // Profile updates and all screen-view draft/publish operations remain
        // protected by their existing TenantAdmin checks.
        migrationBuilder.Sql("""
            INSERT INTO [TenantPermissionRules]
                ([Id], [TenantId], [SubjectType], [SubjectRole], [SubjectUserId], [PermissionCode], [Effect],
                 [ResourceType], [AttributeName], [AttributeOperator], [AttributeValue], [IsActive], [CreatedByUserId], [CreatedAt])
            SELECT NEWID(), tenant.[TenantId], 1, 'TenantUser', NULL, permission.[PermissionCode], 1,
                   NULL, NULL, NULL, NULL, 1, NULL, SYSUTCDATETIME()
            FROM (SELECT DISTINCT [TenantId] FROM [TenantMemberships] WHERE [Role] = 'TenantUser') AS tenant
            CROSS JOIN (VALUES
                ('erp.tenant-company-profile.read'),
                ('erp.screen-views.read')) AS permission([PermissionCode])
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
