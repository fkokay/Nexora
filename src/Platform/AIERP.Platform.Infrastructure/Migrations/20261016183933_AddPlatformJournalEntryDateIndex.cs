using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddPlatformJournalEntryDateIndex : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_JournalEntries_TenantId_EntryDate_CreatedAt",
                table: "JournalEntries",
                columns: new[] { "TenantId", "EntryDate", "CreatedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_JournalEntries_TenantId_EntryDate_CreatedAt",
                table: "JournalEntries");
        }
    }
}
