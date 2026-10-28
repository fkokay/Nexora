using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Platform;

public partial class AddPlatformCustomerAddressCoordinates : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<decimal>(
            name: "Latitude",
            table: "CustomerAddresses",
            type: "decimal(9,6)",
            precision: 9,
            scale: 6,
            nullable: true);

        migrationBuilder.AddColumn<decimal>(
            name: "Longitude",
            table: "CustomerAddresses",
            type: "decimal(9,6)",
            precision: 9,
            scale: 6,
            nullable: true);

        migrationBuilder.Sql(
            "EXEC(N'ALTER TABLE [CustomerAddresses] ADD CONSTRAINT [CK_CustomerAddresses_Coordinates] CHECK (([Latitude] IS NULL AND [Longitude] IS NULL) OR ([Latitude] BETWEEN -90 AND 90 AND [Longitude] BETWEEN -180 AND 180))');");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropCheckConstraint(
            name: "CK_CustomerAddresses_Coordinates",
            table: "CustomerAddresses");

        migrationBuilder.DropColumn(name: "Latitude", table: "CustomerAddresses");
        migrationBuilder.DropColumn(name: "Longitude", table: "CustomerAddresses");
    }
}
