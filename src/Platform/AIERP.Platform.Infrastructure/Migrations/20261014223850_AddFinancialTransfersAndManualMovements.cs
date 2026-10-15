using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddFinancialTransfersAndManualMovements : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "RequestId",
                table: "FinancialAccountTransactions",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "TransferId",
                table: "FinancialAccountTransactions",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "FinancialAccountTransfers",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RequestId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    FromAccountId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ToAccountId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CurrencyCode = table.Column<string>(type: "nchar(3)", fixedLength: true, maxLength: 3, nullable: false),
                    TransferDate = table.Column<DateOnly>(type: "date", nullable: false),
                    Amount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    Reference = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    Description = table.Column<string>(type: "nvarchar(240)", maxLength: 240, nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FinancialAccountTransfers", x => x.Id);
                    table.UniqueConstraint("AK_FinancialAccountTransfers_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_FinancialAccountTransfers_AmountPositive", "[Amount] > 0");
                    table.ForeignKey(
                        name: "FK_FinancialAccountTransfers_FinancialAccounts_TenantId_FromAccountId_CurrencyCode",
                        columns: x => new { x.TenantId, x.FromAccountId, x.CurrencyCode },
                        principalTable: "FinancialAccounts",
                        principalColumns: new[] { "TenantId", "Id", "CurrencyCode" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_FinancialAccountTransfers_FinancialAccounts_TenantId_ToAccountId_CurrencyCode",
                        columns: x => new { x.TenantId, x.ToAccountId, x.CurrencyCode },
                        principalTable: "FinancialAccounts",
                        principalColumns: new[] { "TenantId", "Id", "CurrencyCode" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_FinancialAccountTransfers_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_FinancialAccountTransactions_TenantId_RequestId",
                table: "FinancialAccountTransactions",
                columns: new[] { "TenantId", "RequestId" },
                unique: true,
                filter: "[RequestId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_FinancialAccountTransactions_TenantId_TransferId_FinancialAccountId",
                table: "FinancialAccountTransactions",
                columns: new[] { "TenantId", "TransferId", "FinancialAccountId" },
                unique: true,
                filter: "[TransferId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_FinancialAccountTransfers_TenantId_Code",
                table: "FinancialAccountTransfers",
                columns: new[] { "TenantId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_FinancialAccountTransfers_TenantId_FromAccountId_CurrencyCode",
                table: "FinancialAccountTransfers",
                columns: new[] { "TenantId", "FromAccountId", "CurrencyCode" });

            migrationBuilder.CreateIndex(
                name: "IX_FinancialAccountTransfers_TenantId_RequestId",
                table: "FinancialAccountTransfers",
                columns: new[] { "TenantId", "RequestId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_FinancialAccountTransfers_TenantId_ToAccountId_CurrencyCode",
                table: "FinancialAccountTransfers",
                columns: new[] { "TenantId", "ToAccountId", "CurrencyCode" });

            migrationBuilder.AddForeignKey(
                name: "FK_FinancialAccountTransactions_FinancialAccountTransfers_TenantId_TransferId",
                table: "FinancialAccountTransactions",
                columns: new[] { "TenantId", "TransferId" },
                principalTable: "FinancialAccountTransfers",
                principalColumns: new[] { "TenantId", "Id" },
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_FinancialAccountTransactions_FinancialAccountTransfers_TenantId_TransferId",
                table: "FinancialAccountTransactions");

            migrationBuilder.DropTable(
                name: "FinancialAccountTransfers");

            migrationBuilder.DropIndex(
                name: "IX_FinancialAccountTransactions_TenantId_RequestId",
                table: "FinancialAccountTransactions");

            migrationBuilder.DropIndex(
                name: "IX_FinancialAccountTransactions_TenantId_TransferId_FinancialAccountId",
                table: "FinancialAccountTransactions");

            migrationBuilder.DropColumn(
                name: "RequestId",
                table: "FinancialAccountTransactions");

            migrationBuilder.DropColumn(
                name: "TransferId",
                table: "FinancialAccountTransactions");
        }
    }
}
