using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace AIERP.Platform.Infrastructure.Migrations.Platform
{
    /// <inheritdoc />
    public partial class AddDocumentRuleSets : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "TenantDocumentRuleSets",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Document = table.Column<string>(type: "varchar(40)", unicode: false, maxLength: 40, nullable: false),
                    Transition = table.Column<string>(type: "varchar(40)", unicode: false, maxLength: 40, nullable: false),
                    Version = table.Column<int>(type: "int", nullable: false),
                    Status = table.Column<string>(type: "varchar(16)", unicode: false, maxLength: 16, nullable: false),
                    RulesJson = table.Column<string>(type: "nvarchar(max)", maxLength: 32000, nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    PublishedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    PublishedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TenantDocumentRuleSets", x => x.Id);
                    table.UniqueConstraint("AK_TenantDocumentRuleSets_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.ForeignKey(
                        name: "FK_TenantDocumentRuleSets_Tenants_TenantId",
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
                    { "erp.document-rules.create", "create", "create · Consultant rules on document transitions (belge kuralları)", "erp.document-rules" },
                    { "erp.document-rules.delete", "delete", "delete · Consultant rules on document transitions (belge kuralları)", "erp.document-rules" },
                    { "erp.document-rules.execute", "execute", "execute · Consultant rules on document transitions (belge kuralları)", "erp.document-rules" },
                    { "erp.document-rules.read", "read", "read · Consultant rules on document transitions (belge kuralları)", "erp.document-rules" },
                    { "erp.document-rules.update", "update", "update · Consultant rules on document transitions (belge kuralları)", "erp.document-rules" }
                });

            migrationBuilder.CreateIndex(
                name: "IX_TenantDocumentRuleSets_TenantId_Document_Transition_Status",
                table: "TenantDocumentRuleSets",
                columns: new[] { "TenantId", "Document", "Transition", "Status" },
                unique: true,
                filter: "[Status] IN ('Draft', 'Published')");

            migrationBuilder.CreateIndex(
                name: "IX_TenantDocumentRuleSets_TenantId_Document_Transition_Version",
                table: "TenantDocumentRuleSets",
                columns: new[] { "TenantId", "Document", "Transition", "Version" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "TenantDocumentRuleSets");

            migrationBuilder.DeleteData(
                table: "PermissionDefinitions",
                keyColumn: "Code",
                keyValue: "erp.document-rules.create");

            migrationBuilder.DeleteData(
                table: "PermissionDefinitions",
                keyColumn: "Code",
                keyValue: "erp.document-rules.delete");

            migrationBuilder.DeleteData(
                table: "PermissionDefinitions",
                keyColumn: "Code",
                keyValue: "erp.document-rules.execute");

            migrationBuilder.DeleteData(
                table: "PermissionDefinitions",
                keyColumn: "Code",
                keyValue: "erp.document-rules.read");

            migrationBuilder.DeleteData(
                table: "PermissionDefinitions",
                keyColumn: "Code",
                keyValue: "erp.document-rules.update");
        }
    }
}
