using System;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Platform;

[DbContext(typeof(PlatformDbContext))]
[Migration("20261023150000_AddStudioModuleSourceMappingsPlatform")]
public sealed class AddStudioModuleSourceMappingsPlatform : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "StudioModuleSourceMappings",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                ModuleCode = table.Column<string>(type: "varchar(60)", unicode: false, maxLength: 60, nullable: false),
                ProjectId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                Ref = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: false),
                PathAllowlistJson = table.Column<string>(type: "nvarchar(max)", maxLength: 12000, nullable: false),
                CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_StudioModuleSourceMappings", x => x.Id);
                table.ForeignKey("FK_StudioModuleSourceMappings_DevelopmentProjects_TenantId_ProjectId",
                    x => new { x.TenantId, x.ProjectId }, "DevelopmentProjects", new[] { "TenantId", "Id" }, onDelete: ReferentialAction.Cascade);
                table.ForeignKey("FK_StudioModuleSourceMappings_Tenants_TenantId",
                    x => x.TenantId, "Tenants", "Id", onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateIndex(
            name: "IX_StudioModuleSourceMappings_TenantId_ModuleCode",
            table: "StudioModuleSourceMappings",
            columns: new[] { "TenantId", "ModuleCode" },
            unique: true);
        migrationBuilder.CreateIndex(
            name: "IX_StudioModuleSourceMappings_TenantId_ProjectId",
            table: "StudioModuleSourceMappings",
            columns: new[] { "TenantId", "ProjectId" });
    }

    protected override void Down(MigrationBuilder migrationBuilder) => migrationBuilder.DropTable(name: "StudioModuleSourceMappings");
}
