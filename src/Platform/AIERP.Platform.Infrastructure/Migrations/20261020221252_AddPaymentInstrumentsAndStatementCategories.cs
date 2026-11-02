using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddPaymentInstrumentsAndStatementCategories : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "StatementSection",
                table: "LedgerAccounts",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateTable(
                name: "PaymentInstruments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RequestId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Type = table.Column<int>(type: "int", nullable: false),
                    Direction = table.Column<int>(type: "int", nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    InstrumentNumber = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    CounterpartyName = table.Column<string>(type: "nvarchar(160)", maxLength: 160, nullable: false),
                    BankName = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    CurrencyCode = table.Column<string>(type: "nchar(3)", fixedLength: true, maxLength: 3, nullable: false),
                    Amount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    IssueDate = table.Column<DateOnly>(type: "date", nullable: false),
                    DueDate = table.Column<DateOnly>(type: "date", nullable: false),
                    PortfolioDate = table.Column<DateOnly>(type: "date", nullable: false),
                    EndorsedTo = table.Column<string>(type: "nvarchar(160)", maxLength: 160, nullable: true),
                    EndorsedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    CollectedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    FinancialAccountId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    FinancialAccountTransactionId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Notes = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PaymentInstruments", x => x.Id);
                    table.UniqueConstraint("AK_PaymentInstruments_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_PaymentInstruments_AmountPositive", "[Amount] > 0");
                    table.CheckConstraint("CK_PaymentInstruments_DueDate", "[DueDate] >= [IssueDate]");
                    table.CheckConstraint("CK_PaymentInstruments_ValidDirection", "[Direction] IN (1,2)");
                    table.CheckConstraint("CK_PaymentInstruments_ValidStatus", "[Status] IN (1,2,3,4,5)");
                    table.CheckConstraint("CK_PaymentInstruments_ValidType", "[Type] IN (1,2)");
                    table.ForeignKey(
                        name: "FK_PaymentInstruments_FinancialAccountTransactions_TenantId_FinancialAccountTransactionId_FinancialAccountId_CurrencyCode",
                        columns: x => new { x.TenantId, x.FinancialAccountTransactionId, x.FinancialAccountId, x.CurrencyCode },
                        principalTable: "FinancialAccountTransactions",
                        principalColumns: new[] { "TenantId", "Id", "FinancialAccountId", "CurrencyCode" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PaymentInstruments_FinancialAccounts_TenantId_FinancialAccountId_CurrencyCode",
                        columns: x => new { x.TenantId, x.FinancialAccountId, x.CurrencyCode },
                        principalTable: "FinancialAccounts",
                        principalColumns: new[] { "TenantId", "Id", "CurrencyCode" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PaymentInstruments_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PaymentInstrumentEvents",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PaymentInstrumentId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RequestId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    EventType = table.Column<string>(type: "nvarchar(24)", maxLength: 24, nullable: false),
                    PreviousStatus = table.Column<int>(type: "int", nullable: true),
                    NewStatus = table.Column<int>(type: "int", nullable: false),
                    EventDate = table.Column<DateOnly>(type: "date", nullable: false),
                    Note = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    FinancialAccountTransactionId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PaymentInstrumentEvents", x => x.Id);
                    table.UniqueConstraint("AK_PaymentInstrumentEvents_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_PaymentInstrumentEvents_Status", "[NewStatus] IN (1,2,3,4,5)");
                    table.ForeignKey(
                        name: "FK_PaymentInstrumentEvents_FinancialAccountTransactions_TenantId_FinancialAccountTransactionId",
                        columns: x => new { x.TenantId, x.FinancialAccountTransactionId },
                        principalTable: "FinancialAccountTransactions",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PaymentInstrumentEvents_PaymentInstruments_TenantId_PaymentInstrumentId",
                        columns: x => new { x.TenantId, x.PaymentInstrumentId },
                        principalTable: "PaymentInstruments",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_PaymentInstrumentEvents_TenantId_FinancialAccountTransactionId",
                table: "PaymentInstrumentEvents",
                columns: new[] { "TenantId", "FinancialAccountTransactionId" });

            migrationBuilder.CreateIndex(
                name: "IX_PaymentInstrumentEvents_TenantId_PaymentInstrumentId_CreatedAt",
                table: "PaymentInstrumentEvents",
                columns: new[] { "TenantId", "PaymentInstrumentId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_PaymentInstrumentEvents_TenantId_RequestId",
                table: "PaymentInstrumentEvents",
                columns: new[] { "TenantId", "RequestId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PaymentInstruments_TenantId_Code",
                table: "PaymentInstruments",
                columns: new[] { "TenantId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PaymentInstruments_TenantId_FinancialAccountId_CurrencyCode",
                table: "PaymentInstruments",
                columns: new[] { "TenantId", "FinancialAccountId", "CurrencyCode" });

            migrationBuilder.CreateIndex(
                name: "IX_PaymentInstruments_TenantId_FinancialAccountTransactionId_FinancialAccountId_CurrencyCode",
                table: "PaymentInstruments",
                columns: new[] { "TenantId", "FinancialAccountTransactionId", "FinancialAccountId", "CurrencyCode" });

            migrationBuilder.CreateIndex(
                name: "IX_PaymentInstruments_TenantId_RequestId",
                table: "PaymentInstruments",
                columns: new[] { "TenantId", "RequestId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PaymentInstruments_TenantId_Status_DueDate",
                table: "PaymentInstruments",
                columns: new[] { "TenantId", "Status", "DueDate" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PaymentInstrumentEvents");

            migrationBuilder.DropTable(
                name: "PaymentInstruments");

            migrationBuilder.DropColumn(
                name: "StatementSection",
                table: "LedgerAccounts");
        }
    }
}
