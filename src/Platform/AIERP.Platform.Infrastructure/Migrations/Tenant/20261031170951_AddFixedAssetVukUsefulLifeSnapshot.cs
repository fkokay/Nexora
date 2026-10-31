using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Tenant
{
    /// <inheritdoc />
    public partial class AddFixedAssetVukUsefulLifeSnapshot : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "VukNormalDepreciationRatePercent",
                table: "FixedAssets",
                type: "decimal(5,2)",
                precision: 5,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<DateOnly>(
                name: "VukTaxDepreciationStartDate",
                table: "FixedAssets",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "VukUsefulLifeCode",
                table: "FixedAssets",
                type: "varchar(40)",
                unicode: false,
                maxLength: 40,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "VukUsefulLifeCommuniqueNumber",
                table: "FixedAssets",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "VukUsefulLifeDescription",
                table: "FixedAssets",
                type: "nvarchar(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "VukUsefulLifeMonths",
                table: "FixedAssets",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "VukUsefulLifeTableYear",
                table: "FixedAssets",
                type: "int",
                nullable: true);

            migrationBuilder.AddCheckConstraint(
                name: "CK_FixedAssets_VukUsefulLifeProfile",
                table: "FixedAssets",
                sql: "([VukUsefulLifeCode] IS NULL AND [VukUsefulLifeDescription] IS NULL AND [VukUsefulLifeTableYear] IS NULL AND [VukUsefulLifeCommuniqueNumber] IS NULL AND [VukUsefulLifeMonths] IS NULL AND [VukNormalDepreciationRatePercent] IS NULL AND [VukTaxDepreciationStartDate] IS NULL) OR ([VukUsefulLifeCode] IS NOT NULL AND [VukUsefulLifeDescription] IS NOT NULL AND [VukUsefulLifeTableYear] IS NOT NULL AND [VukUsefulLifeCommuniqueNumber] IS NOT NULL AND [VukUsefulLifeMonths] BETWEEN 1 AND 1200 AND [VukNormalDepreciationRatePercent] > 0 AND [VukNormalDepreciationRatePercent] <= 100 AND [VukTaxDepreciationStartDate] IS NOT NULL AND [VukTaxDepreciationStartDate] >= [AcquisitionDate])");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_FixedAssets_VukUsefulLifeProfile",
                table: "FixedAssets");

            migrationBuilder.DropColumn(
                name: "VukNormalDepreciationRatePercent",
                table: "FixedAssets");

            migrationBuilder.DropColumn(
                name: "VukTaxDepreciationStartDate",
                table: "FixedAssets");

            migrationBuilder.DropColumn(
                name: "VukUsefulLifeCode",
                table: "FixedAssets");

            migrationBuilder.DropColumn(
                name: "VukUsefulLifeCommuniqueNumber",
                table: "FixedAssets");

            migrationBuilder.DropColumn(
                name: "VukUsefulLifeDescription",
                table: "FixedAssets");

            migrationBuilder.DropColumn(
                name: "VukUsefulLifeMonths",
                table: "FixedAssets");

            migrationBuilder.DropColumn(
                name: "VukUsefulLifeTableYear",
                table: "FixedAssets");
        }
    }
}
