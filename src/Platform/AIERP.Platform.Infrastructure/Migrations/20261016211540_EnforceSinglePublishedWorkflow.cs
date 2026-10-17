using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class EnforceSinglePublishedWorkflow : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_TenantWorkflowDefinitions_TenantId_Code",
                table: "TenantWorkflowDefinitions",
                columns: new[] { "TenantId", "Code" },
                unique: true,
                filter: "[Status] = 'Published'");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_TenantWorkflowDefinitions_TenantId_Code",
                table: "TenantWorkflowDefinitions");
        }
    }
}
