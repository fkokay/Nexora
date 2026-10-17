using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddTenantModuleActivations : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "TenantModuleActivations",
                columns: table => new
                {
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ModuleCode = table.Column<string>(type: "varchar(80)", unicode: false, maxLength: 80, nullable: false),
                    Version = table.Column<string>(type: "varchar(40)", unicode: false, maxLength: 40, nullable: false),
                    ActivatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ActivatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TenantModuleActivations", x => new { x.TenantId, x.ModuleCode });
                    table.ForeignKey(
                        name: "FK_TenantModuleActivations_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_TenantModuleActivations_TenantId_Version",
                table: "TenantModuleActivations",
                columns: new[] { "TenantId", "Version" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "TenantModuleActivations");
        }
    }
}
