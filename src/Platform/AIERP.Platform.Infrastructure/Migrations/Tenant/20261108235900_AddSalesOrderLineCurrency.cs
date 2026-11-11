using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Tenant
{
    /// <inheritdoc />
    public partial class AddSalesOrderLineCurrency : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "EnteredCurrencyCode",
                table: "SalesOrderLines",
                type: "varchar(3)",
                unicode: false,
                maxLength: 3,
                nullable: false,
                defaultValue: "TRY");

            migrationBuilder.AddColumn<string>(
                name: "EnteredUnitCode",
                table: "SalesOrderLines",
                type: "nvarchar(8)",
                maxLength: 8,
                nullable: false,
                defaultValue: "EA");

            migrationBuilder.AddColumn<decimal>(
                name: "EnteredUnitPrice",
                table: "SalesOrderLines",
                type: "decimal(18,4)",
                precision: 18,
                scale: 4,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "ExchangeRateToOrderCurrency",
                table: "SalesOrderLines",
                type: "decimal(18,8)",
                precision: 18,
                scale: 8,
                nullable: false,
                defaultValue: 1m);

            migrationBuilder.Sql("""
                EXEC(N'
                    UPDATE line
                    SET EnteredCurrencyCode = COALESCE(NULLIF([order].CurrencyCode, ''''), ''TRY''),
                        EnteredUnitCode = COALESCE(NULLIF(line.UnitCode, ''''), ''EA''),
                        EnteredUnitPrice = line.UnitPrice,
                        ExchangeRateToOrderCurrency = 1
                    FROM dbo.SalesOrderLines AS line
                    INNER JOIN dbo.SalesOrders AS [order]
                        ON [order].TenantId = line.TenantId
                       AND [order].Id = line.OrderId;
                    ');
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "EnteredCurrencyCode",
                table: "SalesOrderLines");

            migrationBuilder.DropColumn(
                name: "EnteredUnitCode",
                table: "SalesOrderLines");

            migrationBuilder.DropColumn(
                name: "EnteredUnitPrice",
                table: "SalesOrderLines");

            migrationBuilder.DropColumn(
                name: "ExchangeRateToOrderCurrency",
                table: "SalesOrderLines");
        }
    }
}
