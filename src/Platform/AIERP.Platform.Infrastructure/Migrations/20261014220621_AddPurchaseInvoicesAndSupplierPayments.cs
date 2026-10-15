using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddPurchaseInvoicesAndSupplierPayments : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "PurchaseInvoiceId",
                table: "CustomerLedgerEntries",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "SupplierPaymentId",
                table: "CustomerLedgerEntries",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "PurchaseInvoices",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PurchaseReceiptId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PurchaseOrderId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SupplierId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    InvoiceDate = table.Column<DateOnly>(type: "date", nullable: false),
                    CurrencyCode = table.Column<string>(type: "nchar(3)", fixedLength: true, maxLength: 3, nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    Subtotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    DiscountTotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    TaxTotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    GrandTotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PurchaseInvoices", x => x.Id);
                    table.UniqueConstraint("AK_PurchaseInvoices_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_PurchaseInvoices_GrandTotalPositive", "[GrandTotal] > 0");
                    table.ForeignKey(
                        name: "FK_PurchaseInvoices_CustomerAccounts_TenantId_SupplierId",
                        columns: x => new { x.TenantId, x.SupplierId },
                        principalTable: "CustomerAccounts",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PurchaseInvoices_PurchaseReceipts_TenantId_PurchaseReceiptId",
                        columns: x => new { x.TenantId, x.PurchaseReceiptId },
                        principalTable: "PurchaseReceipts",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PurchaseInvoices_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PurchaseInvoiceLines",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PurchaseInvoiceId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PurchaseReceiptLineId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
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
                    table.PrimaryKey("PK_PurchaseInvoiceLines", x => x.Id);
                    table.UniqueConstraint("AK_PurchaseInvoiceLines_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_PurchaseInvoiceLines_QuantityPositive", "[Quantity] > 0");
                    table.ForeignKey(
                        name: "FK_PurchaseInvoiceLines_PurchaseInvoices_TenantId_PurchaseInvoiceId",
                        columns: x => new { x.TenantId, x.PurchaseInvoiceId },
                        principalTable: "PurchaseInvoices",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_PurchaseInvoiceLines_PurchaseReceiptLines_TenantId_PurchaseReceiptLineId",
                        columns: x => new { x.TenantId, x.PurchaseReceiptLineId },
                        principalTable: "PurchaseReceiptLines",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "SupplierPayments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RequestId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PurchaseInvoiceId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SupplierId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    PaymentDate = table.Column<DateOnly>(type: "date", nullable: false),
                    CurrencyCode = table.Column<string>(type: "nchar(3)", fixedLength: true, maxLength: 3, nullable: false),
                    Amount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    PaymentMethod = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Reference = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    Status = table.Column<int>(type: "int", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SupplierPayments", x => x.Id);
                    table.UniqueConstraint("AK_SupplierPayments_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_SupplierPayments_AmountPositive", "[Amount] > 0");
                    table.ForeignKey(
                        name: "FK_SupplierPayments_CustomerAccounts_TenantId_SupplierId",
                        columns: x => new { x.TenantId, x.SupplierId },
                        principalTable: "CustomerAccounts",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SupplierPayments_PurchaseInvoices_TenantId_PurchaseInvoiceId",
                        columns: x => new { x.TenantId, x.PurchaseInvoiceId },
                        principalTable: "PurchaseInvoices",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SupplierPayments_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CustomerLedgerEntries_TenantId_PurchaseInvoiceId",
                table: "CustomerLedgerEntries",
                columns: new[] { "TenantId", "PurchaseInvoiceId" });

            migrationBuilder.CreateIndex(
                name: "IX_CustomerLedgerEntries_TenantId_SupplierPaymentId",
                table: "CustomerLedgerEntries",
                columns: new[] { "TenantId", "SupplierPaymentId" });

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseInvoiceLines_TenantId_PurchaseInvoiceId",
                table: "PurchaseInvoiceLines",
                columns: new[] { "TenantId", "PurchaseInvoiceId" });

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseInvoiceLines_TenantId_PurchaseReceiptLineId",
                table: "PurchaseInvoiceLines",
                columns: new[] { "TenantId", "PurchaseReceiptLineId" });

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseInvoices_TenantId_Code",
                table: "PurchaseInvoices",
                columns: new[] { "TenantId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseInvoices_TenantId_PurchaseReceiptId",
                table: "PurchaseInvoices",
                columns: new[] { "TenantId", "PurchaseReceiptId" },
                unique: true,
                filter: "[Status] = 1");

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseInvoices_TenantId_SupplierId_InvoiceDate_CreatedAt",
                table: "PurchaseInvoices",
                columns: new[] { "TenantId", "SupplierId", "InvoiceDate", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_SupplierPayments_TenantId_Code",
                table: "SupplierPayments",
                columns: new[] { "TenantId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SupplierPayments_TenantId_PurchaseInvoiceId_Status_PaymentDate",
                table: "SupplierPayments",
                columns: new[] { "TenantId", "PurchaseInvoiceId", "Status", "PaymentDate" });

            migrationBuilder.CreateIndex(
                name: "IX_SupplierPayments_TenantId_RequestId",
                table: "SupplierPayments",
                columns: new[] { "TenantId", "RequestId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SupplierPayments_TenantId_SupplierId",
                table: "SupplierPayments",
                columns: new[] { "TenantId", "SupplierId" });

            migrationBuilder.AddForeignKey(
                name: "FK_CustomerLedgerEntries_PurchaseInvoices_TenantId_PurchaseInvoiceId",
                table: "CustomerLedgerEntries",
                columns: new[] { "TenantId", "PurchaseInvoiceId" },
                principalTable: "PurchaseInvoices",
                principalColumns: new[] { "TenantId", "Id" },
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_CustomerLedgerEntries_SupplierPayments_TenantId_SupplierPaymentId",
                table: "CustomerLedgerEntries",
                columns: new[] { "TenantId", "SupplierPaymentId" },
                principalTable: "SupplierPayments",
                principalColumns: new[] { "TenantId", "Id" },
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_CustomerLedgerEntries_PurchaseInvoices_TenantId_PurchaseInvoiceId",
                table: "CustomerLedgerEntries");

            migrationBuilder.DropForeignKey(
                name: "FK_CustomerLedgerEntries_SupplierPayments_TenantId_SupplierPaymentId",
                table: "CustomerLedgerEntries");

            migrationBuilder.DropTable(
                name: "PurchaseInvoiceLines");

            migrationBuilder.DropTable(
                name: "SupplierPayments");

            migrationBuilder.DropTable(
                name: "PurchaseInvoices");

            migrationBuilder.DropIndex(
                name: "IX_CustomerLedgerEntries_TenantId_PurchaseInvoiceId",
                table: "CustomerLedgerEntries");

            migrationBuilder.DropIndex(
                name: "IX_CustomerLedgerEntries_TenantId_SupplierPaymentId",
                table: "CustomerLedgerEntries");

            migrationBuilder.DropColumn(
                name: "PurchaseInvoiceId",
                table: "CustomerLedgerEntries");

            migrationBuilder.DropColumn(
                name: "SupplierPaymentId",
                table: "CustomerLedgerEntries");
        }
    }
}
