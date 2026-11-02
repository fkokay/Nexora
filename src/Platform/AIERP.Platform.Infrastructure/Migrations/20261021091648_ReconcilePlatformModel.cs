using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace AIERP.Platform.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class ReconcilePlatformModel : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "FixedAssetDisposals",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    AssetId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DisposalDate = table.Column<DateOnly>(type: "date", nullable: false),
                    Reason = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    ProceedsBase = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    PostedAccumulatedDepreciationBase = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    ScheduleAccumulatedDepreciationBase = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    BookValueBase = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    GainLossBase = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    ScheduleThroughPeriod = table.Column<DateOnly>(type: "date", nullable: true),
                    IdempotencyKey = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DisposedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DisposedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FixedAssetDisposals", x => x.Id);
                    table.UniqueConstraint("AK_FixedAssetDisposals_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_FixedAssetDisposals_Amounts", "[ProceedsBase] >= 0 AND [PostedAccumulatedDepreciationBase] >= 0 AND [ScheduleAccumulatedDepreciationBase] >= 0 AND [BookValueBase] >= 0 AND [GainLossBase] = [ProceedsBase] - [BookValueBase]");
                    table.ForeignKey(
                        name: "FK_FixedAssetDisposals_FixedAssets_TenantId_AssetId",
                        columns: x => new { x.TenantId, x.AssetId },
                        principalTable: "FixedAssets",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_FixedAssetDisposals_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.InsertData(
                table: "PermissionDefinitions",
                columns: new[] { "Code", "Action", "Description", "ResourceType" },
                values: new object[,]
                {
                    { "erp.foreign-trade.create", "create", "create · Foreign trade cases and logistics status", "erp.foreign-trade" },
                    { "erp.foreign-trade.delete", "delete", "delete · Foreign trade cases and logistics status", "erp.foreign-trade" },
                    { "erp.foreign-trade.execute", "execute", "execute · Foreign trade cases and logistics status", "erp.foreign-trade" },
                    { "erp.foreign-trade.read", "read", "read · Foreign trade cases and logistics status", "erp.foreign-trade" },
                    { "erp.foreign-trade.update", "update", "update · Foreign trade cases and logistics status", "erp.foreign-trade" }
                });

            migrationBuilder.CreateIndex(
                name: "IX_FixedAssetDisposals_TenantId_AssetId",
                table: "FixedAssetDisposals",
                columns: new[] { "TenantId", "AssetId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_FixedAssetDisposals_TenantId_IdempotencyKey",
                table: "FixedAssetDisposals",
                columns: new[] { "TenantId", "IdempotencyKey" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "FixedAssetDisposals");

            migrationBuilder.DeleteData(
                table: "PermissionDefinitions",
                keyColumn: "Code",
                keyValue: "erp.foreign-trade.create");

            migrationBuilder.DeleteData(
                table: "PermissionDefinitions",
                keyColumn: "Code",
                keyValue: "erp.foreign-trade.delete");

            migrationBuilder.DeleteData(
                table: "PermissionDefinitions",
                keyColumn: "Code",
                keyValue: "erp.foreign-trade.execute");

            migrationBuilder.DeleteData(
                table: "PermissionDefinitions",
                keyColumn: "Code",
                keyValue: "erp.foreign-trade.read");

            migrationBuilder.DeleteData(
                table: "PermissionDefinitions",
                keyColumn: "Code",
                keyValue: "erp.foreign-trade.update");
        }
    }
}
