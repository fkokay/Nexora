using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddEmployeeCategoryAndInventoryCostInvoiceLink : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "PurchaseInvoiceDraftId",
                table: "InventoryCostAdjustments",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "EmploymentCategory",
                table: "EmployeeRecords",
                type: "nvarchar(80)",
                maxLength: 80,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PurchaseInvoiceDraftId",
                table: "InventoryCostAdjustments");

            migrationBuilder.DropColumn(
                name: "EmploymentCategory",
                table: "EmployeeRecords");
        }
    }
}
