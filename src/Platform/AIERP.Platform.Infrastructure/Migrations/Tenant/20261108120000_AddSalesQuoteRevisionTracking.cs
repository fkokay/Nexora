using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

[DbContext(typeof(TenantDbContext))]
[Migration("20261108120000_AddSalesQuoteRevisionTracking")]
public sealed class AddSalesQuoteRevisionTracking : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<Guid>(
            name: "RevisionGroupId",
            table: "SalesQuotes",
            type: "uniqueidentifier",
            nullable: true);
        migrationBuilder.AddColumn<int>(
            name: "RevisionNumber",
            table: "SalesQuotes",
            type: "int",
            nullable: false,
            defaultValue: 1);
        migrationBuilder.Sql("EXEC(N'UPDATE [SalesQuotes] SET [RevisionGroupId] = [Id] WHERE [RevisionGroupId] IS NULL;');");
        migrationBuilder.AlterColumn<Guid>(
            name: "RevisionGroupId",
            table: "SalesQuotes",
            type: "uniqueidentifier",
            nullable: false,
            oldClrType: typeof(Guid),
            oldType: "uniqueidentifier",
            oldNullable: true);
        migrationBuilder.CreateIndex(
            name: "IX_SalesQuotes_TenantId_RevisionGroupId_RevisionNumber",
            table: "SalesQuotes",
            columns: new[] { "TenantId", "RevisionGroupId", "RevisionNumber" },
            unique: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropIndex(
            name: "IX_SalesQuotes_TenantId_RevisionGroupId_RevisionNumber",
            table: "SalesQuotes");
        migrationBuilder.DropColumn(name: "RevisionGroupId", table: "SalesQuotes");
        migrationBuilder.DropColumn(name: "RevisionNumber", table: "SalesQuotes");
    }
}
