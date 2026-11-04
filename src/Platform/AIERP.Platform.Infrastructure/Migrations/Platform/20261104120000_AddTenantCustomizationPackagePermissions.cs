using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Platform;

[DbContext(typeof(PlatformDbContext))]
[Migration("20261104120000_AddTenantCustomizationPackagePermissions")]
public partial class AddTenantCustomizationPackagePermissions : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            INSERT INTO [dbo].[PermissionDefinitions] ([Code], [Action], [Description], [ResourceType])
            SELECT source.[Code], source.[Action], source.[Description], source.[ResourceType]
            FROM (VALUES
                (N'erp.tenant-customizations.read', N'read', N'read · Tenant low-code customization packages and snapshots', N'erp.tenant-customizations'),
                (N'erp.tenant-customizations.create', N'create', N'create · Tenant low-code customization packages and snapshots', N'erp.tenant-customizations'),
                (N'erp.tenant-customizations.update', N'update', N'update · Tenant low-code customization packages and snapshots', N'erp.tenant-customizations'),
                (N'erp.tenant-customizations.delete', N'delete', N'delete · Tenant low-code customization packages and snapshots', N'erp.tenant-customizations'),
                (N'erp.tenant-customizations.execute', N'execute', N'execute · Tenant low-code customization packages and snapshots', N'erp.tenant-customizations')
            ) AS source ([Code], [Action], [Description], [ResourceType])
            WHERE NOT EXISTS (
                SELECT 1 FROM [dbo].[PermissionDefinitions] AS existing
                WHERE existing.[Code] = source.[Code]);
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            DELETE FROM [dbo].[PermissionDefinitions]
            WHERE [Code] IN (
                N'erp.tenant-customizations.read', N'erp.tenant-customizations.create',
                N'erp.tenant-customizations.update', N'erp.tenant-customizations.delete',
                N'erp.tenant-customizations.execute');
            """);
    }
}
