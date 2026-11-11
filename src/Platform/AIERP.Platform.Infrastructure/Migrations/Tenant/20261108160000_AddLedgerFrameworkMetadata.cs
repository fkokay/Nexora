using System;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Tenant;

public partial class AddLedgerFrameworkMetadata : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<int>("AccountType", "LedgerAccounts", type: "int", nullable: false, defaultValue: 0);
        migrationBuilder.AddColumn<int>("NormalBalance", "LedgerAccounts", type: "int", nullable: false, defaultValue: 0);
        migrationBuilder.AddColumn<string>("CurrencyCode", "LedgerAccounts", type: "varchar(3)", unicode: false, maxLength: 3, nullable: true);
        migrationBuilder.AddColumn<string>("IfrsAccountCode", "LedgerAccounts", type: "nvarchar(32)", maxLength: 32, nullable: true);
        migrationBuilder.AddColumn<string>("IfrsAccountName", "LedgerAccounts", type: "nvarchar(160)", maxLength: 160, nullable: true);
        migrationBuilder.AddColumn<int>("IfrsStatementSection", "LedgerAccounts", type: "int", nullable: false, defaultValue: 0);
        migrationBuilder.AddColumn<string>("AccountingBasis", "JournalEntries", type: "varchar(12)", unicode: false, maxLength: 12, nullable: false, defaultValue: "TDHP");
        migrationBuilder.CreateTable(
            name: "AccountingRuleProfiles",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                ProfileCode = table.Column<string>(type: "varchar(32)", unicode: false, maxLength: 32, nullable: false),
                Name = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                JurisdictionCode = table.Column<string>(type: "varchar(8)", unicode: false, maxLength: 8, nullable: false),
                ReportingStandard = table.Column<string>(type: "varchar(32)", unicode: false, maxLength: 32, nullable: false),
                BaseCurrencyCode = table.Column<string>(type: "varchar(3)", unicode: false, maxLength: 3, nullable: false),
                FiscalYearStartMonth = table.Column<int>(type: "int", nullable: false),
                EffectiveFrom = table.Column<DateOnly>(type: "date", nullable: false),
                EffectiveTo = table.Column<DateOnly>(type: "date", nullable: true),
                ParametersJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                OfficialSourceUrl = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                IsActive = table.Column<bool>(type: "bit", nullable: false),
                UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_AccountingRuleProfiles", x => x.Id);
                table.UniqueConstraint("AK_AccountingRuleProfiles_TenantId_Id", x => new { x.TenantId, x.Id });
                table.ForeignKey(
                    name: "FK_AccountingRuleProfiles_Tenants_TenantId",
                    column: x => x.TenantId,
                    principalTable: "Tenants",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Restrict);
            });
        migrationBuilder.CreateIndex("IX_AccountingRuleProfiles_TenantId_ProfileCode", "AccountingRuleProfiles", new[] { "TenantId", "ProfileCode" }, unique: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable("AccountingRuleProfiles");
        migrationBuilder.DropColumn("AccountType", "LedgerAccounts");
        migrationBuilder.DropColumn("NormalBalance", "LedgerAccounts");
        migrationBuilder.DropColumn("CurrencyCode", "LedgerAccounts");
        migrationBuilder.DropColumn("IfrsAccountCode", "LedgerAccounts");
        migrationBuilder.DropColumn("IfrsAccountName", "LedgerAccounts");
        migrationBuilder.DropColumn("IfrsStatementSection", "LedgerAccounts");
        migrationBuilder.DropColumn("AccountingBasis", "JournalEntries");
    }
}
