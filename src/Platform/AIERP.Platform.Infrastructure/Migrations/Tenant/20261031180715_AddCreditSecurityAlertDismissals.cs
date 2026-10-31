using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Tenant
{
    /// <inheritdoc />
    public partial class AddCreditSecurityAlertDismissals : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "CreditSecurityAlertDismissals",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreditFacilitySecurityId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    AlertStatus = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    DismissedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CreditSecurityAlertDismissals", x => x.Id);
                    table.UniqueConstraint("AK_CreditSecurityAlertDismissals_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_CreditSecurityAlertDismissals_AlertStatus", "[AlertStatus] IN ('Expired','Expiring')");
                    table.ForeignKey(
                        name: "FK_CreditSecurityAlertDismissals_CreditFacilitySecurities_TenantId_CreditFacilitySecurityId",
                        columns: x => new { x.TenantId, x.CreditFacilitySecurityId },
                        principalTable: "CreditFacilitySecurities",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CreditSecurityAlertDismissals_TenantId_CreditFacilitySecurityId",
                table: "CreditSecurityAlertDismissals",
                columns: new[] { "TenantId", "CreditFacilitySecurityId" });

            migrationBuilder.CreateIndex(
                name: "IX_CreditSecurityAlertDismissals_TenantId_UserId_CreditFacilitySecurityId_AlertStatus",
                table: "CreditSecurityAlertDismissals",
                columns: new[] { "TenantId", "UserId", "CreditFacilitySecurityId", "AlertStatus" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CreditSecurityAlertDismissals");
        }
    }
}
