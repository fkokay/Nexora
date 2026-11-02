using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Platform
{
    /// <inheritdoc />
    public partial class ManufacturingSecondPrecision : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "ScheduledEndSecondOfDay",
                table: "ManufacturingOrderOperations",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ScheduledStartSecondOfDay",
                table: "ManufacturingOrderOperations",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "EndSecondOfDay",
                table: "ManufacturingCapacityAllocations",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "StartSecondOfDay",
                table: "ManufacturingCapacityAllocations",
                type: "int",
                nullable: true);

            migrationBuilder.AddCheckConstraint(
                name: "CK_ManufacturingOrderOperations_SecondRange",
                table: "ManufacturingOrderOperations",
                sql: "([ScheduledStartSecondOfDay] IS NULL OR [ScheduledStartSecondOfDay] BETWEEN 0 AND 86399) AND ([ScheduledEndSecondOfDay] IS NULL OR [ScheduledEndSecondOfDay] BETWEEN 1 AND 86400)");

            migrationBuilder.AddCheckConstraint(
                name: "CK_ManufacturingCapacityAllocations_SecondRange",
                table: "ManufacturingCapacityAllocations",
                sql: "([StartSecondOfDay] IS NULL AND [EndSecondOfDay] IS NULL) OR ([StartSecondOfDay] IS NOT NULL AND [EndSecondOfDay] IS NOT NULL AND [StartSecondOfDay] BETWEEN 0 AND 86399 AND [EndSecondOfDay] BETWEEN 1 AND 86400 AND [EndSecondOfDay] > [StartSecondOfDay])");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                IF EXISTS (SELECT 1 FROM [ManufacturingCapacityAllocations] WHERE ([StartSecondOfDay] IS NOT NULL AND [StartSecondOfDay] % 60 <> 0) OR ([EndSecondOfDay] IS NOT NULL AND [EndSecondOfDay] % 60 <> 0))
                   OR EXISTS (SELECT 1 FROM [ManufacturingOrderOperations] WHERE ([ScheduledStartSecondOfDay] IS NOT NULL AND [ScheduledStartSecondOfDay] % 60 <> 0) OR ([ScheduledEndSecondOfDay] IS NOT NULL AND [ScheduledEndSecondOfDay] % 60 <> 0))
                    THROW 51000, 'Cannot downgrade while second-precision schedules exist.', 1;
                """);
            migrationBuilder.DropCheckConstraint(
                name: "CK_ManufacturingOrderOperations_SecondRange",
                table: "ManufacturingOrderOperations");

            migrationBuilder.DropCheckConstraint(
                name: "CK_ManufacturingCapacityAllocations_SecondRange",
                table: "ManufacturingCapacityAllocations");

            migrationBuilder.DropColumn(
                name: "ScheduledEndSecondOfDay",
                table: "ManufacturingOrderOperations");

            migrationBuilder.DropColumn(
                name: "ScheduledStartSecondOfDay",
                table: "ManufacturingOrderOperations");

            migrationBuilder.DropColumn(
                name: "EndSecondOfDay",
                table: "ManufacturingCapacityAllocations");

            migrationBuilder.DropColumn(
                name: "StartSecondOfDay",
                table: "ManufacturingCapacityAllocations");
        }
    }
}
