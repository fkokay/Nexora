using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddPlatformModuleCatalog : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "PlatformModulePublisherKeys",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Publisher = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    KeyId = table.Column<string>(type: "varchar(80)", unicode: false, maxLength: 80, nullable: false),
                    PublicKeyPem = table.Column<string>(type: "nvarchar(max)", maxLength: 4096, nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PlatformModulePublisherKeys", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "PlatformModuleReleases",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ModuleCode = table.Column<string>(type: "varchar(80)", unicode: false, maxLength: 80, nullable: false),
                    Version = table.Column<string>(type: "varchar(40)", unicode: false, maxLength: 40, nullable: false),
                    Publisher = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    ManifestJson = table.Column<string>(type: "nvarchar(max)", maxLength: 65536, nullable: false),
                    ArtifactSha256 = table.Column<string>(type: "char(64)", unicode: false, fixedLength: true, maxLength: 64, nullable: false),
                    SignatureBase64 = table.Column<string>(type: "varchar(2048)", unicode: false, maxLength: 2048, nullable: false),
                    KeyId = table.Column<string>(type: "varchar(80)", unicode: false, maxLength: 80, nullable: false),
                    StorageKey = table.Column<string>(type: "varchar(80)", unicode: false, maxLength: 80, nullable: false),
                    Status = table.Column<string>(type: "varchar(16)", unicode: false, maxLength: 16, nullable: false),
                    RevocationReason = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PublishedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    PublishedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    RevokedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PlatformModuleReleases", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "PlatformUserRoles",
                columns: table => new
                {
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Role = table.Column<string>(type: "varchar(64)", unicode: false, maxLength: 64, nullable: false),
                    AssignedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    AssignedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PlatformUserRoles", x => new { x.UserId, x.Role });
                    table.ForeignKey(
                        name: "FK_PlatformUserRoles_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_PlatformModulePublisherKeys_Publisher_KeyId",
                table: "PlatformModulePublisherKeys",
                columns: new[] { "Publisher", "KeyId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PlatformModuleReleases_ModuleCode_Version",
                table: "PlatformModuleReleases",
                columns: new[] { "ModuleCode", "Version" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PlatformModuleReleases_Status_ModuleCode",
                table: "PlatformModuleReleases",
                columns: new[] { "Status", "ModuleCode" });

            migrationBuilder.CreateIndex(
                name: "IX_PlatformUserRoles_Role",
                table: "PlatformUserRoles",
                column: "Role");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PlatformModulePublisherKeys");

            migrationBuilder.DropTable(
                name: "PlatformModuleReleases");

            migrationBuilder.DropTable(
                name: "PlatformUserRoles");
        }
    }
}
