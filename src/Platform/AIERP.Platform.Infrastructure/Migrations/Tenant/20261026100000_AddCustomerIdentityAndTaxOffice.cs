using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Tenant;

[DbContext(typeof(TenantDbContext))]
[Migration("20261026100000_AddCustomerIdentityAndTaxOffice")]
public sealed class AddCustomerIdentityAndTaxOffice : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(name: "IdentityNumber", table: "CustomerAccounts", type: "varchar(11)", unicode: false, maxLength: 11, nullable: true);
        migrationBuilder.AddColumn<string>(name: "TaxOffice", table: "CustomerAccounts", type: "nvarchar(120)", maxLength: 120, nullable: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(name: "IdentityNumber", table: "CustomerAccounts");
        migrationBuilder.DropColumn(name: "TaxOffice", table: "CustomerAccounts");
    }
}
