using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Tenant
{
    /// <inheritdoc />
    public partial class AllowOrderlessSalesDelivery : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_SalesDeliveryLines_SalesDeliveries_TenantId_DeliveryId_OrderId",
                table: "SalesDeliveryLines");

            migrationBuilder.DropIndex(
                name: "IX_SalesOrders_TenantId_QuoteId",
                table: "SalesOrders");

            migrationBuilder.DropIndex(
                name: "IX_SalesInvoices_TenantId_DeliveryId",
                table: "SalesInvoices");

            migrationBuilder.DropIndex(
                name: "IX_SalesInvoiceLines_TenantId_DeliveryLineId",
                table: "SalesInvoiceLines");

            migrationBuilder.DropIndex(
                name: "IX_SalesDeliveryLines_TenantId_DeliveryId_OrderId",
                table: "SalesDeliveryLines");

            migrationBuilder.DropUniqueConstraint(
                name: "AK_SalesDeliveries_TenantId_Id_OrderId",
                table: "SalesDeliveries");

            migrationBuilder.AlterColumn<Guid>(
                name: "QuoteId",
                table: "SalesOrders",
                type: "uniqueidentifier",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier");

            migrationBuilder.AlterColumn<Guid>(
                name: "OrderId",
                table: "SalesInvoices",
                type: "uniqueidentifier",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier");

            migrationBuilder.AlterColumn<Guid>(
                name: "DeliveryId",
                table: "SalesInvoices",
                type: "uniqueidentifier",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier");

            migrationBuilder.AlterColumn<Guid>(
                name: "DeliveryLineId",
                table: "SalesInvoiceLines",
                type: "uniqueidentifier",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier");

            migrationBuilder.AlterColumn<Guid>(
                name: "OrderId",
                table: "SalesDeliveryLines",
                type: "uniqueidentifier",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier");

            migrationBuilder.AlterColumn<Guid>(
                name: "OrderId",
                table: "SalesDeliveries",
                type: "uniqueidentifier",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier");

            migrationBuilder.CreateIndex(
                name: "IX_SalesOrders_TenantId_QuoteId",
                table: "SalesOrders",
                columns: new[] { "TenantId", "QuoteId" },
                unique: true,
                filter: "[QuoteId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_SalesInvoices_TenantId_DeliveryId",
                table: "SalesInvoices",
                columns: new[] { "TenantId", "DeliveryId" },
                unique: true,
                filter: "[DeliveryId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_SalesInvoiceLines_TenantId_DeliveryLineId",
                table: "SalesInvoiceLines",
                columns: new[] { "TenantId", "DeliveryLineId" },
                unique: true,
                filter: "[DeliveryLineId] IS NOT NULL");

            migrationBuilder.AddForeignKey(
                name: "FK_SalesDeliveryLines_SalesDeliveries_TenantId_DeliveryId",
                table: "SalesDeliveryLines",
                columns: new[] { "TenantId", "DeliveryId" },
                principalTable: "SalesDeliveries",
                principalColumns: new[] { "TenantId", "Id" },
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_SalesDeliveryLines_SalesDeliveries_TenantId_DeliveryId",
                table: "SalesDeliveryLines");

            migrationBuilder.DropIndex(
                name: "IX_SalesOrders_TenantId_QuoteId",
                table: "SalesOrders");

            migrationBuilder.DropIndex(
                name: "IX_SalesInvoices_TenantId_DeliveryId",
                table: "SalesInvoices");

            migrationBuilder.DropIndex(
                name: "IX_SalesInvoiceLines_TenantId_DeliveryLineId",
                table: "SalesInvoiceLines");

            migrationBuilder.AlterColumn<Guid>(
                name: "QuoteId",
                table: "SalesOrders",
                type: "uniqueidentifier",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier",
                oldNullable: true);

            migrationBuilder.AlterColumn<Guid>(
                name: "OrderId",
                table: "SalesInvoices",
                type: "uniqueidentifier",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier",
                oldNullable: true);

            migrationBuilder.AlterColumn<Guid>(
                name: "DeliveryId",
                table: "SalesInvoices",
                type: "uniqueidentifier",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier",
                oldNullable: true);

            migrationBuilder.AlterColumn<Guid>(
                name: "DeliveryLineId",
                table: "SalesInvoiceLines",
                type: "uniqueidentifier",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier",
                oldNullable: true);

            migrationBuilder.AlterColumn<Guid>(
                name: "OrderId",
                table: "SalesDeliveryLines",
                type: "uniqueidentifier",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier",
                oldNullable: true);

            migrationBuilder.AlterColumn<Guid>(
                name: "OrderId",
                table: "SalesDeliveries",
                type: "uniqueidentifier",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier",
                oldNullable: true);

            migrationBuilder.AddUniqueConstraint(
                name: "AK_SalesDeliveries_TenantId_Id_OrderId",
                table: "SalesDeliveries",
                columns: new[] { "TenantId", "Id", "OrderId" });

            migrationBuilder.CreateIndex(
                name: "IX_SalesOrders_TenantId_QuoteId",
                table: "SalesOrders",
                columns: new[] { "TenantId", "QuoteId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SalesInvoices_TenantId_DeliveryId",
                table: "SalesInvoices",
                columns: new[] { "TenantId", "DeliveryId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SalesInvoiceLines_TenantId_DeliveryLineId",
                table: "SalesInvoiceLines",
                columns: new[] { "TenantId", "DeliveryLineId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SalesDeliveryLines_TenantId_DeliveryId_OrderId",
                table: "SalesDeliveryLines",
                columns: new[] { "TenantId", "DeliveryId", "OrderId" });

            migrationBuilder.AddForeignKey(
                name: "FK_SalesDeliveryLines_SalesDeliveries_TenantId_DeliveryId_OrderId",
                table: "SalesDeliveryLines",
                columns: new[] { "TenantId", "DeliveryId", "OrderId" },
                principalTable: "SalesDeliveries",
                principalColumns: new[] { "TenantId", "Id", "OrderId" },
                onDelete: ReferentialAction.Cascade);
        }
    }
}
