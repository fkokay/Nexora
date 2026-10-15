using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddInventoryCostAdjustmentsAndUnitConversions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "EnteredQuantity",
                table: "InventoryTransactions",
                type: "decimal(18,4)",
                precision: 18,
                scale: 4,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "EnteredUnitCode",
                table: "InventoryTransactions",
                type: "nvarchar(8)",
                maxLength: 8,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "InventoryCostAdjustments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(48)", maxLength: 48, nullable: false),
                    EntryDate = table.Column<DateOnly>(type: "date", nullable: false),
                    Kind = table.Column<string>(type: "nvarchar(24)", maxLength: 24, nullable: false),
                    PurchaseReceiptId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Description = table.Column<string>(type: "nvarchar(240)", maxLength: 240, nullable: false),
                    ReversalOfId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InventoryCostAdjustments", x => x.Id);
                    table.UniqueConstraint("AK_InventoryCostAdjustments_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.ForeignKey(
                        name: "FK_InventoryCostAdjustments_InventoryCostAdjustments_TenantId_ReversalOfId",
                        columns: x => new { x.TenantId, x.ReversalOfId },
                        principalTable: "InventoryCostAdjustments",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_InventoryCostAdjustments_PurchaseReceipts_TenantId_PurchaseReceiptId",
                        columns: x => new { x.TenantId, x.PurchaseReceiptId },
                        principalTable: "PurchaseReceipts",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_InventoryCostAdjustments_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "StockItemUnitConversions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    StockItemId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UnitCode = table.Column<string>(type: "nvarchar(8)", maxLength: 8, nullable: false),
                    FactorToBase = table.Column<decimal>(type: "decimal(18,8)", precision: 18, scale: 8, nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StockItemUnitConversions", x => x.Id);
                    table.UniqueConstraint("AK_StockItemUnitConversions_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_StockItemUnitConversions_FactorPositive", "[FactorToBase] > 0");
                    table.ForeignKey(
                        name: "FK_StockItemUnitConversions_StockItems_TenantId_StockItemId",
                        columns: x => new { x.TenantId, x.StockItemId },
                        principalTable: "StockItems",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "InventoryCostAdjustmentLines",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    AdjustmentId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    WarehouseId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    StockItemId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PurchaseReceiptLineId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    QuantitySnapshot = table.Column<decimal>(type: "decimal(18,4)", precision: 18, scale: 4, nullable: false),
                    UnitCostSnapshotBase = table.Column<decimal>(type: "decimal(18,8)", precision: 18, scale: 8, nullable: true),
                    AmountBase = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InventoryCostAdjustmentLines", x => x.Id);
                    table.UniqueConstraint("AK_InventoryCostAdjustmentLines_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_InventoryCostAdjustmentLines_AmountNonZero", "[AmountBase] <> 0");
                    table.ForeignKey(
                        name: "FK_InventoryCostAdjustmentLines_InventoryCostAdjustments_TenantId_AdjustmentId",
                        columns: x => new { x.TenantId, x.AdjustmentId },
                        principalTable: "InventoryCostAdjustments",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_InventoryCostAdjustmentLines_PurchaseReceiptLines_TenantId_PurchaseReceiptLineId",
                        columns: x => new { x.TenantId, x.PurchaseReceiptLineId },
                        principalTable: "PurchaseReceiptLines",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_InventoryCostAdjustmentLines_StockItems_TenantId_StockItemId",
                        columns: x => new { x.TenantId, x.StockItemId },
                        principalTable: "StockItems",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_InventoryCostAdjustmentLines_Warehouses_TenantId_WarehouseId",
                        columns: x => new { x.TenantId, x.WarehouseId },
                        principalTable: "Warehouses",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_InventoryCostAdjustmentLines_TenantId_AdjustmentId_WarehouseId_StockItemId",
                table: "InventoryCostAdjustmentLines",
                columns: new[] { "TenantId", "AdjustmentId", "WarehouseId", "StockItemId" });

            migrationBuilder.CreateIndex(
                name: "IX_InventoryCostAdjustmentLines_TenantId_PurchaseReceiptLineId",
                table: "InventoryCostAdjustmentLines",
                columns: new[] { "TenantId", "PurchaseReceiptLineId" });

            migrationBuilder.CreateIndex(
                name: "IX_InventoryCostAdjustmentLines_TenantId_StockItemId",
                table: "InventoryCostAdjustmentLines",
                columns: new[] { "TenantId", "StockItemId" });

            migrationBuilder.CreateIndex(
                name: "IX_InventoryCostAdjustmentLines_TenantId_WarehouseId",
                table: "InventoryCostAdjustmentLines",
                columns: new[] { "TenantId", "WarehouseId" });

            migrationBuilder.CreateIndex(
                name: "IX_InventoryCostAdjustments_TenantId_Code",
                table: "InventoryCostAdjustments",
                columns: new[] { "TenantId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_InventoryCostAdjustments_TenantId_EntryDate_CreatedAt",
                table: "InventoryCostAdjustments",
                columns: new[] { "TenantId", "EntryDate", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_InventoryCostAdjustments_TenantId_PurchaseReceiptId",
                table: "InventoryCostAdjustments",
                columns: new[] { "TenantId", "PurchaseReceiptId" });

            migrationBuilder.CreateIndex(
                name: "IX_InventoryCostAdjustments_TenantId_ReversalOfId",
                table: "InventoryCostAdjustments",
                columns: new[] { "TenantId", "ReversalOfId" },
                unique: true,
                filter: "[ReversalOfId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_StockItemUnitConversions_TenantId_StockItemId_UnitCode",
                table: "StockItemUnitConversions",
                columns: new[] { "TenantId", "StockItemId", "UnitCode" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "InventoryCostAdjustmentLines");

            migrationBuilder.DropTable(
                name: "StockItemUnitConversions");

            migrationBuilder.DropTable(
                name: "InventoryCostAdjustments");

            migrationBuilder.DropColumn(
                name: "EnteredQuantity",
                table: "InventoryTransactions");

            migrationBuilder.DropColumn(
                name: "EnteredUnitCode",
                table: "InventoryTransactions");
        }
    }
}
