using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Tenant
{
    /// <inheritdoc />
    public partial class AddStandaloneInventoryDocuments : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "StandalonePurchaseReceiptLineId",
                table: "InventoryTransactions",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "StandaloneSalesDeliveryLineId",
                table: "InventoryTransactions",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "StandalonePurchaseReceipts",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RequestId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SupplierId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    WarehouseId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    ReceiptDate = table.Column<DateOnly>(type: "date", nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StandalonePurchaseReceipts", x => x.Id);
                    table.UniqueConstraint("AK_StandalonePurchaseReceipts_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_StandalonePurchaseReceipts_Status", "[Status] IN (0,1,2)");
                    table.ForeignKey(
                        name: "FK_StandalonePurchaseReceipts_CustomerAccounts_TenantId_SupplierId",
                        columns: x => new { x.TenantId, x.SupplierId },
                        principalTable: "CustomerAccounts",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_StandalonePurchaseReceipts_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_StandalonePurchaseReceipts_Warehouses_TenantId_WarehouseId",
                        columns: x => new { x.TenantId, x.WarehouseId },
                        principalTable: "Warehouses",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "StandaloneSalesDeliveries",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RequestId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CustomerId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    WarehouseId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    DeliveryDate = table.Column<DateOnly>(type: "date", nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StandaloneSalesDeliveries", x => x.Id);
                    table.UniqueConstraint("AK_StandaloneSalesDeliveries_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_StandaloneSalesDeliveries_Status", "[Status] IN (0,1,2)");
                    table.ForeignKey(
                        name: "FK_StandaloneSalesDeliveries_CustomerAccounts_TenantId_CustomerId",
                        columns: x => new { x.TenantId, x.CustomerId },
                        principalTable: "CustomerAccounts",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_StandaloneSalesDeliveries_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_StandaloneSalesDeliveries_Warehouses_TenantId_WarehouseId",
                        columns: x => new { x.TenantId, x.WarehouseId },
                        principalTable: "Warehouses",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "StandalonePurchaseReceiptLines",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ReceiptId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    LineNumber = table.Column<int>(type: "int", nullable: false),
                    StockItemId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    StockCode = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    StockName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    UnitCode = table.Column<string>(type: "nvarchar(8)", maxLength: 8, nullable: false),
                    Quantity = table.Column<decimal>(type: "decimal(18,4)", precision: 18, scale: 4, nullable: false),
                    UnitCostBase = table.Column<decimal>(type: "decimal(18,8)", precision: 18, scale: 8, nullable: false),
                    EnteredQuantity = table.Column<decimal>(type: "decimal(18,4)", precision: 18, scale: 4, nullable: true),
                    EnteredUnitCode = table.Column<string>(type: "nvarchar(8)", maxLength: 8, nullable: true),
                    TrackingCode = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: true),
                    ExpiryDate = table.Column<DateOnly>(type: "date", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StandalonePurchaseReceiptLines", x => x.Id);
                    table.UniqueConstraint("AK_StandalonePurchaseReceiptLines_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_StandalonePurchaseReceiptLines_QuantityPositive", "[Quantity] > 0");
                    table.CheckConstraint("CK_StandalonePurchaseReceiptLines_UnitCostNonNegative", "[UnitCostBase] >= 0");
                    table.ForeignKey(
                        name: "FK_StandalonePurchaseReceiptLines_StandalonePurchaseReceipts_TenantId_ReceiptId",
                        columns: x => new { x.TenantId, x.ReceiptId },
                        principalTable: "StandalonePurchaseReceipts",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_StandalonePurchaseReceiptLines_StockItems_TenantId_StockItemId",
                        columns: x => new { x.TenantId, x.StockItemId },
                        principalTable: "StockItems",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "StandaloneSalesDeliveryLines",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DeliveryId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    LineNumber = table.Column<int>(type: "int", nullable: false),
                    StockItemId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    StockCode = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    StockName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    UnitCode = table.Column<string>(type: "nvarchar(8)", maxLength: 8, nullable: false),
                    Quantity = table.Column<decimal>(type: "decimal(18,4)", precision: 18, scale: 4, nullable: false),
                    EnteredQuantity = table.Column<decimal>(type: "decimal(18,4)", precision: 18, scale: 4, nullable: true),
                    EnteredUnitCode = table.Column<string>(type: "nvarchar(8)", maxLength: 8, nullable: true),
                    TrackingCode = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: true),
                    ExpiryDate = table.Column<DateOnly>(type: "date", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StandaloneSalesDeliveryLines", x => x.Id);
                    table.UniqueConstraint("AK_StandaloneSalesDeliveryLines_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_StandaloneSalesDeliveryLines_QuantityPositive", "[Quantity] > 0");
                    table.ForeignKey(
                        name: "FK_StandaloneSalesDeliveryLines_StandaloneSalesDeliveries_TenantId_DeliveryId",
                        columns: x => new { x.TenantId, x.DeliveryId },
                        principalTable: "StandaloneSalesDeliveries",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_StandaloneSalesDeliveryLines_StockItems_TenantId_StockItemId",
                        columns: x => new { x.TenantId, x.StockItemId },
                        principalTable: "StockItems",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_InventoryTransactions_TenantId_StandalonePurchaseReceiptLineId",
                table: "InventoryTransactions",
                columns: new[] { "TenantId", "StandalonePurchaseReceiptLineId" });

            migrationBuilder.CreateIndex(
                name: "IX_InventoryTransactions_TenantId_StandaloneSalesDeliveryLineId",
                table: "InventoryTransactions",
                columns: new[] { "TenantId", "StandaloneSalesDeliveryLineId" });

            migrationBuilder.CreateIndex(
                name: "IX_StandalonePurchaseReceiptLines_TenantId_ReceiptId_LineNumber",
                table: "StandalonePurchaseReceiptLines",
                columns: new[] { "TenantId", "ReceiptId", "LineNumber" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_StandalonePurchaseReceiptLines_TenantId_StockItemId",
                table: "StandalonePurchaseReceiptLines",
                columns: new[] { "TenantId", "StockItemId" });

            migrationBuilder.CreateIndex(
                name: "IX_StandalonePurchaseReceipts_TenantId_Code",
                table: "StandalonePurchaseReceipts",
                columns: new[] { "TenantId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_StandalonePurchaseReceipts_TenantId_RequestId",
                table: "StandalonePurchaseReceipts",
                columns: new[] { "TenantId", "RequestId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_StandalonePurchaseReceipts_TenantId_SupplierId_ReceiptDate_CreatedAt",
                table: "StandalonePurchaseReceipts",
                columns: new[] { "TenantId", "SupplierId", "ReceiptDate", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_StandalonePurchaseReceipts_TenantId_WarehouseId",
                table: "StandalonePurchaseReceipts",
                columns: new[] { "TenantId", "WarehouseId" });

            migrationBuilder.CreateIndex(
                name: "IX_StandaloneSalesDeliveries_TenantId_Code",
                table: "StandaloneSalesDeliveries",
                columns: new[] { "TenantId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_StandaloneSalesDeliveries_TenantId_CustomerId_DeliveryDate_CreatedAt",
                table: "StandaloneSalesDeliveries",
                columns: new[] { "TenantId", "CustomerId", "DeliveryDate", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_StandaloneSalesDeliveries_TenantId_RequestId",
                table: "StandaloneSalesDeliveries",
                columns: new[] { "TenantId", "RequestId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_StandaloneSalesDeliveries_TenantId_WarehouseId",
                table: "StandaloneSalesDeliveries",
                columns: new[] { "TenantId", "WarehouseId" });

            migrationBuilder.CreateIndex(
                name: "IX_StandaloneSalesDeliveryLines_TenantId_DeliveryId_LineNumber",
                table: "StandaloneSalesDeliveryLines",
                columns: new[] { "TenantId", "DeliveryId", "LineNumber" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_StandaloneSalesDeliveryLines_TenantId_StockItemId",
                table: "StandaloneSalesDeliveryLines",
                columns: new[] { "TenantId", "StockItemId" });

            migrationBuilder.AddForeignKey(
                name: "FK_InventoryTransactions_StandalonePurchaseReceiptLines_TenantId_StandalonePurchaseReceiptLineId",
                table: "InventoryTransactions",
                columns: new[] { "TenantId", "StandalonePurchaseReceiptLineId" },
                principalTable: "StandalonePurchaseReceiptLines",
                principalColumns: new[] { "TenantId", "Id" },
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_InventoryTransactions_StandaloneSalesDeliveryLines_TenantId_StandaloneSalesDeliveryLineId",
                table: "InventoryTransactions",
                columns: new[] { "TenantId", "StandaloneSalesDeliveryLineId" },
                principalTable: "StandaloneSalesDeliveryLines",
                principalColumns: new[] { "TenantId", "Id" },
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_InventoryTransactions_StandalonePurchaseReceiptLines_TenantId_StandalonePurchaseReceiptLineId",
                table: "InventoryTransactions");

            migrationBuilder.DropForeignKey(
                name: "FK_InventoryTransactions_StandaloneSalesDeliveryLines_TenantId_StandaloneSalesDeliveryLineId",
                table: "InventoryTransactions");

            migrationBuilder.DropTable(
                name: "StandalonePurchaseReceiptLines");

            migrationBuilder.DropTable(
                name: "StandaloneSalesDeliveryLines");

            migrationBuilder.DropTable(
                name: "StandalonePurchaseReceipts");

            migrationBuilder.DropTable(
                name: "StandaloneSalesDeliveries");

            migrationBuilder.DropIndex(
                name: "IX_InventoryTransactions_TenantId_StandalonePurchaseReceiptLineId",
                table: "InventoryTransactions");

            migrationBuilder.DropIndex(
                name: "IX_InventoryTransactions_TenantId_StandaloneSalesDeliveryLineId",
                table: "InventoryTransactions");

            migrationBuilder.DropColumn(
                name: "StandalonePurchaseReceiptLineId",
                table: "InventoryTransactions");

            migrationBuilder.DropColumn(
                name: "StandaloneSalesDeliveryLineId",
                table: "InventoryTransactions");
        }
    }
}
