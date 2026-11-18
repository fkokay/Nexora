using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Tenant
{
    /// <inheritdoc />
    public partial class AddTenantRequestlessSupplierQuotes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_PurchaseOrders_PurchaseSupplierQuotes_TenantId_SourceSupplierQuoteId_SourcePurchaseRequestId",
                table: "PurchaseOrders");

            migrationBuilder.DropForeignKey(
                name: "FK_PurchaseSupplierQuoteLines_PurchaseSupplierQuotes_TenantId_QuoteId_PurchaseRequestId",
                table: "PurchaseSupplierQuoteLines");

            migrationBuilder.DropUniqueConstraint(
                name: "AK_PurchaseSupplierQuotes_TenantId_Id_PurchaseRequestId",
                table: "PurchaseSupplierQuotes");

            migrationBuilder.DropIndex(
                name: "IX_PurchaseSupplierQuoteLines_TenantId_QuoteId_PurchaseRequestId",
                table: "PurchaseSupplierQuoteLines");

            migrationBuilder.DropIndex(
                name: "IX_PurchaseOrders_TenantId_SourceSupplierQuoteId_SourcePurchaseRequestId",
                table: "PurchaseOrders");

            migrationBuilder.AlterColumn<Guid>(
                name: "PurchaseRequestId",
                table: "PurchaseSupplierQuotes",
                type: "uniqueidentifier",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier");

            migrationBuilder.AlterColumn<Guid>(
                name: "PurchaseRequestId",
                table: "PurchaseSupplierQuoteLines",
                type: "uniqueidentifier",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier");

            migrationBuilder.AddColumn<Guid>(
                name: "StockItemId",
                table: "PurchaseSupplierQuoteLines",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseSupplierQuoteLines_TenantId_StockItemId",
                table: "PurchaseSupplierQuoteLines",
                columns: new[] { "TenantId", "StockItemId" });

            migrationBuilder.AddForeignKey(
                name: "FK_PurchaseOrders_PurchaseSupplierQuotes_TenantId_SourceSupplierQuoteId",
                table: "PurchaseOrders",
                columns: new[] { "TenantId", "SourceSupplierQuoteId" },
                principalTable: "PurchaseSupplierQuotes",
                principalColumns: new[] { "TenantId", "Id" },
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_PurchaseSupplierQuoteLines_PurchaseSupplierQuotes_TenantId_QuoteId",
                table: "PurchaseSupplierQuoteLines",
                columns: new[] { "TenantId", "QuoteId" },
                principalTable: "PurchaseSupplierQuotes",
                principalColumns: new[] { "TenantId", "Id" },
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_PurchaseSupplierQuoteLines_StockItems_TenantId_StockItemId",
                table: "PurchaseSupplierQuoteLines",
                columns: new[] { "TenantId", "StockItemId" },
                principalTable: "StockItems",
                principalColumns: new[] { "TenantId", "Id" },
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_PurchaseOrders_PurchaseSupplierQuotes_TenantId_SourceSupplierQuoteId",
                table: "PurchaseOrders");

            migrationBuilder.DropForeignKey(
                name: "FK_PurchaseSupplierQuoteLines_PurchaseSupplierQuotes_TenantId_QuoteId",
                table: "PurchaseSupplierQuoteLines");

            migrationBuilder.DropForeignKey(
                name: "FK_PurchaseSupplierQuoteLines_StockItems_TenantId_StockItemId",
                table: "PurchaseSupplierQuoteLines");

            migrationBuilder.DropIndex(
                name: "IX_PurchaseSupplierQuoteLines_TenantId_StockItemId",
                table: "PurchaseSupplierQuoteLines");

            migrationBuilder.DropColumn(
                name: "StockItemId",
                table: "PurchaseSupplierQuoteLines");

            migrationBuilder.AlterColumn<Guid>(
                name: "PurchaseRequestId",
                table: "PurchaseSupplierQuotes",
                type: "uniqueidentifier",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier",
                oldNullable: true);

            migrationBuilder.AlterColumn<Guid>(
                name: "PurchaseRequestId",
                table: "PurchaseSupplierQuoteLines",
                type: "uniqueidentifier",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier",
                oldNullable: true);

            migrationBuilder.AddUniqueConstraint(
                name: "AK_PurchaseSupplierQuotes_TenantId_Id_PurchaseRequestId",
                table: "PurchaseSupplierQuotes",
                columns: new[] { "TenantId", "Id", "PurchaseRequestId" });

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseSupplierQuoteLines_TenantId_QuoteId_PurchaseRequestId",
                table: "PurchaseSupplierQuoteLines",
                columns: new[] { "TenantId", "QuoteId", "PurchaseRequestId" });

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseOrders_TenantId_SourceSupplierQuoteId_SourcePurchaseRequestId",
                table: "PurchaseOrders",
                columns: new[] { "TenantId", "SourceSupplierQuoteId", "SourcePurchaseRequestId" },
                unique: true,
                filter: "[SourceSupplierQuoteId] IS NOT NULL AND [SourcePurchaseRequestId] IS NOT NULL");

            migrationBuilder.AddForeignKey(
                name: "FK_PurchaseOrders_PurchaseSupplierQuotes_TenantId_SourceSupplierQuoteId_SourcePurchaseRequestId",
                table: "PurchaseOrders",
                columns: new[] { "TenantId", "SourceSupplierQuoteId", "SourcePurchaseRequestId" },
                principalTable: "PurchaseSupplierQuotes",
                principalColumns: new[] { "TenantId", "Id", "PurchaseRequestId" },
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_PurchaseSupplierQuoteLines_PurchaseSupplierQuotes_TenantId_QuoteId_PurchaseRequestId",
                table: "PurchaseSupplierQuoteLines",
                columns: new[] { "TenantId", "QuoteId", "PurchaseRequestId" },
                principalTable: "PurchaseSupplierQuotes",
                principalColumns: new[] { "TenantId", "Id", "PurchaseRequestId" },
                onDelete: ReferentialAction.Cascade);
        }
    }
}
