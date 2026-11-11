using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Tenant;

[DbContext(typeof(TenantDbContext))]
[Migration("20261108210000_LinkManufacturingOrderToSalesOrderLine")]
public sealed class LinkManufacturingOrderToSalesOrderLine : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<Guid>(name: "SourceSalesOrderId", table: "ManufacturingOrders", type: "uniqueidentifier", nullable: true);
        migrationBuilder.AddColumn<int>(name: "SourceSalesOrderLineNumber", table: "ManufacturingOrders", type: "int", nullable: true);
        migrationBuilder.CreateIndex(name: "IX_ManufacturingOrders_TenantId_SourceSalesOrderId_SourceSalesOrderLineNumber",
            table: "ManufacturingOrders", columns: ["TenantId", "SourceSalesOrderId", "SourceSalesOrderLineNumber"]);
        migrationBuilder.AddForeignKey(name: "FK_ManufacturingOrders_SalesOrderLines_TenantId_SourceSalesOrderId_SourceSalesOrderLineNumber",
            table: "ManufacturingOrders", columns: ["TenantId", "SourceSalesOrderId", "SourceSalesOrderLineNumber"],
            principalTable: "SalesOrderLines", principalColumns: ["TenantId", "OrderId", "LineNumber"], onDelete: ReferentialAction.Restrict);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropForeignKey(name: "FK_ManufacturingOrders_SalesOrderLines_TenantId_SourceSalesOrderId_SourceSalesOrderLineNumber",
            table: "ManufacturingOrders");
        migrationBuilder.DropIndex(name: "IX_ManufacturingOrders_TenantId_SourceSalesOrderId_SourceSalesOrderLineNumber",
            table: "ManufacturingOrders");
        migrationBuilder.DropColumn(name: "SourceSalesOrderId", table: "ManufacturingOrders");
        migrationBuilder.DropColumn(name: "SourceSalesOrderLineNumber", table: "ManufacturingOrders");
    }
}
