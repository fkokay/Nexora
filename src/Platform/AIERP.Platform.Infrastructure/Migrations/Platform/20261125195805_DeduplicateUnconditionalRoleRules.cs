using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Platform
{
    /// <summary>
    /// Removes the duplicate role rules that concurrent login backfills could insert, then adds the filtered unique index
    /// that prevents them. A duplicate is an unconditional role rule (no user subject, no attribute condition) with the same
    /// TenantId, SubjectType, SubjectRole, PermissionCode, Effect and IsActive as an older one; the oldest (CreatedAt, then
    /// Id) is kept. Rules that differ in Effect or IsActive, user rules and conditional rules are never deleted. ResourceType
    /// is not compared: it is NULL on seeded rules and equal to the permission's own resource type on administrator rules,
    /// which the authorizer evaluates identically. The deleted rows are exact duplicates, so evaluation does not change.
    /// Down drops the index only; deleted duplicates are not restored.
    /// </summary>
    public partial class DeduplicateUnconditionalRoleRules : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                WITH [ranked] AS (
                    SELECT [Id], ROW_NUMBER() OVER (
                        PARTITION BY [TenantId], [SubjectType], [SubjectRole], [PermissionCode], [Effect], [IsActive]
                        ORDER BY [CreatedAt], [Id]) AS [rn]
                    FROM [dbo].[TenantPermissionRules]
                    WHERE [SubjectUserId] IS NULL AND [AttributeName] IS NULL
                )
                DELETE FROM [ranked] WHERE [rn] > 1;
                """);

            migrationBuilder.CreateIndex(
                name: "UX_TenantPermissionRules_UnconditionalRoleRule",
                table: "TenantPermissionRules",
                columns: new[] { "TenantId", "SubjectType", "SubjectRole", "PermissionCode", "Effect", "IsActive" },
                unique: true,
                filter: "[SubjectUserId] IS NULL AND [AttributeName] IS NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "UX_TenantPermissionRules_UnconditionalRoleRule",
                table: "TenantPermissionRules");
        }
    }
}
