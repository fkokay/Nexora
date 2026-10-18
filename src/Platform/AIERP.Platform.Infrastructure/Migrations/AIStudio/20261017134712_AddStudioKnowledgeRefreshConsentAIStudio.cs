using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.AIStudio
{
    /// <inheritdoc />
    public partial class AddStudioKnowledgeRefreshConsentAIStudio : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "StudioKnowledgeRefreshConsents",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ProjectId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    WorkspaceRequestId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    GrantedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SelectedPathsJson = table.Column<string>(type: "nvarchar(max)", maxLength: 12000, nullable: false),
                    GrantedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    LastRefreshedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StudioKnowledgeRefreshConsents", x => x.Id);
                    table.ForeignKey(
                        name: "FK_StudioKnowledgeRefreshConsents_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_StudioKnowledgeRefreshConsents_LastRefreshedAt",
                table: "StudioKnowledgeRefreshConsents",
                column: "LastRefreshedAt");

            migrationBuilder.CreateIndex(
                name: "IX_StudioKnowledgeRefreshConsents_TenantId_ProjectId_WorkspaceRequestId",
                table: "StudioKnowledgeRefreshConsents",
                columns: new[] { "TenantId", "ProjectId", "WorkspaceRequestId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "StudioKnowledgeRefreshConsents");
        }
    }
}
