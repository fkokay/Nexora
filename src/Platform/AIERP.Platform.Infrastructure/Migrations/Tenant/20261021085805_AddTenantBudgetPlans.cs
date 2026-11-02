using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Tenant
{
    /// <inheritdoc />
    public partial class AddTenantBudgetPlans : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "TenantBudgetPlans",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    FiscalYear = table.Column<int>(type: "int", nullable: false),
                    CurrencyCode = table.Column<string>(type: "nvarchar(3)", maxLength: 3, nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    ApprovedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ApprovedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    Revision = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TenantBudgetPlans", x => x.Id);
                    table.UniqueConstraint("AK_TenantBudgetPlans_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_TenantBudgetPlans_FiscalYear", "[FiscalYear] BETWEEN 2000 AND 2100");
                    table.ForeignKey(
                        name: "FK_TenantBudgetPlans_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "TenantBudgetLines",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    BudgetPlanId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    AccountId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PeriodStart = table.Column<DateOnly>(type: "date", nullable: false),
                    PlannedAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    Notes = table.Column<string>(type: "nvarchar(240)", maxLength: 240, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TenantBudgetLines", x => x.Id);
                    table.UniqueConstraint("AK_TenantBudgetLines_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_TenantBudgetLines_PlannedAmount", "[PlannedAmount] >= 0");
                    table.ForeignKey(
                        name: "FK_TenantBudgetLines_LedgerAccounts_TenantId_AccountId",
                        columns: x => new { x.TenantId, x.AccountId },
                        principalTable: "LedgerAccounts",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_TenantBudgetLines_TenantBudgetPlans_TenantId_BudgetPlanId",
                        columns: x => new { x.TenantId, x.BudgetPlanId },
                        principalTable: "TenantBudgetPlans",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_TenantBudgetLines_TenantId_AccountId",
                table: "TenantBudgetLines",
                columns: new[] { "TenantId", "AccountId" });

            migrationBuilder.CreateIndex(
                name: "IX_TenantBudgetLines_TenantId_BudgetPlanId_AccountId_PeriodStart",
                table: "TenantBudgetLines",
                columns: new[] { "TenantId", "BudgetPlanId", "AccountId", "PeriodStart" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_TenantBudgetPlans_TenantId_FiscalYear_CreatedAt",
                table: "TenantBudgetPlans",
                columns: new[] { "TenantId", "FiscalYear", "CreatedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "TenantBudgetLines");

            migrationBuilder.DropTable(
                name: "TenantBudgetPlans");
        }
    }
}
