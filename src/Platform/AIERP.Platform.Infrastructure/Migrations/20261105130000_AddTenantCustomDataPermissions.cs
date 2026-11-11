using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations;

[DbContext(typeof(PlatformDbContext))]
[Migration("20261105130000_AddTenantCustomDataPermissions")]
public sealed class AddTenantCustomDataPermissions : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            INSERT INTO [PermissionDefinitions] ([Code], [Action], [Description], [ResourceType])
            SELECT permissions.[Code], permissions.[Action], permissions.[Description], permissions.[ResourceType]
            FROM (VALUES
                ('erp.custom-data.create', 'create', 'create · Tenant-defined logical data models and records', 'erp.custom-data'),
                ('erp.custom-data.delete', 'delete', 'delete · Tenant-defined logical data models and records', 'erp.custom-data'),
                ('erp.custom-data.execute', 'execute', 'execute · Tenant-defined logical data models and records', 'erp.custom-data'),
                ('erp.custom-data.read', 'read', 'read · Tenant-defined logical data models and records', 'erp.custom-data'),
                ('erp.custom-data.update', 'update', 'update · Tenant-defined logical data models and records', 'erp.custom-data')
            ) AS permissions ([Code], [Action], [Description], [ResourceType])
            WHERE NOT EXISTS (
                SELECT 1 FROM [PermissionDefinitions] existing WHERE existing.[Code] = permissions.[Code]
            );
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("DELETE FROM [PermissionDefinitions] WHERE [Code] IN ('erp.custom-data.create', 'erp.custom-data.delete', 'erp.custom-data.execute', 'erp.custom-data.read', 'erp.custom-data.update');");
    }
}
