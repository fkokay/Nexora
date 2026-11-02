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

            // Keep each operation that refers to the new columns in its own dynamic
            // batch. SQL Server compiles the contents of an idempotent migration's IF
            // block before executing its preceding ADD COLUMN statements otherwise.
            migrationBuilder.Sql("EXEC(N'ALTER TABLE [FinancialAccountTransfers] ADD [DestinationAmount] decimal(18,2) NULL')");
            migrationBuilder.Sql("EXEC(N'ALTER TABLE [FinancialAccountTransfers] ADD [ExchangeRate] decimal(18,8) NULL')");
            migrationBuilder.Sql("EXEC(N'ALTER TABLE [FinancialAccountTransfers] ADD [ToCurrencyCode] nchar(3) NULL')");
            migrationBuilder.Sql("EXEC(N'UPDATE [FinancialAccountTransfers] SET [ToCurrencyCode] = [CurrencyCode], [DestinationAmount] = [Amount], [ExchangeRate] = 1')");
            migrationBuilder.Sql("EXEC(N'ALTER TABLE [FinancialAccountTransfers] ALTER COLUMN [DestinationAmount] decimal(18,2) NOT NULL')");
            migrationBuilder.Sql("EXEC(N'ALTER TABLE [FinancialAccountTransfers] ALTER COLUMN [ExchangeRate] decimal(18,8) NOT NULL')");
            migrationBuilder.Sql("EXEC(N'ALTER TABLE [FinancialAccountTransfers] ALTER COLUMN [ToCurrencyCode] nchar(3) NOT NULL')");
            migrationBuilder.Sql("EXEC(N'CREATE INDEX [IX_FinancialAccountTransfers_TenantId_ToAccountId_ToCurrencyCode] ON [FinancialAccountTransfers] ([TenantId], [ToAccountId], [ToCurrencyCode])')");
            migrationBuilder.Sql("EXEC(N'ALTER TABLE [FinancialAccountTransfers] ADD CONSTRAINT [CK_FinancialAccountTransfers_DestinationAmountPositive] CHECK ([DestinationAmount] > 0)')");
            migrationBuilder.Sql("EXEC(N'ALTER TABLE [FinancialAccountTransfers] ADD CONSTRAINT [CK_FinancialAccountTransfers_ExchangeRatePositive] CHECK ([ExchangeRate] > 0)')");
            migrationBuilder.Sql("EXEC(N'ALTER TABLE [FinancialAccountTransfers] ADD CONSTRAINT [CK_FinancialAccountTransfers_SameCurrencyRate] CHECK ([CurrencyCode] <> [ToCurrencyCode] OR [ExchangeRate] = 1)')");
            migrationBuilder.Sql("EXEC(N'ALTER TABLE [FinancialAccountTransfers] ADD CONSTRAINT [FK_FinancialAccountTransfers_FinancialAccounts_TenantId_ToAccountId_ToCurrencyCode] FOREIGN KEY ([TenantId], [ToAccountId], [ToCurrencyCode]) REFERENCES [FinancialAccounts] ([TenantId], [Id], [CurrencyCode]) ON DELETE NO ACTION')");
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
