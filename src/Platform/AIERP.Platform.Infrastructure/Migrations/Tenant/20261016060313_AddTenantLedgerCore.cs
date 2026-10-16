using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Tenant
{
    /// <inheritdoc />
    public partial class AddTenantLedgerCore : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "JournalEntries",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(48)", maxLength: 48, nullable: false),
                    EntryDate = table.Column<DateOnly>(type: "date", nullable: false),
                    Description = table.Column<string>(type: "nvarchar(240)", maxLength: 240, nullable: false),
                    SourceType = table.Column<string>(type: "varchar(32)", unicode: false, maxLength: 32, nullable: false),
                    SourceId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_JournalEntries", x => x.Id);
                    table.UniqueConstraint("AK_JournalEntries_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.ForeignKey(
                        name: "FK_JournalEntries_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "LedgerAccounts",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(160)", maxLength: 160, nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LedgerAccounts", x => x.Id);
                    table.UniqueConstraint("AK_LedgerAccounts_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.ForeignKey(
                        name: "FK_LedgerAccounts_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "JournalEntryLines",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    JournalEntryId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    AccountId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    LineNumber = table.Column<int>(type: "int", nullable: false),
                    Description = table.Column<string>(type: "nvarchar(240)", maxLength: 240, nullable: false),
                    Debit = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    Credit = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_JournalEntryLines", x => x.Id);
                    table.UniqueConstraint("AK_JournalEntryLines_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_JournalEntryLines_OneSidedNonNegative", "[Debit] >= 0 AND [Credit] >= 0 AND (([Debit] > 0 AND [Credit] = 0) OR ([Credit] > 0 AND [Debit] = 0))");
                    table.ForeignKey(
                        name: "FK_JournalEntryLines_JournalEntries_TenantId_JournalEntryId",
                        columns: x => new { x.TenantId, x.JournalEntryId },
                        principalTable: "JournalEntries",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_JournalEntryLines_LedgerAccounts_TenantId_AccountId",
                        columns: x => new { x.TenantId, x.AccountId },
                        principalTable: "LedgerAccounts",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "LedgerAccountMappings",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MappingKey = table.Column<string>(type: "varchar(64)", unicode: false, maxLength: 64, nullable: false),
                    AccountId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LedgerAccountMappings", x => x.Id);
                    table.ForeignKey(
                        name: "FK_LedgerAccountMappings_LedgerAccounts_TenantId_AccountId",
                        columns: x => new { x.TenantId, x.AccountId },
                        principalTable: "LedgerAccounts",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_JournalEntries_TenantId_Code",
                table: "JournalEntries",
                columns: new[] { "TenantId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_JournalEntries_TenantId_SourceType_SourceId",
                table: "JournalEntries",
                columns: new[] { "TenantId", "SourceType", "SourceId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_JournalEntryLines_TenantId_AccountId",
                table: "JournalEntryLines",
                columns: new[] { "TenantId", "AccountId" });

            migrationBuilder.CreateIndex(
                name: "IX_JournalEntryLines_TenantId_JournalEntryId_LineNumber",
                table: "JournalEntryLines",
                columns: new[] { "TenantId", "JournalEntryId", "LineNumber" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_LedgerAccountMappings_TenantId_AccountId",
                table: "LedgerAccountMappings",
                columns: new[] { "TenantId", "AccountId" });

            migrationBuilder.CreateIndex(
                name: "IX_LedgerAccountMappings_TenantId_MappingKey",
                table: "LedgerAccountMappings",
                columns: new[] { "TenantId", "MappingKey" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_LedgerAccounts_TenantId_Code",
                table: "LedgerAccounts",
                columns: new[] { "TenantId", "Code" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "JournalEntryLines");

            migrationBuilder.DropTable(
                name: "LedgerAccountMappings");

            migrationBuilder.DropTable(
                name: "JournalEntries");

            migrationBuilder.DropTable(
                name: "LedgerAccounts");
        }
    }
}
