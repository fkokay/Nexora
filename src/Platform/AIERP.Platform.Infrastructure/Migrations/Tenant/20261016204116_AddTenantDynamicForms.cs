using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Tenant
{
    /// <inheritdoc />
    public partial class AddTenantDynamicForms : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "PlatformModulePublisherKeys",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Publisher = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    KeyId = table.Column<string>(type: "varchar(80)", unicode: false, maxLength: 80, nullable: false),
                    PublicKeyPem = table.Column<string>(type: "nvarchar(max)", maxLength: 4096, nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PlatformModulePublisherKeys", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "PlatformModuleReleases",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ModuleCode = table.Column<string>(type: "varchar(80)", unicode: false, maxLength: 80, nullable: false),
                    Version = table.Column<string>(type: "varchar(40)", unicode: false, maxLength: 40, nullable: false),
                    Publisher = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    ManifestJson = table.Column<string>(type: "nvarchar(max)", maxLength: 65536, nullable: false),
                    ArtifactSha256 = table.Column<string>(type: "char(64)", unicode: false, fixedLength: true, maxLength: 64, nullable: false),
                    SignatureBase64 = table.Column<string>(type: "varchar(2048)", unicode: false, maxLength: 2048, nullable: false),
                    KeyId = table.Column<string>(type: "varchar(80)", unicode: false, maxLength: 80, nullable: false),
                    StorageKey = table.Column<string>(type: "varchar(80)", unicode: false, maxLength: 80, nullable: false),
                    RuntimeKind = table.Column<string>(type: "varchar(40)", unicode: false, maxLength: 40, nullable: true),
                    RuntimeValidatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    Status = table.Column<string>(type: "varchar(16)", unicode: false, maxLength: 16, nullable: false),
                    RevocationReason = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PublishedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    PublishedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    RevokedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PlatformModuleReleases", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "PlatformUserRoles",
                columns: table => new
                {
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Role = table.Column<string>(type: "varchar(64)", unicode: false, maxLength: 64, nullable: false),
                    AssignedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    AssignedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PlatformUserRoles", x => new { x.UserId, x.Role });
                });

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

            migrationBuilder.CreateIndex(
                name: "IX_PlatformModulePublisherKeys_Publisher_KeyId",
                table: "PlatformModulePublisherKeys",
                columns: new[] { "Publisher", "KeyId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PlatformModuleReleases_ModuleCode_Version",
                table: "PlatformModuleReleases",
                columns: new[] { "ModuleCode", "Version" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PlatformModuleReleases_Status_ModuleCode",
                table: "PlatformModuleReleases",
                columns: new[] { "Status", "ModuleCode" });

            migrationBuilder.CreateIndex(
                name: "IX_PlatformUserRoles_Role",
                table: "PlatformUserRoles",
                column: "Role");

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

            migrationBuilder.CreateIndex(
                name: "IX_TenantModuleActivations_TenantId_Version",
                table: "TenantModuleActivations",
                columns: new[] { "TenantId", "Version" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PlatformModulePublisherKeys");

            migrationBuilder.DropTable(
                name: "PlatformModuleReleases");

            migrationBuilder.DropTable(
                name: "PlatformUserRoles");

            migrationBuilder.DropTable(
                name: "TenantCustomFormRevisions");

            migrationBuilder.DropTable(
                name: "TenantCustomFormSubmissions");

            migrationBuilder.DropTable(
                name: "TenantModuleActivations");

            migrationBuilder.DropTable(
                name: "TenantCustomFormDefinitions");
        }
    }
}
