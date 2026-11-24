using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Platform
{
    /// <inheritdoc />
    public partial class BackfillInvoicedDeliveryLinePrices : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Orderless sales deliveries (kind "Invoice", written by POST /api/sales/invoices) take the price of their posted invoice
            // line, exactly as the invoice endpoint now stores it: VAT-exclusive (a retail, VAT-included price is divided by 1 + VAT),
            // per entered unit of the line, discount and VAT copied; the header currency is the invoice currency. Only unpriced,
            // non-free lines are touched; voided invoices are skipped (their delivery stays "fiyatsız"). Order-based lines keep the
            // order-line backfill of AddDeliveryLinePricing.
            migrationBuilder.Sql("""
                EXEC(N'
                    UPDATE l SET
                        l.[UnitPrice] = CASE WHEN l.[EnteredQuantity] IS NULL OR l.[EnteredQuantity] = 0 OR l.[EnteredQuantity] = l.[Quantity] THEN p.[BasePrice]
                                             ELSE ROUND(p.[BasePrice] * l.[Quantity] / l.[EnteredQuantity], 4) END,
                        l.[DiscountPercent] = il.[DiscountPercent],
                        l.[VatPercent] = il.[VatPercent]
                    FROM [dbo].[SalesDeliveryLines] AS l
                    INNER JOIN [dbo].[SalesDeliveries] AS d ON d.[TenantId] = l.[TenantId] AND d.[Id] = l.[DeliveryId]
                    INNER JOIN [dbo].[SalesInvoiceLines] AS il ON il.[TenantId] = l.[TenantId] AND il.[DeliveryLineId] = l.[Id]
                    INNER JOIN [dbo].[SalesInvoices] AS i ON i.[TenantId] = il.[TenantId] AND i.[Id] = il.[InvoiceId] AND i.[DeliveryId] = d.[Id]
                    CROSS APPLY (SELECT CASE WHEN i.[InvoiceType] = N''Retail'' AND il.[VatPercent] > 0
                                             THEN ROUND(il.[UnitPrice] / (1 + il.[VatPercent] / 100), 4)
                                             ELSE il.[UnitPrice] END AS [BasePrice]) AS p
                    WHERE l.[OrderId] IS NULL AND d.[OrderId] IS NULL AND l.[UnitPrice] IS NULL AND l.[IsFreeOfCharge] = 0
                        AND i.[Status] = 1 AND (d.[CurrencyCode] IS NULL OR d.[CurrencyCode] = i.[CurrencyCode]);

                    UPDATE d SET d.[CurrencyCode] = i.[CurrencyCode]
                    FROM [dbo].[SalesDeliveries] AS d
                    INNER JOIN [dbo].[SalesInvoices] AS i ON i.[TenantId] = d.[TenantId] AND i.[DeliveryId] = d.[Id]
                    WHERE d.[OrderId] IS NULL AND d.[CurrencyCode] IS NULL AND i.[Status] = 1;
                ');
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Data-only backfill: prices written here are indistinguishable from prices entered later, so Down leaves them.
        }
    }
}
