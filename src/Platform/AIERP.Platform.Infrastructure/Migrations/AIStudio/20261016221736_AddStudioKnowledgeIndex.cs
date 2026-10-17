using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.AIStudio
{
    /// <inheritdoc />
    public partial class AddStudioKnowledgeIndex : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "StudioKnowledgeDocuments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ProjectId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    WorkspaceRequestId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    IndexedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Path = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    ContentSha256 = table.Column<string>(type: "char(64)", unicode: false, fixedLength: true, maxLength: 64, nullable: false),
                    CommitSha = table.Column<string>(type: "varchar(64)", unicode: false, maxLength: 64, nullable: false),
                    Content = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    IndexedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StudioKnowledgeDocuments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_StudioKnowledgeDocuments_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_StudioKnowledgeDocuments_TenantId_ProjectId_WorkspaceRequestId_Path_IndexedAt",
                table: "StudioKnowledgeDocuments",
                columns: new[] { "TenantId", "ProjectId", "WorkspaceRequestId", "Path", "IndexedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_StudioKnowledgeDocuments_TenantId_WorkspaceRequestId_Path_ContentSha256",
                table: "StudioKnowledgeDocuments",
                columns: new[] { "TenantId", "WorkspaceRequestId", "Path", "ContentSha256" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "StudioKnowledgeDocuments");
        }
    }
}
