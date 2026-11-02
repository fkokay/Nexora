using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Tenant
{
    /// <inheritdoc />
    public partial class SnapshotFixedAssetVukLowerLimit : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "VukCommuniqueNumber",
                table: "FixedAssets",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "VukDepreciationLowerLimitTry",
                table: "FixedAssets",
                type: "decimal(18,2)",
                precision: 18,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "VukSourceUrl",
                table: "FixedAssets",
                type: "nvarchar(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "VukTaxYear",
                table: "FixedAssets",
                type: "int",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "VukCommuniqueNumber",
                table: "FixedAssets");

            migrationBuilder.DropColumn(
                name: "VukDepreciationLowerLimitTry",
                table: "FixedAssets");

            migrationBuilder.DropColumn(
                name: "VukSourceUrl",
                table: "FixedAssets");

            migrationBuilder.DropColumn(
                name: "VukTaxYear",
                table: "FixedAssets");
        }
    }
}
