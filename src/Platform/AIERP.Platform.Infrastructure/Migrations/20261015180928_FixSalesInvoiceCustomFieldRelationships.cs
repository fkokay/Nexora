using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class FixSalesInvoiceCustomFieldRelationships : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // The legacy SalesInvoiceId properties were EF shadow foreign keys. The
            // supported value is InvoiceId; refuse to drop the legacy columns if
            // any stored reference differs, so migration cannot silently discard
            // a distinct invoice association.
            migrationBuilder.Sql("""
                DECLARE @hasMismatch bit = 0;
                DECLARE @checkValues nvarchar(max);

                IF COL_LENGTH(N'dbo.SalesInvoiceCustomFieldValues', N'SalesInvoiceId') IS NOT NULL
                BEGIN
                    IF COL_LENGTH(N'dbo.SalesInvoiceCustomFieldValues', N'InvoiceId') IS NULL
                        THROW 51001, 'Sales invoice custom-field migration stopped: InvoiceId is missing.', 1;
                    SET @checkValues = N'IF EXISTS (SELECT 1 FROM [dbo].[SalesInvoiceCustomFieldValues] WHERE [SalesInvoiceId] IS NOT NULL AND ([InvoiceId] IS NULL OR [SalesInvoiceId] <> [InvoiceId])) SET @hasMismatch = 1;';
                    EXEC sys.sp_executesql @checkValues, N'@hasMismatch bit OUTPUT', @hasMismatch = @hasMismatch OUTPUT;
                END;

                IF COL_LENGTH(N'dbo.SalesInvoiceCustomFieldValueRevisions', N'SalesInvoiceId') IS NOT NULL
                BEGIN
                    IF COL_LENGTH(N'dbo.SalesInvoiceCustomFieldValueRevisions', N'InvoiceId') IS NULL
                        THROW 51002, 'Sales invoice custom-field history migration stopped: InvoiceId is missing.', 1;
                    SET @checkValues = N'IF EXISTS (SELECT 1 FROM [dbo].[SalesInvoiceCustomFieldValueRevisions] WHERE [SalesInvoiceId] IS NOT NULL AND ([InvoiceId] IS NULL OR [SalesInvoiceId] <> [InvoiceId])) SET @hasMismatch = 1;';
                    EXEC sys.sp_executesql @checkValues, N'@hasMismatch bit OUTPUT', @hasMismatch = @hasMismatch OUTPUT;
                END;

                IF @hasMismatch = 1
                    THROW 51003, 'Sales invoice custom-field migration stopped: legacy invoice references differ from InvoiceId.', 1;
                """);

            migrationBuilder.DropForeignKey(
                name: "FK_SalesInvoiceCustomFieldValueRevisions_SalesInvoices_SalesInvoiceId",
                table: "SalesInvoiceCustomFieldValueRevisions");

            migrationBuilder.DropForeignKey(
                name: "FK_SalesInvoiceCustomFieldValues_SalesInvoices_SalesInvoiceId",
                table: "SalesInvoiceCustomFieldValues");

            migrationBuilder.DropIndex(
                name: "IX_SalesInvoiceCustomFieldValues_SalesInvoiceId",
                table: "SalesInvoiceCustomFieldValues");

            migrationBuilder.DropIndex(
                name: "IX_SalesInvoiceCustomFieldValueRevisions_SalesInvoiceId",
                table: "SalesInvoiceCustomFieldValueRevisions");

            migrationBuilder.DropColumn(
                name: "SalesInvoiceId",
                table: "SalesInvoiceCustomFieldValues");

            migrationBuilder.DropColumn(
                name: "SalesInvoiceId",
                table: "SalesInvoiceCustomFieldValueRevisions");

            migrationBuilder.CreateTable(
                name: "FxRevaluationVouchers",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    AsOfDate = table.Column<DateOnly>(type: "date", nullable: false),
                    BaseCurrencyCode = table.Column<string>(type: "nchar(3)", fixedLength: true, maxLength: 3, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FxRevaluationVouchers", x => x.Id);
                    table.UniqueConstraint("AK_FxRevaluationVouchers_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.ForeignKey(
                        name: "FK_FxRevaluationVouchers_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "FxRevaluationVoucherLines",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    VoucherId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Direction = table.Column<int>(type: "int", nullable: false),
                    InvoiceId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    InvoiceCode = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    CounterpartyName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    CurrencyCode = table.Column<string>(type: "nchar(3)", fixedLength: true, maxLength: 3, nullable: false),
                    OutstandingAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    InvoiceDateRate = table.Column<decimal>(type: "decimal(18,8)", precision: 18, scale: 8, nullable: false),
                    ClosingRate = table.Column<decimal>(type: "decimal(18,8)", precision: 18, scale: 8, nullable: false),
                    PreviousAdjustmentBase = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    TargetAdjustmentBase = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    AdjustmentBase = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    DebitAccount = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    CreditAccount = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    DebitBaseAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    CreditBaseAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FxRevaluationVoucherLines", x => x.Id);
                    table.UniqueConstraint("AK_FxRevaluationVoucherLines_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_FxRevaluationVoucherLines_AmountsNonNegative", "[OutstandingAmount] >= 0 AND [DebitBaseAmount] >= 0 AND [CreditBaseAmount] >= 0");
                    table.CheckConstraint("CK_FxRevaluationVoucherLines_Balanced", "[DebitBaseAmount] = [CreditBaseAmount]");
                    table.ForeignKey(
                        name: "FK_FxRevaluationVoucherLines_FxRevaluationVouchers_TenantId_VoucherId",
                        columns: x => new { x.TenantId, x.VoucherId },
                        principalTable: "FxRevaluationVouchers",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_FxRevaluationVoucherLines_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseRequestCustomFieldValues_PurchaseRequestId",
                table: "PurchaseRequestCustomFieldValues",
                column: "PurchaseRequestId");

            migrationBuilder.CreateIndex(
                name: "IX_FxRevaluationVoucherLines_TenantId_VoucherId_InvoiceId",
                table: "FxRevaluationVoucherLines",
                columns: new[] { "TenantId", "VoucherId", "InvoiceId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_FxRevaluationVouchers_TenantId_AsOfDate",
                table: "FxRevaluationVouchers",
                columns: new[] { "TenantId", "AsOfDate" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_FxRevaluationVouchers_TenantId_Code",
                table: "FxRevaluationVouchers",
                columns: new[] { "TenantId", "Code" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_PurchaseRequestCustomFieldValues_PurchaseRequests_PurchaseRequestId",
                table: "PurchaseRequestCustomFieldValues",
                column: "PurchaseRequestId",
                principalTable: "PurchaseRequests",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_PurchaseRequestCustomFieldValues_PurchaseRequests_PurchaseRequestId",
                table: "PurchaseRequestCustomFieldValues");

            migrationBuilder.DropTable(
                name: "FxRevaluationVoucherLines");

            migrationBuilder.DropTable(
                name: "FxRevaluationVouchers");

            migrationBuilder.DropIndex(
                name: "IX_PurchaseRequestCustomFieldValues_PurchaseRequestId",
                table: "PurchaseRequestCustomFieldValues");

            migrationBuilder.AddColumn<Guid>(
                name: "SalesInvoiceId",
                table: "SalesInvoiceCustomFieldValues",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "SalesInvoiceId",
                table: "SalesInvoiceCustomFieldValueRevisions",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_SalesInvoiceCustomFieldValues_SalesInvoiceId",
                table: "SalesInvoiceCustomFieldValues",
                column: "SalesInvoiceId");

            migrationBuilder.CreateIndex(
                name: "IX_SalesInvoiceCustomFieldValueRevisions_SalesInvoiceId",
                table: "SalesInvoiceCustomFieldValueRevisions",
                column: "SalesInvoiceId");

            migrationBuilder.AddForeignKey(
                name: "FK_SalesInvoiceCustomFieldValueRevisions_SalesInvoices_SalesInvoiceId",
                table: "SalesInvoiceCustomFieldValueRevisions",
                column: "SalesInvoiceId",
                principalTable: "SalesInvoices",
                principalColumn: "Id");

            migrationBuilder.AddForeignKey(
                name: "FK_SalesInvoiceCustomFieldValues_SalesInvoices_SalesInvoiceId",
                table: "SalesInvoiceCustomFieldValues",
                column: "SalesInvoiceId",
                principalTable: "SalesInvoices",
                principalColumn: "Id");
        }
    }
}
