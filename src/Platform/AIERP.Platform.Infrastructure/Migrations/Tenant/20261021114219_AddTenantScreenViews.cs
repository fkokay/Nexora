using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Tenant
{
    /// <inheritdoc />
    public partial class AddTenantScreenViews : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "TenantScreenViews",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ScreenKey = table.Column<string>(type: "varchar(40)", unicode: false, maxLength: 40, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    LayoutJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Revision = table.Column<int>(type: "int", nullable: false),
                    IsPublished = table.Column<bool>(type: "bit", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UpdatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TenantScreenViews", x => x.Id);
                    table.UniqueConstraint("AK_TenantScreenViews_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_TenantScreenViews_Revision", "[Revision] >= 1");
                    table.ForeignKey(
                        name: "FK_TenantScreenViews_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "TenantScreenViewRevisions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ScreenViewId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Revision = table.Column<int>(type: "int", nullable: false),
                    ScreenKey = table.Column<string>(type: "varchar(40)", unicode: false, maxLength: 40, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    LayoutJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    ChangeKind = table.Column<string>(type: "varchar(32)", unicode: false, maxLength: 32, nullable: false),
                    ChangedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TenantScreenViewRevisions", x => x.Id);
                    table.UniqueConstraint("AK_TenantScreenViewRevisions_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_TenantScreenViewRevisions_Revision", "[Revision] >= 1");
                    table.ForeignKey(
                        name: "FK_TenantScreenViewRevisions_TenantScreenViews_TenantId_ScreenViewId",
                        columns: x => new { x.TenantId, x.ScreenViewId },
                        principalTable: "TenantScreenViews",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_TenantScreenViewRevisions_TenantId_ScreenViewId_Revision",
                table: "TenantScreenViewRevisions",
                columns: new[] { "TenantId", "ScreenViewId", "Revision" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_TenantScreenViews_TenantId_ScreenKey_IsPublished",
                table: "TenantScreenViews",
                columns: new[] { "TenantId", "ScreenKey", "IsPublished" },
                unique: true,
                filter: "[IsPublished] = 1");

            migrationBuilder.CreateIndex(
                name: "IX_TenantScreenViews_TenantId_ScreenKey_UpdatedAt",
                table: "TenantScreenViews",
                columns: new[] { "TenantId", "ScreenKey", "UpdatedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "TenantScreenViewRevisions");

            migrationBuilder.DropTable(
                name: "TenantScreenViews");
        }
    }
}
