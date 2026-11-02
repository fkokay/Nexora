using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Tenant
{
    public partial class EnforceSinglePublishedCustomForm : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_TenantCustomFormDefinitions_TenantId_Code",
                table: "TenantCustomFormDefinitions",
                columns: new[] { "TenantId", "Code" },
                unique: true,
                filter: "[Status] = 'Published'");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_TenantCustomFormDefinitions_TenantId_Code",
                table: "TenantCustomFormDefinitions");
        }
    }
}
