using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddInventoryTransfers : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "InventoryTransferId",
                table: "InventoryTransactions",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "InventoryTransfers",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RequestId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    FromWarehouseId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ToWarehouseId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(48)", maxLength: 48, nullable: false),
                    TransferDate = table.Column<DateOnly>(type: "date", nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InventoryTransfers", x => x.Id);
                    table.UniqueConstraint("AK_InventoryTransfers_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.ForeignKey(
                        name: "FK_InventoryTransfers_Warehouses_TenantId_FromWarehouseId",
                        columns: x => new { x.TenantId, x.FromWarehouseId },
                        principalTable: "Warehouses",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_InventoryTransfers_Warehouses_TenantId_ToWarehouseId",
                        columns: x => new { x.TenantId, x.ToWarehouseId },
                        principalTable: "Warehouses",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_InventoryTransactions_TenantId_InventoryTransferId_WarehouseId_StockItemId",
                table: "InventoryTransactions",
                columns: new[] { "TenantId", "InventoryTransferId", "WarehouseId", "StockItemId" },
                unique: true,
                filter: "[InventoryTransferId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_InventoryTransfers_TenantId_Code",
                table: "InventoryTransfers",
                columns: new[] { "TenantId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_InventoryTransfers_TenantId_FromWarehouseId",
                table: "InventoryTransfers",
                columns: new[] { "TenantId", "FromWarehouseId" });

            migrationBuilder.CreateIndex(
                name: "IX_InventoryTransfers_TenantId_RequestId",
                table: "InventoryTransfers",
                columns: new[] { "TenantId", "RequestId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_InventoryTransfers_TenantId_ToWarehouseId",
                table: "InventoryTransfers",
                columns: new[] { "TenantId", "ToWarehouseId" });

            migrationBuilder.CreateIndex(
                name: "IX_InventoryTransfers_TenantId_TransferDate_CreatedAt",
                table: "InventoryTransfers",
                columns: new[] { "TenantId", "TransferDate", "CreatedAt" });

            migrationBuilder.AddForeignKey(
                name: "FK_InventoryTransactions_InventoryTransfers_TenantId_InventoryTransferId",
                table: "InventoryTransactions",
                columns: new[] { "TenantId", "InventoryTransferId" },
                principalTable: "InventoryTransfers",
                principalColumns: new[] { "TenantId", "Id" },
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_InventoryTransactions_InventoryTransfers_TenantId_InventoryTransferId",
                table: "InventoryTransactions");

            migrationBuilder.DropTable(
                name: "InventoryTransfers");

            migrationBuilder.DropIndex(
                name: "IX_InventoryTransactions_TenantId_InventoryTransferId_WarehouseId_StockItemId",
                table: "InventoryTransactions");

            migrationBuilder.DropColumn(
                name: "InventoryTransferId",
                table: "InventoryTransactions");
        }
    }
}
