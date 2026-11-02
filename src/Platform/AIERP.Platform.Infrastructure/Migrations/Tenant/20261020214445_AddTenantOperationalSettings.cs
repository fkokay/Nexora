using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Tenant
{
    /// <inheritdoc />
    public partial class AddTenantOperationalSettings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "FixedAssets",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    AssetCode = table.Column<string>(type: "varchar(40)", unicode: false, maxLength: 40, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(160)", maxLength: 160, nullable: false),
                    Category = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: true),
                    AcquisitionDate = table.Column<DateOnly>(type: "date", nullable: false),
                    InServiceDate = table.Column<DateOnly>(type: "date", nullable: false),
                    AcquisitionCostBase = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    ResidualValueBase = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    UsefulLifeMonths = table.Column<int>(type: "int", nullable: false),
                    SupplierAccountId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    SourceReference = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: true),
                    AccumulatedDepreciationBase = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    Status = table.Column<string>(type: "varchar(16)", unicode: false, maxLength: 16, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FixedAssets", x => x.Id);
                    table.UniqueConstraint("AK_FixedAssets_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_FixedAssets_CostAndLife", "[AcquisitionCostBase] > 0 AND [ResidualValueBase] >= 0 AND [ResidualValueBase] < [AcquisitionCostBase] AND [UsefulLifeMonths] BETWEEN 1 AND 1200 AND [InServiceDate] >= [AcquisitionDate] AND [AccumulatedDepreciationBase] >= 0 AND [AccumulatedDepreciationBase] <= [AcquisitionCostBase] - [ResidualValueBase]");
                    table.ForeignKey(
                        name: "FK_FixedAssets_CustomerAccounts_TenantId_SupplierAccountId",
                        columns: x => new { x.TenantId, x.SupplierAccountId },
                        principalTable: "CustomerAccounts",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_FixedAssets_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "TenantOperationalSettings",
                columns: table => new
                {
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    AllowNegativeStock = table.Column<bool>(type: "bit", nullable: false),
                    UpdatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TenantOperationalSettings", x => x.TenantId);
                    table.ForeignKey(
                        name: "FK_TenantOperationalSettings_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "FixedAssetAssignments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    AssetId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    EmployeeId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    AssignedDate = table.Column<DateOnly>(type: "date", nullable: false),
                    ReturnedDate = table.Column<DateOnly>(type: "date", nullable: true),
                    Location = table.Column<string>(type: "nvarchar(160)", maxLength: 160, nullable: true),
                    Notes = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    AssignedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FixedAssetAssignments", x => x.Id);
                    table.UniqueConstraint("AK_FixedAssetAssignments_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_FixedAssetAssignments_ReturnDate", "[ReturnedDate] IS NULL OR [ReturnedDate] >= [AssignedDate]");
                    table.ForeignKey(
                        name: "FK_FixedAssetAssignments_EmployeeRecords_TenantId_EmployeeId",
                        columns: x => new { x.TenantId, x.EmployeeId },
                        principalTable: "EmployeeRecords",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_FixedAssetAssignments_FixedAssets_TenantId_AssetId",
                        columns: x => new { x.TenantId, x.AssetId },
                        principalTable: "FixedAssets",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "FixedAssetDepreciationPostings",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    AssetId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PeriodStart = table.Column<DateOnly>(type: "date", nullable: false),
                    PeriodEnd = table.Column<DateOnly>(type: "date", nullable: false),
                    AmountBase = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    JournalEntryId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PostedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PostedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FixedAssetDepreciationPostings", x => x.Id);
                    table.UniqueConstraint("AK_FixedAssetDepreciationPostings_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_FixedAssetDepreciationPostings_PeriodAmount", "[PeriodEnd] >= [PeriodStart] AND [AmountBase] > 0");
                    table.ForeignKey(
                        name: "FK_FixedAssetDepreciationPostings_FixedAssets_TenantId_AssetId",
                        columns: x => new { x.TenantId, x.AssetId },
                        principalTable: "FixedAssets",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_FixedAssetDepreciationPostings_JournalEntries_TenantId_JournalEntryId",
                        columns: x => new { x.TenantId, x.JournalEntryId },
                        principalTable: "JournalEntries",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_FixedAssetAssignments_TenantId_AssetId",
                table: "FixedAssetAssignments",
                columns: new[] { "TenantId", "AssetId" },
                unique: true,
                filter: "[ReturnedDate] IS NULL");

            migrationBuilder.CreateIndex(
                name: "IX_FixedAssetAssignments_TenantId_AssetId_ReturnedDate",
                table: "FixedAssetAssignments",
                columns: new[] { "TenantId", "AssetId", "ReturnedDate" });

            migrationBuilder.CreateIndex(
                name: "IX_FixedAssetAssignments_TenantId_EmployeeId",
                table: "FixedAssetAssignments",
                columns: new[] { "TenantId", "EmployeeId" });

            migrationBuilder.CreateIndex(
                name: "IX_FixedAssetDepreciationPostings_TenantId_AssetId_PeriodStart",
                table: "FixedAssetDepreciationPostings",
                columns: new[] { "TenantId", "AssetId", "PeriodStart" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_FixedAssetDepreciationPostings_TenantId_JournalEntryId",
                table: "FixedAssetDepreciationPostings",
                columns: new[] { "TenantId", "JournalEntryId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_FixedAssets_TenantId_AssetCode",
                table: "FixedAssets",
                columns: new[] { "TenantId", "AssetCode" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_FixedAssets_TenantId_Status_InServiceDate",
                table: "FixedAssets",
                columns: new[] { "TenantId", "Status", "InServiceDate" });

            migrationBuilder.CreateIndex(
                name: "IX_FixedAssets_TenantId_SupplierAccountId",
                table: "FixedAssets",
                columns: new[] { "TenantId", "SupplierAccountId" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "FixedAssetAssignments");

            migrationBuilder.DropTable(
                name: "FixedAssetDepreciationPostings");

            migrationBuilder.DropTable(
                name: "TenantOperationalSettings");

            migrationBuilder.DropTable(
                name: "FixedAssets");
        }
    }
}
