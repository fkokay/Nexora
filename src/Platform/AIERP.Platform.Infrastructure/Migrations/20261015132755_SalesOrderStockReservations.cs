using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class SalesOrderStockReservations : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "ReservationId",
                table: "SalesDeliveryLines",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "SalesOrderReservations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RequestId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    OrderId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    OrderLineNumber = table.Column<int>(type: "int", nullable: false),
                    WarehouseId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Quantity = table.Column<decimal>(type: "decimal(18,4)", precision: 18, scale: 4, nullable: false),
                    FulfilledQuantity = table.Column<decimal>(type: "decimal(18,4)", precision: 18, scale: 4, nullable: false),
                    Status = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    ReleasedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SalesOrderReservations", x => x.Id);
                    table.UniqueConstraint("AK_SalesOrderReservations_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.UniqueConstraint("AK_SalesOrderReservations_TenantId_Id_OrderId_OrderLineNumber", x => new { x.TenantId, x.Id, x.OrderId, x.OrderLineNumber });
                    table.CheckConstraint("CK_SalesOrderReservations_FulfilledRange", "[FulfilledQuantity] >= 0 AND [FulfilledQuantity] <= [Quantity]");
                    table.CheckConstraint("CK_SalesOrderReservations_QuantityPositive", "[Quantity] > 0");
                    table.ForeignKey(
                        name: "FK_SalesOrderReservations_SalesOrderLines_TenantId_OrderId_OrderLineNumber",
                        columns: x => new { x.TenantId, x.OrderId, x.OrderLineNumber },
                        principalTable: "SalesOrderLines",
                        principalColumns: new[] { "TenantId", "OrderId", "LineNumber" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SalesOrderReservations_SalesOrders_TenantId_OrderId",
                        columns: x => new { x.TenantId, x.OrderId },
                        principalTable: "SalesOrders",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SalesOrderReservations_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SalesOrderReservations_Warehouses_TenantId_WarehouseId",
                        columns: x => new { x.TenantId, x.WarehouseId },
                        principalTable: "Warehouses",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_SalesDeliveryLines_TenantId_ReservationId_OrderId_OrderLineNumber",
                table: "SalesDeliveryLines",
                columns: new[] { "TenantId", "ReservationId", "OrderId", "OrderLineNumber" });

            migrationBuilder.CreateIndex(
                name: "IX_SalesOrderReservations_TenantId_OrderId_OrderLineNumber",
                table: "SalesOrderReservations",
                columns: new[] { "TenantId", "OrderId", "OrderLineNumber" },
                unique: true,
                filter: "[Status] = N'Active'");

            migrationBuilder.CreateIndex(
                name: "IX_SalesOrderReservations_TenantId_RequestId_OrderId_OrderLineNumber",
                table: "SalesOrderReservations",
                columns: new[] { "TenantId", "RequestId", "OrderId", "OrderLineNumber" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SalesOrderReservations_TenantId_WarehouseId_Status",
                table: "SalesOrderReservations",
                columns: new[] { "TenantId", "WarehouseId", "Status" });

            migrationBuilder.AddForeignKey(
                name: "FK_SalesDeliveryLines_SalesOrderReservations_TenantId_ReservationId_OrderId_OrderLineNumber",
                table: "SalesDeliveryLines",
                columns: new[] { "TenantId", "ReservationId", "OrderId", "OrderLineNumber" },
                principalTable: "SalesOrderReservations",
                principalColumns: new[] { "TenantId", "Id", "OrderId", "OrderLineNumber" },
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_SalesDeliveryLines_SalesOrderReservations_TenantId_ReservationId_OrderId_OrderLineNumber",
                table: "SalesDeliveryLines");

            migrationBuilder.DropTable(
                name: "SalesOrderReservations");

            migrationBuilder.DropIndex(
                name: "IX_SalesDeliveryLines_TenantId_ReservationId_OrderId_OrderLineNumber",
                table: "SalesDeliveryLines");

            migrationBuilder.DropColumn(
                name: "ReservationId",
                table: "SalesDeliveryLines");
        }
    }
}
