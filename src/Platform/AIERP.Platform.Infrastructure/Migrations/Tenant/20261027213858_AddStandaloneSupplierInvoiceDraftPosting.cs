using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Tenant
{
    /// <inheritdoc />
    public partial class AddStandaloneSupplierInvoiceDraftPosting : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_PurchaseInvoiceDrafts_Status",
                table: "PurchaseInvoiceDrafts");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "PostedAt",
                table: "PurchaseInvoiceDrafts",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "PostedByUserId",
                table: "PurchaseInvoiceDrafts",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "NormalizedInvoiceNumber",
                table: "PurchaseInvoiceDrafts",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<Guid>(
                name: "PurchaseInvoiceDraftId",
                table: "CustomerLedgerEntries",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.Sql("EXEC(N'UPDATE [dbo].[PurchaseInvoiceDrafts] SET [NormalizedInvoiceNumber] = UPPER(LTRIM(RTRIM([InvoiceNumber])))');");

            migrationBuilder.AddCheckConstraint(
                name: "CK_PurchaseInvoiceDrafts_Status",
                table: "PurchaseInvoiceDrafts",
                sql: "[Status] IN (1, 2)");

            migrationBuilder.Sql(
                "EXEC(N'ALTER TABLE [PurchaseInvoiceDrafts] ADD CONSTRAINT [CK_PurchaseInvoiceDrafts_Posting] CHECK (([Status] = 1 AND [PostedAt] IS NULL AND [PostedByUserId] IS NULL) OR ([Status] = 2 AND [PostedAt] IS NOT NULL AND [PostedByUserId] IS NOT NULL))');");

            migrationBuilder.Sql("SET ANSI_NULLS ON; SET QUOTED_IDENTIFIER ON;");

            migrationBuilder.Sql(
                "EXEC(N'CREATE UNIQUE INDEX [IX_CustomerLedgerEntries_TenantId_PurchaseInvoiceDraftId] ON [CustomerLedgerEntries] ([TenantId], [PurchaseInvoiceDraftId]) WHERE [PurchaseInvoiceDraftId] IS NOT NULL');");

            migrationBuilder.Sql(
                "EXEC(N'ALTER TABLE [CustomerLedgerEntries] ADD CONSTRAINT [FK_CustomerLedgerEntries_PurchaseInvoiceDrafts_TenantId_PurchaseInvoiceDraftId] FOREIGN KEY ([TenantId], [PurchaseInvoiceDraftId]) REFERENCES [PurchaseInvoiceDrafts] ([TenantId], [Id]) ON DELETE NO ACTION');");

            migrationBuilder.Sql(
                "EXEC(N'CREATE UNIQUE INDEX [IX_PurchaseInvoiceDrafts_TenantId_SupplierId_NormalizedInvoiceNumber] ON [PurchaseInvoiceDrafts] ([TenantId], [SupplierId], [NormalizedInvoiceNumber]) WHERE [Status] = 2');");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_CustomerLedgerEntries_PurchaseInvoiceDrafts_TenantId_PurchaseInvoiceDraftId",
                table: "CustomerLedgerEntries");

            migrationBuilder.DropIndex(
                name: "IX_PurchaseInvoiceDrafts_TenantId_SupplierId_NormalizedInvoiceNumber",
                table: "PurchaseInvoiceDrafts");

            migrationBuilder.DropIndex(
                name: "IX_CustomerLedgerEntries_TenantId_PurchaseInvoiceDraftId",
                table: "CustomerLedgerEntries");

            migrationBuilder.DropCheckConstraint(
                name: "CK_PurchaseInvoiceDrafts_Posting",
                table: "PurchaseInvoiceDrafts");

            migrationBuilder.DropCheckConstraint(
                name: "CK_PurchaseInvoiceDrafts_Status",
                table: "PurchaseInvoiceDrafts");

            migrationBuilder.AddCheckConstraint(
                name: "CK_PurchaseInvoiceDrafts_Status",
                table: "PurchaseInvoiceDrafts",
                sql: "[Status] = 1");

            migrationBuilder.DropColumn(
                name: "PostedAt",
                table: "PurchaseInvoiceDrafts");

            migrationBuilder.DropColumn(
                name: "PostedByUserId",
                table: "PurchaseInvoiceDrafts");

            migrationBuilder.DropColumn(
                name: "PurchaseInvoiceDraftId",
                table: "CustomerLedgerEntries");

            migrationBuilder.DropColumn(
                name: "NormalizedInvoiceNumber",
                table: "PurchaseInvoiceDrafts");
        }
    }
}
