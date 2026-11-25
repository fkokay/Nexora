using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Tenant
{
    /// <inheritdoc />
    public partial class AddTenantCatalogReleases : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "TenantCatalogReleases",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Version = table.Column<string>(type: "varchar(32)", unicode: false, maxLength: 32, nullable: false),
                    Status = table.Column<string>(type: "varchar(16)", unicode: false, maxLength: 16, nullable: false),
                    BundleJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    BundleSha256 = table.Column<string>(type: "char(64)", unicode: false, fixedLength: true, maxLength: 64, nullable: false),
                    SourceRepository = table.Column<string>(type: "nvarchar(400)", maxLength: 400, nullable: true),
                    SourceCommit = table.Column<string>(type: "varchar(64)", unicode: false, maxLength: 64, nullable: true),
                    SourcePath = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    ActivatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ActivatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TenantCatalogReleases", x => x.Id);
                    table.CheckConstraint("CK_TenantCatalogReleases_Status", "[Status] IN ('Draft','Active','Superseded')");
                    table.ForeignKey(
                        name: "FK_TenantCatalogReleases_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_TenantCatalogReleases_Active",
                table: "TenantCatalogReleases",
                column: "TenantId",
                unique: true,
                filter: "[Status] = 'Active'");

            migrationBuilder.CreateIndex(
                name: "IX_TenantCatalogReleases_TenantId_Version",
                table: "TenantCatalogReleases",
                columns: new[] { "TenantId", "Version" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "TenantCatalogReleases");
        }
    }
}
