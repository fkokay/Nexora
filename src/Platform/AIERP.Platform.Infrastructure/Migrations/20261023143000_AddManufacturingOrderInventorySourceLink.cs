using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddManufacturingOrderInventorySourceLink : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "ManufacturingOrderId",
                table: "InventoryTransactions",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_InventoryTransactions_TenantId_ManufacturingOrderId_Direction_ReversalOfId",
                table: "InventoryTransactions",
                columns: new[] { "TenantId", "ManufacturingOrderId", "Direction", "ReversalOfId" });

            migrationBuilder.AddForeignKey(
                name: "FK_InventoryTransactions_ManufacturingOrders_TenantId_ManufacturingOrderId",
                table: "InventoryTransactions",
                columns: new[] { "TenantId", "ManufacturingOrderId" },
                principalTable: "ManufacturingOrders",
                principalColumns: new[] { "TenantId", "Id" },
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_InventoryTransactions_ManufacturingOrders_TenantId_ManufacturingOrderId",
                table: "InventoryTransactions");

            migrationBuilder.DropIndex(
                name: "IX_InventoryTransactions_TenantId_ManufacturingOrderId_Direction_ReversalOfId",
                table: "InventoryTransactions");

            migrationBuilder.DropColumn(
                name: "ManufacturingOrderId",
                table: "InventoryTransactions");
        }
    }
}
