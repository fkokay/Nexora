using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Tenant;

[DbContext(typeof(TenantDbContext))]
[Migration("20261108190000_AddManufacturingProductionActuals")]
public sealed class AddManufacturingProductionActuals : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<decimal>(name: "ActualGoodQuantity", table: "ManufacturingOrders", type: "decimal(18,4)", precision: 18, scale: 4, nullable: true);
        migrationBuilder.AddColumn<decimal>(name: "ScrapQuantity", table: "ManufacturingOrders", type: "decimal(18,4)", precision: 18, scale: 4, nullable: true);
        migrationBuilder.AddColumn<string>(name: "ScrapReason", table: "ManufacturingOrders", type: "nvarchar(500)", maxLength: 500, nullable: true);
        migrationBuilder.AddCheckConstraint(name: "CK_ManufacturingOrders_ProductionActuals", table: "ManufacturingOrders",
            sql: "([ActualGoodQuantity] IS NULL AND [ScrapQuantity] IS NULL AND [ScrapReason] IS NULL) OR ([ActualGoodQuantity] IS NOT NULL AND [ScrapQuantity] IS NOT NULL AND [ActualGoodQuantity] > 0 AND [ScrapQuantity] >= 0 AND [ActualGoodQuantity] + [ScrapQuantity] = [PlannedQuantity] AND ([ScrapQuantity] = 0 OR NULLIF(LTRIM(RTRIM([ScrapReason])), '') IS NOT NULL))");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropCheckConstraint(name: "CK_ManufacturingOrders_ProductionActuals", table: "ManufacturingOrders");
        migrationBuilder.DropColumn(name: "ActualGoodQuantity", table: "ManufacturingOrders");
        migrationBuilder.DropColumn(name: "ScrapQuantity", table: "ManufacturingOrders");
        migrationBuilder.DropColumn(name: "ScrapReason", table: "ManufacturingOrders");
    }
}
