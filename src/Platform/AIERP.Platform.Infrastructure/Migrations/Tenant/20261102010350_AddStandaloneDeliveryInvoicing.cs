using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Tenant
{
    /// <inheritdoc />
    public partial class AddStandaloneDeliveryInvoicing : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "StandaloneDeliveryId",
                table: "SalesInvoices",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "StandaloneDeliveryLineId",
                table: "SalesInvoiceLines",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_SalesInvoices_TenantId_StandaloneDeliveryId",
                table: "SalesInvoices",
                columns: new[] { "TenantId", "StandaloneDeliveryId" },
                unique: true,
                filter: "[StandaloneDeliveryId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_SalesInvoiceLines_TenantId_StandaloneDeliveryLineId",
                table: "SalesInvoiceLines",
                columns: new[] { "TenantId", "StandaloneDeliveryLineId" },
                unique: true,
                filter: "[StandaloneDeliveryLineId] IS NOT NULL");

            migrationBuilder.AddForeignKey(
                name: "FK_SalesInvoiceLines_StandaloneSalesDeliveryLines_TenantId_StandaloneDeliveryLineId",
                table: "SalesInvoiceLines",
                columns: new[] { "TenantId", "StandaloneDeliveryLineId" },
                principalTable: "StandaloneSalesDeliveryLines",
                principalColumns: new[] { "TenantId", "Id" },
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_SalesInvoices_StandaloneSalesDeliveries_TenantId_StandaloneDeliveryId",
                table: "SalesInvoices",
                columns: new[] { "TenantId", "StandaloneDeliveryId" },
                principalTable: "StandaloneSalesDeliveries",
                principalColumns: new[] { "TenantId", "Id" },
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_SalesInvoiceLines_StandaloneSalesDeliveryLines_TenantId_StandaloneDeliveryLineId",
                table: "SalesInvoiceLines");

            migrationBuilder.DropForeignKey(
                name: "FK_SalesInvoices_StandaloneSalesDeliveries_TenantId_StandaloneDeliveryId",
                table: "SalesInvoices");

            migrationBuilder.DropIndex(
                name: "IX_SalesInvoices_TenantId_StandaloneDeliveryId",
                table: "SalesInvoices");

            migrationBuilder.DropIndex(
                name: "IX_SalesInvoiceLines_TenantId_StandaloneDeliveryLineId",
                table: "SalesInvoiceLines");

            migrationBuilder.DropColumn(
                name: "StandaloneDeliveryId",
                table: "SalesInvoices");

            migrationBuilder.DropColumn(
                name: "StandaloneDeliveryLineId",
                table: "SalesInvoiceLines");
        }
    }
}
