using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Tenant
{
    /// <inheritdoc />
    public partial class AddPayrollCompensationRecords : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "PayrollCompensationRecords",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    EmployeeId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TargetKind = table.Column<string>(type: "varchar(8)", unicode: false, maxLength: 8, nullable: false),
                    Amount = table.Column<decimal>(type: "decimal(18,4)", precision: 18, scale: 4, nullable: false),
                    CurrencyCode = table.Column<string>(type: "char(3)", unicode: false, fixedLength: true, maxLength: 3, nullable: false),
                    PayBasisCode = table.Column<string>(type: "varchar(40)", unicode: false, maxLength: 40, nullable: false),
                    EffectiveFrom = table.Column<DateOnly>(type: "date", nullable: false),
                    Version = table.Column<int>(type: "int", nullable: false),
                    Status = table.Column<string>(type: "varchar(24)", unicode: false, maxLength: 24, nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ApprovedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    RejectedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    ApprovedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    RejectedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PayrollCompensationRecords", x => x.Id);
                    table.UniqueConstraint("AK_PayrollCompensationRecords_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_PayrollCompensationRecords_Amount", "[Amount] > 0");
                    table.CheckConstraint("CK_PayrollCompensationRecords_Status", "[Status] IN ('PendingApproval','Approved','Rejected')");
                    table.CheckConstraint("CK_PayrollCompensationRecords_TargetKind", "[TargetKind] IN ('Gross','Net')");
                    table.ForeignKey(
                        name: "FK_PayrollCompensationRecords_EmployeeRecords_TenantId_EmployeeId",
                        columns: x => new { x.TenantId, x.EmployeeId },
                        principalTable: "EmployeeRecords",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PayrollCompensationRecords_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_PayrollCompensationRecords_TenantId_EmployeeId_EffectiveFrom",
                table: "PayrollCompensationRecords",
                columns: new[] { "TenantId", "EmployeeId", "EffectiveFrom" },
                unique: true,
                filter: "[Status] = 'Approved'");

            migrationBuilder.CreateIndex(
                name: "IX_PayrollCompensationRecords_TenantId_EmployeeId_EffectiveFrom_Status",
                table: "PayrollCompensationRecords",
                columns: new[] { "TenantId", "EmployeeId", "EffectiveFrom", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_PayrollCompensationRecords_TenantId_EmployeeId_EffectiveFrom_Version",
                table: "PayrollCompensationRecords",
                columns: new[] { "TenantId", "EmployeeId", "EffectiveFrom", "Version" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PayrollCompensationRecords");
        }
    }
}
