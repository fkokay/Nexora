using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddSalesDeliveries : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "SalesDeliveryLineId",
                table: "InventoryTransactions",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "SalesDeliveries",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RequestId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    OrderId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    WarehouseId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    DeliveryDate = table.Column<DateOnly>(type: "date", nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SalesDeliveries", x => x.Id);
                    table.UniqueConstraint("AK_SalesDeliveries_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.UniqueConstraint("AK_SalesDeliveries_TenantId_Id_OrderId", x => new { x.TenantId, x.Id, x.OrderId });
                    table.ForeignKey(
                        name: "FK_SalesDeliveries_SalesOrders_TenantId_OrderId",
                        columns: x => new { x.TenantId, x.OrderId },
                        principalTable: "SalesOrders",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SalesDeliveries_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_SalesDeliveries_Warehouses_TenantId_WarehouseId",
                        columns: x => new { x.TenantId, x.WarehouseId },
                        principalTable: "Warehouses",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "SalesDeliveryLines",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DeliveryId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    OrderId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    OrderLineNumber = table.Column<int>(type: "int", nullable: false),
                    StockItemId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    StockCode = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    StockName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    UnitCode = table.Column<string>(type: "nvarchar(8)", maxLength: 8, nullable: false),
                    Quantity = table.Column<decimal>(type: "decimal(18,4)", precision: 18, scale: 4, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SalesDeliveryLines", x => x.Id);
                    table.UniqueConstraint("AK_SalesDeliveryLines_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_SalesDeliveryLines_QuantityPositive", "[Quantity] > 0");
                    table.ForeignKey(
                        name: "FK_SalesDeliveryLines_SalesDeliveries_TenantId_DeliveryId_OrderId",
                        columns: x => new { x.TenantId, x.DeliveryId, x.OrderId },
                        principalTable: "SalesDeliveries",
                        principalColumns: new[] { "TenantId", "Id", "OrderId" },
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_SalesDeliveryLines_SalesOrderLines_TenantId_OrderId_OrderLineNumber",
                        columns: x => new { x.TenantId, x.OrderId, x.OrderLineNumber },
                        principalTable: "SalesOrderLines",
                        principalColumns: new[] { "TenantId", "OrderId", "LineNumber" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_InventoryTransactions_TenantId_SalesDeliveryLineId",
                table: "InventoryTransactions",
                columns: new[] { "TenantId", "SalesDeliveryLineId" });

            migrationBuilder.CreateIndex(
                name: "IX_SalesDeliveries_TenantId_Code",
                table: "SalesDeliveries",
                columns: new[] { "TenantId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SalesDeliveries_TenantId_OrderId_Status_DeliveryDate",
                table: "SalesDeliveries",
                columns: new[] { "TenantId", "OrderId", "Status", "DeliveryDate" });

            migrationBuilder.CreateIndex(
                name: "IX_SalesDeliveries_TenantId_RequestId",
                table: "SalesDeliveries",
                columns: new[] { "TenantId", "RequestId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SalesDeliveries_TenantId_WarehouseId",
                table: "SalesDeliveries",
                columns: new[] { "TenantId", "WarehouseId" });

            migrationBuilder.CreateIndex(
                name: "IX_SalesDeliveryLines_TenantId_DeliveryId_OrderId",
                table: "SalesDeliveryLines",
                columns: new[] { "TenantId", "DeliveryId", "OrderId" });

            migrationBuilder.CreateIndex(
                name: "IX_SalesDeliveryLines_TenantId_DeliveryId_OrderLineNumber",
                table: "SalesDeliveryLines",
                columns: new[] { "TenantId", "DeliveryId", "OrderLineNumber" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SalesDeliveryLines_TenantId_OrderId_OrderLineNumber",
                table: "SalesDeliveryLines",
                columns: new[] { "TenantId", "OrderId", "OrderLineNumber" });

            migrationBuilder.AddForeignKey(
                name: "FK_InventoryTransactions_SalesDeliveryLines_TenantId_SalesDeliveryLineId",
                table: "InventoryTransactions",
                columns: new[] { "TenantId", "SalesDeliveryLineId" },
                principalTable: "SalesDeliveryLines",
                principalColumns: new[] { "TenantId", "Id" },
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_InventoryTransactions_SalesDeliveryLines_TenantId_SalesDeliveryLineId",
                table: "InventoryTransactions");

            migrationBuilder.DropTable(
                name: "SalesDeliveryLines");

            migrationBuilder.DropTable(
                name: "SalesDeliveries");

            migrationBuilder.DropIndex(
                name: "IX_InventoryTransactions_TenantId_SalesDeliveryLineId",
                table: "InventoryTransactions");

            migrationBuilder.DropColumn(
                name: "SalesDeliveryLineId",
                table: "InventoryTransactions");
        }
    }
}
