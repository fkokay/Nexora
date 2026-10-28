using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations;

[DbContext(typeof(PlatformDbContext))]
[Migration("20261028001000_AddCustomerCompanyHierarchy")]
public sealed class AddCustomerCompanyHierarchy : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<Guid>(
            name: "ParentCompanyId",
            table: "CustomerAccounts",
            type: "uniqueidentifier",
            nullable: true);

        migrationBuilder.CreateIndex(
            name: "IX_CustomerAccounts_TenantId_ParentCompanyId",
            table: "CustomerAccounts",
            columns: new[] { "TenantId", "ParentCompanyId" });

        migrationBuilder.AddForeignKey(
            name: "FK_CustomerAccounts_CustomerAccounts_TenantId_ParentCompanyId",
            table: "CustomerAccounts",
            columns: new[] { "TenantId", "ParentCompanyId" },
            principalTable: "CustomerAccounts",
            principalColumns: new[] { "TenantId", "Id" },
            onDelete: ReferentialAction.Restrict);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropForeignKey(
            name: "FK_CustomerAccounts_CustomerAccounts_TenantId_ParentCompanyId",
            table: "CustomerAccounts");

        migrationBuilder.DropIndex(
            name: "IX_CustomerAccounts_TenantId_ParentCompanyId",
            table: "CustomerAccounts");

        migrationBuilder.DropColumn(
            name: "ParentCompanyId",
            table: "CustomerAccounts");
    }
}
