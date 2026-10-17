using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace AIERP.Platform.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddTenantSavedReports : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "TenantSavedReports",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    Source = table.Column<string>(type: "varchar(40)", unicode: false, maxLength: 40, nullable: false),
                    DefinitionJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UpdatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TenantSavedReports", x => x.Id);
                    table.UniqueConstraint("AK_TenantSavedReports_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.ForeignKey(
                        name: "FK_TenantSavedReports_Tenants_TenantId",
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
                    { "erp.reports.create", "create", "create · Tenant report definitions and execution", "erp.reports" },
                    { "erp.reports.delete", "delete", "delete · Tenant report definitions and execution", "erp.reports" },
                    { "erp.reports.execute", "execute", "execute · Tenant report definitions and execution", "erp.reports" },
                    { "erp.reports.read", "read", "read · Tenant report definitions and execution", "erp.reports" },
                    { "erp.reports.update", "update", "update · Tenant report definitions and execution", "erp.reports" }
                });

            migrationBuilder.CreateIndex(
                name: "IX_TenantSavedReports_TenantId_Name",
                table: "TenantSavedReports",
                columns: new[] { "TenantId", "Name" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "TenantSavedReports");

            migrationBuilder.DeleteData(
                table: "PermissionDefinitions",
                keyColumn: "Code",
                keyValue: "erp.reports.create");

            migrationBuilder.DeleteData(
                table: "PermissionDefinitions",
                keyColumn: "Code",
                keyValue: "erp.reports.delete");

            migrationBuilder.DeleteData(
                table: "PermissionDefinitions",
                keyColumn: "Code",
                keyValue: "erp.reports.execute");

            migrationBuilder.DeleteData(
                table: "PermissionDefinitions",
                keyColumn: "Code",
                keyValue: "erp.reports.read");

            migrationBuilder.DeleteData(
                table: "PermissionDefinitions",
                keyColumn: "Code",
                keyValue: "erp.reports.update");
        }
    }
}
