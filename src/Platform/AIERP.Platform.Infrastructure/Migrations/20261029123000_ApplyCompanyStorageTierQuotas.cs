using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations;

[DbContext(typeof(PlatformDbContext))]
[Migration("20261029123000_ApplyCompanyStorageTierQuotas")]
public sealed class ApplyCompanyStorageTierQuotas : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        // Keep already activated licenses valid against the approved tier catalog.
        // The change is deliberately forward-only: rolling back code must not silently
        // restore a larger storage entitlement than the current company policy allows.
        migrationBuilder.Sql("""
            UPDATE [TenantLicenses] SET [MaxStorageGb] = 50
            WHERE [Tier] = N'Medium' AND [MaxStorageGb] <> 50;

            UPDATE [TenantLicenses] SET [MaxStorageGb] = 250
            WHERE [Tier] = N'Large' AND [MaxStorageGb] <> 250;
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        // Intentionally do not widen storage quotas on rollback.
    }
}
