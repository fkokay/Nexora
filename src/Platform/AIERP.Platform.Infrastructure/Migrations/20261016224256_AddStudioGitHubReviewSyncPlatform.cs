using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddStudioGitHubReviewSyncPlatform : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<long>(
                name: "GitHubReviewCommentId",
                table: "StudioCodeReviewComments",
                type: "bigint",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "GitHubSyncedAt",
                table: "StudioCodeReviewComments",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "GitHubBaseBranch",
                table: "ReleaseCandidateRecords",
                type: "nvarchar(256)",
                maxLength: 256,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "GitHubPullRequestNumber",
                table: "ReleaseCandidateRecords",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "GitHubPullRequestState",
                table: "ReleaseCandidateRecords",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "GitHubPullRequestUrl",
                table: "ReleaseCandidateRecords",
                type: "nvarchar(2048)",
                maxLength: 2048,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "GitHubRepository",
                table: "ReleaseCandidateRecords",
                type: "nvarchar(256)",
                maxLength: 256,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_StudioCodeReviewComments_GitHubReviewCommentId",
                table: "StudioCodeReviewComments",
                column: "GitHubReviewCommentId",
                unique: true,
                filter: "[GitHubReviewCommentId] IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_StudioCodeReviewComments_GitHubReviewCommentId",
                table: "StudioCodeReviewComments");

            migrationBuilder.DropColumn(
                name: "GitHubReviewCommentId",
                table: "StudioCodeReviewComments");

            migrationBuilder.DropColumn(
                name: "GitHubSyncedAt",
                table: "StudioCodeReviewComments");

            migrationBuilder.DropColumn(
                name: "GitHubBaseBranch",
                table: "ReleaseCandidateRecords");

            migrationBuilder.DropColumn(
                name: "GitHubPullRequestNumber",
                table: "ReleaseCandidateRecords");

            migrationBuilder.DropColumn(
                name: "GitHubPullRequestState",
                table: "ReleaseCandidateRecords");

            migrationBuilder.DropColumn(
                name: "GitHubPullRequestUrl",
                table: "ReleaseCandidateRecords");

            migrationBuilder.DropColumn(
                name: "GitHubRepository",
                table: "ReleaseCandidateRecords");
        }
    }
}
