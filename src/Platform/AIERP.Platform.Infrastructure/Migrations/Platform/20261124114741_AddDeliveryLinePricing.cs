using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Platform
{
    /// <inheritdoc />
    public partial class AddDeliveryLinePricing : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "DiscountPercent",
                table: "SalesDeliveryLines",
                type: "decimal(9,4)",
                precision: 9,
                scale: 4,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsFreeOfCharge",
                table: "SalesDeliveryLines",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<decimal>(
                name: "UnitPrice",
                table: "SalesDeliveryLines",
                type: "decimal(18,4)",
                precision: 18,
                scale: 4,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "VatPercent",
                table: "SalesDeliveryLines",
                type: "decimal(9,4)",
                precision: 9,
                scale: 4,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CurrencyCode",
                table: "SalesDeliveries",
                type: "nvarchar(3)",
                maxLength: 3,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CurrencyCode",
                table: "PurchaseReceipts",
                type: "nvarchar(3)",
                maxLength: 3,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "DiscountPercent",
                table: "PurchaseReceiptLines",
                type: "decimal(9,4)",
                precision: 9,
                scale: 4,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsFreeOfCharge",
                table: "PurchaseReceiptLines",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<decimal>(
                name: "UnitPrice",
                table: "PurchaseReceiptLines",
                type: "decimal(18,4)",
                precision: 18,
                scale: 4,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "VatPercent",
                table: "PurchaseReceiptLines",
                type: "decimal(9,4)",
                precision: 9,
                scale: 4,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "CostPending",
                table: "InventoryTransactions",
                type: "bit",
                nullable: false,
                defaultValue: false);

            // Backfill (expand-only): order-based sales delivery lines and PO receipt lines take their order line price, converted
            // to the line's entered unit; the header currency is the order currency. Orderless and standalone rows stay unpriced
            // ("fiyatsız", not free). No row is marked free.
            migrationBuilder.Sql(@"
-- Ayrı derlenir (EXEC): idempotent betikte yeni sütunlar aynı toplu işte eklenir.
EXEC(N'
UPDATE l SET
    l.[UnitPrice] = CASE WHEN l.[EnteredQuantity] IS NULL OR l.[EnteredQuantity] = 0 OR l.[EnteredQuantity] = l.[Quantity] THEN o.[UnitPrice]
                         ELSE ROUND(o.[UnitPrice] * l.[Quantity] / l.[EnteredQuantity], 4) END,
    l.[DiscountPercent] = o.[DiscountPercent],
    l.[VatPercent] = o.[VatPercent]
FROM [dbo].[SalesDeliveryLines] AS l
INNER JOIN [dbo].[SalesOrderLines] AS o
    ON o.[TenantId] = l.[TenantId] AND o.[OrderId] = l.[OrderId] AND o.[LineNumber] = l.[OrderLineNumber]
WHERE l.[OrderId] IS NOT NULL AND l.[UnitPrice] IS NULL AND l.[IsFreeOfCharge] = 0;

UPDATE d SET d.[CurrencyCode] = o.[CurrencyCode]
FROM [dbo].[SalesDeliveries] AS d
INNER JOIN [dbo].[SalesOrders] AS o ON o.[TenantId] = d.[TenantId] AND o.[Id] = d.[OrderId]
WHERE d.[CurrencyCode] IS NULL;

UPDATE l SET
    l.[UnitPrice] = CASE WHEN l.[EnteredQuantity] IS NULL OR l.[EnteredQuantity] = 0 OR l.[EnteredQuantity] = l.[Quantity] THEN o.[UnitPrice]
                         ELSE ROUND(o.[UnitPrice] * l.[Quantity] / l.[EnteredQuantity], 4) END,
    l.[DiscountPercent] = o.[DiscountPercent],
    l.[VatPercent] = o.[VatPercent]
FROM [dbo].[PurchaseReceiptLines] AS l
INNER JOIN [dbo].[PurchaseOrderLines] AS o
    ON o.[TenantId] = l.[TenantId] AND o.[PurchaseOrderId] = l.[PurchaseOrderId] AND o.[LineNumber] = l.[OrderLineNumber]
WHERE l.[UnitPrice] IS NULL AND l.[IsFreeOfCharge] = 0;

UPDATE r SET r.[CurrencyCode] = o.[CurrencyCode]
FROM [dbo].[PurchaseReceipts] AS r
INNER JOIN [dbo].[PurchaseOrders] AS o ON o.[TenantId] = r.[TenantId] AND o.[Id] = r.[PurchaseOrderId]
WHERE r.[CurrencyCode] IS NULL;')
");

            migrationBuilder.AddCheckConstraint(
                name: "CK_SalesDeliveryLines_FreeOfChargeUnpriced",
                table: "SalesDeliveryLines",
                sql: "[IsFreeOfCharge] = 0 OR ([UnitPrice] IS NULL AND [DiscountPercent] IS NULL AND [VatPercent] IS NULL)");

            migrationBuilder.AddCheckConstraint(
                name: "CK_SalesDeliveryLines_PriceRanges",
                table: "SalesDeliveryLines",
                sql: "([UnitPrice] IS NULL OR [UnitPrice] >= 0) AND ([DiscountPercent] IS NULL OR ([DiscountPercent] >= 0 AND [DiscountPercent] <= 100)) AND ([VatPercent] IS NULL OR ([VatPercent] >= 0 AND [VatPercent] <= 100))");

            migrationBuilder.AddCheckConstraint(
                name: "CK_PurchaseReceiptLines_FreeOfChargeUnpriced",
                table: "PurchaseReceiptLines",
                sql: "[IsFreeOfCharge] = 0 OR ([UnitPrice] IS NULL AND [DiscountPercent] IS NULL AND [VatPercent] IS NULL)");

            migrationBuilder.AddCheckConstraint(
                name: "CK_PurchaseReceiptLines_PriceRanges",
                table: "PurchaseReceiptLines",
                sql: "([UnitPrice] IS NULL OR [UnitPrice] >= 0) AND ([DiscountPercent] IS NULL OR ([DiscountPercent] >= 0 AND [DiscountPercent] <= 100)) AND ([VatPercent] IS NULL OR ([VatPercent] >= 0 AND [VatPercent] <= 100))");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_SalesDeliveryLines_FreeOfChargeUnpriced",
                table: "SalesDeliveryLines");

            migrationBuilder.DropCheckConstraint(
                name: "CK_SalesDeliveryLines_PriceRanges",
                table: "SalesDeliveryLines");

            migrationBuilder.DropCheckConstraint(
                name: "CK_PurchaseReceiptLines_FreeOfChargeUnpriced",
                table: "PurchaseReceiptLines");

            migrationBuilder.DropCheckConstraint(
                name: "CK_PurchaseReceiptLines_PriceRanges",
                table: "PurchaseReceiptLines");

            migrationBuilder.DropColumn(
                name: "DiscountPercent",
                table: "SalesDeliveryLines");

            migrationBuilder.DropColumn(
                name: "IsFreeOfCharge",
                table: "SalesDeliveryLines");

            migrationBuilder.DropColumn(
                name: "UnitPrice",
                table: "SalesDeliveryLines");

            migrationBuilder.DropColumn(
                name: "VatPercent",
                table: "SalesDeliveryLines");

            migrationBuilder.DropColumn(
                name: "CurrencyCode",
                table: "SalesDeliveries");

            migrationBuilder.DropColumn(
                name: "CurrencyCode",
                table: "PurchaseReceipts");

            migrationBuilder.DropColumn(
                name: "DiscountPercent",
                table: "PurchaseReceiptLines");

            migrationBuilder.DropColumn(
                name: "IsFreeOfCharge",
                table: "PurchaseReceiptLines");

            migrationBuilder.DropColumn(
                name: "UnitPrice",
                table: "PurchaseReceiptLines");

            migrationBuilder.DropColumn(
                name: "VatPercent",
                table: "PurchaseReceiptLines");

            migrationBuilder.DropColumn(
                name: "CostPending",
                table: "InventoryTransactions");
        }
    }
}
