using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Tenant
{
    /// <inheritdoc />
    public partial class AddCommercialContractsAndFixedAssetInvoiceLink : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
migrationBuilder.AddColumn<Guid>(
                name: "PurchaseInvoiceId",
                table: "FixedAssets",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "CommercialContracts",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Type = table.Column<int>(type: "int", nullable: false),
                    CounterpartyId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CounterpartyNameSnapshot = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    EffectiveFrom = table.Column<DateOnly>(type: "date", nullable: false),
                    EffectiveThrough = table.Column<DateOnly>(type: "date", nullable: false),
                    CurrencyCode = table.Column<string>(type: "nchar(3)", fixedLength: true, maxLength: 3, nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    SalesQuoteId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    SalesOrderId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    PurchaseSupplierQuoteId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    PurchaseOrderId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreateIdempotencyKey = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    Revision = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CommercialContracts", x => x.Id);
                    table.UniqueConstraint("AK_CommercialContracts_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_CommercialContracts_EffectiveRange", "[EffectiveThrough] >= [EffectiveFrom]");
                    table.CheckConstraint("CK_CommercialContracts_SourceDirection", "([Type] = 1 AND [PurchaseSupplierQuoteId] IS NULL AND [PurchaseOrderId] IS NULL) OR ([Type] = 2 AND [SalesQuoteId] IS NULL AND [SalesOrderId] IS NULL)");
                    table.CheckConstraint("CK_CommercialContracts_Status", "[Status] BETWEEN 1 AND 6");
                    table.CheckConstraint("CK_CommercialContracts_Type", "[Type] IN (1,2)");
                    table.ForeignKey(
                        name: "FK_CommercialContracts_CustomerAccounts_TenantId_CounterpartyId",
                        columns: x => new { x.TenantId, x.CounterpartyId },
                        principalTable: "CustomerAccounts",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CommercialContracts_PurchaseOrders_TenantId_PurchaseOrderId",
                        columns: x => new { x.TenantId, x.PurchaseOrderId },
                        principalTable: "PurchaseOrders",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CommercialContracts_PurchaseSupplierQuotes_TenantId_PurchaseSupplierQuoteId",
                        columns: x => new { x.TenantId, x.PurchaseSupplierQuoteId },
                        principalTable: "PurchaseSupplierQuotes",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CommercialContracts_SalesOrders_TenantId_SalesOrderId",
                        columns: x => new { x.TenantId, x.SalesOrderId },
                        principalTable: "SalesOrders",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CommercialContracts_SalesQuotes_TenantId_SalesQuoteId",
                        columns: x => new { x.TenantId, x.SalesQuoteId },
                        principalTable: "SalesQuotes",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CommercialContracts_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "CommercialContractStatusTransitions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ContractId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    FromStatus = table.Column<int>(type: "int", nullable: false),
                    ToStatus = table.Column<int>(type: "int", nullable: false),
                    Reason = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    IdempotencyKey = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ChangedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ChangedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CommercialContractStatusTransitions", x => x.Id);
                    table.UniqueConstraint("AK_CommercialContractStatusTransitions_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_CommercialContractStatusTransitions_Change", "[FromStatus] <> [ToStatus]");
                    table.CheckConstraint("CK_CommercialContractStatusTransitions_Status", "[FromStatus] BETWEEN 1 AND 6 AND [ToStatus] BETWEEN 1 AND 6");
                    table.ForeignKey(
                        name: "FK_CommercialContractStatusTransitions_CommercialContracts_TenantId_ContractId",
                        columns: x => new { x.TenantId, x.ContractId },
                        principalTable: "CommercialContracts",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CommercialContractStatusTransitions_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });
migrationBuilder.CreateIndex(
                name: "IX_FixedAssets_TenantId_PurchaseInvoiceId",
                table: "FixedAssets",
                columns: new[] { "TenantId", "PurchaseInvoiceId" });

            migrationBuilder.CreateIndex(
                name: "IX_CommercialContracts_TenantId_Code",
                table: "CommercialContracts",
                columns: new[] { "TenantId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CommercialContracts_TenantId_CounterpartyId",
                table: "CommercialContracts",
                columns: new[] { "TenantId", "CounterpartyId" });

            migrationBuilder.CreateIndex(
                name: "IX_CommercialContracts_TenantId_CreateIdempotencyKey",
                table: "CommercialContracts",
                columns: new[] { "TenantId", "CreateIdempotencyKey" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CommercialContracts_TenantId_PurchaseOrderId",
                table: "CommercialContracts",
                columns: new[] { "TenantId", "PurchaseOrderId" });

            migrationBuilder.CreateIndex(
                name: "IX_CommercialContracts_TenantId_PurchaseSupplierQuoteId",
                table: "CommercialContracts",
                columns: new[] { "TenantId", "PurchaseSupplierQuoteId" });

            migrationBuilder.CreateIndex(
                name: "IX_CommercialContracts_TenantId_SalesOrderId",
                table: "CommercialContracts",
                columns: new[] { "TenantId", "SalesOrderId" });

            migrationBuilder.CreateIndex(
                name: "IX_CommercialContracts_TenantId_SalesQuoteId",
                table: "CommercialContracts",
                columns: new[] { "TenantId", "SalesQuoteId" });

            migrationBuilder.CreateIndex(
                name: "IX_CommercialContracts_TenantId_Status_EffectiveFrom_EffectiveThrough",
                table: "CommercialContracts",
                columns: new[] { "TenantId", "Status", "EffectiveFrom", "EffectiveThrough" });

            migrationBuilder.CreateIndex(
                name: "IX_CommercialContractStatusTransitions_TenantId_ContractId_ChangedAt",
                table: "CommercialContractStatusTransitions",
                columns: new[] { "TenantId", "ContractId", "ChangedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_CommercialContractStatusTransitions_TenantId_IdempotencyKey",
                table: "CommercialContractStatusTransitions",
                columns: new[] { "TenantId", "IdempotencyKey" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_FixedAssets_PurchaseInvoices_TenantId_PurchaseInvoiceId",
                table: "FixedAssets",
                columns: new[] { "TenantId", "PurchaseInvoiceId" },
                principalTable: "PurchaseInvoices",
                principalColumns: new[] { "TenantId", "Id" },
                onDelete: ReferentialAction.Restrict);
}

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_FixedAssets_PurchaseInvoices_TenantId_PurchaseInvoiceId",
                table: "FixedAssets");
migrationBuilder.DropTable(
                name: "CommercialContractStatusTransitions");

            migrationBuilder.DropTable(
                name: "CommercialContracts");
migrationBuilder.DropIndex(
                name: "IX_FixedAssets_TenantId_PurchaseInvoiceId",
                table: "FixedAssets");
migrationBuilder.DropColumn(
                name: "PurchaseInvoiceId",
                table: "FixedAssets");
        }
    }
}

