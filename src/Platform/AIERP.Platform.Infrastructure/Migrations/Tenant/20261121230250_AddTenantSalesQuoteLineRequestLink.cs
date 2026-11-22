using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Tenant
{
    /// <inheritdoc />
    public partial class AddTenantSalesQuoteLineRequestLink : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "SourceSalesRequestLineNumber",
                table: "SalesQuoteLines",
                type: "int",
                nullable: true);

            // Mevcut talepten teklif satırlarını stok kartı eşleşmesiyle talep satırına bağlar; talep durumlarına dokunmaz.
            // EXEC: idempotent betikte ALTER ile aynı batch'te derlenirken yeni sütun henüz yoktur.
            migrationBuilder.Sql(@"EXEC(N'
WITH quoteLines AS (
    SELECT ql.[TenantId], ql.[QuoteId], ql.[LineNumber], ql.[StockItemId], q.[SourceSalesRequestId],
           ROW_NUMBER() OVER (PARTITION BY ql.[TenantId], ql.[QuoteId], ql.[StockItemId] ORDER BY ql.[LineNumber]) AS [Seq]
    FROM [dbo].[SalesQuoteLines] ql
    JOIN [dbo].[SalesQuotes] q ON q.[TenantId] = ql.[TenantId] AND q.[Id] = ql.[QuoteId]
    WHERE q.[SourceSalesRequestId] IS NOT NULL),
requestLines AS (
    SELECT [TenantId], [SalesRequestId], [LineNumber], [StockItemId],
           ROW_NUMBER() OVER (PARTITION BY [TenantId], [SalesRequestId], [StockItemId] ORDER BY [LineNumber]) AS [Seq]
    FROM [dbo].[SalesRequestLines])
UPDATE target SET [SourceSalesRequestLineNumber] = rl.[LineNumber]
FROM [dbo].[SalesQuoteLines] target
JOIN quoteLines qlx ON qlx.[TenantId] = target.[TenantId] AND qlx.[QuoteId] = target.[QuoteId] AND qlx.[LineNumber] = target.[LineNumber]
JOIN requestLines rl ON rl.[TenantId] = qlx.[TenantId] AND rl.[SalesRequestId] = qlx.[SourceSalesRequestId]
    AND rl.[StockItemId] = qlx.[StockItemId] AND rl.[Seq] = qlx.[Seq];')");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "SourceSalesRequestLineNumber",
                table: "SalesQuoteLines");
        }
    }
}
