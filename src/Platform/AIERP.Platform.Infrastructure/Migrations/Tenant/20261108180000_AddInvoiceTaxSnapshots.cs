using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Tenant;

[DbContext(typeof(TenantDbContext))]
[Migration("20261108180000_AddInvoiceTaxSnapshots")]
public sealed class AddInvoiceTaxSnapshots : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(name: "AccountingProfileCode", table: "SalesInvoices", type: "varchar(32)", unicode: false, maxLength: 32, nullable: true);
        migrationBuilder.AddColumn<string>(name: "TaxBreakdownJson", table: "SalesInvoices", type: "nvarchar(max)", nullable: false, defaultValue: "[]");
        migrationBuilder.AddColumn<string>(name: "TaxBreakdownJson", table: "SalesInvoiceLines", type: "nvarchar(max)", nullable: false, defaultValue: "[]");
        migrationBuilder.AddColumn<string>(name: "AccountingProfileCode", table: "PurchaseInvoices", type: "varchar(32)", unicode: false, maxLength: 32, nullable: true);
        migrationBuilder.AddColumn<string>(name: "TaxBreakdownJson", table: "PurchaseInvoices", type: "nvarchar(max)", nullable: false, defaultValue: "[]");
        migrationBuilder.AddColumn<string>(name: "TaxBreakdownJson", table: "PurchaseInvoiceLines", type: "nvarchar(max)", nullable: false, defaultValue: "[]");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(name: "AccountingProfileCode", table: "SalesInvoices");
        migrationBuilder.DropColumn(name: "TaxBreakdownJson", table: "SalesInvoices");
        migrationBuilder.DropColumn(name: "TaxBreakdownJson", table: "SalesInvoiceLines");
        migrationBuilder.DropColumn(name: "AccountingProfileCode", table: "PurchaseInvoices");
        migrationBuilder.DropColumn(name: "TaxBreakdownJson", table: "PurchaseInvoices");
        migrationBuilder.DropColumn(name: "TaxBreakdownJson", table: "PurchaseInvoiceLines");
    }
}
