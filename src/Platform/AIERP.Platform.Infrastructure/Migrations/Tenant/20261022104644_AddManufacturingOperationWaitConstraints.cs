using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Tenant
{
    /// <inheritdoc />
    public partial class AddManufacturingOperationWaitConstraints : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "MinimumWaitDaysAfterPrevious",
                table: "ManufacturingOrderOperations",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "MinimumWaitDaysAfterPrevious",
                table: "BillOfMaterialOperations",
                type: "int",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "MinimumWaitDaysAfterPrevious",
                table: "ManufacturingOrderOperations");

            migrationBuilder.DropColumn(
                name: "MinimumWaitDaysAfterPrevious",
                table: "BillOfMaterialOperations");
        }
    }
}
