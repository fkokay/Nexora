using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Tenant
{
    /// <inheritdoc />
    public partial class AddTenantDeliveryLinePricing : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "DiscountPercent",
                table: "StandaloneSalesDeliveryLines",
                type: "decimal(9,4)",
                precision: 9,
                scale: 4,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsFreeOfCharge",
                table: "StandaloneSalesDeliveryLines",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<decimal>(
                name: "UnitPrice",
                table: "StandaloneSalesDeliveryLines",
                type: "decimal(18,4)",
                precision: 18,
                scale: 4,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "VatPercent",
                table: "StandaloneSalesDeliveryLines",
                type: "decimal(9,4)",
                precision: 9,
                scale: 4,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CurrencyCode",
                table: "StandaloneSalesDeliveries",
                type: "nvarchar(3)",
                maxLength: 3,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CurrencyCode",
                table: "StandalonePurchaseReceipts",
                type: "nvarchar(3)",
                maxLength: 3,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "DiscountPercent",
                table: "StandalonePurchaseReceiptLines",
                type: "decimal(9,4)",
                precision: 9,
                scale: 4,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsFreeOfCharge",
                table: "StandalonePurchaseReceiptLines",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<decimal>(
                name: "UnitPrice",
                table: "StandalonePurchaseReceiptLines",
                type: "decimal(18,4)",
                precision: 18,
                scale: 4,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "VatPercent",
                table: "StandalonePurchaseReceiptLines",
                type: "decimal(9,4)",
                precision: 9,
                scale: 4,
                nullable: true);

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

            migrationBuilder.AddColumn<string>(
                name: "CurrencyCode",
                table: "PurchaseDeliveryNotes",
                type: "nvarchar(3)",
                maxLength: 3,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "DiscountPercent",
                table: "PurchaseDeliveryNoteLines",
                type: "decimal(9,4)",
                precision: 9,
                scale: 4,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsFreeOfCharge",
                table: "PurchaseDeliveryNoteLines",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<decimal>(
                name: "UnitPrice",
                table: "PurchaseDeliveryNoteLines",
                type: "decimal(18,4)",
                precision: 18,
                scale: 4,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "VatPercent",
                table: "PurchaseDeliveryNoteLines",
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
WHERE r.[CurrencyCode] IS NULL;");

            // Tenant-only tables: header currencies only (lines stay unpriced). Delivery notes take the PO currency, standalone
            // documents their counterparty's currency.
            migrationBuilder.Sql(@"
UPDATE n SET n.[CurrencyCode] = o.[CurrencyCode]
FROM [dbo].[PurchaseDeliveryNotes] AS n
INNER JOIN [dbo].[PurchaseOrders] AS o ON o.[TenantId] = n.[TenantId] AND o.[Id] = n.[PurchaseOrderId]
WHERE n.[CurrencyCode] IS NULL;

UPDATE d SET d.[CurrencyCode] = c.[CurrencyCode]
FROM [dbo].[StandaloneSalesDeliveries] AS d
INNER JOIN [dbo].[CustomerAccounts] AS c ON c.[TenantId] = d.[TenantId] AND c.[Id] = d.[CustomerId]
WHERE d.[CurrencyCode] IS NULL;

UPDATE r SET r.[CurrencyCode] = c.[CurrencyCode]
FROM [dbo].[StandalonePurchaseReceipts] AS r
INNER JOIN [dbo].[CustomerAccounts] AS c ON c.[TenantId] = r.[TenantId] AND c.[Id] = r.[SupplierId]
WHERE r.[CurrencyCode] IS NULL;");

            migrationBuilder.AddCheckConstraint(
                name: "CK_StandaloneSalesDeliveryLines_FreeOfChargeUnpriced",
                table: "StandaloneSalesDeliveryLines",
                sql: "[IsFreeOfCharge] = 0 OR ([UnitPrice] IS NULL AND [DiscountPercent] IS NULL AND [VatPercent] IS NULL)");

            migrationBuilder.AddCheckConstraint(
                name: "CK_StandaloneSalesDeliveryLines_PriceRanges",
                table: "StandaloneSalesDeliveryLines",
                sql: "([UnitPrice] IS NULL OR [UnitPrice] >= 0) AND ([DiscountPercent] IS NULL OR ([DiscountPercent] >= 0 AND [DiscountPercent] <= 100)) AND ([VatPercent] IS NULL OR ([VatPercent] >= 0 AND [VatPercent] <= 100))");

            migrationBuilder.AddCheckConstraint(
                name: "CK_StandalonePurchaseReceiptLines_FreeOfChargeUnpriced",
                table: "StandalonePurchaseReceiptLines",
                sql: "[IsFreeOfCharge] = 0 OR ([UnitPrice] IS NULL AND [DiscountPercent] IS NULL AND [VatPercent] IS NULL)");

            migrationBuilder.AddCheckConstraint(
                name: "CK_StandalonePurchaseReceiptLines_PriceRanges",
                table: "StandalonePurchaseReceiptLines",
                sql: "([UnitPrice] IS NULL OR [UnitPrice] >= 0) AND ([DiscountPercent] IS NULL OR ([DiscountPercent] >= 0 AND [DiscountPercent] <= 100)) AND ([VatPercent] IS NULL OR ([VatPercent] >= 0 AND [VatPercent] <= 100))");

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

            migrationBuilder.AddCheckConstraint(
                name: "CK_PurchaseDeliveryNoteLines_FreeOfChargeUnpriced",
                table: "PurchaseDeliveryNoteLines",
                sql: "[IsFreeOfCharge] = 0 OR ([UnitPrice] IS NULL AND [DiscountPercent] IS NULL AND [VatPercent] IS NULL)");

            migrationBuilder.AddCheckConstraint(
                name: "CK_PurchaseDeliveryNoteLines_PriceRanges",
                table: "PurchaseDeliveryNoteLines",
                sql: "([UnitPrice] IS NULL OR [UnitPrice] >= 0) AND ([DiscountPercent] IS NULL OR ([DiscountPercent] >= 0 AND [DiscountPercent] <= 100)) AND ([VatPercent] IS NULL OR ([VatPercent] >= 0 AND [VatPercent] <= 100))");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_StandaloneSalesDeliveryLines_FreeOfChargeUnpriced",
                table: "StandaloneSalesDeliveryLines");

            migrationBuilder.DropCheckConstraint(
                name: "CK_StandaloneSalesDeliveryLines_PriceRanges",
                table: "StandaloneSalesDeliveryLines");

            migrationBuilder.DropCheckConstraint(
                name: "CK_StandalonePurchaseReceiptLines_FreeOfChargeUnpriced",
                table: "StandalonePurchaseReceiptLines");

            migrationBuilder.DropCheckConstraint(
                name: "CK_StandalonePurchaseReceiptLines_PriceRanges",
                table: "StandalonePurchaseReceiptLines");

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

            migrationBuilder.DropCheckConstraint(
                name: "CK_PurchaseDeliveryNoteLines_FreeOfChargeUnpriced",
                table: "PurchaseDeliveryNoteLines");

            migrationBuilder.DropCheckConstraint(
                name: "CK_PurchaseDeliveryNoteLines_PriceRanges",
                table: "PurchaseDeliveryNoteLines");

            migrationBuilder.DropColumn(
                name: "DiscountPercent",
                table: "StandaloneSalesDeliveryLines");

            migrationBuilder.DropColumn(
                name: "IsFreeOfCharge",
                table: "StandaloneSalesDeliveryLines");

            migrationBuilder.DropColumn(
                name: "UnitPrice",
                table: "StandaloneSalesDeliveryLines");

            migrationBuilder.DropColumn(
                name: "VatPercent",
                table: "StandaloneSalesDeliveryLines");

            migrationBuilder.DropColumn(
                name: "CurrencyCode",
                table: "StandaloneSalesDeliveries");

            migrationBuilder.DropColumn(
                name: "CurrencyCode",
                table: "StandalonePurchaseReceipts");

            migrationBuilder.DropColumn(
                name: "DiscountPercent",
                table: "StandalonePurchaseReceiptLines");

            migrationBuilder.DropColumn(
                name: "IsFreeOfCharge",
                table: "StandalonePurchaseReceiptLines");

            migrationBuilder.DropColumn(
                name: "UnitPrice",
                table: "StandalonePurchaseReceiptLines");

            migrationBuilder.DropColumn(
                name: "VatPercent",
                table: "StandalonePurchaseReceiptLines");

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
                name: "CurrencyCode",
                table: "PurchaseDeliveryNotes");

            migrationBuilder.DropColumn(
                name: "DiscountPercent",
                table: "PurchaseDeliveryNoteLines");

            migrationBuilder.DropColumn(
                name: "IsFreeOfCharge",
                table: "PurchaseDeliveryNoteLines");

            migrationBuilder.DropColumn(
                name: "UnitPrice",
                table: "PurchaseDeliveryNoteLines");

            migrationBuilder.DropColumn(
                name: "VatPercent",
                table: "PurchaseDeliveryNoteLines");

            migrationBuilder.DropColumn(
                name: "CostPending",
                table: "InventoryTransactions");
        }
    }
}
