using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Tenant
{
    /// <inheritdoc />
    public partial class AddManufacturingEnergyActuals : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_ManufacturingOrderOperations_Actuals",
                table: "ManufacturingOrderOperations");

            migrationBuilder.AddColumn<decimal>(
                name: "ActualEnergyCostBase",
                table: "ManufacturingOrderOperations",
                type: "decimal(18,4)",
                precision: 18,
                scale: 4,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "ActualEnergyCostPerKwhBase",
                table: "ManufacturingOrderOperations",
                type: "decimal(18,6)",
                precision: 18,
                scale: 6,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "ActualEnergyQuantityKwh",
                table: "ManufacturingOrderOperations",
                type: "decimal(14,3)",
                precision: 14,
                scale: 3,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "CreditFacilityMovements",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreditFacilityId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    FinancialAccountTransactionId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreditFacilityScheduleId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    RequestId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Type = table.Column<int>(type: "int", nullable: false),
                    TransactionDate = table.Column<DateOnly>(type: "date", nullable: false),
                    PrincipalAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    InterestAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    FeeAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    Notes = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CreditFacilityMovements", x => x.Id);
                    table.UniqueConstraint("AK_CreditFacilityMovements_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_CreditFacilityMovements_Amounts", "[PrincipalAmount] > 0 AND [InterestAmount] >= 0 AND [FeeAmount] >= 0");
                    table.CheckConstraint("CK_CreditFacilityMovements_Drawdown", "[Type] <> 1 OR ([InterestAmount] = 0 AND [FeeAmount] = 0)");
                    table.CheckConstraint("CK_CreditFacilityMovements_Type", "[Type] IN (1,2)");
                    table.ForeignKey(
                        name: "FK_CreditFacilityMovements_CreditFacilities_TenantId_CreditFacilityId",
                        columns: x => new { x.TenantId, x.CreditFacilityId },
                        principalTable: "CreditFacilities",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CreditFacilityMovements_CreditFacilitySchedules_TenantId_CreditFacilityScheduleId",
                        columns: x => new { x.TenantId, x.CreditFacilityScheduleId },
                        principalTable: "CreditFacilitySchedules",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CreditFacilityMovements_FinancialAccountTransactions_TenantId_FinancialAccountTransactionId",
                        columns: x => new { x.TenantId, x.FinancialAccountTransactionId },
                        principalTable: "FinancialAccountTransactions",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            // Compile the constraint after SQL Server has executed the new-column DDL.
            // In a generated EF batch SQL Server otherwise binds the CHECK expression
            // before the preceding ADD COLUMN statements have updated table metadata.
            migrationBuilder.Sql("EXEC(N'ALTER TABLE [ManufacturingOrderOperations] ADD CONSTRAINT [CK_ManufacturingOrderOperations_Actuals] CHECK (([ActualSetupMinutes] IS NULL OR [ActualSetupMinutes] >= 0) AND ([ActualRunMinutes] IS NULL OR [ActualRunMinutes] >= 0) AND ([ActualEnergyQuantityKwh] IS NULL OR [ActualEnergyQuantityKwh] >= 0) AND ([ActualEnergyCostPerKwhBase] IS NULL OR [ActualEnergyCostPerKwhBase] >= 0) AND ([ActualEnergyCostBase] IS NULL OR [ActualEnergyCostBase] >= 0) AND ([ActualCostBase] IS NULL OR [ActualCostBase] >= 0))')");

            migrationBuilder.CreateIndex(
                name: "IX_CreditFacilityMovements_TenantId_CreditFacilityId_TransactionDate_CreatedAt",
                table: "CreditFacilityMovements",
                columns: new[] { "TenantId", "CreditFacilityId", "TransactionDate", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_CreditFacilityMovements_TenantId_CreditFacilityScheduleId",
                table: "CreditFacilityMovements",
                columns: new[] { "TenantId", "CreditFacilityScheduleId" },
                unique: true,
                filter: "[CreditFacilityScheduleId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_CreditFacilityMovements_TenantId_FinancialAccountTransactionId",
                table: "CreditFacilityMovements",
                columns: new[] { "TenantId", "FinancialAccountTransactionId" });

            migrationBuilder.CreateIndex(
                name: "IX_CreditFacilityMovements_TenantId_RequestId",
                table: "CreditFacilityMovements",
                columns: new[] { "TenantId", "RequestId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CreditFacilityMovements");

            migrationBuilder.DropCheckConstraint(
                name: "CK_ManufacturingOrderOperations_Actuals",
                table: "ManufacturingOrderOperations");

            migrationBuilder.DropColumn(
                name: "ActualEnergyCostBase",
                table: "ManufacturingOrderOperations");

            migrationBuilder.DropColumn(
                name: "ActualEnergyCostPerKwhBase",
                table: "ManufacturingOrderOperations");

            migrationBuilder.DropColumn(
                name: "ActualEnergyQuantityKwh",
                table: "ManufacturingOrderOperations");

            migrationBuilder.AddCheckConstraint(
                name: "CK_ManufacturingOrderOperations_Actuals",
                table: "ManufacturingOrderOperations",
                sql: "([ActualSetupMinutes] IS NULL OR [ActualSetupMinutes] >= 0) AND ([ActualRunMinutes] IS NULL OR [ActualRunMinutes] >= 0) AND ([ActualCostBase] IS NULL OR [ActualCostBase] >= 0)");
        }
    }
}
