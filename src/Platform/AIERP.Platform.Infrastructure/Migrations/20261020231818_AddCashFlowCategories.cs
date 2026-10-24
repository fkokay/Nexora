using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddCashFlowCategories : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "CashFlowCategory",
                table: "FinancialAccountTransactions",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.Sql("""
                EXEC(N'
                    UPDATE [dbo].[FinancialAccountTransactions]
                    SET [CashFlowCategory] = CASE
                        WHEN [CustomerCollectionId] IS NOT NULL OR [SupplierPaymentId] IS NOT NULL THEN 1
                        WHEN [TransferId] IS NOT NULL THEN 4
                        WHEN [Description] = N''Açılış bakiyesi'' THEN 5
                        ELSE [CashFlowCategory]
                    END;
                    UPDATE reversal
                    SET reversal.[CashFlowCategory] = original.[CashFlowCategory]
                    FROM [dbo].[FinancialAccountTransactions] reversal
                    INNER JOIN [dbo].[FinancialAccountTransactions] original
                        ON original.[TenantId] = reversal.[TenantId] AND original.[Id] = reversal.[ReversalOfId]
                    WHERE original.[CashFlowCategory] IN (1, 4, 5);
                ');
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CashFlowCategory",
                table: "FinancialAccountTransactions");
        }
    }
}
