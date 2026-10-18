using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddManufacturingOperationActuals : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "ActualCostBase",
                table: "ManufacturingOrderOperations",
                type: "decimal(18,4)",
                precision: 18,
                scale: 4,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "ActualRunMinutes",
                table: "ManufacturingOrderOperations",
                type: "decimal(12,2)",
                precision: 12,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "ActualSetupMinutes",
                table: "ManufacturingOrderOperations",
                type: "decimal(12,2)",
                precision: 12,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "CompletedAt",
                table: "ManufacturingOrderOperations",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "StartedAt",
                table: "ManufacturingOrderOperations",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Status",
                table: "ManufacturingOrderOperations",
                type: "nvarchar(16)",
                maxLength: 16,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddCheckConstraint(
                name: "CK_ManufacturingOrderOperations_Actuals",
                table: "ManufacturingOrderOperations",
                sql: "([ActualSetupMinutes] IS NULL OR [ActualSetupMinutes] >= 0) AND ([ActualRunMinutes] IS NULL OR [ActualRunMinutes] >= 0) AND ([ActualCostBase] IS NULL OR [ActualCostBase] >= 0)");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_ManufacturingOrderOperations_Actuals",
                table: "ManufacturingOrderOperations");

            migrationBuilder.DropColumn(
                name: "ActualCostBase",
                table: "ManufacturingOrderOperations");

            migrationBuilder.DropColumn(
                name: "ActualRunMinutes",
                table: "ManufacturingOrderOperations");

            migrationBuilder.DropColumn(
                name: "ActualSetupMinutes",
                table: "ManufacturingOrderOperations");

            migrationBuilder.DropColumn(
                name: "CompletedAt",
                table: "ManufacturingOrderOperations");

            migrationBuilder.DropColumn(
                name: "StartedAt",
                table: "ManufacturingOrderOperations");

            migrationBuilder.DropColumn(
                name: "Status",
                table: "ManufacturingOrderOperations");
        }
    }
}
