using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace AIERP.Platform.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddPayrollCompensationPermissions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.InsertData(
                table: "PermissionDefinitions",
                columns: new[] { "Code", "Action", "Description", "ResourceType" },
                values: new object[,]
                {
                    { "erp.payroll-compensation.approve", "approve", "approve · Confidential effective-dated employee gross/net compensation targets", "erp.payroll-compensation" },
                    { "erp.payroll-compensation.change", "change", "change · Confidential effective-dated employee gross/net compensation targets", "erp.payroll-compensation" },
                    { "erp.payroll-compensation.view", "view", "view · Confidential effective-dated employee gross/net compensation targets", "erp.payroll-compensation" }
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Permission definitions may already be referenced by administrator-created
            // access rules. Do not delete tenant policy state during migration rollback.
        }
    }
}
