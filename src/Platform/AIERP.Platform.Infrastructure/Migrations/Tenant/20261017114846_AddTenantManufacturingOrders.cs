using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Tenant
{
    /// <inheritdoc />
    public partial class AddTenantManufacturingOrders : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "BillOfMaterials",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "varchar(48)", unicode: false, maxLength: 48, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(160)", maxLength: 160, nullable: false),
                    ProductStockItemId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    OutputQuantity = table.Column<decimal>(type: "decimal(18,4)", precision: 18, scale: 4, nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BillOfMaterials", x => x.Id);
                    table.UniqueConstraint("AK_BillOfMaterials_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_BillOfMaterials_OutputQuantityPositive", "[OutputQuantity] > 0");
                    table.ForeignKey(
                        name: "FK_BillOfMaterials_StockItems_TenantId_ProductStockItemId",
                        columns: x => new { x.TenantId, x.ProductStockItemId },
                        principalTable: "StockItems",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_BillOfMaterials_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "BillOfMaterialLines",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    BillOfMaterialId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ComponentStockItemId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Quantity = table.Column<decimal>(type: "decimal(18,4)", precision: 18, scale: 4, nullable: false),
                    ScrapPercent = table.Column<decimal>(type: "decimal(9,4)", precision: 9, scale: 4, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BillOfMaterialLines", x => x.Id);
                    table.UniqueConstraint("AK_BillOfMaterialLines_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_BillOfMaterialLines_Quantities", "[Quantity] > 0 AND [ScrapPercent] >= 0 AND [ScrapPercent] <= 100");
                    table.ForeignKey(
                        name: "FK_BillOfMaterialLines_BillOfMaterials_TenantId_BillOfMaterialId",
                        columns: x => new { x.TenantId, x.BillOfMaterialId },
                        principalTable: "BillOfMaterials",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_BillOfMaterialLines_StockItems_TenantId_ComponentStockItemId",
                        columns: x => new { x.TenantId, x.ComponentStockItemId },
                        principalTable: "StockItems",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ManufacturingOrders",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "varchar(48)", unicode: false, maxLength: 48, nullable: false),
                    BillOfMaterialId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    WarehouseId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PlannedQuantity = table.Column<decimal>(type: "decimal(18,4)", precision: 18, scale: 4, nullable: false),
                    Status = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    PlannedDate = table.Column<DateOnly>(type: "date", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CompletedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ManufacturingOrders", x => x.Id);
                    table.UniqueConstraint("AK_ManufacturingOrders_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_ManufacturingOrders_PlannedQuantityPositive", "[PlannedQuantity] > 0");
                    table.ForeignKey(
                        name: "FK_ManufacturingOrders_BillOfMaterials_TenantId_BillOfMaterialId",
                        columns: x => new { x.TenantId, x.BillOfMaterialId },
                        principalTable: "BillOfMaterials",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ManufacturingOrders_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ManufacturingOrders_Warehouses_TenantId_WarehouseId",
                        columns: x => new { x.TenantId, x.WarehouseId },
                        principalTable: "Warehouses",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ManufacturingOrderLines",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ManufacturingOrderId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ComponentStockItemId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ComponentCodeSnapshot = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    ComponentNameSnapshot = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    RequiredQuantity = table.Column<decimal>(type: "decimal(18,4)", precision: 18, scale: 4, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ManufacturingOrderLines", x => x.Id);
                    table.UniqueConstraint("AK_ManufacturingOrderLines_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_ManufacturingOrderLines_RequiredQuantityPositive", "[RequiredQuantity] > 0");
                    table.ForeignKey(
                        name: "FK_ManufacturingOrderLines_ManufacturingOrders_TenantId_ManufacturingOrderId",
                        columns: x => new { x.TenantId, x.ManufacturingOrderId },
                        principalTable: "ManufacturingOrders",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ManufacturingOrderLines_StockItems_TenantId_ComponentStockItemId",
                        columns: x => new { x.TenantId, x.ComponentStockItemId },
                        principalTable: "StockItems",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_BillOfMaterialLines_TenantId_BillOfMaterialId_ComponentStockItemId",
                table: "BillOfMaterialLines",
                columns: new[] { "TenantId", "BillOfMaterialId", "ComponentStockItemId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_BillOfMaterialLines_TenantId_ComponentStockItemId",
                table: "BillOfMaterialLines",
                columns: new[] { "TenantId", "ComponentStockItemId" });

            migrationBuilder.CreateIndex(
                name: "IX_BillOfMaterials_TenantId_Code",
                table: "BillOfMaterials",
                columns: new[] { "TenantId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_BillOfMaterials_TenantId_ProductStockItemId_IsActive",
                table: "BillOfMaterials",
                columns: new[] { "TenantId", "ProductStockItemId", "IsActive" });

            migrationBuilder.CreateIndex(
                name: "IX_ManufacturingOrderLines_TenantId_ComponentStockItemId",
                table: "ManufacturingOrderLines",
                columns: new[] { "TenantId", "ComponentStockItemId" });

            migrationBuilder.CreateIndex(
                name: "IX_ManufacturingOrderLines_TenantId_ManufacturingOrderId_ComponentStockItemId",
                table: "ManufacturingOrderLines",
                columns: new[] { "TenantId", "ManufacturingOrderId", "ComponentStockItemId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ManufacturingOrders_TenantId_BillOfMaterialId",
                table: "ManufacturingOrders",
                columns: new[] { "TenantId", "BillOfMaterialId" });

            migrationBuilder.CreateIndex(
                name: "IX_ManufacturingOrders_TenantId_Code",
                table: "ManufacturingOrders",
                columns: new[] { "TenantId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ManufacturingOrders_TenantId_Status_PlannedDate",
                table: "ManufacturingOrders",
                columns: new[] { "TenantId", "Status", "PlannedDate" });

            migrationBuilder.CreateIndex(
                name: "IX_ManufacturingOrders_TenantId_WarehouseId",
                table: "ManufacturingOrders",
                columns: new[] { "TenantId", "WarehouseId" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "BillOfMaterialLines");

            migrationBuilder.DropTable(
                name: "ManufacturingOrderLines");

            migrationBuilder.DropTable(
                name: "ManufacturingOrders");

            migrationBuilder.DropTable(
                name: "BillOfMaterials");
        }
    }
}
