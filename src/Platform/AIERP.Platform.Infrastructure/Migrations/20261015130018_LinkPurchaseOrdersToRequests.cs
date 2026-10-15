using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class LinkPurchaseOrdersToRequests : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "SourcePurchaseRequestId",
                table: "PurchaseOrders",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseOrders_TenantId_SourcePurchaseRequestId",
                table: "PurchaseOrders",
                columns: new[] { "TenantId", "SourcePurchaseRequestId" },
                unique: true,
                filter: "[SourcePurchaseRequestId] IS NOT NULL");

            migrationBuilder.AddForeignKey(
                name: "FK_PurchaseOrders_PurchaseRequests_TenantId_SourcePurchaseRequestId",
                table: "PurchaseOrders",
                columns: new[] { "TenantId", "SourcePurchaseRequestId" },
                principalTable: "PurchaseRequests",
                principalColumns: new[] { "TenantId", "Id" },
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_PurchaseOrders_PurchaseRequests_TenantId_SourcePurchaseRequestId",
                table: "PurchaseOrders");

            migrationBuilder.DropIndex(
                name: "IX_PurchaseOrders_TenantId_SourcePurchaseRequestId",
                table: "PurchaseOrders");

            migrationBuilder.DropColumn(
                name: "SourcePurchaseRequestId",
                table: "PurchaseOrders");
        }
    }
}
