using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace AIERP.Platform.Infrastructure.Migrations.Platform
{
    /// <inheritdoc />
    public partial class AllowStandaloneSalesOrders : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_SalesOrders_TenantId_QuoteId",
                table: "SalesOrders");

            migrationBuilder.AlterColumn<Guid>(
                name: "QuoteId",
                table: "SalesOrders",
                type: "uniqueidentifier",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier");

            migrationBuilder.AddColumn<int>(
                name: "VukCommuniqueNumber",
                table: "FixedAssets",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "VukDepreciationLowerLimitTry",
                table: "FixedAssets",
                type: "decimal(18,2)",
                precision: 18,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "VukSourceUrl",
                table: "FixedAssets",
                type: "nvarchar(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "VukTaxYear",
                table: "FixedAssets",
                type: "int",
                nullable: true);

            migrationBuilder.InsertData(
                table: "PermissionDefinitions",
                columns: new[] { "Code", "Action", "Description", "ResourceType" },
                values: new object[,]
                {
                    { "erp.customer-locations.create", "create", "create · Customer address province and district definitions", "erp.customer-locations" },
                    { "erp.customer-locations.delete", "delete", "delete · Customer address province and district definitions", "erp.customer-locations" },
                    { "erp.customer-locations.execute", "execute", "execute · Customer address province and district definitions", "erp.customer-locations" },
                    { "erp.customer-locations.read", "read", "read · Customer address province and district definitions", "erp.customer-locations" },
                    { "erp.customer-locations.update", "update", "update · Customer address province and district definitions", "erp.customer-locations" }
                });

            migrationBuilder.CreateIndex(
                name: "IX_SalesOrders_TenantId_QuoteId",
                table: "SalesOrders",
                columns: new[] { "TenantId", "QuoteId" },
                unique: true,
                filter: "[QuoteId] IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_SalesOrders_TenantId_QuoteId",
                table: "SalesOrders");

            migrationBuilder.DeleteData(
                table: "PermissionDefinitions",
                keyColumn: "Code",
                keyValue: "erp.customer-locations.create");

            migrationBuilder.DeleteData(
                table: "PermissionDefinitions",
                keyColumn: "Code",
                keyValue: "erp.customer-locations.delete");

            migrationBuilder.DeleteData(
                table: "PermissionDefinitions",
                keyColumn: "Code",
                keyValue: "erp.customer-locations.execute");

            migrationBuilder.DeleteData(
                table: "PermissionDefinitions",
                keyColumn: "Code",
                keyValue: "erp.customer-locations.read");

            migrationBuilder.DeleteData(
                table: "PermissionDefinitions",
                keyColumn: "Code",
                keyValue: "erp.customer-locations.update");

            migrationBuilder.DropColumn(
                name: "VukCommuniqueNumber",
                table: "FixedAssets");

            migrationBuilder.DropColumn(
                name: "VukDepreciationLowerLimitTry",
                table: "FixedAssets");

            migrationBuilder.DropColumn(
                name: "VukSourceUrl",
                table: "FixedAssets");

            migrationBuilder.DropColumn(
                name: "VukTaxYear",
                table: "FixedAssets");

            migrationBuilder.AlterColumn<Guid>(
                name: "QuoteId",
                table: "SalesOrders",
                type: "uniqueidentifier",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier",
                oldNullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_SalesOrders_TenantId_QuoteId",
                table: "SalesOrders",
                columns: new[] { "TenantId", "QuoteId" },
                unique: true);
        }
    }
}
