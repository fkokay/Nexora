using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Tenant
{
    /// <inheritdoc />
    public partial class AddPayrollRunSnapshots : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "PayrollRunSnapshots",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PeriodKind = table.Column<string>(type: "varchar(24)", unicode: false, maxLength: 24, nullable: false),
                    PeriodStart = table.Column<DateOnly>(type: "date", nullable: false),
                    PeriodEnd = table.Column<DateOnly>(type: "date", nullable: false),
                    ProfileCode = table.Column<string>(type: "varchar(40)", unicode: false, maxLength: 40, nullable: false),
                    Status = table.Column<string>(type: "varchar(24)", unicode: false, maxLength: 24, nullable: false),
                    EmployeeCount = table.Column<int>(type: "int", nullable: false),
                    SnapshotJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    SnapshotSha256 = table.Column<string>(type: "char(64)", unicode: false, fixedLength: true, maxLength: 64, nullable: false),
                    BlockersJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PayrollRunSnapshots", x => x.Id);
                    table.UniqueConstraint("AK_PayrollRunSnapshots_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_PayrollRunSnapshots_Hash", "LEN([SnapshotSha256]) = 64");
                    table.CheckConstraint("CK_PayrollRunSnapshots_Period", "[PeriodEnd] >= [PeriodStart]");
                    table.CheckConstraint("CK_PayrollRunSnapshots_PeriodKind", "[PeriodKind] IN ('CalendarMonth','EmployerDefined')");
                    table.CheckConstraint("CK_PayrollRunSnapshots_Status", "[Status] IN ('Blocked')");
                    table.ForeignKey(
                        name: "FK_PayrollRunSnapshots_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_PayrollRunSnapshots_TenantId_CreatedAt",
                table: "PayrollRunSnapshots",
                columns: new[] { "TenantId", "CreatedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PayrollRunSnapshots");
        }
    }
}
