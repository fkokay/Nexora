using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddCustomerCollections : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "CustomerCollectionId",
                table: "CustomerLedgerEntries",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "CustomerCollections",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CustomerId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RequestId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    CollectionDate = table.Column<DateOnly>(type: "date", nullable: false),
                    CurrencyCode = table.Column<string>(type: "nchar(3)", fixedLength: true, maxLength: 3, nullable: false),
                    Amount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    PaymentMethod = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Reference = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    Status = table.Column<int>(type: "int", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CustomerCollections", x => x.Id);
                    table.UniqueConstraint("AK_CustomerCollections_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_CustomerCollections_AmountPositive", "[Amount] > 0");
                    table.ForeignKey(
                        name: "FK_CustomerCollections_CustomerAccounts_TenantId_CustomerId",
                        columns: x => new { x.TenantId, x.CustomerId },
                        principalTable: "CustomerAccounts",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CustomerCollections_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "CustomerCollectionAllocations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CustomerCollectionId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SalesInvoiceId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Amount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CustomerCollectionAllocations", x => x.Id);
                    table.UniqueConstraint("AK_CustomerCollectionAllocations_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_CustomerCollectionAllocations_AmountPositive", "[Amount] > 0");
                    table.ForeignKey(
                        name: "FK_CustomerCollectionAllocations_CustomerCollections_TenantId_CustomerCollectionId",
                        columns: x => new { x.TenantId, x.CustomerCollectionId },
                        principalTable: "CustomerCollections",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_CustomerCollectionAllocations_SalesInvoices_TenantId_SalesInvoiceId",
                        columns: x => new { x.TenantId, x.SalesInvoiceId },
                        principalTable: "SalesInvoices",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CustomerLedgerEntries_TenantId_CustomerCollectionId",
                table: "CustomerLedgerEntries",
                columns: new[] { "TenantId", "CustomerCollectionId" });

            migrationBuilder.CreateIndex(
                name: "IX_CustomerCollectionAllocations_TenantId_CustomerCollectionId_SalesInvoiceId",
                table: "CustomerCollectionAllocations",
                columns: new[] { "TenantId", "CustomerCollectionId", "SalesInvoiceId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CustomerCollectionAllocations_TenantId_SalesInvoiceId",
                table: "CustomerCollectionAllocations",
                columns: new[] { "TenantId", "SalesInvoiceId" });

            migrationBuilder.CreateIndex(
                name: "IX_CustomerCollections_TenantId_Code",
                table: "CustomerCollections",
                columns: new[] { "TenantId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CustomerCollections_TenantId_CustomerId_CollectionDate_CreatedAt",
                table: "CustomerCollections",
                columns: new[] { "TenantId", "CustomerId", "CollectionDate", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_CustomerCollections_TenantId_RequestId",
                table: "CustomerCollections",
                columns: new[] { "TenantId", "RequestId" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_CustomerLedgerEntries_CustomerCollections_TenantId_CustomerCollectionId",
                table: "CustomerLedgerEntries",
                columns: new[] { "TenantId", "CustomerCollectionId" },
                principalTable: "CustomerCollections",
                principalColumns: new[] { "TenantId", "Id" },
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_CustomerLedgerEntries_CustomerCollections_TenantId_CustomerCollectionId",
                table: "CustomerLedgerEntries");

            migrationBuilder.DropTable(
                name: "CustomerCollectionAllocations");

            migrationBuilder.DropTable(
                name: "CustomerCollections");

            migrationBuilder.DropIndex(
                name: "IX_CustomerLedgerEntries_TenantId_CustomerCollectionId",
                table: "CustomerLedgerEntries");

            migrationBuilder.DropColumn(
                name: "CustomerCollectionId",
                table: "CustomerLedgerEntries");
        }
    }
}
