using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Tenant
{
    /// <inheritdoc />
    public partial class RestrictTenantCustomerLedgerForeignKeys : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_CustomerCustomFieldValues_CustomerAccounts_TenantId_CustomerId",
                table: "CustomerCustomFieldValues");

            migrationBuilder.DropForeignKey(
                name: "FK_CustomerLedgerEntries_CustomerAccounts_TenantId_CustomerId",
                table: "CustomerLedgerEntries");

            migrationBuilder.AddForeignKey(
                name: "FK_CustomerCustomFieldValues_CustomerAccounts_TenantId_CustomerId",
                table: "CustomerCustomFieldValues",
                columns: new[] { "TenantId", "CustomerId" },
                principalTable: "CustomerAccounts",
                principalColumns: new[] { "TenantId", "Id" },
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_CustomerLedgerEntries_CustomerAccounts_TenantId_CustomerId",
                table: "CustomerLedgerEntries",
                columns: new[] { "TenantId", "CustomerId" },
                principalTable: "CustomerAccounts",
                principalColumns: new[] { "TenantId", "Id" },
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_CustomerCustomFieldValues_CustomerAccounts_TenantId_CustomerId",
                table: "CustomerCustomFieldValues");

            migrationBuilder.DropForeignKey(
                name: "FK_CustomerLedgerEntries_CustomerAccounts_TenantId_CustomerId",
                table: "CustomerLedgerEntries");

            migrationBuilder.AddForeignKey(
                name: "FK_CustomerCustomFieldValues_CustomerAccounts_TenantId_CustomerId",
                table: "CustomerCustomFieldValues",
                columns: new[] { "TenantId", "CustomerId" },
                principalTable: "CustomerAccounts",
                principalColumns: new[] { "TenantId", "Id" },
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_CustomerLedgerEntries_CustomerAccounts_TenantId_CustomerId",
                table: "CustomerLedgerEntries",
                columns: new[] { "TenantId", "CustomerId" },
                principalTable: "CustomerAccounts",
                principalColumns: new[] { "TenantId", "Id" },
                onDelete: ReferentialAction.Cascade);
        }
    }
}
