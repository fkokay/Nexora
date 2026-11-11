using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Tenant;

[DbContext(typeof(TenantDbContext))]
[Migration("20261108200000_AddManufacturingOperationOperator")]
public sealed class AddManufacturingOperationOperator : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<Guid>(name: "PerformedByEmployeeId", table: "ManufacturingOrderOperations", type: "uniqueidentifier", nullable: true);
        migrationBuilder.CreateIndex(name: "IX_ManufacturingOrderOperations_TenantId_PerformedByEmployeeId",
            table: "ManufacturingOrderOperations", columns: ["TenantId", "PerformedByEmployeeId"]);
        migrationBuilder.AddForeignKey(name: "FK_ManufacturingOrderOperations_EmployeeRecords_TenantId_PerformedByEmployeeId",
            table: "ManufacturingOrderOperations", columns: ["TenantId", "PerformedByEmployeeId"],
            principalTable: "EmployeeRecords", principalColumns: ["TenantId", "Id"], onDelete: ReferentialAction.Restrict);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropForeignKey(name: "FK_ManufacturingOrderOperations_EmployeeRecords_TenantId_PerformedByEmployeeId",
            table: "ManufacturingOrderOperations");
        migrationBuilder.DropIndex(name: "IX_ManufacturingOrderOperations_TenantId_PerformedByEmployeeId",
            table: "ManufacturingOrderOperations");
        migrationBuilder.DropColumn(name: "PerformedByEmployeeId", table: "ManufacturingOrderOperations");
    }
}
