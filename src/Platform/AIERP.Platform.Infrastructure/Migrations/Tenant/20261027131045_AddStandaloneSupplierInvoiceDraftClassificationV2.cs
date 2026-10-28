using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Tenant
{
    /// <inheritdoc />
    public partial class AddStandaloneSupplierInvoiceDraftClassificationV2 : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "ExpenseAccountId",
                table: "PurchaseInvoiceDraftLines",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "VatRate",
                table: "PurchaseInvoiceDraftLines",
                type: "decimal(5,2)",
                precision: 5,
                scale: 2,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseInvoiceDraftLines_TenantId_ExpenseAccountId",
                table: "PurchaseInvoiceDraftLines",
                columns: new[] { "TenantId", "ExpenseAccountId" });

            migrationBuilder.AddForeignKey(
                name: "FK_PurchaseInvoiceDraftLines_LedgerAccounts_TenantId_ExpenseAccountId",
                table: "PurchaseInvoiceDraftLines",
                columns: new[] { "TenantId", "ExpenseAccountId" },
                principalTable: "LedgerAccounts",
                principalColumns: new[] { "TenantId", "Id" },
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_PurchaseInvoiceDraftLines_LedgerAccounts_TenantId_ExpenseAccountId",
                table: "PurchaseInvoiceDraftLines");

            migrationBuilder.DropIndex(
                name: "IX_PurchaseInvoiceDraftLines_TenantId_ExpenseAccountId",
                table: "PurchaseInvoiceDraftLines");

            migrationBuilder.DropColumn(
                name: "ExpenseAccountId",
                table: "PurchaseInvoiceDraftLines");

            migrationBuilder.DropColumn(
                name: "VatRate",
                table: "PurchaseInvoiceDraftLines");
        }
    }
}
