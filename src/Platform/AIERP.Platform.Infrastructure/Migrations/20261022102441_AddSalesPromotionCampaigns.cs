using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddSalesPromotionCampaigns : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "CounterpartyAccountId",
                table: "PaymentInstruments",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "WorkingDaysMask",
                table: "ManufacturingWorkCenters",
                type: "int",
                nullable: false,
                defaultValue: 127);

            migrationBuilder.AddColumn<Guid>(
                name: "PurchaseInvoiceId",
                table: "FixedAssets",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "ManufacturingWorkCenterCapacityOverrides",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    WorkCenterId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    WorkDate = table.Column<DateOnly>(type: "date", nullable: false),
                    CapacityMinutes = table.Column<int>(type: "int", nullable: false),
                    Note = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ManufacturingWorkCenterCapacityOverrides", x => x.Id);
                    table.UniqueConstraint("AK_ManufacturingWorkCenterCapacityOverrides_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_ManufacturingWorkCenterCapacityOverrides_Capacity", "[CapacityMinutes] BETWEEN 0 AND 1440");
                    table.ForeignKey(
                        name: "FK_ManufacturingWorkCenterCapacityOverrides_ManufacturingWorkCenters_TenantId_WorkCenterId",
                        columns: x => new { x.TenantId, x.WorkCenterId },
                        principalTable: "ManufacturingWorkCenters",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ManufacturingWorkCenterCapacityOverrides_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "SalesPromotionCampaigns",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    DiscountPercent = table.Column<decimal>(type: "decimal(5,2)", precision: 5, scale: 2, nullable: false),
                    EffectiveFrom = table.Column<DateOnly>(type: "date", nullable: false),
                    EffectiveThrough = table.Column<DateOnly>(type: "date", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SalesPromotionCampaigns", x => x.Id);
                    table.UniqueConstraint("AK_SalesPromotionCampaigns_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_SalesPromotionCampaigns_DiscountRange", "[DiscountPercent] > 0 AND [DiscountPercent] <= 100");
                    table.CheckConstraint("CK_SalesPromotionCampaigns_EffectiveRange", "[EffectiveThrough] >= [EffectiveFrom]");
                    table.ForeignKey(
                        name: "FK_SalesPromotionCampaigns_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "SalesPromotionApplications",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CampaignId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    QuoteId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DiscountPercent = table.Column<decimal>(type: "decimal(5,2)", precision: 5, scale: 2, nullable: false),
                    DiscountAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    AppliedOn = table.Column<DateOnly>(type: "date", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    AppliedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SalesPromotionApplications", x => x.Id);
                    table.UniqueConstraint("AK_SalesPromotionApplications_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.ForeignKey(
                        name: "FK_SalesPromotionApplications_SalesPromotionCampaigns_TenantId_CampaignId",
                        columns: x => new { x.TenantId, x.CampaignId },
                        principalTable: "SalesPromotionCampaigns",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SalesPromotionApplications_SalesQuotes_TenantId_QuoteId",
                        columns: x => new { x.TenantId, x.QuoteId },
                        principalTable: "SalesQuotes",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SalesPromotionApplications_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_PaymentInstruments_TenantId_CounterpartyAccountId",
                table: "PaymentInstruments",
                columns: new[] { "TenantId", "CounterpartyAccountId" });

            migrationBuilder.AddCheckConstraint(
                name: "CK_ManufacturingWorkCenters_WorkingDaysMask",
                table: "ManufacturingWorkCenters",
                sql: "[WorkingDaysMask] BETWEEN 0 AND 127");

            migrationBuilder.CreateIndex(
                name: "IX_FixedAssets_TenantId_PurchaseInvoiceId",
                table: "FixedAssets",
                columns: new[] { "TenantId", "PurchaseInvoiceId" });

            migrationBuilder.CreateIndex(
                name: "IX_ManufacturingWorkCenterCapacityOverrides_TenantId_WorkCenterId_WorkDate",
                table: "ManufacturingWorkCenterCapacityOverrides",
                columns: new[] { "TenantId", "WorkCenterId", "WorkDate" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SalesPromotionApplications_TenantId_CampaignId_QuoteId",
                table: "SalesPromotionApplications",
                columns: new[] { "TenantId", "CampaignId", "QuoteId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SalesPromotionApplications_TenantId_QuoteId",
                table: "SalesPromotionApplications",
                columns: new[] { "TenantId", "QuoteId" });

            migrationBuilder.CreateIndex(
                name: "IX_SalesPromotionCampaigns_TenantId_Code",
                table: "SalesPromotionCampaigns",
                columns: new[] { "TenantId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SalesPromotionCampaigns_TenantId_IsActive_EffectiveFrom_EffectiveThrough",
                table: "SalesPromotionCampaigns",
                columns: new[] { "TenantId", "IsActive", "EffectiveFrom", "EffectiveThrough" });

            migrationBuilder.AddForeignKey(
                name: "FK_FixedAssets_PurchaseInvoices_TenantId_PurchaseInvoiceId",
                table: "FixedAssets",
                columns: new[] { "TenantId", "PurchaseInvoiceId" },
                principalTable: "PurchaseInvoices",
                principalColumns: new[] { "TenantId", "Id" },
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_PaymentInstruments_CustomerAccounts_TenantId_CounterpartyAccountId",
                table: "PaymentInstruments",
                columns: new[] { "TenantId", "CounterpartyAccountId" },
                principalTable: "CustomerAccounts",
                principalColumns: new[] { "TenantId", "Id" },
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_FixedAssets_PurchaseInvoices_TenantId_PurchaseInvoiceId",
                table: "FixedAssets");

            migrationBuilder.DropForeignKey(
                name: "FK_PaymentInstruments_CustomerAccounts_TenantId_CounterpartyAccountId",
                table: "PaymentInstruments");

            migrationBuilder.DropTable(
                name: "ManufacturingWorkCenterCapacityOverrides");

            migrationBuilder.DropTable(
                name: "SalesPromotionApplications");

            migrationBuilder.DropTable(
                name: "SalesPromotionCampaigns");

            migrationBuilder.DropIndex(
                name: "IX_PaymentInstruments_TenantId_CounterpartyAccountId",
                table: "PaymentInstruments");

            migrationBuilder.DropCheckConstraint(
                name: "CK_ManufacturingWorkCenters_WorkingDaysMask",
                table: "ManufacturingWorkCenters");

            migrationBuilder.DropIndex(
                name: "IX_FixedAssets_TenantId_PurchaseInvoiceId",
                table: "FixedAssets");

            migrationBuilder.DropColumn(
                name: "CounterpartyAccountId",
                table: "PaymentInstruments");

            migrationBuilder.DropColumn(
                name: "WorkingDaysMask",
                table: "ManufacturingWorkCenters");

            migrationBuilder.DropColumn(
                name: "PurchaseInvoiceId",
                table: "FixedAssets");
        }
    }
}
