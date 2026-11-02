using System;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Tenant;

[DbContext(typeof(TenantDbContext))]
[Migration("20261028150000_AddPayrollCalculationFinalization")]
public sealed class AddPayrollCalculationFinalization : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<Guid>(name: "FinalizedByUserId", table: "PayrollRunCalculations", type: "uniqueidentifier", nullable: true);
        migrationBuilder.AddColumn<DateTimeOffset>(name: "FinalizedAt", table: "PayrollRunCalculations", type: "datetimeoffset", nullable: true);
        migrationBuilder.DropCheckConstraint(name: "CK_PayrollRunCalculations_Status", table: "PayrollRunCalculations");
        migrationBuilder.AddCheckConstraint(name: "CK_PayrollRunCalculations_Status", table: "PayrollRunCalculations",
            sql: "[Status] IN ('PendingApproval','Approved','Rejected','Finalized')");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropCheckConstraint(name: "CK_PayrollRunCalculations_Status", table: "PayrollRunCalculations");
        migrationBuilder.AddCheckConstraint(name: "CK_PayrollRunCalculations_Status", table: "PayrollRunCalculations",
            sql: "[Status] IN ('PendingApproval','Approved','Rejected')");
        migrationBuilder.DropColumn(name: "FinalizedByUserId", table: "PayrollRunCalculations");
        migrationBuilder.DropColumn(name: "FinalizedAt", table: "PayrollRunCalculations");
    }
}
