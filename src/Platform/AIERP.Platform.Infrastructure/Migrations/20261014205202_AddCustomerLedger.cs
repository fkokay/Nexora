using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddCustomerLedger : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "CustomerLedgerEntries",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CustomerId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    EntryDate = table.Column<DateOnly>(type: "date", nullable: false),
                    Direction = table.Column<int>(type: "int", nullable: false),
                    Amount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    CurrencyCode = table.Column<string>(type: "nchar(3)", fixedLength: true, maxLength: 3, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(240)", maxLength: 240, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    ReversalOfId = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CustomerLedgerEntries", x => x.Id);
                    table.UniqueConstraint("AK_CustomerLedgerEntries_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_CustomerLedgerEntries_AmountPositive", "[Amount] > 0");
                    table.ForeignKey(
                        name: "FK_CustomerLedgerEntries_CustomerAccounts_TenantId_CustomerId",
                        columns: x => new { x.TenantId, x.CustomerId },
                        principalTable: "CustomerAccounts",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_CustomerLedgerEntries_CustomerLedgerEntries_TenantId_ReversalOfId",
                        columns: x => new { x.TenantId, x.ReversalOfId },
                        principalTable: "CustomerLedgerEntries",
                        principalColumns: new[] { "TenantId", "Id" });
                });

            migrationBuilder.CreateIndex(
                name: "IX_CustomerLedgerEntries_TenantId_CustomerId_EntryDate_CreatedAt",
                table: "CustomerLedgerEntries",
                columns: new[] { "TenantId", "CustomerId", "EntryDate", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_CustomerLedgerEntries_TenantId_ReversalOfId",
                table: "CustomerLedgerEntries",
                columns: new[] { "TenantId", "ReversalOfId" },
                unique: true,
                filter: "[ReversalOfId] IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CustomerLedgerEntries");
        }
    }
}
