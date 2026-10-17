using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddStudioGitHubInboundCommentSyncPlatform : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "GitHubAuthorLogin",
                table: "StudioCodeReviewComments",
                type: "nvarchar(39)",
                maxLength: 39,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "GitHubPullRequestNumber",
                table: "StudioCodeReviewComments",
                type: "int",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "GitHubAuthorLogin",
                table: "StudioCodeReviewComments");

            migrationBuilder.DropColumn(
                name: "GitHubPullRequestNumber",
                table: "StudioCodeReviewComments");
        }
    }
}
