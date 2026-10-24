using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Tenant
{
    /// <inheritdoc />
    public partial class AddSavedReportRevisionHistory : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "DefinitionRevision",
                table: "TenantSavedReports",
                type: "int",
                nullable: false,
                defaultValue: 1);

            migrationBuilder.CreateTable(
                name: "TenantSavedReportRevisions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SavedReportId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Revision = table.Column<int>(type: "int", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    Kind = table.Column<string>(type: "varchar(12)", unicode: false, maxLength: 12, nullable: false),
                    Source = table.Column<string>(type: "varchar(40)", unicode: false, maxLength: 40, nullable: false),
                    DefinitionJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TenantSavedReportRevisions", x => x.Id);
                    table.UniqueConstraint("AK_TenantSavedReportRevisions_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.ForeignKey(
                        name: "FK_TenantSavedReportRevisions_TenantSavedReports_TenantId_SavedReportId",
                        columns: x => new { x.TenantId, x.SavedReportId },
                        principalTable: "TenantSavedReports",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.Sql("INSERT INTO [TenantSavedReportRevisions] ([Id], [TenantId], [SavedReportId], [Revision], [Name], [Kind], [Source], [DefinitionJson], [CreatedByUserId], [CreatedAt]) SELECT NEWID(), [TenantId], [Id], 1, [Name], [Kind], [Source], [DefinitionJson], [UpdatedByUserId], [UpdatedAt] FROM [TenantSavedReports];");

            migrationBuilder.CreateIndex(
                name: "IX_TenantSavedReportRevisions_TenantId_SavedReportId_Revision",
                table: "TenantSavedReportRevisions",
                columns: new[] { "TenantId", "SavedReportId", "Revision" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "TenantSavedReportRevisions");

            migrationBuilder.DropColumn(
                name: "DefinitionRevision",
                table: "TenantSavedReports");
        }
    }
}
