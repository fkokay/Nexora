using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace AIERP.Platform.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddTenantDynamicForms : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "TenantCustomFormDefinitions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "varchar(40)", unicode: false, maxLength: 40, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    Version = table.Column<int>(type: "int", nullable: false),
                    Status = table.Column<string>(type: "varchar(16)", unicode: false, maxLength: 16, nullable: false),
                    FieldsJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UpdatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TenantCustomFormDefinitions", x => x.Id);
                    table.UniqueConstraint("AK_TenantCustomFormDefinitions_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.ForeignKey(
                        name: "FK_TenantCustomFormDefinitions_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "TenantCustomFormRevisions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    FormId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Version = table.Column<int>(type: "int", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    Status = table.Column<string>(type: "varchar(16)", unicode: false, maxLength: 16, nullable: false),
                    FieldsJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    ChangeKind = table.Column<string>(type: "varchar(24)", unicode: false, maxLength: 24, nullable: false),
                    ChangedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TenantCustomFormRevisions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TenantCustomFormRevisions_TenantCustomFormDefinitions_TenantId_FormId",
                        columns: x => new { x.TenantId, x.FormId },
                        principalTable: "TenantCustomFormDefinitions",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "TenantCustomFormSubmissions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    FormId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    FormCode = table.Column<string>(type: "varchar(40)", unicode: false, maxLength: 40, nullable: false),
                    FormName = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    FormVersion = table.Column<int>(type: "int", nullable: false),
                    FieldsJsonSnapshot = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    ValuesJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Status = table.Column<string>(type: "varchar(16)", unicode: false, maxLength: 16, nullable: false),
                    SubmittedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SubmittedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    DecidedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    DecidedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    DecisionReason = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TenantCustomFormSubmissions", x => x.Id);
                    table.UniqueConstraint("AK_TenantCustomFormSubmissions_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.ForeignKey(
                        name: "FK_TenantCustomFormSubmissions_TenantCustomFormDefinitions_TenantId_FormId",
                        columns: x => new { x.TenantId, x.FormId },
                        principalTable: "TenantCustomFormDefinitions",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.InsertData(
                table: "PermissionDefinitions",
                columns: new[] { "Code", "Action", "Description", "ResourceType" },
                values: new object[,]
                {
                    { "erp.custom-forms.create", "create", "create · Tenant dynamic forms and submissions", "erp.custom-forms" },
                    { "erp.custom-forms.delete", "delete", "delete · Tenant dynamic forms and submissions", "erp.custom-forms" },
                    { "erp.custom-forms.execute", "execute", "execute · Tenant dynamic forms and submissions", "erp.custom-forms" },
                    { "erp.custom-forms.read", "read", "read · Tenant dynamic forms and submissions", "erp.custom-forms" },
                    { "erp.custom-forms.update", "update", "update · Tenant dynamic forms and submissions", "erp.custom-forms" }
                });

            migrationBuilder.CreateIndex(
                name: "IX_TenantCustomFormDefinitions_TenantId_Code_Version",
                table: "TenantCustomFormDefinitions",
                columns: new[] { "TenantId", "Code", "Version" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_TenantCustomFormDefinitions_TenantId_Status_UpdatedAt",
                table: "TenantCustomFormDefinitions",
                columns: new[] { "TenantId", "Status", "UpdatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_TenantCustomFormRevisions_TenantId_FormId_Version_CreatedAt",
                table: "TenantCustomFormRevisions",
                columns: new[] { "TenantId", "FormId", "Version", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_TenantCustomFormSubmissions_TenantId_FormId_Status_SubmittedAt",
                table: "TenantCustomFormSubmissions",
                columns: new[] { "TenantId", "FormId", "Status", "SubmittedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_TenantCustomFormSubmissions_TenantId_SubmittedByUserId_SubmittedAt",
                table: "TenantCustomFormSubmissions",
                columns: new[] { "TenantId", "SubmittedByUserId", "SubmittedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "TenantCustomFormRevisions");

            migrationBuilder.DropTable(
                name: "TenantCustomFormSubmissions");

            migrationBuilder.DropTable(
                name: "TenantCustomFormDefinitions");

            migrationBuilder.DeleteData(
                table: "PermissionDefinitions",
                keyColumn: "Code",
                keyValue: "erp.custom-forms.create");

            migrationBuilder.DeleteData(
                table: "PermissionDefinitions",
                keyColumn: "Code",
                keyValue: "erp.custom-forms.delete");

            migrationBuilder.DeleteData(
                table: "PermissionDefinitions",
                keyColumn: "Code",
                keyValue: "erp.custom-forms.execute");

            migrationBuilder.DeleteData(
                table: "PermissionDefinitions",
                keyColumn: "Code",
                keyValue: "erp.custom-forms.read");

            migrationBuilder.DeleteData(
                table: "PermissionDefinitions",
                keyColumn: "Code",
                keyValue: "erp.custom-forms.update");
        }
    }
}
