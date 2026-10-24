using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations;

[DbContext(typeof(PlatformDbContext))]
[Migration("20261023210000_AddSalesPromotionPermissions")]
public sealed class AddSalesPromotionPermissions : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            INSERT INTO [PermissionDefinitions] ([Code], [Action], [Description], [ResourceType])
            SELECT permission.[Code], permission.[Action], permission.[Description], permission.[ResourceType]
            FROM (VALUES
                ('erp.sales-promotions.read', 'read', N'read · Sales promotion campaigns and applications', 'erp.sales-promotions'),
                ('erp.sales-promotions.create', 'create', N'create · Sales promotion campaigns and applications', 'erp.sales-promotions'),
                ('erp.sales-promotions.update', 'update', N'update · Sales promotion campaigns and applications', 'erp.sales-promotions'),
                ('erp.sales-promotions.delete', 'delete', N'delete · Sales promotion campaigns and applications', 'erp.sales-promotions'),
                ('erp.sales-promotions.execute', 'execute', N'execute · Sales promotion campaigns and applications', 'erp.sales-promotions')
            ) AS permission([Code], [Action], [Description], [ResourceType])
            WHERE NOT EXISTS (SELECT 1 FROM [PermissionDefinitions] AS existing WHERE existing.[Code] = permission.[Code]);
            """);

        // Preserve only existing unscoped quote read/update rules. Attribute-scoped
        // quote rules are intentionally not copied because promotions have different
        // resource attributes; tenants can grant those explicitly after reviewing them.
        migrationBuilder.Sql("""
            INSERT INTO [TenantPermissionRules]
                ([Id], [TenantId], [SubjectType], [SubjectRole], [SubjectUserId], [PermissionCode], [Effect],
                 [ResourceType], [AttributeName], [AttributeOperator], [AttributeValue], [IsActive], [CreatedByUserId], [CreatedAt])
            SELECT NEWID(), source.[TenantId], source.[SubjectType], source.[SubjectRole], source.[SubjectUserId],
                   CASE source.[PermissionCode]
                       WHEN 'erp.sales-quotes.read' THEN 'erp.sales-promotions.read'
                       WHEN 'erp.sales-quotes.update' THEN 'erp.sales-promotions.update'
                   END,
                   source.[Effect], 'erp.sales-promotions', NULL, NULL, NULL, source.[IsActive], source.[CreatedByUserId], source.[CreatedAt]
            FROM [TenantPermissionRules] AS source
            WHERE source.[PermissionCode] IN ('erp.sales-quotes.read', 'erp.sales-quotes.update')
              AND source.[ResourceType] IS NULL
              AND source.[AttributeName] IS NULL AND source.[AttributeOperator] IS NULL AND source.[AttributeValue] IS NULL
              AND NOT EXISTS (
                  SELECT 1 FROM [TenantPermissionRules] AS existing
                  WHERE existing.[TenantId] = source.[TenantId]
                    AND existing.[SubjectType] = source.[SubjectType]
                    AND ISNULL(existing.[SubjectRole], '') = ISNULL(source.[SubjectRole], '')
                    AND ISNULL(existing.[SubjectUserId], '00000000-0000-0000-0000-000000000000') = ISNULL(source.[SubjectUserId], '00000000-0000-0000-0000-000000000000')
                    AND existing.[PermissionCode] = CASE source.[PermissionCode]
                        WHEN 'erp.sales-quotes.read' THEN 'erp.sales-promotions.read'
                        WHEN 'erp.sales-quotes.update' THEN 'erp.sales-promotions.update'
                    END
                    AND existing.[ResourceType] = 'erp.sales-promotions'
                    AND existing.[AttributeName] IS NULL AND existing.[AttributeOperator] IS NULL AND existing.[AttributeValue] IS NULL
              );
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        // Up creates tenant policy rows only when an equivalent row is missing, so an
        // identical row may predate this migration or have been created manually.
        // TenantPermissionRules has no migration provenance marker; CreatedAt/CreatedBy
        // are user/audit fields and cannot prove ownership. Leave copied rows in place
        // on rollback rather than risk deleting an administrator's pre-existing rule.
        // Keep permission definitions too, since surviving tenant rules may reference them.
    }

}
