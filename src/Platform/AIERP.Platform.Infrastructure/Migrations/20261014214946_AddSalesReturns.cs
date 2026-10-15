using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddSalesReturns : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "SalesReturnLineId",
                table: "InventoryTransactions",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "SalesReturnId",
                table: "CustomerLedgerEntries",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "SalesReturns",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RequestId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SalesInvoiceId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CustomerId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    WarehouseId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    ReturnDate = table.Column<DateOnly>(type: "date", nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    Subtotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    DiscountTotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    TaxTotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    GrandTotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SalesReturns", x => x.Id);
                    table.UniqueConstraint("AK_SalesReturns_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_SalesReturns_GrandTotalPositive", "[GrandTotal] > 0");
                    table.ForeignKey(
                        name: "FK_SalesReturns_CustomerAccounts_TenantId_CustomerId",
                        columns: x => new { x.TenantId, x.CustomerId },
                        principalTable: "CustomerAccounts",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SalesReturns_SalesInvoices_TenantId_SalesInvoiceId",
                        columns: x => new { x.TenantId, x.SalesInvoiceId },
                        principalTable: "SalesInvoices",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SalesReturns_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_SalesReturns_Warehouses_TenantId_WarehouseId",
                        columns: x => new { x.TenantId, x.WarehouseId },
                        principalTable: "Warehouses",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "SalesReturnLines",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SalesReturnId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SalesInvoiceLineId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    OrderLineNumber = table.Column<int>(type: "int", nullable: false),
                    StockItemId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    StockCode = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    StockName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    UnitCode = table.Column<string>(type: "nvarchar(8)", maxLength: 8, nullable: false),
                    Quantity = table.Column<decimal>(type: "decimal(18,4)", precision: 18, scale: 4, nullable: false),
                    UnitPrice = table.Column<decimal>(type: "decimal(18,4)", precision: 18, scale: 4, nullable: false),
                    DiscountPercent = table.Column<decimal>(type: "decimal(5,2)", precision: 5, scale: 2, nullable: false),
                    VatPercent = table.Column<decimal>(type: "decimal(5,2)", precision: 5, scale: 2, nullable: false),
                    LineSubtotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    DiscountAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    TaxAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    LineTotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SalesReturnLines", x => x.Id);
                    table.UniqueConstraint("AK_SalesReturnLines_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_SalesReturnLines_DiscountRange", "[DiscountPercent] >= 0 AND [DiscountPercent] <= 100");
                    table.CheckConstraint("CK_SalesReturnLines_QuantityPositive", "[Quantity] > 0");
                    table.CheckConstraint("CK_SalesReturnLines_VatRange", "[VatPercent] >= 0 AND [VatPercent] <= 100");
                    table.ForeignKey(
                        name: "FK_SalesReturnLines_SalesInvoiceLines_TenantId_SalesInvoiceLineId",
                        columns: x => new { x.TenantId, x.SalesInvoiceLineId },
                        principalTable: "SalesInvoiceLines",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SalesReturnLines_SalesReturns_TenantId_SalesReturnId",
                        columns: x => new { x.TenantId, x.SalesReturnId },
                        principalTable: "SalesReturns",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_SalesReturnLines_StockItems_TenantId_StockItemId",
                        columns: x => new { x.TenantId, x.StockItemId },
                        principalTable: "StockItems",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_InventoryTransactions_TenantId_SalesReturnLineId",
                table: "InventoryTransactions",
                columns: new[] { "TenantId", "SalesReturnLineId" });

            migrationBuilder.CreateIndex(
                name: "IX_CustomerLedgerEntries_TenantId_SalesReturnId",
                table: "CustomerLedgerEntries",
                columns: new[] { "TenantId", "SalesReturnId" });

            migrationBuilder.CreateIndex(
                name: "IX_SalesReturnLines_TenantId_SalesInvoiceLineId",
                table: "SalesReturnLines",
                columns: new[] { "TenantId", "SalesInvoiceLineId" });

            migrationBuilder.CreateIndex(
                name: "IX_SalesReturnLines_TenantId_SalesReturnId",
                table: "SalesReturnLines",
                columns: new[] { "TenantId", "SalesReturnId" });

            migrationBuilder.CreateIndex(
                name: "IX_SalesReturnLines_TenantId_StockItemId",
                table: "SalesReturnLines",
                columns: new[] { "TenantId", "StockItemId" });

            migrationBuilder.CreateIndex(
                name: "IX_SalesReturns_TenantId_Code",
                table: "SalesReturns",
                columns: new[] { "TenantId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SalesReturns_TenantId_CustomerId",
                table: "SalesReturns",
                columns: new[] { "TenantId", "CustomerId" });

            migrationBuilder.CreateIndex(
                name: "IX_SalesReturns_TenantId_RequestId",
                table: "SalesReturns",
                columns: new[] { "TenantId", "RequestId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SalesReturns_TenantId_SalesInvoiceId_ReturnDate_CreatedAt",
                table: "SalesReturns",
                columns: new[] { "TenantId", "SalesInvoiceId", "ReturnDate", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_SalesReturns_TenantId_WarehouseId",
                table: "SalesReturns",
                columns: new[] { "TenantId", "WarehouseId" });

            migrationBuilder.AddForeignKey(
                name: "FK_CustomerLedgerEntries_SalesReturns_TenantId_SalesReturnId",
                table: "CustomerLedgerEntries",
                columns: new[] { "TenantId", "SalesReturnId" },
                principalTable: "SalesReturns",
                principalColumns: new[] { "TenantId", "Id" },
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_InventoryTransactions_SalesReturnLines_TenantId_SalesReturnLineId",
                table: "InventoryTransactions",
                columns: new[] { "TenantId", "SalesReturnLineId" },
                principalTable: "SalesReturnLines",
                principalColumns: new[] { "TenantId", "Id" },
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_CustomerLedgerEntries_SalesReturns_TenantId_SalesReturnId",
                table: "CustomerLedgerEntries");

            migrationBuilder.DropForeignKey(
                name: "FK_InventoryTransactions_SalesReturnLines_TenantId_SalesReturnLineId",
                table: "InventoryTransactions");

            migrationBuilder.DropTable(
                name: "SalesReturnLines");

            migrationBuilder.DropTable(
                name: "SalesReturns");

            migrationBuilder.DropIndex(
                name: "IX_InventoryTransactions_TenantId_SalesReturnLineId",
                table: "InventoryTransactions");

            migrationBuilder.DropIndex(
                name: "IX_CustomerLedgerEntries_TenantId_SalesReturnId",
                table: "CustomerLedgerEntries");

            migrationBuilder.DropColumn(
                name: "SalesReturnLineId",
                table: "InventoryTransactions");

            migrationBuilder.DropColumn(
                name: "SalesReturnId",
                table: "CustomerLedgerEntries");
        }
    }
}
