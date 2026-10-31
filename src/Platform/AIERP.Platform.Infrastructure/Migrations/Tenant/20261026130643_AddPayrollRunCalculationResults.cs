using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Tenant
{
    /// <inheritdoc />
    public partial class AddPayrollRunCalculationResults : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "PayrollRunCalculations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RunId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Version = table.Column<int>(type: "int", nullable: false),
                    RunSnapshotSha256 = table.Column<string>(type: "char(64)", unicode: false, fixedLength: true, maxLength: 64, nullable: false),
                    ResultJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    ResultSha256 = table.Column<string>(type: "char(64)", unicode: false, fixedLength: true, maxLength: 64, nullable: false),
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
                    table.PrimaryKey("PK_PayrollRunCalculations", x => x.Id);
                    table.UniqueConstraint("AK_PayrollRunCalculations_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_PayrollRunCalculations_ResultHash", "LEN([ResultSha256]) = 64");
                    table.CheckConstraint("CK_PayrollRunCalculations_SnapshotHash", "LEN([RunSnapshotSha256]) = 64");
                    table.CheckConstraint("CK_PayrollRunCalculations_Status", "[Status] IN ('PendingApproval','Approved','Rejected')");
                    table.CheckConstraint("CK_PayrollRunCalculations_Version", "[Version] >= 1");
                    table.ForeignKey(
                        name: "FK_PayrollRunCalculations_PayrollRunSnapshots_TenantId_RunId",
                        columns: x => new { x.TenantId, x.RunId },
                        principalTable: "PayrollRunSnapshots",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_PayrollRunCalculations_TenantId_RunId_Status",
                table: "PayrollRunCalculations",
                columns: new[] { "TenantId", "RunId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_PayrollRunCalculations_TenantId_RunId_Version",
                table: "PayrollRunCalculations",
                columns: new[] { "TenantId", "RunId", "Version" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder) =>
            migrationBuilder.DropTable(name: "PayrollRunCalculations");
    }
}
