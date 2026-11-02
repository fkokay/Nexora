using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Tenant
{
    /// <inheritdoc />
    public partial class AllowPartialStandaloneInvoiceReceiptInvoicing : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(name: "StandalonePurchaseReceiptLineId", table: "PurchaseInvoiceDraftLines", type: "uniqueidentifier", nullable: true);
            migrationBuilder.AddColumn<Guid>(name: "PurchaseInvoiceDraftId", table: "InventoryCostAdjustments", type: "uniqueidentifier", nullable: true);
            migrationBuilder.AddColumn<Guid>(name: "StandalonePurchaseReceiptId", table: "InventoryCostAdjustments", type: "uniqueidentifier", nullable: true);
            migrationBuilder.AddColumn<Guid>(name: "StandalonePurchaseReceiptLineId", table: "InventoryCostAdjustmentLines", type: "uniqueidentifier", nullable: true);

            migrationBuilder.CreateIndex(name: "IX_PurchaseInvoiceDraftLines_TenantId_StandalonePurchaseReceiptLineId",
                table: "PurchaseInvoiceDraftLines", columns: new[] { "TenantId", "StandalonePurchaseReceiptLineId" },
                filter: "[StandalonePurchaseReceiptLineId] IS NOT NULL");
            migrationBuilder.CreateIndex(name: "IX_InventoryCostAdjustments_TenantId_PurchaseInvoiceDraftId",
                table: "InventoryCostAdjustments", columns: new[] { "TenantId", "PurchaseInvoiceDraftId" });
            migrationBuilder.CreateIndex(name: "IX_InventoryCostAdjustments_TenantId_StandalonePurchaseReceiptId",
                table: "InventoryCostAdjustments", columns: new[] { "TenantId", "StandalonePurchaseReceiptId" });
            migrationBuilder.CreateIndex(name: "IX_InventoryCostAdjustmentLines_TenantId_StandalonePurchaseReceiptLineId",
                table: "InventoryCostAdjustmentLines", columns: new[] { "TenantId", "StandalonePurchaseReceiptLineId" });

            migrationBuilder.AddForeignKey(name: "FK_PurchaseInvoiceDraftLines_StandalonePurchaseReceiptLines_TenantId_StandalonePurchaseReceiptLineId",
                table: "PurchaseInvoiceDraftLines", columns: new[] { "TenantId", "StandalonePurchaseReceiptLineId" },
                principalTable: "StandalonePurchaseReceiptLines", principalColumns: new[] { "TenantId", "Id" }, onDelete: ReferentialAction.Restrict);
            migrationBuilder.AddForeignKey(name: "FK_InventoryCostAdjustments_PurchaseInvoiceDrafts_TenantId_PurchaseInvoiceDraftId",
                table: "InventoryCostAdjustments", columns: new[] { "TenantId", "PurchaseInvoiceDraftId" },
                principalTable: "PurchaseInvoiceDrafts", principalColumns: new[] { "TenantId", "Id" }, onDelete: ReferentialAction.Restrict);
            migrationBuilder.AddForeignKey(name: "FK_InventoryCostAdjustments_StandalonePurchaseReceipts_TenantId_StandalonePurchaseReceiptId",
                table: "InventoryCostAdjustments", columns: new[] { "TenantId", "StandalonePurchaseReceiptId" },
                principalTable: "StandalonePurchaseReceipts", principalColumns: new[] { "TenantId", "Id" }, onDelete: ReferentialAction.Restrict);
            migrationBuilder.AddForeignKey(name: "FK_InventoryCostAdjustmentLines_StandalonePurchaseReceiptLines_TenantId_StandalonePurchaseReceiptLineId",
                table: "InventoryCostAdjustmentLines", columns: new[] { "TenantId", "StandalonePurchaseReceiptLineId" },
                principalTable: "StandalonePurchaseReceiptLines", principalColumns: new[] { "TenantId", "Id" }, onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(name: "FK_PurchaseInvoiceDraftLines_StandalonePurchaseReceiptLines_TenantId_StandalonePurchaseReceiptLineId", table: "PurchaseInvoiceDraftLines");
            migrationBuilder.DropForeignKey(name: "FK_InventoryCostAdjustments_PurchaseInvoiceDrafts_TenantId_PurchaseInvoiceDraftId", table: "InventoryCostAdjustments");
            migrationBuilder.DropForeignKey(name: "FK_InventoryCostAdjustments_StandalonePurchaseReceipts_TenantId_StandalonePurchaseReceiptId", table: "InventoryCostAdjustments");
            migrationBuilder.DropForeignKey(name: "FK_InventoryCostAdjustmentLines_StandalonePurchaseReceiptLines_TenantId_StandalonePurchaseReceiptLineId", table: "InventoryCostAdjustmentLines");
            migrationBuilder.DropIndex(name: "IX_PurchaseInvoiceDraftLines_TenantId_StandalonePurchaseReceiptLineId", table: "PurchaseInvoiceDraftLines");
            migrationBuilder.DropIndex(name: "IX_InventoryCostAdjustments_TenantId_PurchaseInvoiceDraftId", table: "InventoryCostAdjustments");
            migrationBuilder.DropIndex(name: "IX_InventoryCostAdjustments_TenantId_StandalonePurchaseReceiptId", table: "InventoryCostAdjustments");
            migrationBuilder.DropIndex(name: "IX_InventoryCostAdjustmentLines_TenantId_StandalonePurchaseReceiptLineId", table: "InventoryCostAdjustmentLines");
            migrationBuilder.DropColumn(name: "StandalonePurchaseReceiptLineId", table: "PurchaseInvoiceDraftLines");
            migrationBuilder.DropColumn(name: "PurchaseInvoiceDraftId", table: "InventoryCostAdjustments");
            migrationBuilder.DropColumn(name: "StandalonePurchaseReceiptId", table: "InventoryCostAdjustments");
            migrationBuilder.DropColumn(name: "StandalonePurchaseReceiptLineId", table: "InventoryCostAdjustmentLines");
        }
    }
}
