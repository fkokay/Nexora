using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddPurchaseSupplierQuotes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "SourceSupplierQuoteId",
                table: "PurchaseOrders",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "PurchaseSupplierQuotes",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PurchaseRequestId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SupplierId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    QuoteDate = table.Column<DateOnly>(type: "date", nullable: false),
                    ValidUntil = table.Column<DateOnly>(type: "date", nullable: true),
                    CurrencyCode = table.Column<string>(type: "nchar(3)", fixedLength: true, maxLength: 3, nullable: false),
                    Status = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    Subtotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    DiscountTotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    TaxTotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    GrandTotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    Notes = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PurchaseSupplierQuotes", x => x.Id);
                    table.UniqueConstraint("AK_PurchaseSupplierQuotes_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.UniqueConstraint("AK_PurchaseSupplierQuotes_TenantId_Id_PurchaseRequestId", x => new { x.TenantId, x.Id, x.PurchaseRequestId });
                    table.ForeignKey(
                        name: "FK_PurchaseSupplierQuotes_CustomerAccounts_TenantId_SupplierId",
                        columns: x => new { x.TenantId, x.SupplierId },
                        principalTable: "CustomerAccounts",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PurchaseSupplierQuotes_PurchaseRequests_TenantId_PurchaseRequestId",
                        columns: x => new { x.TenantId, x.PurchaseRequestId },
                        principalTable: "PurchaseRequests",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PurchaseSupplierQuoteLines",
                columns: table => new
                {
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    QuoteId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RequestLineNumber = table.Column<int>(type: "int", nullable: false),
                    PurchaseRequestId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
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
                    table.PrimaryKey("PK_PurchaseSupplierQuoteLines", x => new { x.TenantId, x.QuoteId, x.RequestLineNumber });
                    table.CheckConstraint("CK_PurchaseSupplierQuoteLines_DiscountRange", "[DiscountPercent] >= 0 AND [DiscountPercent] <= 100");
                    table.CheckConstraint("CK_PurchaseSupplierQuoteLines_QuantityPositive", "[Quantity] > 0");
                    table.CheckConstraint("CK_PurchaseSupplierQuoteLines_VatRange", "[VatPercent] >= 0 AND [VatPercent] <= 100");
                    table.ForeignKey(
                        name: "FK_PurchaseSupplierQuoteLines_PurchaseRequestLines_TenantId_PurchaseRequestId_RequestLineNumber",
                        columns: x => new { x.TenantId, x.PurchaseRequestId, x.RequestLineNumber },
                        principalTable: "PurchaseRequestLines",
                        principalColumns: new[] { "TenantId", "PurchaseRequestId", "LineNumber" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PurchaseSupplierQuoteLines_PurchaseSupplierQuotes_TenantId_QuoteId_PurchaseRequestId",
                        columns: x => new { x.TenantId, x.QuoteId, x.PurchaseRequestId },
                        principalTable: "PurchaseSupplierQuotes",
                        principalColumns: new[] { "TenantId", "Id", "PurchaseRequestId" },
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseOrders_TenantId_SourceSupplierQuoteId",
                table: "PurchaseOrders",
                columns: new[] { "TenantId", "SourceSupplierQuoteId" },
                unique: true,
                filter: "[SourceSupplierQuoteId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseOrders_TenantId_SourceSupplierQuoteId_SourcePurchaseRequestId",
                table: "PurchaseOrders",
                columns: new[] { "TenantId", "SourceSupplierQuoteId", "SourcePurchaseRequestId" },
                unique: true,
                filter: "[SourceSupplierQuoteId] IS NOT NULL AND [SourcePurchaseRequestId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseSupplierQuoteLines_TenantId_PurchaseRequestId_RequestLineNumber",
                table: "PurchaseSupplierQuoteLines",
                columns: new[] { "TenantId", "PurchaseRequestId", "RequestLineNumber" });

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseSupplierQuoteLines_TenantId_QuoteId_PurchaseRequestId",
                table: "PurchaseSupplierQuoteLines",
                columns: new[] { "TenantId", "QuoteId", "PurchaseRequestId" });

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseSupplierQuotes_TenantId_PurchaseRequestId_Status_CreatedAt",
                table: "PurchaseSupplierQuotes",
                columns: new[] { "TenantId", "PurchaseRequestId", "Status", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseSupplierQuotes_TenantId_SupplierId_Code",
                table: "PurchaseSupplierQuotes",
                columns: new[] { "TenantId", "SupplierId", "Code" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_PurchaseOrders_PurchaseSupplierQuotes_TenantId_SourceSupplierQuoteId_SourcePurchaseRequestId",
                table: "PurchaseOrders",
                columns: new[] { "TenantId", "SourceSupplierQuoteId", "SourcePurchaseRequestId" },
                principalTable: "PurchaseSupplierQuotes",
                principalColumns: new[] { "TenantId", "Id", "PurchaseRequestId" },
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_PurchaseOrders_PurchaseSupplierQuotes_TenantId_SourceSupplierQuoteId_SourcePurchaseRequestId",
                table: "PurchaseOrders");

            migrationBuilder.DropTable(
                name: "PurchaseSupplierQuoteLines");

            migrationBuilder.DropTable(
                name: "PurchaseSupplierQuotes");

            migrationBuilder.DropIndex(
                name: "IX_PurchaseOrders_TenantId_SourceSupplierQuoteId",
                table: "PurchaseOrders");

            migrationBuilder.DropIndex(
                name: "IX_PurchaseOrders_TenantId_SourceSupplierQuoteId_SourcePurchaseRequestId",
                table: "PurchaseOrders");

            migrationBuilder.DropColumn(
                name: "SourceSupplierQuoteId",
                table: "PurchaseOrders");
        }
    }
}
