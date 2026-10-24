using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Tenant
{
    /// <inheritdoc />
    public partial class AddPurchaseInvoiceDrafts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {


            migrationBuilder.CreateTable(
                name: "PurchaseInvoiceDrafts",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SupplierId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RequestId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    InvoiceNumber = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    InvoiceDate = table.Column<DateOnly>(type: "date", nullable: false),
                    DueDate = table.Column<DateOnly>(type: "date", nullable: true),
                    CurrencyCode = table.Column<string>(type: "nchar(3)", fixedLength: true, maxLength: 3, nullable: false),
                    Notes = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    Subtotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    DiscountTotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    TaxTotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    GrandTotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PurchaseInvoiceDrafts", x => x.Id);
                    table.UniqueConstraint("AK_PurchaseInvoiceDrafts_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_PurchaseInvoiceDrafts_Amounts", "[Subtotal] >= 0 AND [DiscountTotal] >= 0 AND [TaxTotal] >= 0 AND [GrandTotal] >= 0");
                    table.CheckConstraint("CK_PurchaseInvoiceDrafts_DueDate", "[DueDate] IS NULL OR [DueDate] >= [InvoiceDate]");
                    table.CheckConstraint("CK_PurchaseInvoiceDrafts_Status", "[Status] = 1");
                    table.ForeignKey(
                        name: "FK_PurchaseInvoiceDrafts_CustomerAccounts_TenantId_SupplierId",
                        columns: x => new { x.TenantId, x.SupplierId },
                        principalTable: "CustomerAccounts",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PurchaseInvoiceDrafts_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });


            migrationBuilder.CreateTable(
                name: "PurchaseInvoiceDraftLines",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PurchaseInvoiceDraftId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    LineNumber = table.Column<int>(type: "int", nullable: false),
                    Description = table.Column<string>(type: "nvarchar(240)", maxLength: 240, nullable: false),
                    Quantity = table.Column<decimal>(type: "decimal(18,4)", precision: 18, scale: 4, nullable: true),
                    UnitCode = table.Column<string>(type: "nvarchar(12)", maxLength: 12, nullable: true),
                    UnitPrice = table.Column<decimal>(type: "decimal(18,4)", precision: 18, scale: 4, nullable: true),
                    Subtotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    DiscountAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    TaxAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    Total = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PurchaseInvoiceDraftLines", x => x.Id);
                    table.UniqueConstraint("AK_PurchaseInvoiceDraftLines_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_PurchaseInvoiceDraftLines_Amounts", "[Subtotal] >= 0 AND [DiscountAmount] >= 0 AND [TaxAmount] >= 0 AND [Total] >= 0");
                    table.ForeignKey(
                        name: "FK_PurchaseInvoiceDraftLines_PurchaseInvoiceDrafts_TenantId_PurchaseInvoiceDraftId",
                        columns: x => new { x.TenantId, x.PurchaseInvoiceDraftId },
                        principalTable: "PurchaseInvoiceDrafts",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Cascade);
                });






            migrationBuilder.CreateIndex(
                name: "IX_PurchaseInvoiceDraftLines_TenantId_PurchaseInvoiceDraftId_LineNumber",
                table: "PurchaseInvoiceDraftLines",
                columns: new[] { "TenantId", "PurchaseInvoiceDraftId", "LineNumber" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseInvoiceDrafts_TenantId_RequestId",
                table: "PurchaseInvoiceDrafts",
                columns: new[] { "TenantId", "RequestId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseInvoiceDrafts_TenantId_SupplierId_InvoiceDate_CreatedAt",
                table: "PurchaseInvoiceDrafts",
                columns: new[] { "TenantId", "SupplierId", "InvoiceDate", "CreatedAt" });



        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {


            migrationBuilder.DropTable(
                name: "PurchaseInvoiceDraftLines");


            migrationBuilder.DropTable(
                name: "PurchaseInvoiceDrafts");
        }
    }
}
