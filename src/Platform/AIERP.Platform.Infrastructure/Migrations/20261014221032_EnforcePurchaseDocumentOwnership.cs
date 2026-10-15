using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class EnforcePurchaseDocumentOwnership : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_CustomerLedgerEntries_PurchaseInvoices_TenantId_PurchaseInvoiceId",
                table: "CustomerLedgerEntries");

            migrationBuilder.DropForeignKey(
                name: "FK_CustomerLedgerEntries_SupplierPayments_TenantId_SupplierPaymentId",
                table: "CustomerLedgerEntries");

            migrationBuilder.DropForeignKey(
                name: "FK_PurchaseInvoiceLines_PurchaseReceiptLines_TenantId_PurchaseReceiptLineId",
                table: "PurchaseInvoiceLines");

            migrationBuilder.DropForeignKey(
                name: "FK_PurchaseInvoices_PurchaseReceipts_TenantId_PurchaseReceiptId",
                table: "PurchaseInvoices");

            migrationBuilder.DropForeignKey(
                name: "FK_SupplierPayments_PurchaseInvoices_TenantId_PurchaseInvoiceId",
                table: "SupplierPayments");

            migrationBuilder.DropIndex(
                name: "IX_PurchaseInvoiceLines_TenantId_PurchaseReceiptLineId",
                table: "PurchaseInvoiceLines");

            migrationBuilder.AddColumn<Guid>(
                name: "PurchaseReceiptId",
                table: "PurchaseInvoiceLines",
                type: "uniqueidentifier",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AddUniqueConstraint(
                name: "AK_SupplierPayments_TenantId_Id_SupplierId",
                table: "SupplierPayments",
                columns: new[] { "TenantId", "Id", "SupplierId" });

            migrationBuilder.AddUniqueConstraint(
                name: "AK_PurchaseReceiptLines_TenantId_ReceiptId_Id",
                table: "PurchaseReceiptLines",
                columns: new[] { "TenantId", "ReceiptId", "Id" });

            migrationBuilder.AddUniqueConstraint(
                name: "AK_PurchaseOrders_TenantId_Id_SupplierId",
                table: "PurchaseOrders",
                columns: new[] { "TenantId", "Id", "SupplierId" });

            migrationBuilder.AddUniqueConstraint(
                name: "AK_PurchaseInvoices_TenantId_Id_SupplierId",
                table: "PurchaseInvoices",
                columns: new[] { "TenantId", "Id", "SupplierId" });

            migrationBuilder.CreateIndex(
                name: "IX_SupplierPayments_TenantId_PurchaseInvoiceId_SupplierId",
                table: "SupplierPayments",
                columns: new[] { "TenantId", "PurchaseInvoiceId", "SupplierId" });

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseInvoices_TenantId_PurchaseOrderId_SupplierId",
                table: "PurchaseInvoices",
                columns: new[] { "TenantId", "PurchaseOrderId", "SupplierId" });

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseInvoices_TenantId_PurchaseReceiptId_PurchaseOrderId",
                table: "PurchaseInvoices",
                columns: new[] { "TenantId", "PurchaseReceiptId", "PurchaseOrderId" });

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseInvoiceLines_TenantId_PurchaseReceiptId_PurchaseReceiptLineId",
                table: "PurchaseInvoiceLines",
                columns: new[] { "TenantId", "PurchaseReceiptId", "PurchaseReceiptLineId" });

            migrationBuilder.CreateIndex(
                name: "IX_CustomerLedgerEntries_TenantId_PurchaseInvoiceId_CustomerId",
                table: "CustomerLedgerEntries",
                columns: new[] { "TenantId", "PurchaseInvoiceId", "CustomerId" });

            migrationBuilder.CreateIndex(
                name: "IX_CustomerLedgerEntries_TenantId_SupplierPaymentId_CustomerId",
                table: "CustomerLedgerEntries",
                columns: new[] { "TenantId", "SupplierPaymentId", "CustomerId" });

            migrationBuilder.AddForeignKey(
                name: "FK_CustomerLedgerEntries_PurchaseInvoices_TenantId_PurchaseInvoiceId_CustomerId",
                table: "CustomerLedgerEntries",
                columns: new[] { "TenantId", "PurchaseInvoiceId", "CustomerId" },
                principalTable: "PurchaseInvoices",
                principalColumns: new[] { "TenantId", "Id", "SupplierId" },
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_CustomerLedgerEntries_SupplierPayments_TenantId_SupplierPaymentId_CustomerId",
                table: "CustomerLedgerEntries",
                columns: new[] { "TenantId", "SupplierPaymentId", "CustomerId" },
                principalTable: "SupplierPayments",
                principalColumns: new[] { "TenantId", "Id", "SupplierId" },
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_PurchaseInvoiceLines_PurchaseReceiptLines_TenantId_PurchaseReceiptId_PurchaseReceiptLineId",
                table: "PurchaseInvoiceLines",
                columns: new[] { "TenantId", "PurchaseReceiptId", "PurchaseReceiptLineId" },
                principalTable: "PurchaseReceiptLines",
                principalColumns: new[] { "TenantId", "ReceiptId", "Id" },
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_PurchaseInvoices_PurchaseOrders_TenantId_PurchaseOrderId_SupplierId",
                table: "PurchaseInvoices",
                columns: new[] { "TenantId", "PurchaseOrderId", "SupplierId" },
                principalTable: "PurchaseOrders",
                principalColumns: new[] { "TenantId", "Id", "SupplierId" },
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_PurchaseInvoices_PurchaseReceipts_TenantId_PurchaseReceiptId_PurchaseOrderId",
                table: "PurchaseInvoices",
                columns: new[] { "TenantId", "PurchaseReceiptId", "PurchaseOrderId" },
                principalTable: "PurchaseReceipts",
                principalColumns: new[] { "TenantId", "Id", "PurchaseOrderId" },
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_SupplierPayments_PurchaseInvoices_TenantId_PurchaseInvoiceId_SupplierId",
                table: "SupplierPayments",
                columns: new[] { "TenantId", "PurchaseInvoiceId", "SupplierId" },
                principalTable: "PurchaseInvoices",
                principalColumns: new[] { "TenantId", "Id", "SupplierId" },
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_CustomerLedgerEntries_PurchaseInvoices_TenantId_PurchaseInvoiceId_CustomerId",
                table: "CustomerLedgerEntries");

            migrationBuilder.DropForeignKey(
                name: "FK_CustomerLedgerEntries_SupplierPayments_TenantId_SupplierPaymentId_CustomerId",
                table: "CustomerLedgerEntries");

            migrationBuilder.DropForeignKey(
                name: "FK_PurchaseInvoiceLines_PurchaseReceiptLines_TenantId_PurchaseReceiptId_PurchaseReceiptLineId",
                table: "PurchaseInvoiceLines");

            migrationBuilder.DropForeignKey(
                name: "FK_PurchaseInvoices_PurchaseOrders_TenantId_PurchaseOrderId_SupplierId",
                table: "PurchaseInvoices");

            migrationBuilder.DropForeignKey(
                name: "FK_PurchaseInvoices_PurchaseReceipts_TenantId_PurchaseReceiptId_PurchaseOrderId",
                table: "PurchaseInvoices");

            migrationBuilder.DropForeignKey(
                name: "FK_SupplierPayments_PurchaseInvoices_TenantId_PurchaseInvoiceId_SupplierId",
                table: "SupplierPayments");

            migrationBuilder.DropUniqueConstraint(
                name: "AK_SupplierPayments_TenantId_Id_SupplierId",
                table: "SupplierPayments");

            migrationBuilder.DropIndex(
                name: "IX_SupplierPayments_TenantId_PurchaseInvoiceId_SupplierId",
                table: "SupplierPayments");

            migrationBuilder.DropUniqueConstraint(
                name: "AK_PurchaseReceiptLines_TenantId_ReceiptId_Id",
                table: "PurchaseReceiptLines");

            migrationBuilder.DropUniqueConstraint(
                name: "AK_PurchaseOrders_TenantId_Id_SupplierId",
                table: "PurchaseOrders");

            migrationBuilder.DropUniqueConstraint(
                name: "AK_PurchaseInvoices_TenantId_Id_SupplierId",
                table: "PurchaseInvoices");

            migrationBuilder.DropIndex(
                name: "IX_PurchaseInvoices_TenantId_PurchaseOrderId_SupplierId",
                table: "PurchaseInvoices");

            migrationBuilder.DropIndex(
                name: "IX_PurchaseInvoices_TenantId_PurchaseReceiptId_PurchaseOrderId",
                table: "PurchaseInvoices");

            migrationBuilder.DropIndex(
                name: "IX_PurchaseInvoiceLines_TenantId_PurchaseReceiptId_PurchaseReceiptLineId",
                table: "PurchaseInvoiceLines");

            migrationBuilder.DropIndex(
                name: "IX_CustomerLedgerEntries_TenantId_PurchaseInvoiceId_CustomerId",
                table: "CustomerLedgerEntries");

            migrationBuilder.DropIndex(
                name: "IX_CustomerLedgerEntries_TenantId_SupplierPaymentId_CustomerId",
                table: "CustomerLedgerEntries");

            migrationBuilder.DropColumn(
                name: "PurchaseReceiptId",
                table: "PurchaseInvoiceLines");

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseInvoiceLines_TenantId_PurchaseReceiptLineId",
                table: "PurchaseInvoiceLines",
                columns: new[] { "TenantId", "PurchaseReceiptLineId" });

            migrationBuilder.AddForeignKey(
                name: "FK_CustomerLedgerEntries_PurchaseInvoices_TenantId_PurchaseInvoiceId",
                table: "CustomerLedgerEntries",
                columns: new[] { "TenantId", "PurchaseInvoiceId" },
                principalTable: "PurchaseInvoices",
                principalColumns: new[] { "TenantId", "Id" },
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_CustomerLedgerEntries_SupplierPayments_TenantId_SupplierPaymentId",
                table: "CustomerLedgerEntries",
                columns: new[] { "TenantId", "SupplierPaymentId" },
                principalTable: "SupplierPayments",
                principalColumns: new[] { "TenantId", "Id" },
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_PurchaseInvoiceLines_PurchaseReceiptLines_TenantId_PurchaseReceiptLineId",
                table: "PurchaseInvoiceLines",
                columns: new[] { "TenantId", "PurchaseReceiptLineId" },
                principalTable: "PurchaseReceiptLines",
                principalColumns: new[] { "TenantId", "Id" },
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_PurchaseInvoices_PurchaseReceipts_TenantId_PurchaseReceiptId",
                table: "PurchaseInvoices",
                columns: new[] { "TenantId", "PurchaseReceiptId" },
                principalTable: "PurchaseReceipts",
                principalColumns: new[] { "TenantId", "Id" },
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_SupplierPayments_PurchaseInvoices_TenantId_PurchaseInvoiceId",
                table: "SupplierPayments",
                columns: new[] { "TenantId", "PurchaseInvoiceId" },
                principalTable: "PurchaseInvoices",
                principalColumns: new[] { "TenantId", "Id" },
                onDelete: ReferentialAction.Restrict);
        }
    }
}
