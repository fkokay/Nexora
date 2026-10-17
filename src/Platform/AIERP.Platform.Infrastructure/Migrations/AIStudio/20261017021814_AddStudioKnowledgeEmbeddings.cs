using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.AIStudio
{
    /// <inheritdoc />
    public partial class AddStudioKnowledgeEmbeddings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "EmbeddingJson",
                table: "StudioKnowledgeDocuments",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "EmbeddingModel",
                table: "StudioKnowledgeDocuments",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "EmbeddingJson",
                table: "StudioKnowledgeDocuments");

            migrationBuilder.DropColumn(
                name: "EmbeddingModel",
                table: "StudioKnowledgeDocuments");
        }
    }
}
