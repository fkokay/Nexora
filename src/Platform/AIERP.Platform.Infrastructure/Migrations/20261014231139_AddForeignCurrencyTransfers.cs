using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddForeignCurrencyTransfers : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_FinancialAccountTransfers_FinancialAccounts_TenantId_ToAccountId_CurrencyCode",
                table: "FinancialAccountTransfers");

            migrationBuilder.DropIndex(
                name: "IX_FinancialAccountTransfers_TenantId_ToAccountId_CurrencyCode",
                table: "FinancialAccountTransfers");

            migrationBuilder.AddColumn<decimal>(
                name: "DestinationAmount",
                table: "FinancialAccountTransfers",
                type: "decimal(18,2)",
                precision: 18,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "ExchangeRate",
                table: "FinancialAccountTransfers",
                type: "decimal(18,8)",
                precision: 18,
                scale: 8,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ToCurrencyCode",
                table: "FinancialAccountTransfers",
                type: "nchar(3)",
                fixedLength: true,
                maxLength: 3,
                nullable: true);

            migrationBuilder.Sql("UPDATE [FinancialAccountTransfers] SET [ToCurrencyCode] = [CurrencyCode], [DestinationAmount] = [Amount], [ExchangeRate] = 1");

            migrationBuilder.AlterColumn<decimal>(name: "DestinationAmount", table: "FinancialAccountTransfers", type: "decimal(18,2)", precision: 18, scale: 2, nullable: false, oldClrType: typeof(decimal), oldType: "decimal(18,2)", oldPrecision: 18, oldScale: 2, oldNullable: true);
            migrationBuilder.AlterColumn<decimal>(name: "ExchangeRate", table: "FinancialAccountTransfers", type: "decimal(18,8)", precision: 18, scale: 8, nullable: false, oldClrType: typeof(decimal), oldType: "decimal(18,8)", oldPrecision: 18, oldScale: 8, oldNullable: true);
            migrationBuilder.AlterColumn<string>(name: "ToCurrencyCode", table: "FinancialAccountTransfers", type: "nchar(3)", fixedLength: true, maxLength: 3, nullable: false, oldClrType: typeof(string), oldType: "nchar(3)", oldFixedLength: true, oldMaxLength: 3, oldNullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_FinancialAccountTransfers_TenantId_ToAccountId_ToCurrencyCode",
                table: "FinancialAccountTransfers",
                columns: new[] { "TenantId", "ToAccountId", "ToCurrencyCode" });

            migrationBuilder.AddCheckConstraint(
                name: "CK_FinancialAccountTransfers_DestinationAmountPositive",
                table: "FinancialAccountTransfers",
                sql: "[DestinationAmount] > 0");

            migrationBuilder.AddCheckConstraint(
                name: "CK_FinancialAccountTransfers_ExchangeRatePositive",
                table: "FinancialAccountTransfers",
                sql: "[ExchangeRate] > 0");

            migrationBuilder.AddCheckConstraint(
                name: "CK_FinancialAccountTransfers_SameCurrencyRate",
                table: "FinancialAccountTransfers",
                sql: "[CurrencyCode] <> [ToCurrencyCode] OR [ExchangeRate] = 1");

            migrationBuilder.AddForeignKey(
                name: "FK_FinancialAccountTransfers_FinancialAccounts_TenantId_ToAccountId_ToCurrencyCode",
                table: "FinancialAccountTransfers",
                columns: new[] { "TenantId", "ToAccountId", "ToCurrencyCode" },
                principalTable: "FinancialAccounts",
                principalColumns: new[] { "TenantId", "Id", "CurrencyCode" },
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_FinancialAccountTransfers_FinancialAccounts_TenantId_ToAccountId_ToCurrencyCode",
                table: "FinancialAccountTransfers");

            migrationBuilder.DropIndex(
                name: "IX_FinancialAccountTransfers_TenantId_ToAccountId_ToCurrencyCode",
                table: "FinancialAccountTransfers");

            migrationBuilder.DropCheckConstraint(
                name: "CK_FinancialAccountTransfers_DestinationAmountPositive",
                table: "FinancialAccountTransfers");

            migrationBuilder.DropCheckConstraint(
                name: "CK_FinancialAccountTransfers_ExchangeRatePositive",
                table: "FinancialAccountTransfers");

            migrationBuilder.DropCheckConstraint(
                name: "CK_FinancialAccountTransfers_SameCurrencyRate",
                table: "FinancialAccountTransfers");

            migrationBuilder.DropColumn(
                name: "DestinationAmount",
                table: "FinancialAccountTransfers");

            migrationBuilder.DropColumn(
                name: "ExchangeRate",
                table: "FinancialAccountTransfers");

            migrationBuilder.DropColumn(
                name: "ToCurrencyCode",
                table: "FinancialAccountTransfers");

            migrationBuilder.CreateIndex(
                name: "IX_FinancialAccountTransfers_TenantId_ToAccountId_CurrencyCode",
                table: "FinancialAccountTransfers",
                columns: new[] { "TenantId", "ToAccountId", "CurrencyCode" });

            migrationBuilder.AddForeignKey(
                name: "FK_FinancialAccountTransfers_FinancialAccounts_TenantId_ToAccountId_CurrencyCode",
                table: "FinancialAccountTransfers",
                columns: new[] { "TenantId", "ToAccountId", "CurrencyCode" },
                principalTable: "FinancialAccounts",
                principalColumns: new[] { "TenantId", "Id", "CurrencyCode" },
                onDelete: ReferentialAction.Restrict);
        }
    }
}
