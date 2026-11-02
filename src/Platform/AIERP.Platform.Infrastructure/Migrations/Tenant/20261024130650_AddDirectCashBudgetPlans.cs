using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Tenant
{
    /// <inheritdoc />
    public partial class AddDirectCashBudgetPlans : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "DirectCashBudgetPlans",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    FiscalYear = table.Column<int>(type: "int", nullable: false),
                    CurrencyCode = table.Column<string>(type: "varchar(3)", unicode: false, maxLength: 3, nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    ApprovedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ApprovedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    Revision = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DirectCashBudgetPlans", x => x.Id);
                    table.UniqueConstraint("AK_DirectCashBudgetPlans_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_DirectCashBudgetPlans_FiscalYear", "[FiscalYear] BETWEEN 2000 AND 2100");
                    table.ForeignKey(
                        name: "FK_DirectCashBudgetPlans_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "DirectCashBudgetLines",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PlanId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PeriodStart = table.Column<DateOnly>(type: "date", nullable: false),
                    Direction = table.Column<int>(type: "int", nullable: false),
                    Category = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(240)", maxLength: 240, nullable: false),
                    Amount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DirectCashBudgetLines", x => x.Id);
                    table.UniqueConstraint("AK_DirectCashBudgetLines_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_DirectCashBudgetLines_Amount", "[Amount] >= 0");
                    table.CheckConstraint("CK_DirectCashBudgetLines_Direction", "[Direction] IN (1,2)");
                    table.ForeignKey(
                        name: "FK_DirectCashBudgetLines_DirectCashBudgetPlans_TenantId_PlanId",
                        columns: x => new { x.TenantId, x.PlanId },
                        principalTable: "DirectCashBudgetPlans",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_DirectCashBudgetLines_TenantId_PlanId_PeriodStart",
                table: "DirectCashBudgetLines",
                columns: new[] { "TenantId", "PlanId", "PeriodStart" });

            migrationBuilder.CreateIndex(
                name: "IX_DirectCashBudgetPlans_TenantId_FiscalYear_CurrencyCode",
                table: "DirectCashBudgetPlans",
                columns: new[] { "TenantId", "FiscalYear", "CurrencyCode" },
                unique: true,
                filter: "[Status] = 2");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "DirectCashBudgetLines");

            migrationBuilder.DropTable(
                name: "DirectCashBudgetPlans");
        }
    }
}
