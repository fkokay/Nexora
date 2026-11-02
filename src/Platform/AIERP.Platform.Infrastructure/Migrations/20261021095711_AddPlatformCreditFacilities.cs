using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddPlatformCreditFacilities : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "CreditFacilities",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    LenderName = table.Column<string>(type: "nvarchar(160)", maxLength: 160, nullable: false),
                    FacilityType = table.Column<string>(type: "nvarchar(24)", maxLength: 24, nullable: false),
                    CurrencyCode = table.Column<string>(type: "nchar(3)", fixedLength: true, maxLength: 3, nullable: false),
                    ApprovedLimit = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    StartDate = table.Column<DateOnly>(type: "date", nullable: false),
                    MaturityDate = table.Column<DateOnly>(type: "date", nullable: true),
                    AnnualInterestRatePercent = table.Column<decimal>(type: "decimal(9,4)", precision: 9, scale: 4, nullable: true),
                    Status = table.Column<int>(type: "int", nullable: false),
                    Notes = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CreditFacilities", x => x.Id);
                    table.UniqueConstraint("AK_CreditFacilities_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_CreditFacilities_ApprovedLimit", "[ApprovedLimit] > 0");
                    table.CheckConstraint("CK_CreditFacilities_Rate", "[AnnualInterestRatePercent] IS NULL OR [AnnualInterestRatePercent] >= 0");
                    table.CheckConstraint("CK_CreditFacilities_Status", "[Status] IN (1,2)");
                    table.CheckConstraint("CK_CreditFacilities_ValidDates", "[MaturityDate] IS NULL OR [MaturityDate] >= [StartDate]");
                    table.ForeignKey(
                        name: "FK_CreditFacilities_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "CreditFacilitySchedules",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreditFacilityId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DueDate = table.Column<DateOnly>(type: "date", nullable: false),
                    PrincipalAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    InterestAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    FeeAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    PaidDate = table.Column<DateOnly>(type: "date", nullable: true),
                    Notes = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CreditFacilitySchedules", x => x.Id);
                    table.UniqueConstraint("AK_CreditFacilitySchedules_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_CreditFacilitySchedules_Amounts", "[PrincipalAmount] >= 0 AND [InterestAmount] >= 0 AND [FeeAmount] >= 0 AND ([PrincipalAmount] + [InterestAmount] + [FeeAmount]) > 0");
                    table.CheckConstraint("CK_CreditFacilitySchedules_PaidDate", "([Status] = 2 AND [PaidDate] IS NOT NULL) OR ([Status] <> 2 AND [PaidDate] IS NULL)");
                    table.CheckConstraint("CK_CreditFacilitySchedules_Status", "[Status] IN (1,2,3)");
                    table.ForeignKey(
                        name: "FK_CreditFacilitySchedules_CreditFacilities_TenantId_CreditFacilityId",
                        columns: x => new { x.TenantId, x.CreditFacilityId },
                        principalTable: "CreditFacilities",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CreditFacilities_TenantId_Code",
                table: "CreditFacilities",
                columns: new[] { "TenantId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CreditFacilities_TenantId_Status_MaturityDate",
                table: "CreditFacilities",
                columns: new[] { "TenantId", "Status", "MaturityDate" });

            migrationBuilder.CreateIndex(
                name: "IX_CreditFacilitySchedules_TenantId_CreditFacilityId_DueDate",
                table: "CreditFacilitySchedules",
                columns: new[] { "TenantId", "CreditFacilityId", "DueDate" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CreditFacilitySchedules");

            migrationBuilder.DropTable(
                name: "CreditFacilities");
        }
    }
}
