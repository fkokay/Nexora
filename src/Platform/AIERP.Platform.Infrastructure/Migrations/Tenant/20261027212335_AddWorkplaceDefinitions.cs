using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Tenant
{
    /// <inheritdoc />
    public partial class AddWorkplaceDefinitions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "ParentCompanyId",
                table: "CustomerAccounts",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "WorkplaceDefinitions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "varchar(40)", unicode: false, maxLength: 40, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    Kind = table.Column<string>(type: "varchar(20)", unicode: false, maxLength: 20, nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WorkplaceDefinitions", x => x.Id);
                    table.UniqueConstraint("AK_WorkplaceDefinitions_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_WorkplaceDefinitions_Kind", "[Kind] IN ('Workplace','Branch','Factory')");
                    table.ForeignKey(
                        name: "FK_WorkplaceDefinitions_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CustomerAccounts_TenantId_ParentCompanyId",
                table: "CustomerAccounts",
                columns: new[] { "TenantId", "ParentCompanyId" });

            migrationBuilder.CreateIndex(
                name: "IX_WorkplaceDefinitions_TenantId_Code",
                table: "WorkplaceDefinitions",
                columns: new[] { "TenantId", "Code" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_CustomerAccounts_CustomerAccounts_TenantId_ParentCompanyId",
                table: "CustomerAccounts",
                columns: new[] { "TenantId", "ParentCompanyId" },
                principalTable: "CustomerAccounts",
                principalColumns: new[] { "TenantId", "Id" },
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_CustomerAccounts_CustomerAccounts_TenantId_ParentCompanyId",
                table: "CustomerAccounts");

            migrationBuilder.DropTable(
                name: "WorkplaceDefinitions");

            migrationBuilder.DropIndex(
                name: "IX_CustomerAccounts_TenantId_ParentCompanyId",
                table: "CustomerAccounts");

            migrationBuilder.DropColumn(
                name: "ParentCompanyId",
                table: "CustomerAccounts");
        }
    }
}
