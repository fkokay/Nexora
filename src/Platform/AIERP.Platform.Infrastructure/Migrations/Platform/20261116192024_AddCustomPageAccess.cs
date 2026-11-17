using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Platform
{
    /// <inheritdoc />
    public partial class AddCustomPageAccess : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "TenantCustomPageAccesses",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PageCode = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    Mode = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    AllUsersCanInsert = table.Column<bool>(type: "bit", nullable: false),
                    AllUsersCanUpdate = table.Column<bool>(type: "bit", nullable: false),
                    AllUsersCanDelete = table.Column<bool>(type: "bit", nullable: false),
                    Revision = table.Column<int>(type: "int", nullable: false),
                    UpdatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TenantCustomPageAccesses", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TenantCustomPageAccesses_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "TenantCustomPageAccessRevisions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PageCode = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    Revision = table.Column<int>(type: "int", nullable: false),
                    SnapshotJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    ChangedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TenantCustomPageAccessRevisions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TenantCustomPageAccessRevisions_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "TenantCustomPageAccessUsers",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    AccessId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CanView = table.Column<bool>(type: "bit", nullable: false),
                    CanInsert = table.Column<bool>(type: "bit", nullable: false),
                    CanUpdate = table.Column<bool>(type: "bit", nullable: false),
                    CanDelete = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TenantCustomPageAccessUsers", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TenantCustomPageAccessUsers_TenantCustomPageAccesses_AccessId",
                        column: x => x.AccessId,
                        principalTable: "TenantCustomPageAccesses",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_TenantCustomPageAccessUsers_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_TenantCustomPageAccesses_TenantId_PageCode",
                table: "TenantCustomPageAccesses",
                columns: new[] { "TenantId", "PageCode" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_TenantCustomPageAccessRevisions_TenantId_PageCode_Revision",
                table: "TenantCustomPageAccessRevisions",
                columns: new[] { "TenantId", "PageCode", "Revision" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_TenantCustomPageAccessUsers_AccessId_UserId",
                table: "TenantCustomPageAccessUsers",
                columns: new[] { "AccessId", "UserId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_TenantCustomPageAccessUsers_UserId",
                table: "TenantCustomPageAccessUsers",
                column: "UserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "TenantCustomPageAccessRevisions");

            migrationBuilder.DropTable(
                name: "TenantCustomPageAccessUsers");

            migrationBuilder.DropTable(
                name: "TenantCustomPageAccesses");
        }
    }
}
