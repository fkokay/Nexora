using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddSupplierReturns : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "SupplierReturnLineId",
                table: "InventoryTransactions",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "SupplierReturnId",
                table: "CustomerLedgerEntries",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddUniqueConstraint(
                name: "AK_PurchaseInvoiceLines_TenantId_PurchaseInvoiceId_Id",
                table: "PurchaseInvoiceLines",
                columns: new[] { "TenantId", "PurchaseInvoiceId", "Id" });

            migrationBuilder.CreateTable(
                name: "SupplierReturns",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RequestId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PurchaseInvoiceId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SupplierId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
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
                    table.PrimaryKey("PK_SupplierReturns", x => x.Id);
                    table.UniqueConstraint("AK_SupplierReturns_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.UniqueConstraint("AK_SupplierReturns_TenantId_Id_SupplierId", x => new { x.TenantId, x.Id, x.SupplierId });
                    table.CheckConstraint("CK_SupplierReturns_GrandTotalPositive", "[GrandTotal] > 0");
                    table.ForeignKey(
                        name: "FK_SupplierReturns_CustomerAccounts_TenantId_SupplierId",
                        columns: x => new { x.TenantId, x.SupplierId },
                        principalTable: "CustomerAccounts",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SupplierReturns_PurchaseInvoices_TenantId_PurchaseInvoiceId_SupplierId",
                        columns: x => new { x.TenantId, x.PurchaseInvoiceId, x.SupplierId },
                        principalTable: "PurchaseInvoices",
                        principalColumns: new[] { "TenantId", "Id", "SupplierId" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SupplierReturns_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_SupplierReturns_Warehouses_TenantId_WarehouseId",
                        columns: x => new { x.TenantId, x.WarehouseId },
                        principalTable: "Warehouses",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "SupplierReturnLines",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SupplierReturnId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PurchaseInvoiceId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PurchaseInvoiceLineId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
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
                    table.PrimaryKey("PK_SupplierReturnLines", x => x.Id);
                    table.UniqueConstraint("AK_SupplierReturnLines_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_SupplierReturnLines_QuantityPositive", "[Quantity] > 0");
                    table.ForeignKey(
                        name: "FK_SupplierReturnLines_PurchaseInvoiceLines_TenantId_PurchaseInvoiceId_PurchaseInvoiceLineId",
                        columns: x => new { x.TenantId, x.PurchaseInvoiceId, x.PurchaseInvoiceLineId },
                        principalTable: "PurchaseInvoiceLines",
                        principalColumns: new[] { "TenantId", "PurchaseInvoiceId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SupplierReturnLines_SupplierReturns_TenantId_SupplierReturnId",
                        columns: x => new { x.TenantId, x.SupplierReturnId },
                        principalTable: "SupplierReturns",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_InventoryTransactions_TenantId_SupplierReturnLineId",
                table: "InventoryTransactions",
                columns: new[] { "TenantId", "SupplierReturnLineId" });

            migrationBuilder.CreateIndex(
                name: "IX_CustomerLedgerEntries_TenantId_SupplierReturnId",
                table: "CustomerLedgerEntries",
                columns: new[] { "TenantId", "SupplierReturnId" });

            migrationBuilder.CreateIndex(
                name: "IX_CustomerLedgerEntries_TenantId_SupplierReturnId_CustomerId",
                table: "CustomerLedgerEntries",
                columns: new[] { "TenantId", "SupplierReturnId", "CustomerId" });

            migrationBuilder.CreateIndex(
                name: "IX_SupplierReturnLines_TenantId_PurchaseInvoiceId_PurchaseInvoiceLineId",
                table: "SupplierReturnLines",
                columns: new[] { "TenantId", "PurchaseInvoiceId", "PurchaseInvoiceLineId" });

            migrationBuilder.CreateIndex(
                name: "IX_SupplierReturnLines_TenantId_SupplierReturnId",
                table: "SupplierReturnLines",
                columns: new[] { "TenantId", "SupplierReturnId" });

            migrationBuilder.CreateIndex(
                name: "IX_SupplierReturns_TenantId_Code",
                table: "SupplierReturns",
                columns: new[] { "TenantId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SupplierReturns_TenantId_PurchaseInvoiceId_Status_ReturnDate",
                table: "SupplierReturns",
                columns: new[] { "TenantId", "PurchaseInvoiceId", "Status", "ReturnDate" });

            migrationBuilder.CreateIndex(
                name: "IX_SupplierReturns_TenantId_PurchaseInvoiceId_SupplierId",
                table: "SupplierReturns",
                columns: new[] { "TenantId", "PurchaseInvoiceId", "SupplierId" });

            migrationBuilder.CreateIndex(
                name: "IX_SupplierReturns_TenantId_RequestId",
                table: "SupplierReturns",
                columns: new[] { "TenantId", "RequestId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SupplierReturns_TenantId_SupplierId",
                table: "SupplierReturns",
                columns: new[] { "TenantId", "SupplierId" });

            migrationBuilder.CreateIndex(
                name: "IX_SupplierReturns_TenantId_WarehouseId",
                table: "SupplierReturns",
                columns: new[] { "TenantId", "WarehouseId" });

            migrationBuilder.AddForeignKey(
                name: "FK_CustomerLedgerEntries_SupplierReturns_TenantId_SupplierReturnId_CustomerId",
                table: "CustomerLedgerEntries",
                columns: new[] { "TenantId", "SupplierReturnId", "CustomerId" },
                principalTable: "SupplierReturns",
                principalColumns: new[] { "TenantId", "Id", "SupplierId" },
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_InventoryTransactions_SupplierReturnLines_TenantId_SupplierReturnLineId",
                table: "InventoryTransactions",
                columns: new[] { "TenantId", "SupplierReturnLineId" },
                principalTable: "SupplierReturnLines",
                principalColumns: new[] { "TenantId", "Id" },
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_CustomerLedgerEntries_SupplierReturns_TenantId_SupplierReturnId_CustomerId",
                table: "CustomerLedgerEntries");

            migrationBuilder.DropForeignKey(
                name: "FK_InventoryTransactions_SupplierReturnLines_TenantId_SupplierReturnLineId",
                table: "InventoryTransactions");

            migrationBuilder.DropTable(
                name: "SupplierReturnLines");

            migrationBuilder.DropTable(
                name: "SupplierReturns");

            migrationBuilder.DropUniqueConstraint(
                name: "AK_PurchaseInvoiceLines_TenantId_PurchaseInvoiceId_Id",
                table: "PurchaseInvoiceLines");

            migrationBuilder.DropIndex(
                name: "IX_InventoryTransactions_TenantId_SupplierReturnLineId",
                table: "InventoryTransactions");

            migrationBuilder.DropIndex(
                name: "IX_CustomerLedgerEntries_TenantId_SupplierReturnId",
                table: "CustomerLedgerEntries");

            migrationBuilder.DropIndex(
                name: "IX_CustomerLedgerEntries_TenantId_SupplierReturnId_CustomerId",
                table: "CustomerLedgerEntries");

            migrationBuilder.DropColumn(
                name: "SupplierReturnLineId",
                table: "InventoryTransactions");

            migrationBuilder.DropColumn(
                name: "SupplierReturnId",
                table: "CustomerLedgerEntries");
        }
    }
}
