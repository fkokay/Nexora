using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class EnforceSupplierReturnInvoiceOwnership : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_SupplierReturnLines_SupplierReturns_TenantId_SupplierReturnId",
                table: "SupplierReturnLines");

            migrationBuilder.AddUniqueConstraint(
                name: "AK_SupplierReturns_TenantId_Id_PurchaseInvoiceId",
                table: "SupplierReturns",
                columns: new[] { "TenantId", "Id", "PurchaseInvoiceId" });

            migrationBuilder.CreateIndex(
                name: "IX_SupplierReturnLines_TenantId_SupplierReturnId_PurchaseInvoiceId",
                table: "SupplierReturnLines",
                columns: new[] { "TenantId", "SupplierReturnId", "PurchaseInvoiceId" });

            migrationBuilder.AddForeignKey(
                name: "FK_SupplierReturnLines_SupplierReturns_TenantId_SupplierReturnId_PurchaseInvoiceId",
                table: "SupplierReturnLines",
                columns: new[] { "TenantId", "SupplierReturnId", "PurchaseInvoiceId" },
                principalTable: "SupplierReturns",
                principalColumns: new[] { "TenantId", "Id", "PurchaseInvoiceId" },
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_SupplierReturnLines_SupplierReturns_TenantId_SupplierReturnId_PurchaseInvoiceId",
                table: "SupplierReturnLines");

            migrationBuilder.DropUniqueConstraint(
                name: "AK_SupplierReturns_TenantId_Id_PurchaseInvoiceId",
                table: "SupplierReturns");

            migrationBuilder.DropIndex(
                name: "IX_SupplierReturnLines_TenantId_SupplierReturnId_PurchaseInvoiceId",
                table: "SupplierReturnLines");

            migrationBuilder.AddForeignKey(
                name: "FK_SupplierReturnLines_SupplierReturns_TenantId_SupplierReturnId",
                table: "SupplierReturnLines",
                columns: new[] { "TenantId", "SupplierReturnId" },
                principalTable: "SupplierReturns",
                principalColumns: new[] { "TenantId", "Id" },
                onDelete: ReferentialAction.Cascade);
        }
    }
}
