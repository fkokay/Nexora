using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddInventoryLotSerialTracking : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "EnteredQuantity",
                table: "SupplierReturnLines",
                type: "decimal(18,2)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "EnteredUnitCode",
                table: "SupplierReturnLines",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "TrackingMode",
                table: "StockItems",
                type: "nvarchar(16)",
                maxLength: 16,
                nullable: false,
                defaultValue: "None");

            migrationBuilder.AddColumn<decimal>(
                name: "EnteredQuantity",
                table: "SalesReturnLines",
                type: "decimal(18,2)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "EnteredUnitCode",
                table: "SalesReturnLines",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "EnteredQuantity",
                table: "SalesDeliveryLines",
                type: "decimal(18,2)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "EnteredUnitCode",
                table: "SalesDeliveryLines",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "EnteredQuantity",
                table: "PurchaseReceiptLines",
                type: "decimal(18,2)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "EnteredUnitCode",
                table: "PurchaseReceiptLines",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "InventoryTransactionTraces",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    InventoryTransactionId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    StockItemId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TrackingMode = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    TrackingCode = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    Quantity = table.Column<decimal>(type: "decimal(18,4)", precision: 18, scale: 4, nullable: false),
                    ExpiryDate = table.Column<DateOnly>(type: "date", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InventoryTransactionTraces", x => x.Id);
                    table.CheckConstraint("CK_InventoryTransactionTraces_QuantityPositive", "[Quantity] > 0");
                    table.ForeignKey(
                        name: "FK_InventoryTransactionTraces_InventoryTransactions_TenantId_InventoryTransactionId",
                        columns: x => new { x.TenantId, x.InventoryTransactionId },
                        principalTable: "InventoryTransactions",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_InventoryTransactionTraces_StockItems_TenantId_StockItemId",
                        columns: x => new { x.TenantId, x.StockItemId },
                        principalTable: "StockItems",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_InventoryTransactionTraces_TenantId_InventoryTransactionId",
                table: "InventoryTransactionTraces",
                columns: new[] { "TenantId", "InventoryTransactionId" });

            migrationBuilder.CreateIndex(
                name: "IX_InventoryTransactionTraces_TenantId_StockItemId_TrackingCode",
                table: "InventoryTransactionTraces",
                columns: new[] { "TenantId", "StockItemId", "TrackingCode" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "InventoryTransactionTraces");

            migrationBuilder.DropColumn(
                name: "EnteredQuantity",
                table: "SupplierReturnLines");

            migrationBuilder.DropColumn(
                name: "EnteredUnitCode",
                table: "SupplierReturnLines");

            migrationBuilder.DropColumn(
                name: "TrackingMode",
                table: "StockItems");

            migrationBuilder.DropColumn(
                name: "EnteredQuantity",
                table: "SalesReturnLines");

            migrationBuilder.DropColumn(
                name: "EnteredUnitCode",
                table: "SalesReturnLines");

            migrationBuilder.DropColumn(
                name: "EnteredQuantity",
                table: "SalesDeliveryLines");

            migrationBuilder.DropColumn(
                name: "EnteredUnitCode",
                table: "SalesDeliveryLines");

            migrationBuilder.DropColumn(
                name: "EnteredQuantity",
                table: "PurchaseReceiptLines");

            migrationBuilder.DropColumn(
                name: "EnteredUnitCode",
                table: "PurchaseReceiptLines");
        }
    }
}
