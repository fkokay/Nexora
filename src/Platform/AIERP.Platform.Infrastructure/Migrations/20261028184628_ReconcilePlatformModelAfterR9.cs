using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class ReconcilePlatformModelAfterR9 : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                IF OBJECT_ID(N'[ManufacturingOrderLines]', N'U') IS NOT NULL AND EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_ManufacturingOrderLines_RequiredQuantityPositive' AND parent_object_id = OBJECT_ID(N'[ManufacturingOrderLines]'))
                    ALTER TABLE [ManufacturingOrderLines] DROP CONSTRAINT [CK_ManufacturingOrderLines_RequiredQuantityPositive];
                IF OBJECT_ID(N'[BillOfMaterialLines]', N'U') IS NOT NULL AND EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_BillOfMaterialLines_Quantities' AND parent_object_id = OBJECT_ID(N'[BillOfMaterialLines]'))
                    ALTER TABLE [BillOfMaterialLines] DROP CONSTRAINT [CK_BillOfMaterialLines_Quantities];
                IF COL_LENGTH(N'BillOfMaterialLines', N'PlannedEnergyCostPerKwhBase') IS NOT NULL ALTER TABLE [BillOfMaterialLines] DROP COLUMN [PlannedEnergyCostPerKwhBase];
                IF COL_LENGTH(N'BillOfMaterialLines', N'PlannedEnergyKwhPerOutput') IS NOT NULL ALTER TABLE [BillOfMaterialLines] DROP COLUMN [PlannedEnergyKwhPerOutput];

                IF COL_LENGTH(N'ManufacturingOrderLines', N'PlannedCostBase') IS NULL ALTER TABLE [ManufacturingOrderLines] ADD [PlannedCostBase] decimal(18,4) NOT NULL CONSTRAINT [DF_MOL_PlannedCostBase_Reconcile] DEFAULT 0;
                IF COL_LENGTH(N'ManufacturingOrderLines', N'StandardUnitCostBaseSnapshot') IS NULL ALTER TABLE [ManufacturingOrderLines] ADD [StandardUnitCostBaseSnapshot] decimal(18,4) NOT NULL CONSTRAINT [DF_MOL_StandardUnitCostBaseSnapshot_Reconcile] DEFAULT 0;
                IF COL_LENGTH(N'BillOfMaterialOperations', N'PlannedEnergyCostPerKwhBase') IS NULL ALTER TABLE [BillOfMaterialOperations] ADD [PlannedEnergyCostPerKwhBase] decimal(18,6) NOT NULL CONSTRAINT [DF_BOMO_EnergyCost_Reconcile] DEFAULT 0;
                IF COL_LENGTH(N'BillOfMaterialOperations', N'PlannedEnergyKwhPerOutput') IS NULL ALTER TABLE [BillOfMaterialOperations] ADD [PlannedEnergyKwhPerOutput] decimal(14,3) NOT NULL CONSTRAINT [DF_BOMO_EnergyKwh_Reconcile] DEFAULT 0;
                IF COL_LENGTH(N'BillOfMaterialLines', N'StandardUnitCostBase') IS NULL ALTER TABLE [BillOfMaterialLines] ADD [StandardUnitCostBase] decimal(18,4) NOT NULL CONSTRAINT [DF_BOML_StandardUnitCostBase_Reconcile] DEFAULT 0;

                IF OBJECT_ID(N'[ManufacturingOrderLines]', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_ManufacturingOrderLines_RequiredQuantityPositive' AND parent_object_id = OBJECT_ID(N'[ManufacturingOrderLines]'))
                    EXEC(N'ALTER TABLE [ManufacturingOrderLines] ADD CONSTRAINT [CK_ManufacturingOrderLines_RequiredQuantityPositive] CHECK ([RequiredQuantity] > 0 AND [StandardUnitCostBaseSnapshot] >= 0 AND [PlannedCostBase] >= 0)');
                IF OBJECT_ID(N'[BillOfMaterialLines]', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_BillOfMaterialLines_Quantities' AND parent_object_id = OBJECT_ID(N'[BillOfMaterialLines]'))
                    EXEC(N'ALTER TABLE [BillOfMaterialLines] ADD CONSTRAINT [CK_BillOfMaterialLines_Quantities] CHECK ([Quantity] > 0 AND [ScrapPercent] >= 0 AND [ScrapPercent] <= 100 AND [StandardUnitCostBase] >= 0)');
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_ManufacturingOrderLines_RequiredQuantityPositive' AND parent_object_id = OBJECT_ID(N'[ManufacturingOrderLines]')) ALTER TABLE [ManufacturingOrderLines] DROP CONSTRAINT [CK_ManufacturingOrderLines_RequiredQuantityPositive];
                IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_BillOfMaterialLines_Quantities' AND parent_object_id = OBJECT_ID(N'[BillOfMaterialLines]')) ALTER TABLE [BillOfMaterialLines] DROP CONSTRAINT [CK_BillOfMaterialLines_Quantities];
                IF COL_LENGTH(N'ManufacturingOrderLines', N'PlannedCostBase') IS NOT NULL ALTER TABLE [ManufacturingOrderLines] DROP COLUMN [PlannedCostBase];
                IF COL_LENGTH(N'ManufacturingOrderLines', N'StandardUnitCostBaseSnapshot') IS NOT NULL ALTER TABLE [ManufacturingOrderLines] DROP COLUMN [StandardUnitCostBaseSnapshot];
                IF COL_LENGTH(N'BillOfMaterialOperations', N'PlannedEnergyCostPerKwhBase') IS NOT NULL ALTER TABLE [BillOfMaterialOperations] DROP COLUMN [PlannedEnergyCostPerKwhBase];
                IF COL_LENGTH(N'BillOfMaterialOperations', N'PlannedEnergyKwhPerOutput') IS NOT NULL ALTER TABLE [BillOfMaterialOperations] DROP COLUMN [PlannedEnergyKwhPerOutput];
                IF COL_LENGTH(N'BillOfMaterialLines', N'StandardUnitCostBase') IS NOT NULL ALTER TABLE [BillOfMaterialLines] DROP COLUMN [StandardUnitCostBase];
                IF COL_LENGTH(N'BillOfMaterialLines', N'PlannedEnergyCostPerKwhBase') IS NULL ALTER TABLE [BillOfMaterialLines] ADD [PlannedEnergyCostPerKwhBase] decimal(18,6) NOT NULL CONSTRAINT [DF_BOML_EnergyCost_ReconcileDown] DEFAULT 0;
                IF COL_LENGTH(N'BillOfMaterialLines', N'PlannedEnergyKwhPerOutput') IS NULL ALTER TABLE [BillOfMaterialLines] ADD [PlannedEnergyKwhPerOutput] decimal(14,3) NOT NULL CONSTRAINT [DF_BOML_EnergyKwh_ReconcileDown] DEFAULT 0;
                IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_ManufacturingOrderLines_RequiredQuantityPositive' AND parent_object_id = OBJECT_ID(N'[ManufacturingOrderLines]')) ALTER TABLE [ManufacturingOrderLines] ADD CONSTRAINT [CK_ManufacturingOrderLines_RequiredQuantityPositive] CHECK ([RequiredQuantity] > 0);
                IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_BillOfMaterialLines_Quantities' AND parent_object_id = OBJECT_ID(N'[BillOfMaterialLines]')) ALTER TABLE [BillOfMaterialLines] ADD CONSTRAINT [CK_BillOfMaterialLines_Quantities] CHECK ([Quantity] > 0 AND [ScrapPercent] >= 0 AND [ScrapPercent] <= 100);
                """);
        }
    }
}
