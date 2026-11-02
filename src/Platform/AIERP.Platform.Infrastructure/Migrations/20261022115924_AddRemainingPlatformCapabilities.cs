using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddRemainingPlatformCapabilities : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "MinimumWaitDaysAfterPrevious",
                table: "ManufacturingOrderOperations",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "MinimumWaitDaysAfterPrevious",
                table: "BillOfMaterialOperations",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateTable(
                name: "BillOfMaterialOperationWorkCenterOptions",
                columns: table => new
                {
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    BillOfMaterialOperationId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    WorkCenterId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    IsPreferred = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BillOfMaterialOperationWorkCenterOptions", x => new { x.TenantId, x.BillOfMaterialOperationId, x.WorkCenterId });
                    table.ForeignKey(
                        name: "FK_BillOfMaterialOperationWorkCenterOptions_BillOfMaterialOperations_TenantId_BillOfMaterialOperationId",
                        columns: x => new { x.TenantId, x.BillOfMaterialOperationId },
                        principalTable: "BillOfMaterialOperations",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_BillOfMaterialOperationWorkCenterOptions_ManufacturingWorkCenters_TenantId_WorkCenterId",
                        columns: x => new { x.TenantId, x.WorkCenterId },
                        principalTable: "ManufacturingWorkCenters",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ManufacturingOrderOperationWorkCenterOptions",
                columns: table => new
                {
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ManufacturingOrderOperationId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    WorkCenterId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    IsPreferred = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ManufacturingOrderOperationWorkCenterOptions", x => new { x.TenantId, x.ManufacturingOrderOperationId, x.WorkCenterId });
                    table.ForeignKey(
                        name: "FK_ManufacturingOrderOperationWorkCenterOptions_ManufacturingOrderOperations_TenantId_ManufacturingOrderOperationId",
                        columns: x => new { x.TenantId, x.ManufacturingOrderOperationId },
                        principalTable: "ManufacturingOrderOperations",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ManufacturingOrderOperationWorkCenterOptions_ManufacturingWorkCenters_TenantId_WorkCenterId",
                        columns: x => new { x.TenantId, x.WorkCenterId },
                        principalTable: "ManufacturingWorkCenters",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_BillOfMaterialOperationWorkCenterOptions_TenantId_BillOfMaterialOperationId_IsPreferred",
                table: "BillOfMaterialOperationWorkCenterOptions",
                columns: new[] { "TenantId", "BillOfMaterialOperationId", "IsPreferred" },
                unique: true,
                filter: "[IsPreferred] = 1");

            migrationBuilder.CreateIndex(
                name: "IX_BillOfMaterialOperationWorkCenterOptions_TenantId_WorkCenterId",
                table: "BillOfMaterialOperationWorkCenterOptions",
                columns: new[] { "TenantId", "WorkCenterId" });

            migrationBuilder.CreateIndex(
                name: "IX_ManufacturingOrderOperationWorkCenterOptions_TenantId_ManufacturingOrderOperationId_IsPreferred",
                table: "ManufacturingOrderOperationWorkCenterOptions",
                columns: new[] { "TenantId", "ManufacturingOrderOperationId", "IsPreferred" },
                unique: true,
                filter: "[IsPreferred] = 1");

            migrationBuilder.CreateIndex(
                name: "IX_ManufacturingOrderOperationWorkCenterOptions_TenantId_WorkCenterId",
                table: "ManufacturingOrderOperationWorkCenterOptions",
                columns: new[] { "TenantId", "WorkCenterId" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "BillOfMaterialOperationWorkCenterOptions");

            migrationBuilder.DropTable(
                name: "ManufacturingOrderOperationWorkCenterOptions");

            migrationBuilder.DropColumn(
                name: "MinimumWaitDaysAfterPrevious",
                table: "ManufacturingOrderOperations");

            migrationBuilder.DropColumn(
                name: "MinimumWaitDaysAfterPrevious",
                table: "BillOfMaterialOperations");
        }
    }
}
