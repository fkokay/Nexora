using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Tenant
{
    [Microsoft.EntityFrameworkCore.Infrastructure.DbContext(typeof(TenantDbContext))]
    [Migration("20261028120000_AddPlannedManufacturingEnergyCost")]
    public sealed class AddPlannedManufacturingEnergyCost : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "PlannedEnergyKwhPerOutput", table: "BillOfMaterialOperations",
                type: "decimal(14,3)", precision: 14, scale: 3, nullable: false, defaultValue: 0m);
            migrationBuilder.AddColumn<decimal>(
                name: "PlannedEnergyCostPerKwhBase", table: "BillOfMaterialOperations",
                type: "decimal(18,6)", precision: 18, scale: 6, nullable: false, defaultValue: 0m);
            // Use dynamic SQL so generated sqlcmd scripts can add the constraint
            // after the columns in the same migration batch.
            migrationBuilder.Sql("EXEC(N'ALTER TABLE [BillOfMaterialOperations] ADD CONSTRAINT [CK_BillOfMaterialOperations_PlannedEnergy] CHECK ([PlannedEnergyKwhPerOutput] >= 0 AND [PlannedEnergyCostPerKwhBase] >= 0)')");

            migrationBuilder.AddColumn<decimal>(
                name: "PlannedEnergyQuantityKwh", table: "ManufacturingOrderOperations",
                type: "decimal(14,3)", precision: 14, scale: 3, nullable: false, defaultValue: 0m);
            migrationBuilder.AddColumn<decimal>(
                name: "PlannedEnergyCostPerKwhBase", table: "ManufacturingOrderOperations",
                type: "decimal(18,6)", precision: 18, scale: 6, nullable: false, defaultValue: 0m);
            migrationBuilder.AddColumn<decimal>(
                name: "PlannedEnergyCostBase", table: "ManufacturingOrderOperations",
                type: "decimal(18,4)", precision: 18, scale: 4, nullable: false, defaultValue: 0m);
            migrationBuilder.Sql("EXEC(N'ALTER TABLE [ManufacturingOrderOperations] ADD CONSTRAINT [CK_ManufacturingOrderOperations_PlannedEnergy] CHECK ([PlannedEnergyQuantityKwh] >= 0 AND [PlannedEnergyCostPerKwhBase] >= 0 AND [PlannedEnergyCostBase] >= 0)')");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint("CK_BillOfMaterialOperations_PlannedEnergy", "BillOfMaterialOperations");
            migrationBuilder.DropCheckConstraint("CK_ManufacturingOrderOperations_PlannedEnergy", "ManufacturingOrderOperations");
            migrationBuilder.DropColumn("PlannedEnergyKwhPerOutput", "BillOfMaterialOperations");
            migrationBuilder.DropColumn("PlannedEnergyCostPerKwhBase", "BillOfMaterialOperations");
            migrationBuilder.DropColumn("PlannedEnergyQuantityKwh", "ManufacturingOrderOperations");
            migrationBuilder.DropColumn("PlannedEnergyCostPerKwhBase", "ManufacturingOrderOperations");
            migrationBuilder.DropColumn("PlannedEnergyCostBase", "ManufacturingOrderOperations");
        }
    }
}
