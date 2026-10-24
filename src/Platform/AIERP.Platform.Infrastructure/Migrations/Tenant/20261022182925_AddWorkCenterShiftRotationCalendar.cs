using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Tenant
{
    /// <inheritdoc />
    public partial class AddWorkCenterShiftRotationCalendar : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ManufacturingWorkCenterShiftRotations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    WorkCenterId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    EffectiveFromDate = table.Column<DateOnly>(type: "date", nullable: false),
                    EffectiveToDate = table.Column<DateOnly>(type: "date", nullable: true),
                    Note = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ManufacturingWorkCenterShiftRotations", x => x.Id);
                    table.UniqueConstraint("AK_ManufacturingWorkCenterShiftRotations_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_ManufacturingWorkCenterShiftRotations_DateRange", "[EffectiveToDate] IS NULL OR [EffectiveToDate] >= [EffectiveFromDate]");
                    table.ForeignKey(
                        name: "FK_ManufacturingWorkCenterShiftRotations_ManufacturingWorkCenters_TenantId_WorkCenterId",
                        columns: x => new { x.TenantId, x.WorkCenterId },
                        principalTable: "ManufacturingWorkCenters",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ManufacturingWorkCenterShiftRotations_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ManufacturingWorkCenterShiftRotationDays",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShiftRotationId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DayIndex = table.Column<int>(type: "int", nullable: false),
                    CapacityMinutes = table.Column<int>(type: "int", nullable: false),
                    ShiftStartMinuteOfDay = table.Column<int>(type: "int", nullable: false),
                    ShiftEndMinuteOfDay = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ManufacturingWorkCenterShiftRotationDays", x => x.Id);
                    table.UniqueConstraint("AK_ManufacturingWorkCenterShiftRotationDays_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_ManufacturingWorkCenterShiftRotationDays_Capacity", "[CapacityMinutes] BETWEEN 0 AND 1440");
                    table.CheckConstraint("CK_ManufacturingWorkCenterShiftRotationDays_Index", "[DayIndex] BETWEEN 0 AND 365");
                    table.CheckConstraint("CK_ManufacturingWorkCenterShiftRotationDays_ShiftWindow", "[ShiftStartMinuteOfDay] BETWEEN 0 AND 1439 AND [ShiftEndMinuteOfDay] BETWEEN 1 AND 1440 AND [ShiftEndMinuteOfDay] > [ShiftStartMinuteOfDay]");
                    table.ForeignKey(
                        name: "FK_ManufacturingWorkCenterShiftRotationDays_ManufacturingWorkCenterShiftRotations_TenantId_ShiftRotationId",
                        columns: x => new { x.TenantId, x.ShiftRotationId },
                        principalTable: "ManufacturingWorkCenterShiftRotations",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ManufacturingWorkCenterShiftRotationDays_TenantId_ShiftRotationId_DayIndex",
                table: "ManufacturingWorkCenterShiftRotationDays",
                columns: new[] { "TenantId", "ShiftRotationId", "DayIndex" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ManufacturingWorkCenterShiftRotations_TenantId_WorkCenterId_EffectiveFromDate",
                table: "ManufacturingWorkCenterShiftRotations",
                columns: new[] { "TenantId", "WorkCenterId", "EffectiveFromDate" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ManufacturingWorkCenterShiftRotations_TenantId_WorkCenterId_EffectiveToDate",
                table: "ManufacturingWorkCenterShiftRotations",
                columns: new[] { "TenantId", "WorkCenterId", "EffectiveToDate" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ManufacturingWorkCenterShiftRotationDays");

            migrationBuilder.DropTable(
                name: "ManufacturingWorkCenterShiftRotations");
        }
    }
}
