using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Tenant;

[DbContext(typeof(TenantDbContext))]
[Migration("20261109150000_AddSalesQuotePdfDesignOptions")]
public sealed class AddSalesQuotePdfDesignOptions : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(
            name: "FontFamily",
            table: "SalesQuotePdfTemplates",
            type: "nvarchar(32)",
            maxLength: 32,
            nullable: false,
            defaultValue: "Arial");

        migrationBuilder.AddColumn<string>(
            name: "Layout",
            table: "SalesQuotePdfTemplates",
            type: "varchar(16)",
            unicode: false,
            maxLength: 16,
            nullable: false,
            defaultValue: "classic");

        migrationBuilder.AddColumn<string>(
            name: "LogoDataUrl",
            table: "SalesQuotePdfTemplates",
            type: "nvarchar(max)",
            maxLength: 350000,
            nullable: false,
            defaultValue: "");

        migrationBuilder.AddColumn<string>(
            name: "LogoPosition",
            table: "SalesQuotePdfTemplates",
            type: "varchar(8)",
            unicode: false,
            maxLength: 8,
            nullable: false,
            defaultValue: "left");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(name: "FontFamily", table: "SalesQuotePdfTemplates");
        migrationBuilder.DropColumn(name: "Layout", table: "SalesQuotePdfTemplates");
        migrationBuilder.DropColumn(name: "LogoDataUrl", table: "SalesQuotePdfTemplates");
        migrationBuilder.DropColumn(name: "LogoPosition", table: "SalesQuotePdfTemplates");
    }
}
