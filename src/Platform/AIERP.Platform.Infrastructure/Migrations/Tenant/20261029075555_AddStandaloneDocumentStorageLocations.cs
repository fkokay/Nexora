using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Tenant
{
    /// <inheritdoc />
    public partial class AddStandaloneDocumentStorageLocations : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "StorageLocationId",
                table: "StandaloneSalesDeliveryLines",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "StorageLocationId",
                table: "StandalonePurchaseReceiptLines",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddUniqueConstraint(
                name: "AK_WarehouseLocations_TenantId_Id",
                table: "WarehouseLocations",
                columns: new[] { "TenantId", "Id" });

            migrationBuilder.CreateIndex(
                name: "IX_StandaloneSalesDeliveryLines_TenantId_StorageLocationId",
                table: "StandaloneSalesDeliveryLines",
                columns: new[] { "TenantId", "StorageLocationId" });

            migrationBuilder.CreateIndex(
                name: "IX_StandalonePurchaseReceiptLines_TenantId_StorageLocationId",
                table: "StandalonePurchaseReceiptLines",
                columns: new[] { "TenantId", "StorageLocationId" });

            migrationBuilder.AddForeignKey(
                name: "FK_StandalonePurchaseReceiptLines_WarehouseLocations_TenantId_StorageLocationId",
                table: "StandalonePurchaseReceiptLines",
                columns: new[] { "TenantId", "StorageLocationId" },
                principalTable: "WarehouseLocations",
                principalColumns: new[] { "TenantId", "Id" },
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_StandaloneSalesDeliveryLines_WarehouseLocations_TenantId_StorageLocationId",
                table: "StandaloneSalesDeliveryLines",
                columns: new[] { "TenantId", "StorageLocationId" },
                principalTable: "WarehouseLocations",
                principalColumns: new[] { "TenantId", "Id" },
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_StandalonePurchaseReceiptLines_WarehouseLocations_TenantId_StorageLocationId",
                table: "StandalonePurchaseReceiptLines");

            migrationBuilder.DropForeignKey(
                name: "FK_StandaloneSalesDeliveryLines_WarehouseLocations_TenantId_StorageLocationId",
                table: "StandaloneSalesDeliveryLines");

            migrationBuilder.DropUniqueConstraint(
                name: "AK_WarehouseLocations_TenantId_Id",
                table: "WarehouseLocations");

            migrationBuilder.DropIndex(
                name: "IX_StandaloneSalesDeliveryLines_TenantId_StorageLocationId",
                table: "StandaloneSalesDeliveryLines");

            migrationBuilder.DropIndex(
                name: "IX_StandalonePurchaseReceiptLines_TenantId_StorageLocationId",
                table: "StandalonePurchaseReceiptLines");

            migrationBuilder.DropColumn(
                name: "StorageLocationId",
                table: "StandaloneSalesDeliveryLines");

            migrationBuilder.DropColumn(
                name: "StorageLocationId",
                table: "StandalonePurchaseReceiptLines");
        }
    }
}
