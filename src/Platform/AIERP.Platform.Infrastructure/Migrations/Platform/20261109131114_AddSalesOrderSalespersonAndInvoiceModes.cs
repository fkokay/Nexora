using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Platform
{
    /// <inheritdoc />
    public partial class AddSalesOrderSalespersonAndInvoiceModes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "DeliveryTerms",
                table: "SalesQuotes",
                type: "nvarchar(1000)",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "SalespersonEmployeeId",
                table: "SalesQuotes",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "EnteredCurrencyCode",
                table: "SalesQuoteLines",
                type: "varchar(3)",
                unicode: false,
                maxLength: 3,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "EnteredUnitCode",
                table: "SalesQuoteLines",
                type: "nvarchar(8)",
                maxLength: 8,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<decimal>(
                name: "EnteredUnitPrice",
                table: "SalesQuoteLines",
                type: "decimal(18,4)",
                precision: 18,
                scale: 4,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "ExchangeRateToQuoteCurrency",
                table: "SalesQuoteLines",
                type: "decimal(18,8)",
                precision: 18,
                scale: 8,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<bool>(
                name: "IsVatIncluded",
                table: "SalesQuoteLines",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<Guid>(
                name: "SalespersonEmployeeId",
                table: "SalesOrders",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "EnteredCurrencyCode",
                table: "SalesOrderLines",
                type: "varchar(3)",
                unicode: false,
                maxLength: 3,
                nullable: false,
                defaultValue: "TRY");

            migrationBuilder.AddColumn<string>(
                name: "EnteredUnitCode",
                table: "SalesOrderLines",
                type: "nvarchar(8)",
                maxLength: 8,
                nullable: false,
                defaultValue: "EA");

            migrationBuilder.AddColumn<decimal>(
                name: "EnteredUnitPrice",
                table: "SalesOrderLines",
                type: "decimal(18,4)",
                precision: 18,
                scale: 4,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "ExchangeRateToOrderCurrency",
                table: "SalesOrderLines",
                type: "decimal(18,8)",
                precision: 18,
                scale: 8,
                nullable: false,
                defaultValue: 1m);

            migrationBuilder.AddColumn<bool>(
                name: "IsVatIncluded",
                table: "SalesOrderLines",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "InvoiceType",
                table: "SalesInvoices",
                type: "nvarchar(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "");

            migrationBuilder.CreateIndex(
                name: "IX_SalesOrders_TenantId_SalespersonEmployeeId",
                table: "SalesOrders",
                columns: new[] { "TenantId", "SalespersonEmployeeId" });

            migrationBuilder.AddForeignKey(
                name: "FK_SalesOrders_EmployeeRecords_TenantId_SalespersonEmployeeId",
                table: "SalesOrders",
                columns: new[] { "TenantId", "SalespersonEmployeeId" },
                principalTable: "EmployeeRecords",
                principalColumns: new[] { "TenantId", "Id" },
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_SalesOrders_EmployeeRecords_TenantId_SalespersonEmployeeId",
                table: "SalesOrders");

            migrationBuilder.DropIndex(
                name: "IX_SalesOrders_TenantId_SalespersonEmployeeId",
                table: "SalesOrders");

            migrationBuilder.DropColumn(
                name: "DeliveryTerms",
                table: "SalesQuotes");

            migrationBuilder.DropColumn(
                name: "SalespersonEmployeeId",
                table: "SalesQuotes");

            migrationBuilder.DropColumn(
                name: "EnteredCurrencyCode",
                table: "SalesQuoteLines");

            migrationBuilder.DropColumn(
                name: "EnteredUnitCode",
                table: "SalesQuoteLines");

            migrationBuilder.DropColumn(
                name: "EnteredUnitPrice",
                table: "SalesQuoteLines");

            migrationBuilder.DropColumn(
                name: "ExchangeRateToQuoteCurrency",
                table: "SalesQuoteLines");

            migrationBuilder.DropColumn(
                name: "IsVatIncluded",
                table: "SalesQuoteLines");

            migrationBuilder.DropColumn(
                name: "SalespersonEmployeeId",
                table: "SalesOrders");

            migrationBuilder.DropColumn(
                name: "EnteredCurrencyCode",
                table: "SalesOrderLines");

            migrationBuilder.DropColumn(
                name: "EnteredUnitCode",
                table: "SalesOrderLines");

            migrationBuilder.DropColumn(
                name: "EnteredUnitPrice",
                table: "SalesOrderLines");

            migrationBuilder.DropColumn(
                name: "ExchangeRateToOrderCurrency",
                table: "SalesOrderLines");

            migrationBuilder.DropColumn(
                name: "IsVatIncluded",
                table: "SalesOrderLines");

            migrationBuilder.DropColumn(
                name: "InvoiceType",
                table: "SalesInvoices");
        }
    }
}
