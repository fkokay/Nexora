using System;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Tenant;

[DbContext(typeof(TenantDbContext))]
[Migration("20261104150000_AddTenantCustomPages")]
public sealed class AddTenantCustomPages : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder) => CustomPageSchema.Create(migrationBuilder);
    protected override void Down(MigrationBuilder migrationBuilder) => CustomPageSchema.Drop(migrationBuilder);
}

internal static class CustomPageSchema
{
    public static void Create(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AlterColumn<string>(
            name: "TargetPage", table: "TenantCustomMenuEntries", type: "varchar(80)", unicode: false, maxLength: 80,
            nullable: false, oldClrType: typeof(string), oldType: "varchar(40)", oldMaxLength: 40, oldUnicode: false);
        migrationBuilder.CreateTable(
            name: "TenantCustomPages",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                Code = table.Column<string>(type: "varchar(40)", unicode: false, maxLength: 40, nullable: false),
                Name = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                Description = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                DefinitionJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                Revision = table.Column<int>(type: "int", nullable: false),
                IsPublished = table.Column<bool>(type: "bit", nullable: false),
                IsArchived = table.Column<bool>(type: "bit", nullable: false),
                CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                UpdatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_TenantCustomPages", x => x.Id);
                table.UniqueConstraint("AK_TenantCustomPages_TenantId_Id", x => new { x.TenantId, x.Id });
                table.CheckConstraint("CK_TenantCustomPages_Revision", "[Revision] >= 1");
                table.ForeignKey("FK_TenantCustomPages_Tenants_TenantId", x => x.TenantId, "Tenants", "Id", onDelete: ReferentialAction.Restrict);
            });
        migrationBuilder.CreateTable(
            name: "TenantCustomPageRevisions",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                CustomPageId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                Revision = table.Column<int>(type: "int", nullable: false),
                Code = table.Column<string>(type: "varchar(40)", unicode: false, maxLength: 40, nullable: false),
                Name = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                Description = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                DefinitionJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                ChangeKind = table.Column<string>(type: "varchar(32)", unicode: false, maxLength: 32, nullable: false),
                ChangedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_TenantCustomPageRevisions", x => x.Id);
                table.UniqueConstraint("AK_TenantCustomPageRevisions_TenantId_Id", x => new { x.TenantId, x.Id });
                table.CheckConstraint("CK_TenantCustomPageRevisions_Revision", "[Revision] >= 1");
                table.ForeignKey("FK_TenantCustomPageRevisions_TenantCustomPages_TenantId_CustomPageId", x => new { x.TenantId, x.CustomPageId }, "TenantCustomPages", new[] { "TenantId", "Id" }, onDelete: ReferentialAction.Cascade);
            });
        migrationBuilder.CreateIndex("IX_TenantCustomPages_Published", "TenantCustomPages", new[] { "TenantId", "Code", "IsPublished" }, unique: true, filter: "[IsPublished] = 1");
        migrationBuilder.CreateIndex("IX_TenantCustomPages_Draft", "TenantCustomPages", new[] { "TenantId", "Code", "IsPublished", "IsArchived" }, unique: true, filter: "[IsPublished] = 0 AND [IsArchived] = 0");
        migrationBuilder.CreateIndex("IX_TenantCustomPages_TenantId_Code_UpdatedAt", "TenantCustomPages", new[] { "TenantId", "Code", "UpdatedAt" });
        migrationBuilder.CreateIndex("IX_TenantCustomPageRevisions_TenantId_CustomPageId_Revision", "TenantCustomPageRevisions", new[] { "TenantId", "CustomPageId", "Revision" }, unique: true);
    }

    public static void Drop(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable("TenantCustomPageRevisions");
        migrationBuilder.DropTable("TenantCustomPages");
        migrationBuilder.AlterColumn<string>(
            name: "TargetPage", table: "TenantCustomMenuEntries", type: "varchar(40)", unicode: false, maxLength: 40,
            nullable: false, oldClrType: typeof(string), oldType: "varchar(80)", oldMaxLength: 80, oldUnicode: false);
    }
}
