using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddFinancialAccountsAndCashBankMovements : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "FinancialAccountId",
                table: "SupplierPayments",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "FinancialAccountId",
                table: "CustomerCollections",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddUniqueConstraint(
                name: "AK_SupplierPayments_TenantId_Id_CurrencyCode",
                table: "SupplierPayments",
                columns: new[] { "TenantId", "Id", "CurrencyCode" });

            migrationBuilder.AddUniqueConstraint(
                name: "AK_CustomerCollections_TenantId_Id_CurrencyCode",
                table: "CustomerCollections",
                columns: new[] { "TenantId", "Id", "CurrencyCode" });

            migrationBuilder.CreateTable(
                name: "FinancialAccounts",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    Type = table.Column<int>(type: "int", nullable: false),
                    CurrencyCode = table.Column<string>(type: "nchar(3)", fixedLength: true, maxLength: 3, nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FinancialAccounts", x => x.Id);
                    table.UniqueConstraint("AK_FinancialAccounts_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.UniqueConstraint("AK_FinancialAccounts_TenantId_Id_CurrencyCode", x => new { x.TenantId, x.Id, x.CurrencyCode });
                    table.ForeignKey(
                        name: "FK_FinancialAccounts_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "FinancialAccountTransactions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    FinancialAccountId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CurrencyCode = table.Column<string>(type: "nchar(3)", fixedLength: true, maxLength: 3, nullable: false),
                    TransactionDate = table.Column<DateOnly>(type: "date", nullable: false),
                    Direction = table.Column<int>(type: "int", nullable: false),
                    Amount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(240)", maxLength: 240, nullable: false),
                    Reference = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    ReversalOfId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CustomerCollectionId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    SupplierPaymentId = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FinancialAccountTransactions", x => x.Id);
                    table.UniqueConstraint("AK_FinancialAccountTransactions_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_FinancialAccountTransactions_AmountPositive", "[Amount] > 0");
                    table.ForeignKey(
                        name: "FK_FinancialAccountTransactions_CustomerCollections_TenantId_CustomerCollectionId_CurrencyCode",
                        columns: x => new { x.TenantId, x.CustomerCollectionId, x.CurrencyCode },
                        principalTable: "CustomerCollections",
                        principalColumns: new[] { "TenantId", "Id", "CurrencyCode" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_FinancialAccountTransactions_FinancialAccountTransactions_TenantId_ReversalOfId",
                        columns: x => new { x.TenantId, x.ReversalOfId },
                        principalTable: "FinancialAccountTransactions",
                        principalColumns: new[] { "TenantId", "Id" });
                    table.ForeignKey(
                        name: "FK_FinancialAccountTransactions_FinancialAccounts_TenantId_FinancialAccountId_CurrencyCode",
                        columns: x => new { x.TenantId, x.FinancialAccountId, x.CurrencyCode },
                        principalTable: "FinancialAccounts",
                        principalColumns: new[] { "TenantId", "Id", "CurrencyCode" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_FinancialAccountTransactions_SupplierPayments_TenantId_SupplierPaymentId_CurrencyCode",
                        columns: x => new { x.TenantId, x.SupplierPaymentId, x.CurrencyCode },
                        principalTable: "SupplierPayments",
                        principalColumns: new[] { "TenantId", "Id", "CurrencyCode" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_SupplierPayments_TenantId_FinancialAccountId_CurrencyCode",
                table: "SupplierPayments",
                columns: new[] { "TenantId", "FinancialAccountId", "CurrencyCode" });

            migrationBuilder.CreateIndex(
                name: "IX_CustomerCollections_TenantId_FinancialAccountId_CurrencyCode",
                table: "CustomerCollections",
                columns: new[] { "TenantId", "FinancialAccountId", "CurrencyCode" });

            migrationBuilder.CreateIndex(
                name: "IX_FinancialAccounts_TenantId_Code",
                table: "FinancialAccounts",
                columns: new[] { "TenantId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_FinancialAccountTransactions_TenantId_CustomerCollectionId",
                table: "FinancialAccountTransactions",
                columns: new[] { "TenantId", "CustomerCollectionId" },
                unique: true,
                filter: "[CustomerCollectionId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_FinancialAccountTransactions_TenantId_CustomerCollectionId_CurrencyCode",
                table: "FinancialAccountTransactions",
                columns: new[] { "TenantId", "CustomerCollectionId", "CurrencyCode" });

            migrationBuilder.CreateIndex(
                name: "IX_FinancialAccountTransactions_TenantId_FinancialAccountId_CurrencyCode",
                table: "FinancialAccountTransactions",
                columns: new[] { "TenantId", "FinancialAccountId", "CurrencyCode" });

            migrationBuilder.CreateIndex(
                name: "IX_FinancialAccountTransactions_TenantId_FinancialAccountId_TransactionDate_CreatedAt",
                table: "FinancialAccountTransactions",
                columns: new[] { "TenantId", "FinancialAccountId", "TransactionDate", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_FinancialAccountTransactions_TenantId_ReversalOfId",
                table: "FinancialAccountTransactions",
                columns: new[] { "TenantId", "ReversalOfId" },
                unique: true,
                filter: "[ReversalOfId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_FinancialAccountTransactions_TenantId_SupplierPaymentId",
                table: "FinancialAccountTransactions",
                columns: new[] { "TenantId", "SupplierPaymentId" },
                unique: true,
                filter: "[SupplierPaymentId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_FinancialAccountTransactions_TenantId_SupplierPaymentId_CurrencyCode",
                table: "FinancialAccountTransactions",
                columns: new[] { "TenantId", "SupplierPaymentId", "CurrencyCode" });

            migrationBuilder.AddForeignKey(
                name: "FK_CustomerCollections_FinancialAccounts_TenantId_FinancialAccountId_CurrencyCode",
                table: "CustomerCollections",
                columns: new[] { "TenantId", "FinancialAccountId", "CurrencyCode" },
                principalTable: "FinancialAccounts",
                principalColumns: new[] { "TenantId", "Id", "CurrencyCode" },
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_SupplierPayments_FinancialAccounts_TenantId_FinancialAccountId_CurrencyCode",
                table: "SupplierPayments",
                columns: new[] { "TenantId", "FinancialAccountId", "CurrencyCode" },
                principalTable: "FinancialAccounts",
                principalColumns: new[] { "TenantId", "Id", "CurrencyCode" },
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_CustomerCollections_FinancialAccounts_TenantId_FinancialAccountId_CurrencyCode",
                table: "CustomerCollections");

            migrationBuilder.DropForeignKey(
                name: "FK_SupplierPayments_FinancialAccounts_TenantId_FinancialAccountId_CurrencyCode",
                table: "SupplierPayments");

            migrationBuilder.DropTable(
                name: "FinancialAccountTransactions");

            migrationBuilder.DropTable(
                name: "FinancialAccounts");

            migrationBuilder.DropUniqueConstraint(
                name: "AK_SupplierPayments_TenantId_Id_CurrencyCode",
                table: "SupplierPayments");

            migrationBuilder.DropIndex(
                name: "IX_SupplierPayments_TenantId_FinancialAccountId_CurrencyCode",
                table: "SupplierPayments");

            migrationBuilder.DropUniqueConstraint(
                name: "AK_CustomerCollections_TenantId_Id_CurrencyCode",
                table: "CustomerCollections");

            migrationBuilder.DropIndex(
                name: "IX_CustomerCollections_TenantId_FinancialAccountId_CurrencyCode",
                table: "CustomerCollections");

            migrationBuilder.DropColumn(
                name: "FinancialAccountId",
                table: "SupplierPayments");

            migrationBuilder.DropColumn(
                name: "FinancialAccountId",
                table: "CustomerCollections");
        }
    }
}
