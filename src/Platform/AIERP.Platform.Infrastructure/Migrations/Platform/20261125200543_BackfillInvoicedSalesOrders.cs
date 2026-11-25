using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Platform
{
    /// <inheritdoc />
    public partial class BackfillInvoicedSalesOrders : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Belge kuralları: a shipped order (Fulfilled = 2) whose every posted delivery (Posted = 1) has a posted invoice
            // (Posted = 1) is "Faturalandı" (Invoiced = 6). Idempotent: only Fulfilled rows change; data only, no column is added.
            // Down is a no-op on purpose: reverting the code still reads 6 as an unknown status, so restore 6 -> 2 by hand if needed.
            migrationBuilder.Sql("""
                EXEC(N'
                    UPDATE o SET o.[Status] = 6
                    FROM [dbo].[SalesOrders] AS o
                    WHERE o.[Status] = 2
                        AND EXISTS (SELECT 1 FROM [dbo].[SalesDeliveries] AS d
                                    WHERE d.[TenantId] = o.[TenantId] AND d.[OrderId] = o.[Id] AND d.[Status] = 1)
                        AND NOT EXISTS (SELECT 1 FROM [dbo].[SalesDeliveries] AS d
                                        WHERE d.[TenantId] = o.[TenantId] AND d.[OrderId] = o.[Id] AND d.[Status] = 1
                                            AND NOT EXISTS (SELECT 1 FROM [dbo].[SalesInvoices] AS i
                                                            WHERE i.[TenantId] = d.[TenantId] AND i.[DeliveryId] = d.[Id] AND i.[Status] = 1));
                ');
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {

        }
    }
}
