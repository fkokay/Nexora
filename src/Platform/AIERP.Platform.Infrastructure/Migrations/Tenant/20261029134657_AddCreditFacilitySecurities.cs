using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Tenant
{
    /// <inheritdoc />
    public partial class AddCreditFacilitySecurities : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "CreditFacilitySecurities",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreditFacilityId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Type = table.Column<int>(type: "int", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Issuer = table.Column<string>(type: "nvarchar(160)", maxLength: 160, nullable: false),
                    Beneficiary = table.Column<string>(type: "nvarchar(160)", maxLength: 160, nullable: false),
                    Amount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    CurrencyCode = table.Column<string>(type: "nchar(3)", fixedLength: true, maxLength: 3, nullable: false),
                    CommissionAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    IssueDate = table.Column<DateOnly>(type: "date", nullable: false),
                    ExpiryDate = table.Column<DateOnly>(type: "date", nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    Notes = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CreditFacilitySecurities", x => x.Id);
                    table.UniqueConstraint("AK_CreditFacilitySecurities_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_CreditFacilitySecurities_Amounts", "[Amount] > 0 AND [CommissionAmount] >= 0");
                    table.CheckConstraint("CK_CreditFacilitySecurities_Dates", "[ExpiryDate] >= [IssueDate]");
                    table.CheckConstraint("CK_CreditFacilitySecurities_Status", "[Status] IN (1,2,3,4)");
                    table.CheckConstraint("CK_CreditFacilitySecurities_Type", "[Type] IN (1,2)");
                    table.ForeignKey(
                        name: "FK_CreditFacilitySecurities_CreditFacilities_TenantId_CreditFacilityId",
                        columns: x => new { x.TenantId, x.CreditFacilityId },
                        principalTable: "CreditFacilities",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CreditFacilitySecurities_TenantId_Code",
                table: "CreditFacilitySecurities",
                columns: new[] { "TenantId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CreditFacilitySecurities_TenantId_CreditFacilityId_Status_ExpiryDate",
                table: "CreditFacilitySecurities",
                columns: new[] { "TenantId", "CreditFacilityId", "Status", "ExpiryDate" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CreditFacilitySecurities");
        }
    }
}
