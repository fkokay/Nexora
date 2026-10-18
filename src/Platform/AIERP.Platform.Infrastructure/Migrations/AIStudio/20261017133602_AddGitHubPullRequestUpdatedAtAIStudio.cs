using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.AIStudio
{
    /// <inheritdoc />
    public partial class AddGitHubPullRequestUpdatedAtAIStudio : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "GitHubPullRequestUpdatedAt",
                table: "ReleaseCandidateRecords",
                type: "datetimeoffset",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "GitHubPullRequestUpdatedAt",
                table: "ReleaseCandidateRecords");
        }
    }
}
