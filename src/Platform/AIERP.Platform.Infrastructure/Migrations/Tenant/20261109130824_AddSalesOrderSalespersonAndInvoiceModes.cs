using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Tenant
{
    /// <inheritdoc />
    public partial class AddSalesOrderSalespersonAndInvoiceModes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "SalespersonEmployeeId",
                table: "SalesOrders",
                type: "uniqueidentifier",
                nullable: true);

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
                name: "SalespersonEmployeeId",
                table: "SalesOrders");

            migrationBuilder.DropColumn(
                name: "IsVatIncluded",
                table: "SalesOrderLines");

            migrationBuilder.DropColumn(
                name: "InvoiceType",
                table: "SalesInvoices");
        }
    }
}
