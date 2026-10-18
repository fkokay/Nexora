using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Tenant
{
    /// <inheritdoc />
    public partial class AddTenantManufacturingRouting : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ManufacturingWorkCenters",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "varchar(48)", unicode: false, maxLength: 48, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(160)", maxLength: 160, nullable: false),
                    CapacityMinutesPerDay = table.Column<int>(type: "int", nullable: false),
                    LaborCostPerHourBase = table.Column<decimal>(type: "decimal(18,4)", precision: 18, scale: 4, nullable: false),
                    OverheadCostPerHourBase = table.Column<decimal>(type: "decimal(18,4)", precision: 18, scale: 4, nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ManufacturingWorkCenters", x => x.Id);
                    table.UniqueConstraint("AK_ManufacturingWorkCenters_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_ManufacturingWorkCenters_Capacity", "[CapacityMinutesPerDay] > 0 AND [CapacityMinutesPerDay] <= 1440 AND [LaborCostPerHourBase] >= 0 AND [OverheadCostPerHourBase] >= 0");
                    table.ForeignKey(
                        name: "FK_ManufacturingWorkCenters_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "BillOfMaterialOperations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    BillOfMaterialId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Sequence = table.Column<int>(type: "int", nullable: false),
                    WorkCenterId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SetupMinutes = table.Column<decimal>(type: "decimal(12,2)", precision: 12, scale: 2, nullable: false),
                    RunMinutesPerOutputUnit = table.Column<decimal>(type: "decimal(12,4)", precision: 12, scale: 4, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BillOfMaterialOperations", x => x.Id);
                    table.UniqueConstraint("AK_BillOfMaterialOperations_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_BillOfMaterialOperations_Minutes", "[Sequence] > 0 AND [SetupMinutes] >= 0 AND [RunMinutesPerOutputUnit] >= 0 AND ([SetupMinutes] + [RunMinutesPerOutputUnit]) > 0");
                    table.ForeignKey(
                        name: "FK_BillOfMaterialOperations_BillOfMaterials_TenantId_BillOfMaterialId",
                        columns: x => new { x.TenantId, x.BillOfMaterialId },
                        principalTable: "BillOfMaterials",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_BillOfMaterialOperations_ManufacturingWorkCenters_TenantId_WorkCenterId",
                        columns: x => new { x.TenantId, x.WorkCenterId },
                        principalTable: "ManufacturingWorkCenters",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ManufacturingOrderOperations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ManufacturingOrderId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Sequence = table.Column<int>(type: "int", nullable: false),
                    WorkCenterId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    WorkCenterCodeSnapshot = table.Column<string>(type: "varchar(48)", unicode: false, maxLength: 48, nullable: false),
                    WorkCenterNameSnapshot = table.Column<string>(type: "nvarchar(160)", maxLength: 160, nullable: false),
                    SetupMinutes = table.Column<decimal>(type: "decimal(12,2)", precision: 12, scale: 2, nullable: false),
                    RunMinutes = table.Column<decimal>(type: "decimal(12,2)", precision: 12, scale: 2, nullable: false),
                    LaborCostPerHourBase = table.Column<decimal>(type: "decimal(18,4)", precision: 18, scale: 4, nullable: false),
                    OverheadCostPerHourBase = table.Column<decimal>(type: "decimal(18,4)", precision: 18, scale: 4, nullable: false),
                    PlannedCostBase = table.Column<decimal>(type: "decimal(18,4)", precision: 18, scale: 4, nullable: false),
                    ScheduledStartDate = table.Column<DateOnly>(type: "date", nullable: true),
                    ScheduledEndDate = table.Column<DateOnly>(type: "date", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ManufacturingOrderOperations", x => x.Id);
                    table.UniqueConstraint("AK_ManufacturingOrderOperations_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_ManufacturingOrderOperations_MinutesAndCost", "[Sequence] > 0 AND [SetupMinutes] >= 0 AND [RunMinutes] >= 0 AND [LaborCostPerHourBase] >= 0 AND [OverheadCostPerHourBase] >= 0 AND [PlannedCostBase] >= 0");
                    table.ForeignKey(
                        name: "FK_ManufacturingOrderOperations_ManufacturingOrders_TenantId_ManufacturingOrderId",
                        columns: x => new { x.TenantId, x.ManufacturingOrderId },
                        principalTable: "ManufacturingOrders",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ManufacturingOrderOperations_ManufacturingWorkCenters_TenantId_WorkCenterId",
                        columns: x => new { x.TenantId, x.WorkCenterId },
                        principalTable: "ManufacturingWorkCenters",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ManufacturingCapacityAllocations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ManufacturingOrderOperationId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    WorkCenterId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ScheduledDate = table.Column<DateOnly>(type: "date", nullable: false),
                    AllocatedMinutes = table.Column<decimal>(type: "decimal(12,2)", precision: 12, scale: 2, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ManufacturingCapacityAllocations", x => x.Id);
                    table.UniqueConstraint("AK_ManufacturingCapacityAllocations_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_ManufacturingCapacityAllocations_Minutes", "[AllocatedMinutes] > 0");
                    table.ForeignKey(
                        name: "FK_ManufacturingCapacityAllocations_ManufacturingOrderOperations_TenantId_ManufacturingOrderOperationId",
                        columns: x => new { x.TenantId, x.ManufacturingOrderOperationId },
                        principalTable: "ManufacturingOrderOperations",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ManufacturingCapacityAllocations_ManufacturingWorkCenters_TenantId_WorkCenterId",
                        columns: x => new { x.TenantId, x.WorkCenterId },
                        principalTable: "ManufacturingWorkCenters",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_BillOfMaterialOperations_TenantId_BillOfMaterialId_Sequence",
                table: "BillOfMaterialOperations",
                columns: new[] { "TenantId", "BillOfMaterialId", "Sequence" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_BillOfMaterialOperations_TenantId_WorkCenterId",
                table: "BillOfMaterialOperations",
                columns: new[] { "TenantId", "WorkCenterId" });

            migrationBuilder.CreateIndex(
                name: "IX_ManufacturingCapacityAllocations_TenantId_ManufacturingOrderOperationId_ScheduledDate",
                table: "ManufacturingCapacityAllocations",
                columns: new[] { "TenantId", "ManufacturingOrderOperationId", "ScheduledDate" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ManufacturingCapacityAllocations_TenantId_WorkCenterId_ScheduledDate",
                table: "ManufacturingCapacityAllocations",
                columns: new[] { "TenantId", "WorkCenterId", "ScheduledDate" });

            migrationBuilder.CreateIndex(
                name: "IX_ManufacturingOrderOperations_TenantId_ManufacturingOrderId_Sequence",
                table: "ManufacturingOrderOperations",
                columns: new[] { "TenantId", "ManufacturingOrderId", "Sequence" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ManufacturingOrderOperations_TenantId_WorkCenterId_ScheduledStartDate_ScheduledEndDate",
                table: "ManufacturingOrderOperations",
                columns: new[] { "TenantId", "WorkCenterId", "ScheduledStartDate", "ScheduledEndDate" });

            migrationBuilder.CreateIndex(
                name: "IX_ManufacturingWorkCenters_TenantId_Code",
                table: "ManufacturingWorkCenters",
                columns: new[] { "TenantId", "Code" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "BillOfMaterialOperations");

            migrationBuilder.DropTable(
                name: "ManufacturingCapacityAllocations");

            migrationBuilder.DropTable(
                name: "ManufacturingOrderOperations");

            migrationBuilder.DropTable(
                name: "ManufacturingWorkCenters");
        }
    }
}
