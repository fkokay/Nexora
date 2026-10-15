using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddBankStatementReconciliation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddUniqueConstraint(
                name: "AK_FinancialAccountTransactions_TenantId_Id_FinancialAccountId_CurrencyCode",
                table: "FinancialAccountTransactions",
                columns: new[] { "TenantId", "Id", "FinancialAccountId", "CurrencyCode" });

            migrationBuilder.CreateTable(
                name: "BankStatements",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    AccountId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CurrencyCode = table.Column<string>(type: "nchar(3)", fixedLength: true, maxLength: 3, nullable: false),
                    RequestId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    StartDate = table.Column<DateOnly>(type: "date", nullable: false),
                    EndDate = table.Column<DateOnly>(type: "date", nullable: false),
                    OpeningBalance = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    ClosingBalance = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BankStatements", x => x.Id);
                    table.UniqueConstraint("AK_BankStatements_TenantId_Id_AccountId_CurrencyCode", x => new { x.TenantId, x.Id, x.AccountId, x.CurrencyCode });
                    table.ForeignKey(
                        name: "FK_BankStatements_FinancialAccounts_TenantId_AccountId_CurrencyCode",
                        columns: x => new { x.TenantId, x.AccountId, x.CurrencyCode },
                        principalTable: "FinancialAccounts",
                        principalColumns: new[] { "TenantId", "Id", "CurrencyCode" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_BankStatements_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "BankStatementLines",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    StatementId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    FinancialAccountId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CurrencyCode = table.Column<string>(type: "nchar(3)", fixedLength: true, maxLength: 3, nullable: false),
                    LineNumber = table.Column<int>(type: "int", nullable: false),
                    ExternalId = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    TransactionDate = table.Column<DateOnly>(type: "date", nullable: false),
                    Direction = table.Column<int>(type: "int", nullable: false),
                    Amount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(240)", maxLength: 240, nullable: false),
                    Reference = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    FinancialAccountTransactionId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    IsBookEntryCreated = table.Column<bool>(type: "bit", nullable: false),
                    MatchedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BankStatementLines", x => x.Id);
                    table.UniqueConstraint("AK_BankStatementLines_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_BankStatementLines_AmountPositive", "[Amount] > 0");
                    table.ForeignKey(
                        name: "FK_BankStatementLines_BankStatements_TenantId_StatementId_FinancialAccountId_CurrencyCode",
                        columns: x => new { x.TenantId, x.StatementId, x.FinancialAccountId, x.CurrencyCode },
                        principalTable: "BankStatements",
                        principalColumns: new[] { "TenantId", "Id", "AccountId", "CurrencyCode" },
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_BankStatementLines_FinancialAccountTransactions_TenantId_FinancialAccountTransactionId_FinancialAccountId_CurrencyCode",
                        columns: x => new { x.TenantId, x.FinancialAccountTransactionId, x.FinancialAccountId, x.CurrencyCode },
                        principalTable: "FinancialAccountTransactions",
                        principalColumns: new[] { "TenantId", "Id", "FinancialAccountId", "CurrencyCode" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_BankStatementLines_TenantId_FinancialAccountTransactionId",
                table: "BankStatementLines",
                columns: new[] { "TenantId", "FinancialAccountTransactionId" },
                unique: true,
                filter: "[FinancialAccountTransactionId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_BankStatementLines_TenantId_FinancialAccountTransactionId_FinancialAccountId_CurrencyCode",
                table: "BankStatementLines",
                columns: new[] { "TenantId", "FinancialAccountTransactionId", "FinancialAccountId", "CurrencyCode" },
                unique: true,
                filter: "[FinancialAccountTransactionId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_BankStatementLines_TenantId_StatementId_ExternalId",
                table: "BankStatementLines",
                columns: new[] { "TenantId", "StatementId", "ExternalId" },
                unique: true,
                filter: "[ExternalId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_BankStatementLines_TenantId_StatementId_FinancialAccountId_CurrencyCode",
                table: "BankStatementLines",
                columns: new[] { "TenantId", "StatementId", "FinancialAccountId", "CurrencyCode" });

            migrationBuilder.CreateIndex(
                name: "IX_BankStatementLines_TenantId_StatementId_LineNumber",
                table: "BankStatementLines",
                columns: new[] { "TenantId", "StatementId", "LineNumber" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_BankStatements_TenantId_AccountId_CurrencyCode",
                table: "BankStatements",
                columns: new[] { "TenantId", "AccountId", "CurrencyCode" });

            migrationBuilder.CreateIndex(
                name: "IX_BankStatements_TenantId_Code",
                table: "BankStatements",
                columns: new[] { "TenantId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_BankStatements_TenantId_RequestId",
                table: "BankStatements",
                columns: new[] { "TenantId", "RequestId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "BankStatementLines");

            migrationBuilder.DropTable(
                name: "BankStatements");

            migrationBuilder.DropUniqueConstraint(
                name: "AK_FinancialAccountTransactions_TenantId_Id_FinancialAccountId_CurrencyCode",
                table: "FinancialAccountTransactions");
        }
    }
}
