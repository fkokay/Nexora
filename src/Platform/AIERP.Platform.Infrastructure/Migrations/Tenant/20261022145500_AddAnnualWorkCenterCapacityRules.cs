using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Tenant
{
    public partial class AddAnnualWorkCenterCapacityRules : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ManufacturingWorkCenterAnnualCapacityRules",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    WorkCenterId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Month = table.Column<int>(type: "int", nullable: false),
                    Day = table.Column<int>(type: "int", nullable: false),
                    CapacityMinutes = table.Column<int>(type: "int", nullable: false),
                    Note = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ManufacturingWorkCenterAnnualCapacityRules", x => x.Id);
                    table.UniqueConstraint("AK_ManufacturingWorkCenterAnnualCapacityRules_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_ManufacturingWorkCenterAnnualCapacityRules_Capacity", "[CapacityMinutes] BETWEEN 0 AND 1440");
                    table.CheckConstraint("CK_ManufacturingWorkCenterAnnualCapacityRules_MonthDay", "([Month] BETWEEN 1 AND 12) AND ([Day] BETWEEN 1 AND 31) AND NOT ([Month] IN (4, 6, 9, 11) AND [Day] = 31) AND NOT ([Month] = 2 AND [Day] > 29)");
                    table.ForeignKey("FK_ManufacturingWorkCenterAnnualCapacityRules_Tenants_TenantId", x => x.TenantId, "Tenants", "Id", onDelete: ReferentialAction.Restrict);
                    table.ForeignKey("FK_ManufacturingWorkCenterAnnualCapacityRules_ManufacturingWorkCenters_TenantId_WorkCenterId", x => new { x.TenantId, x.WorkCenterId }, "ManufacturingWorkCenters", new[] { "TenantId", "Id" }, onDelete: ReferentialAction.Cascade);
                });
            migrationBuilder.CreateIndex(name: "IX_ManufacturingWorkCenterAnnualCapacityRules_TenantId_WorkCenterId_Month_Day", table: "ManufacturingWorkCenterAnnualCapacityRules", columns: new[] { "TenantId", "WorkCenterId", "Month", "Day" }, unique: true);
        }
        protected override void Down(MigrationBuilder migrationBuilder) => migrationBuilder.DropTable(name: "ManufacturingWorkCenterAnnualCapacityRules");
    }
}
