using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Tenant
{
    /// <inheritdoc />
    public partial class AddIntradayManufacturingScheduling : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "ShiftEndMinuteOfDay",
                table: "ManufacturingWorkCenters",
                type: "int",
                nullable: false,
                defaultValue: 960);

            migrationBuilder.AddColumn<int>(
                name: "ShiftStartMinuteOfDay",
                table: "ManufacturingWorkCenters",
                type: "int",
                nullable: false,
                defaultValue: 480);

            migrationBuilder.AddColumn<int>(
                name: "ScheduledEndMinuteOfDay",
                table: "ManufacturingOrderOperations",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ScheduledStartMinuteOfDay",
                table: "ManufacturingOrderOperations",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "EndMinuteOfDay",
                table: "ManufacturingCapacityAllocations",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "StartMinuteOfDay",
                table: "ManufacturingCapacityAllocations",
                type: "int",
                nullable: false,
                defaultValue: 0);

            // Existing tenant centers retain their pre-shift whole-day capacity. The new
            // 08:00 default applies to newly created centers, not historical schedules.
            migrationBuilder.Sql("EXEC(N'UPDATE [dbo].[ManufacturingWorkCenters] SET [ShiftStartMinuteOfDay] = 0, [ShiftEndMinuteOfDay] = 1440;');");
            migrationBuilder.Sql("EXEC(N'UPDATE [dbo].[ManufacturingCapacityAllocations] SET [StartMinuteOfDay] = 0, [EndMinuteOfDay] = CONVERT(int, CEILING([AllocatedMinutes]));');");
            migrationBuilder.Sql(@"EXEC(N'
UPDATE operation
SET [ScheduledStartMinuteOfDay] = allocation.[StartMinuteOfDay],
    [ScheduledEndMinuteOfDay] = allocation.[EndMinuteOfDay]
FROM [dbo].[ManufacturingOrderOperations] AS operation
CROSS APPLY (
    SELECT MIN([StartMinuteOfDay]) AS [StartMinuteOfDay], MAX([EndMinuteOfDay]) AS [EndMinuteOfDay]
    FROM [dbo].[ManufacturingCapacityAllocations] AS allocation
    WHERE allocation.[TenantId] = operation.[TenantId]
      AND allocation.[ManufacturingOrderOperationId] = operation.[Id]
) AS allocation
WHERE operation.[ScheduledStartDate] IS NOT NULL AND allocation.[StartMinuteOfDay] IS NOT NULL;');");

            migrationBuilder.Sql("EXEC(N'ALTER TABLE [ManufacturingWorkCenters] ADD CONSTRAINT [CK_ManufacturingWorkCenters_ShiftWindow] CHECK ([ShiftStartMinuteOfDay] BETWEEN 0 AND 1439 AND [ShiftEndMinuteOfDay] BETWEEN 1 AND 1440 AND [ShiftEndMinuteOfDay] > [ShiftStartMinuteOfDay])');");
            migrationBuilder.Sql("EXEC(N'ALTER TABLE [ManufacturingCapacityAllocations] ADD CONSTRAINT [CK_ManufacturingCapacityAllocations_TimeRange] CHECK ([StartMinuteOfDay] BETWEEN 0 AND 1439 AND [EndMinuteOfDay] BETWEEN 1 AND 1440 AND [EndMinuteOfDay] > [StartMinuteOfDay])');");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_ManufacturingWorkCenters_ShiftWindow",
                table: "ManufacturingWorkCenters");

            migrationBuilder.DropCheckConstraint(
                name: "CK_ManufacturingCapacityAllocations_TimeRange",
                table: "ManufacturingCapacityAllocations");

            migrationBuilder.DropColumn(
                name: "ShiftEndMinuteOfDay",
                table: "ManufacturingWorkCenters");

            migrationBuilder.DropColumn(
                name: "ShiftStartMinuteOfDay",
                table: "ManufacturingWorkCenters");

            migrationBuilder.DropColumn(
                name: "ScheduledEndMinuteOfDay",
                table: "ManufacturingOrderOperations");

            migrationBuilder.DropColumn(
                name: "ScheduledStartMinuteOfDay",
                table: "ManufacturingOrderOperations");

            migrationBuilder.DropColumn(
                name: "EndMinuteOfDay",
                table: "ManufacturingCapacityAllocations");

            migrationBuilder.DropColumn(
                name: "StartMinuteOfDay",
                table: "ManufacturingCapacityAllocations");
        }
    }
}
