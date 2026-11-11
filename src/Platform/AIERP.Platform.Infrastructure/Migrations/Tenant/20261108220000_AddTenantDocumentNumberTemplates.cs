using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Tenant
{
    /// <inheritdoc />
    public partial class AddTenantDocumentNumberTemplates : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "TenantDocumentNumberCounters",
                columns: table => new
                {
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DocumentType = table.Column<string>(type: "varchar(32)", unicode: false, maxLength: 32, nullable: false),
                    ScenarioKey = table.Column<string>(type: "varchar(32)", unicode: false, maxLength: 32, nullable: false),
                    PeriodKey = table.Column<string>(type: "varchar(8)", unicode: false, maxLength: 8, nullable: false),
                    LastValue = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TenantDocumentNumberCounters", x => new { x.TenantId, x.DocumentType, x.ScenarioKey, x.PeriodKey });
                    table.ForeignKey(
                        name: "FK_TenantDocumentNumberCounters_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "TenantDocumentNumberTemplates",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DocumentType = table.Column<string>(type: "varchar(32)", unicode: false, maxLength: 32, nullable: false),
                    ScenarioCode = table.Column<string>(type: "varchar(32)", unicode: false, maxLength: 32, nullable: true),
                    Pattern = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    ResetsYearly = table.Column<bool>(type: "bit", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TenantDocumentNumberTemplates", x => x.Id);
                    table.UniqueConstraint("AK_TenantDocumentNumberTemplates_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.ForeignKey(
                        name: "FK_TenantDocumentNumberTemplates_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_TenantDocumentNumberTemplates_TenantId_DocumentType_ScenarioCode",
                table: "TenantDocumentNumberTemplates",
                columns: new[] { "TenantId", "DocumentType", "ScenarioCode" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "TenantDocumentNumberCounters");

            migrationBuilder.DropTable(
                name: "TenantDocumentNumberTemplates");
        }
    }
}
