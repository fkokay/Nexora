using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Platform
{
    /// <inheritdoc />
    public partial class AllowOrderlessSalesDelivery : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_SalesDeliveryLines_SalesDeliveries_TenantId_DeliveryId_OrderId",
                table: "SalesDeliveryLines");

            migrationBuilder.DropIndex(
                name: "IX_SalesInvoices_TenantId_DeliveryId",
                table: "SalesInvoices");

            migrationBuilder.DropIndex(
                name: "IX_SalesInvoiceLines_TenantId_DeliveryLineId",
                table: "SalesInvoiceLines");

            migrationBuilder.DropIndex(
                name: "IX_SalesDeliveryLines_TenantId_DeliveryId_OrderId",
                table: "SalesDeliveryLines");

            migrationBuilder.DropUniqueConstraint(
                name: "AK_SalesDeliveries_TenantId_Id_OrderId",
                table: "SalesDeliveries");

            migrationBuilder.AlterColumn<Guid>(
                name: "OrderId",
                table: "SalesInvoices",
                type: "uniqueidentifier",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier");

            migrationBuilder.AlterColumn<Guid>(
                name: "DeliveryId",
                table: "SalesInvoices",
                type: "uniqueidentifier",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier");

            migrationBuilder.AlterColumn<Guid>(
                name: "DeliveryLineId",
                table: "SalesInvoiceLines",
                type: "uniqueidentifier",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier");

            migrationBuilder.AlterColumn<Guid>(
                name: "OrderId",
                table: "SalesDeliveryLines",
                type: "uniqueidentifier",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier");

            migrationBuilder.AlterColumn<Guid>(
                name: "OrderId",
                table: "SalesDeliveries",
                type: "uniqueidentifier",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier");

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

            migrationBuilder.CreateIndex(
                name: "IX_SalesInvoices_TenantId_DeliveryId",
                table: "SalesInvoices",
                columns: new[] { "TenantId", "DeliveryId" },
                unique: true,
                filter: "[DeliveryId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_SalesInvoiceLines_TenantId_DeliveryLineId",
                table: "SalesInvoiceLines",
                columns: new[] { "TenantId", "DeliveryLineId" },
                unique: true,
                filter: "[DeliveryLineId] IS NOT NULL");

            migrationBuilder.Sql(
                "EXEC(N'ALTER TABLE [FixedAssets] ADD CONSTRAINT [CK_FixedAssets_VukUsefulLifeProfile] CHECK (([VukUsefulLifeCode] IS NULL AND [VukUsefulLifeDescription] IS NULL AND [VukUsefulLifeTableYear] IS NULL AND [VukUsefulLifeCommuniqueNumber] IS NULL AND [VukUsefulLifeMonths] IS NULL AND [VukNormalDepreciationRatePercent] IS NULL AND [VukTaxDepreciationStartDate] IS NULL) OR ([VukUsefulLifeCode] IS NOT NULL AND [VukUsefulLifeDescription] IS NOT NULL AND [VukUsefulLifeTableYear] IS NOT NULL AND [VukUsefulLifeCommuniqueNumber] IS NOT NULL AND [VukUsefulLifeMonths] BETWEEN 1 AND 1200 AND [VukNormalDepreciationRatePercent] > 0 AND [VukNormalDepreciationRatePercent] <= 100 AND [VukTaxDepreciationStartDate] IS NOT NULL AND [VukTaxDepreciationStartDate] >= [AcquisitionDate]))');");

            migrationBuilder.AddForeignKey(
                name: "FK_SalesDeliveryLines_SalesDeliveries_TenantId_DeliveryId",
                table: "SalesDeliveryLines",
                columns: new[] { "TenantId", "DeliveryId" },
                principalTable: "SalesDeliveries",
                principalColumns: new[] { "TenantId", "Id" },
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_SalesDeliveryLines_SalesDeliveries_TenantId_DeliveryId",
                table: "SalesDeliveryLines");

            migrationBuilder.DropIndex(
                name: "IX_SalesInvoices_TenantId_DeliveryId",
                table: "SalesInvoices");

            migrationBuilder.DropIndex(
                name: "IX_SalesInvoiceLines_TenantId_DeliveryLineId",
                table: "SalesInvoiceLines");

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

            migrationBuilder.AlterColumn<Guid>(
                name: "OrderId",
                table: "SalesInvoices",
                type: "uniqueidentifier",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier",
                oldNullable: true);

            migrationBuilder.AlterColumn<Guid>(
                name: "DeliveryId",
                table: "SalesInvoices",
                type: "uniqueidentifier",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier",
                oldNullable: true);

            migrationBuilder.AlterColumn<Guid>(
                name: "DeliveryLineId",
                table: "SalesInvoiceLines",
                type: "uniqueidentifier",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier",
                oldNullable: true);

            migrationBuilder.AlterColumn<Guid>(
                name: "OrderId",
                table: "SalesDeliveryLines",
                type: "uniqueidentifier",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier",
                oldNullable: true);

            migrationBuilder.AlterColumn<Guid>(
                name: "OrderId",
                table: "SalesDeliveries",
                type: "uniqueidentifier",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier",
                oldNullable: true);

            migrationBuilder.AddUniqueConstraint(
                name: "AK_SalesDeliveries_TenantId_Id_OrderId",
                table: "SalesDeliveries",
                columns: new[] { "TenantId", "Id", "OrderId" });

            migrationBuilder.CreateIndex(
                name: "IX_SalesInvoices_TenantId_DeliveryId",
                table: "SalesInvoices",
                columns: new[] { "TenantId", "DeliveryId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SalesInvoiceLines_TenantId_DeliveryLineId",
                table: "SalesInvoiceLines",
                columns: new[] { "TenantId", "DeliveryLineId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SalesDeliveryLines_TenantId_DeliveryId_OrderId",
                table: "SalesDeliveryLines",
                columns: new[] { "TenantId", "DeliveryId", "OrderId" });

            migrationBuilder.AddForeignKey(
                name: "FK_SalesDeliveryLines_SalesDeliveries_TenantId_DeliveryId_OrderId",
                table: "SalesDeliveryLines",
                columns: new[] { "TenantId", "DeliveryId", "OrderId" },
                principalTable: "SalesDeliveries",
                principalColumns: new[] { "TenantId", "Id", "OrderId" },
                onDelete: ReferentialAction.Cascade);
        }
    }
}
