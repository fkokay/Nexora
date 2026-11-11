using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Tenant
{
    /// <inheritdoc />
    public partial class AddSalesQuoteLineCurrency : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "EnteredCurrencyCode",
                table: "SalesQuoteLines",
                type: "varchar(3)",
                unicode: false,
                maxLength: 3,
                nullable: false,
                defaultValue: "TRY");

            migrationBuilder.AddColumn<string>(
                name: "EnteredUnitCode",
                table: "SalesQuoteLines",
                type: "nvarchar(8)",
                maxLength: 8,
                nullable: false,
                defaultValue: "EA");

            migrationBuilder.AddColumn<decimal>(
                name: "EnteredUnitPrice",
                table: "SalesQuoteLines",
                type: "decimal(18,4)",
                precision: 18,
                scale: 4,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "ExchangeRateToQuoteCurrency",
                table: "SalesQuoteLines",
                type: "decimal(18,8)",
                precision: 18,
                scale: 8,
                nullable: false,
                defaultValue: 1m);

            migrationBuilder.Sql("""
                UPDATE line
                SET EnteredCurrencyCode = COALESCE(NULLIF(quote.CurrencyCode, ''), 'TRY'),
                    EnteredUnitPrice = line.UnitPrice,
                    EnteredUnitCode = COALESCE(NULLIF(line.UnitCode, ''), 'EA'),
                    ExchangeRateToQuoteCurrency = 1
                FROM dbo.SalesQuoteLines AS line
                INNER JOIN dbo.SalesQuotes AS quote
                    ON quote.TenantId = line.TenantId AND quote.Id = line.QuoteId;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "EnteredCurrencyCode",
                table: "SalesQuoteLines");

            migrationBuilder.DropColumn(
                name: "EnteredUnitCode",
                table: "SalesQuoteLines");

            migrationBuilder.DropColumn(
                name: "EnteredUnitPrice",
                table: "SalesQuoteLines");

            migrationBuilder.DropColumn(
                name: "ExchangeRateToQuoteCurrency",
                table: "SalesQuoteLines");
        }
    }
}
