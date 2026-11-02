using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Tenant
{
    public partial class AddPayrollWorkplaceCalendarApprovals : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                            name: "PayrollWorkplaceCalendars",
                            columns: table => new
                            {
                                Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                                TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                                WorkplaceCode = table.Column<string>(type: "varchar(40)", unicode: false, maxLength: 40, nullable: false),
                                EffectiveFrom = table.Column<DateOnly>(type: "date", nullable: false),
                                Version = table.Column<int>(type: "int", nullable: false),
                                WeeklyMinutesJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                                DateOverridesJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                                PolicyReference = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
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
                                table.PrimaryKey("PK_PayrollWorkplaceCalendars", x => x.Id);
                                table.UniqueConstraint("AK_PayrollWorkplaceCalendars_TenantId_Id", x => new { x.TenantId, x.Id });
                                table.CheckConstraint("CK_PayrollWorkplaceCalendars_Status", "[Status] IN ('PendingApproval','Approved','Rejected')");
                                table.ForeignKey(
                                    name: "FK_PayrollWorkplaceCalendars_Tenants_TenantId",
                                    column: x => x.TenantId,
                                    principalTable: "Tenants",
                                    principalColumn: "Id",
                                    onDelete: ReferentialAction.Restrict);
                            });

            migrationBuilder.CreateTable(
                            name: "PayrollEmployeeWorkCalendarOverrides",
                            columns: table => new
                            {
                                Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                                TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                                EmployeeId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                                EffectiveFrom = table.Column<DateOnly>(type: "date", nullable: false),
                                Version = table.Column<int>(type: "int", nullable: false),
                                WeeklyMinutesJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                                DateOverridesJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                                PolicyReference = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
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
                                table.PrimaryKey("PK_PayrollEmployeeWorkCalendarOverrides", x => x.Id);
                                table.UniqueConstraint("AK_PayrollEmployeeWorkCalendarOverrides_TenantId_Id", x => new { x.TenantId, x.Id });
                                table.CheckConstraint("CK_PayrollEmployeeWorkCalendarOverrides_Status", "[Status] IN ('PendingApproval','Approved','Rejected')");
                                table.ForeignKey(
                                    name: "FK_PayrollEmployeeWorkCalendarOverrides_EmployeeRecords_TenantId_EmployeeId",
                                    columns: x => new { x.TenantId, x.EmployeeId },
                                    principalTable: "EmployeeRecords",
                                    principalColumns: new[] { "TenantId", "Id" },
                                    onDelete: ReferentialAction.Restrict);
                                table.ForeignKey(
                                    name: "FK_PayrollEmployeeWorkCalendarOverrides_Tenants_TenantId",
                                    column: x => x.TenantId,
                                    principalTable: "Tenants",
                                    principalColumn: "Id",
                                    onDelete: ReferentialAction.Restrict);
                            });

            migrationBuilder.CreateTable(
                            name: "PayrollEmployeeWorkplaceAssignments",
                            columns: table => new
                            {
                                Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                                TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                                EmployeeId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                                WorkplaceCode = table.Column<string>(type: "varchar(40)", unicode: false, maxLength: 40, nullable: false),
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
                                table.PrimaryKey("PK_PayrollEmployeeWorkplaceAssignments", x => x.Id);
                                table.UniqueConstraint("AK_PayrollEmployeeWorkplaceAssignments_TenantId_Id", x => new { x.TenantId, x.Id });
                                table.CheckConstraint("CK_PayrollEmployeeWorkplaceAssignments_Status", "[Status] IN ('PendingApproval','Approved','Rejected')");
                                table.ForeignKey(
                                    name: "FK_PayrollEmployeeWorkplaceAssignments_EmployeeRecords_TenantId_EmployeeId",
                                    columns: x => new { x.TenantId, x.EmployeeId },
                                    principalTable: "EmployeeRecords",
                                    principalColumns: new[] { "TenantId", "Id" },
                                    onDelete: ReferentialAction.Restrict);
                                table.ForeignKey(
                                    name: "FK_PayrollEmployeeWorkplaceAssignments_Tenants_TenantId",
                                    column: x => x.TenantId,
                                    principalTable: "Tenants",
                                    principalColumn: "Id",
                                    onDelete: ReferentialAction.Restrict);
                            });

            migrationBuilder.CreateIndex(
                            name: "IX_PayrollEmployeeWorkCalendarOverrides_TenantId_EmployeeId_EffectiveFrom",
                            table: "PayrollEmployeeWorkCalendarOverrides",
                            columns: new[] { "TenantId", "EmployeeId", "EffectiveFrom" },
                            unique: true,
                            filter: "[Status] = 'Approved'");

            migrationBuilder.CreateIndex(
                            name: "IX_PayrollEmployeeWorkCalendarOverrides_TenantId_EmployeeId_EffectiveFrom_Status",
                            table: "PayrollEmployeeWorkCalendarOverrides",
                            columns: new[] { "TenantId", "EmployeeId", "EffectiveFrom", "Status" });

            migrationBuilder.CreateIndex(
                            name: "IX_PayrollEmployeeWorkCalendarOverrides_TenantId_EmployeeId_EffectiveFrom_Version",
                            table: "PayrollEmployeeWorkCalendarOverrides",
                            columns: new[] { "TenantId", "EmployeeId", "EffectiveFrom", "Version" },
                            unique: true);

            migrationBuilder.CreateIndex(
                            name: "IX_PayrollEmployeeWorkplaceAssignments_TenantId_EmployeeId_EffectiveFrom",
                            table: "PayrollEmployeeWorkplaceAssignments",
                            columns: new[] { "TenantId", "EmployeeId", "EffectiveFrom" },
                            unique: true,
                            filter: "[Status] = 'Approved'");

            migrationBuilder.CreateIndex(
                            name: "IX_PayrollEmployeeWorkplaceAssignments_TenantId_EmployeeId_EffectiveFrom_Status",
                            table: "PayrollEmployeeWorkplaceAssignments",
                            columns: new[] { "TenantId", "EmployeeId", "EffectiveFrom", "Status" });

            migrationBuilder.CreateIndex(
                            name: "IX_PayrollEmployeeWorkplaceAssignments_TenantId_EmployeeId_EffectiveFrom_Version",
                            table: "PayrollEmployeeWorkplaceAssignments",
                            columns: new[] { "TenantId", "EmployeeId", "EffectiveFrom", "Version" },
                            unique: true);

            migrationBuilder.CreateIndex(
                            name: "IX_PayrollWorkplaceCalendars_TenantId_WorkplaceCode_EffectiveFrom",
                            table: "PayrollWorkplaceCalendars",
                            columns: new[] { "TenantId", "WorkplaceCode", "EffectiveFrom" },
                            unique: true,
                            filter: "[Status] = 'Approved'");

            migrationBuilder.CreateIndex(
                            name: "IX_PayrollWorkplaceCalendars_TenantId_WorkplaceCode_EffectiveFrom_Status",
                            table: "PayrollWorkplaceCalendars",
                            columns: new[] { "TenantId", "WorkplaceCode", "EffectiveFrom", "Status" });

            migrationBuilder.CreateIndex(
                            name: "IX_PayrollWorkplaceCalendars_TenantId_WorkplaceCode_EffectiveFrom_Version",
                            table: "PayrollWorkplaceCalendars",
                            columns: new[] { "TenantId", "WorkplaceCode", "EffectiveFrom", "Version" },
                            unique: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                            name: "PayrollEmployeeWorkCalendarOverrides");

            migrationBuilder.DropTable(
                            name: "PayrollEmployeeWorkplaceAssignments");

            migrationBuilder.DropTable(
                            name: "PayrollWorkplaceCalendars");
        }
    }
}
