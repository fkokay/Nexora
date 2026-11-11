using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

[DbContext(typeof(TenantDbContext))]
[Migration("20261110110000_AddTenantUserPreferences")]
public sealed class AddTenantUserPreferences : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "TenantUserPreferences",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                PreferenceKey = table.Column<string>(type: "varchar(80)", unicode: false, maxLength: 80, nullable: false),
                ValueJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                Revision = table.Column<int>(type: "int", nullable: false),
                UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_TenantUserPreferences", x => x.Id);
                table.ForeignKey("FK_TenantUserPreferences_Tenants_TenantId", x => x.TenantId, "Tenants", "Id", onDelete: ReferentialAction.Restrict);
            });

        migrationBuilder.CreateIndex(
            name: "IX_TenantUserPreferences_TenantId_UserId_PreferenceKey",
            table: "TenantUserPreferences",
            columns: new[] { "TenantId", "UserId", "PreferenceKey" },
            unique: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder) =>
        migrationBuilder.DropTable(name: "TenantUserPreferences");
}
