using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Platform
{
    /// <inheritdoc />
    public partial class AddSequenceDependentManufacturingSetups : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "SequenceSetupMinutes",
                table: "ManufacturingOrderOperations",
                type: "decimal(12,2)",
                precision: 12,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<string>(
                name: "SetupFamilyCodeSnapshot",
                table: "ManufacturingOrderOperations",
                type: "varchar(48)",
                unicode: false,
                maxLength: 48,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "SetupTransitionRulesSnapshotJson",
                table: "ManufacturingOrderOperations",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "[]");

            migrationBuilder.AddColumn<string>(
                name: "SetupFamilyCode",
                table: "BillOfMaterialOperations",
                type: "varchar(48)",
                unicode: false,
                maxLength: 48,
                nullable: false,
                defaultValue: "");

            migrationBuilder.CreateTable(
                name: "ManufacturingSetupTransitionRules",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    WorkCenterId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    FromSetupFamilyCode = table.Column<string>(type: "varchar(48)", unicode: false, maxLength: 48, nullable: false),
                    ToSetupFamilyCode = table.Column<string>(type: "varchar(48)", unicode: false, maxLength: 48, nullable: false),
                    SetupMinutes = table.Column<decimal>(type: "decimal(12,2)", precision: 12, scale: 2, nullable: false),
                    IsTransitionAllowed = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ManufacturingSetupTransitionRules", x => x.Id);
                    table.UniqueConstraint("AK_ManufacturingSetupTransitionRules_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_ManufacturingSetupTransitionRules_SetupMinutes", "[SetupMinutes] >= 0");
                    table.ForeignKey(
                        name: "FK_ManufacturingSetupTransitionRules_ManufacturingWorkCenters_TenantId_WorkCenterId",
                        columns: x => new { x.TenantId, x.WorkCenterId },
                        principalTable: "ManufacturingWorkCenters",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ManufacturingSetupTransitionRules_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ManufacturingSetupTransitionRules_TenantId_WorkCenterId_FromSetupFamilyCode_ToSetupFamilyCode",
                table: "ManufacturingSetupTransitionRules",
                columns: new[] { "TenantId", "WorkCenterId", "FromSetupFamilyCode", "ToSetupFamilyCode" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ManufacturingSetupTransitionRules");

            migrationBuilder.DropColumn(
                name: "SequenceSetupMinutes",
                table: "ManufacturingOrderOperations");

            migrationBuilder.DropColumn(
                name: "SetupFamilyCodeSnapshot",
                table: "ManufacturingOrderOperations");

            migrationBuilder.DropColumn(
                name: "SetupTransitionRulesSnapshotJson",
                table: "ManufacturingOrderOperations");

            migrationBuilder.DropColumn(
                name: "SetupFamilyCode",
                table: "BillOfMaterialOperations");
        }
    }
}
