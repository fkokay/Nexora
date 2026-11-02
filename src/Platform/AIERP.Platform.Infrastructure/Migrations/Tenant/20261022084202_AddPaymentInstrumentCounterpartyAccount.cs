using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Tenant
{
    /// <inheritdoc />
    public partial class AddPaymentInstrumentCounterpartyAccount : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "CounterpartyAccountId",
                table: "PaymentInstruments",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_PaymentInstruments_TenantId_CounterpartyAccountId",
                table: "PaymentInstruments",
                columns: new[] { "TenantId", "CounterpartyAccountId" });

            migrationBuilder.AddForeignKey(
                name: "FK_PaymentInstruments_CustomerAccounts_TenantId_CounterpartyAccountId",
                table: "PaymentInstruments",
                columns: new[] { "TenantId", "CounterpartyAccountId" },
                principalTable: "CustomerAccounts",
                principalColumns: new[] { "TenantId", "Id" },
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_PaymentInstruments_CustomerAccounts_TenantId_CounterpartyAccountId",
                table: "PaymentInstruments");

            migrationBuilder.DropIndex(
                name: "IX_PaymentInstruments_TenantId_CounterpartyAccountId",
                table: "PaymentInstruments");

            migrationBuilder.DropColumn(
                name: "CounterpartyAccountId",
                table: "PaymentInstruments");
        }
    }
}
