using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddWarehouseLocations : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "StorageLocationId",
                table: "InventoryTransactions",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "WarehouseLocations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    WarehouseId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ParentLocationId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Code = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WarehouseLocations", x => x.Id);
                    table.UniqueConstraint("AK_WarehouseLocations_TenantId_WarehouseId_Id", x => new { x.TenantId, x.WarehouseId, x.Id });
                    table.ForeignKey(
                        name: "FK_WarehouseLocations_WarehouseLocations_TenantId_WarehouseId_ParentLocationId",
                        columns: x => new { x.TenantId, x.WarehouseId, x.ParentLocationId },
                        principalTable: "WarehouseLocations",
                        principalColumns: new[] { "TenantId", "WarehouseId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_WarehouseLocations_Warehouses_TenantId_WarehouseId",
                        columns: x => new { x.TenantId, x.WarehouseId },
                        principalTable: "Warehouses",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_InventoryTransactions_TenantId_WarehouseId_StorageLocationId",
                table: "InventoryTransactions",
                columns: new[] { "TenantId", "WarehouseId", "StorageLocationId" });

            migrationBuilder.CreateIndex(
                name: "IX_WarehouseLocations_TenantId_WarehouseId_Code",
                table: "WarehouseLocations",
                columns: new[] { "TenantId", "WarehouseId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_WarehouseLocations_TenantId_WarehouseId_ParentLocationId_Code",
                table: "WarehouseLocations",
                columns: new[] { "TenantId", "WarehouseId", "ParentLocationId", "Code" });

            migrationBuilder.AddForeignKey(
                name: "FK_InventoryTransactions_WarehouseLocations_TenantId_WarehouseId_StorageLocationId",
                table: "InventoryTransactions",
                columns: new[] { "TenantId", "WarehouseId", "StorageLocationId" },
                principalTable: "WarehouseLocations",
                principalColumns: new[] { "TenantId", "WarehouseId", "Id" },
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_InventoryTransactions_WarehouseLocations_TenantId_WarehouseId_StorageLocationId",
                table: "InventoryTransactions");

            migrationBuilder.DropTable(
                name: "WarehouseLocations");

            migrationBuilder.DropIndex(
                name: "IX_InventoryTransactions_TenantId_WarehouseId_StorageLocationId",
                table: "InventoryTransactions");

            migrationBuilder.DropColumn(
                name: "StorageLocationId",
                table: "InventoryTransactions");
        }
    }
}
