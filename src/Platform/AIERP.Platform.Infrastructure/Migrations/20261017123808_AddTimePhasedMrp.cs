using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddTimePhasedMrp : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "ManufacturingLeadTimeDays",
                table: "StockItems",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "ProcurementLeadTimeDays",
                table: "StockItems",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<DateOnly>(
                name: "ExpectedReceiptDate",
                table: "PurchaseOrders",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "TargetWarehouseId",
                table: "PurchaseOrders",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddCheckConstraint(
                name: "CK_StockItems_LeadTimesNonNegative",
                table: "StockItems",
                sql: "[ProcurementLeadTimeDays] >= 0 AND [ManufacturingLeadTimeDays] >= 0");

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseOrders_TenantId_TargetWarehouseId_ExpectedReceiptDate",
                table: "PurchaseOrders",
                columns: new[] { "TenantId", "TargetWarehouseId", "ExpectedReceiptDate" });

            migrationBuilder.AddForeignKey(
                name: "FK_PurchaseOrders_Warehouses_TenantId_TargetWarehouseId",
                table: "PurchaseOrders",
                columns: new[] { "TenantId", "TargetWarehouseId" },
                principalTable: "Warehouses",
                principalColumns: new[] { "TenantId", "Id" },
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_PurchaseOrders_Warehouses_TenantId_TargetWarehouseId",
                table: "PurchaseOrders");

            migrationBuilder.DropCheckConstraint(
                name: "CK_StockItems_LeadTimesNonNegative",
                table: "StockItems");

            migrationBuilder.DropIndex(
                name: "IX_PurchaseOrders_TenantId_TargetWarehouseId_ExpectedReceiptDate",
                table: "PurchaseOrders");

            migrationBuilder.DropColumn(
                name: "ManufacturingLeadTimeDays",
                table: "StockItems");

            migrationBuilder.DropColumn(
                name: "ProcurementLeadTimeDays",
                table: "StockItems");

            migrationBuilder.DropColumn(
                name: "ExpectedReceiptDate",
                table: "PurchaseOrders");

            migrationBuilder.DropColumn(
                name: "TargetWarehouseId",
                table: "PurchaseOrders");
        }
    }
}
