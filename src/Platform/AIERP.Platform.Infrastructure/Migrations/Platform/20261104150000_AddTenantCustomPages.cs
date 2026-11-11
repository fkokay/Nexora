using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Platform;

[DbContext(typeof(PlatformDbContext))]
[Migration("20261104150000_AddTenantCustomPages")]
public sealed class AddTenantCustomPages : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder) => AIERP.Platform.Infrastructure.Migrations.Tenant.CustomPageSchema.Create(migrationBuilder);
    protected override void Down(MigrationBuilder migrationBuilder) => AIERP.Platform.Infrastructure.Migrations.Tenant.CustomPageSchema.Drop(migrationBuilder);
}
