using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Tenant;

/// <summary>
/// Adds planned BOM material costs and links foreign-trade dossiers to the
/// existing posted inventory documents. Existing dossiers remain compatible.
/// </summary>
public partial class AddPlannedManufacturingMaterialCostAndTradeInventoryLinks : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<decimal>(
            name: "StandardUnitCostBase", table: "BillOfMaterialLines",
            type: "decimal(18,4)", precision: 18, scale: 4, nullable: false, defaultValue: 0m);
        migrationBuilder.AddColumn<decimal>(
            name: "StandardUnitCostBaseSnapshot", table: "ManufacturingOrderLines",
            type: "decimal(18,4)", precision: 18, scale: 4, nullable: false, defaultValue: 0m);
        migrationBuilder.AddColumn<decimal>(
            name: "PlannedCostBase", table: "ManufacturingOrderLines",
            type: "decimal(18,4)", precision: 18, scale: 4, nullable: false, defaultValue: 0m);

        // New cases require a standard posted stock document; legacy cases are
        // backfilled as not-required so existing dossiers are not blocked.
        migrationBuilder.AddColumn<bool>(
            name: "InventoryPostingRequired", table: "ForeignTradeCases",
            type: "bit", nullable: false, defaultValue: false);
        migrationBuilder.AddColumn<Guid>(
            name: "PurchaseReceiptId", table: "ForeignTradeCases",
            type: "uniqueidentifier", nullable: true);
        migrationBuilder.AddColumn<Guid>(
            name: "SalesDeliveryId", table: "ForeignTradeCases",
            type: "uniqueidentifier", nullable: true);
        migrationBuilder.AddColumn<DateTimeOffset>(
            name: "InventoryDocumentLinkedAt", table: "ForeignTradeCases",
            type: "datetimeoffset", nullable: true);
        migrationBuilder.AddColumn<Guid>(
            name: "InventoryDocumentLinkedByUserId", table: "ForeignTradeCases",
            type: "uniqueidentifier", nullable: true);

        migrationBuilder.DropCheckConstraint("CK_BillOfMaterialLines_Quantities", "BillOfMaterialLines");
        migrationBuilder.DropCheckConstraint("CK_ManufacturingOrderLines_RequiredQuantityPositive", "ManufacturingOrderLines");
        migrationBuilder.Sql("EXEC(N'ALTER TABLE [BillOfMaterialLines] ADD CONSTRAINT [CK_BillOfMaterialLines_Quantities] CHECK ([Quantity] > 0 AND [ScrapPercent] >= 0 AND [ScrapPercent] <= 100 AND [StandardUnitCostBase] >= 0)')");
        migrationBuilder.Sql("EXEC(N'ALTER TABLE [ManufacturingOrderLines] ADD CONSTRAINT [CK_ManufacturingOrderLines_RequiredQuantityPositive] CHECK ([RequiredQuantity] > 0 AND [StandardUnitCostBaseSnapshot] >= 0 AND [PlannedCostBase] >= 0)')");
        migrationBuilder.Sql("EXEC(N'ALTER TABLE [ForeignTradeCases] ADD CONSTRAINT [CK_ForeignTradeCases_InventoryDocumentDirection] CHECK (([PurchaseReceiptId] IS NULL OR ([Direction] = 1 AND [SalesDeliveryId] IS NULL)) AND ([SalesDeliveryId] IS NULL OR ([Direction] = 2 AND [PurchaseReceiptId] IS NULL)))')");
        migrationBuilder.Sql("EXEC(N'ALTER TABLE [ForeignTradeCases] ADD CONSTRAINT [CK_ForeignTradeCases_InventoryAudit] CHECK (([PurchaseReceiptId] IS NULL AND [SalesDeliveryId] IS NULL AND [InventoryDocumentLinkedAt] IS NULL AND [InventoryDocumentLinkedByUserId] IS NULL) OR (([PurchaseReceiptId] IS NOT NULL OR [SalesDeliveryId] IS NOT NULL) AND [InventoryDocumentLinkedAt] IS NOT NULL))')");

        // Defer DDL that references newly added columns. SQL Server may compile
        // these statements before the preceding ALTER TABLE statements run.
        migrationBuilder.Sql("EXEC(N'CREATE UNIQUE INDEX [IX_ForeignTradeCases_TenantId_PurchaseReceiptId] ON [ForeignTradeCases] ([TenantId], [PurchaseReceiptId]) WHERE [PurchaseReceiptId] IS NOT NULL')");
        migrationBuilder.Sql("EXEC(N'CREATE UNIQUE INDEX [IX_ForeignTradeCases_TenantId_SalesDeliveryId] ON [ForeignTradeCases] ([TenantId], [SalesDeliveryId]) WHERE [SalesDeliveryId] IS NOT NULL')");
        migrationBuilder.Sql("EXEC(N'ALTER TABLE [ForeignTradeCases] ADD CONSTRAINT [FK_ForeignTradeCases_PurchaseReceipts_TenantId_PurchaseReceiptId] FOREIGN KEY ([TenantId], [PurchaseReceiptId]) REFERENCES [PurchaseReceipts] ([TenantId], [Id]) ON DELETE NO ACTION')");
        migrationBuilder.Sql("EXEC(N'ALTER TABLE [ForeignTradeCases] ADD CONSTRAINT [FK_ForeignTradeCases_SalesDeliveries_TenantId_SalesDeliveryId] FOREIGN KEY ([TenantId], [SalesDeliveryId]) REFERENCES [SalesDeliveries] ([TenantId], [Id]) ON DELETE NO ACTION')");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropForeignKey("FK_ForeignTradeCases_PurchaseReceipts_TenantId_PurchaseReceiptId", "ForeignTradeCases");
        migrationBuilder.DropForeignKey("FK_ForeignTradeCases_SalesDeliveries_TenantId_SalesDeliveryId", "ForeignTradeCases");
        migrationBuilder.DropIndex("IX_ForeignTradeCases_TenantId_PurchaseReceiptId", "ForeignTradeCases");
        migrationBuilder.DropIndex("IX_ForeignTradeCases_TenantId_SalesDeliveryId", "ForeignTradeCases");
        migrationBuilder.DropCheckConstraint("CK_BillOfMaterialLines_Quantities", "BillOfMaterialLines");
        migrationBuilder.DropCheckConstraint("CK_ManufacturingOrderLines_RequiredQuantityPositive", "ManufacturingOrderLines");
        migrationBuilder.DropCheckConstraint("CK_ForeignTradeCases_InventoryDocumentDirection", "ForeignTradeCases");
        migrationBuilder.DropCheckConstraint("CK_ForeignTradeCases_InventoryAudit", "ForeignTradeCases");
        migrationBuilder.Sql("EXEC(N'ALTER TABLE [BillOfMaterialLines] ADD CONSTRAINT [CK_BillOfMaterialLines_Quantities] CHECK ([Quantity] > 0 AND [ScrapPercent] >= 0 AND [ScrapPercent] <= 100)')");
        migrationBuilder.Sql("EXEC(N'ALTER TABLE [ManufacturingOrderLines] ADD CONSTRAINT [CK_ManufacturingOrderLines_RequiredQuantityPositive] CHECK ([RequiredQuantity] > 0)')");
        migrationBuilder.DropColumn("StandardUnitCostBase", "BillOfMaterialLines");
        migrationBuilder.DropColumn("StandardUnitCostBaseSnapshot", "ManufacturingOrderLines");
        migrationBuilder.DropColumn("PlannedCostBase", "ManufacturingOrderLines");
        migrationBuilder.DropColumn("InventoryPostingRequired", "ForeignTradeCases");
        migrationBuilder.DropColumn("PurchaseReceiptId", "ForeignTradeCases");
        migrationBuilder.DropColumn("SalesDeliveryId", "ForeignTradeCases");
        migrationBuilder.DropColumn("InventoryDocumentLinkedAt", "ForeignTradeCases");
        migrationBuilder.DropColumn("InventoryDocumentLinkedByUserId", "ForeignTradeCases");
    }
}
