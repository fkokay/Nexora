using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

[DbContext(typeof(TenantDbContext))]
[Migration("20261108133000_AddSalesQuoteProspects")]
public sealed class AddSalesQuoteProspects : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropForeignKey(
            name: "FK_SalesQuotes_CustomerAccounts_TenantId_CustomerId",
            table: "SalesQuotes");

        migrationBuilder.AlterColumn<Guid>(
            name: "CustomerId",
            table: "SalesQuotes",
            type: "uniqueidentifier",
            nullable: true,
            oldClrType: typeof(Guid),
            oldType: "uniqueidentifier");

        migrationBuilder.AddColumn<string>(
            name: "ProspectCustomerName",
            table: "SalesQuotes",
            type: "nvarchar(200)",
            maxLength: 200,
            nullable: true);

        migrationBuilder.AddColumn<decimal>("PurchaseListPrice", "StockItems", type: "decimal(18,4)", precision: 18, scale: 4, nullable: true);
        migrationBuilder.AddColumn<decimal>("SalesListPrice", "StockItems", type: "decimal(18,4)", precision: 18, scale: 4, nullable: true);
        migrationBuilder.AddColumn<string>("PriceCurrencyCode", "StockItems", type: "nchar(3)", maxLength: 3, fixedLength: true, nullable: false, defaultValue: "TRY");
        migrationBuilder.AddColumn<decimal>("PurchaseVatPercent", "StockItems", type: "decimal(5,2)", precision: 5, scale: 2, nullable: false, defaultValue: 20m);
        migrationBuilder.AddColumn<decimal>("SalesVatPercent", "StockItems", type: "decimal(5,2)", precision: 5, scale: 2, nullable: false, defaultValue: 20m);
        migrationBuilder.AddColumn<decimal>("ExciseTaxPercent", "StockItems", type: "decimal(5,2)", precision: 5, scale: 2, nullable: false, defaultValue: 0m);
        migrationBuilder.AddColumn<decimal>("CommunicationTaxPercent", "StockItems", type: "decimal(5,2)", precision: 5, scale: 2, nullable: false, defaultValue: 0m);
        migrationBuilder.AddColumn<decimal>("WithholdingTaxPercent", "StockItems", type: "decimal(5,2)", precision: 5, scale: 2, nullable: false, defaultValue: 0m);
        migrationBuilder.AddColumn<decimal>("StampTaxPercent", "StockItems", type: "decimal(5,2)", precision: 5, scale: 2, nullable: false, defaultValue: 0m);
        migrationBuilder.AddColumn<decimal>("PurchaseDiscountPercent", "StockItems", type: "decimal(5,2)", precision: 5, scale: 2, nullable: false, defaultValue: 0m);
        migrationBuilder.AddColumn<decimal>("SalesDiscountPercent", "StockItems", type: "decimal(5,2)", precision: 5, scale: 2, nullable: false, defaultValue: 0m);
        migrationBuilder.AddColumn<decimal>("SafetyStock", "StockItems", type: "decimal(18,4)", precision: 18, scale: 4, nullable: false, defaultValue: 0m);
        migrationBuilder.AddColumn<decimal?>("MaximumStock", "StockItems", type: "decimal(18,4)", precision: 18, scale: 4, nullable: true);
        migrationBuilder.AddColumn<decimal?>("ReorderPoint", "StockItems", type: "decimal(18,4)", precision: 18, scale: 4, nullable: true);
        migrationBuilder.AddColumn<decimal?>("NetWeight", "StockItems", type: "decimal(18,4)", precision: 18, scale: 4, nullable: true);
        migrationBuilder.AddColumn<decimal?>("GrossWeight", "StockItems", type: "decimal(18,4)", precision: 18, scale: 4, nullable: true);
        migrationBuilder.AddColumn<decimal?>("Length", "StockItems", type: "decimal(18,4)", precision: 18, scale: 4, nullable: true);
        migrationBuilder.AddColumn<decimal?>("Width", "StockItems", type: "decimal(18,4)", precision: 18, scale: 4, nullable: true);
        migrationBuilder.AddColumn<decimal?>("Height", "StockItems", type: "decimal(18,4)", precision: 18, scale: 4, nullable: true);
        migrationBuilder.AddColumn<string>("ProductImageUrl", "StockItems", type: "nvarchar(1000)", maxLength: 1000, nullable: true);
        migrationBuilder.AddColumn<string>("PurchaseAccountCode", "StockItems", type: "nvarchar(40)", maxLength: 40, nullable: true);
        migrationBuilder.AddColumn<string>("SalesAccountCode", "StockItems", type: "nvarchar(40)", maxLength: 40, nullable: true);
        migrationBuilder.AddColumn<string>("CostAccountCode", "StockItems", type: "nvarchar(40)", maxLength: 40, nullable: true);
        migrationBuilder.AddColumn<string>("MarketplaceProductId", "StockItems", type: "nvarchar(120)", maxLength: 120, nullable: true);
        migrationBuilder.AddColumn<Guid>("ParentStockItemId", "StockItems", type: "uniqueidentifier", nullable: true);
        migrationBuilder.AddColumn<string>("VariantAttributesJson", "StockItems", type: "nvarchar(2000)", maxLength: 2000, nullable: true);
        migrationBuilder.AddColumn<bool>("IsVariantParent", "StockItems", type: "bit", nullable: false, defaultValue: false);
        migrationBuilder.CreateIndex("IX_StockItems_TenantId_ParentStockItemId", "StockItems", new[] { "TenantId", "ParentStockItemId" });
        migrationBuilder.AddForeignKey(name: "FK_StockItems_StockItems_TenantId_ParentStockItemId", table: "StockItems",
            columns: new[] { "TenantId", "ParentStockItemId" }, principalTable: "StockItems",
            principalColumns: new[] { "TenantId", "Id" }, onDelete: ReferentialAction.Restrict);

        migrationBuilder.AddColumn<string>("Phone", "CustomerAccounts", type: "nvarchar(40)", maxLength: 40, nullable: true);
        migrationBuilder.AddColumn<string>("Email", "CustomerAccounts", type: "nvarchar(254)", maxLength: 254, nullable: true);
        migrationBuilder.AddColumn<string>("Website", "CustomerAccounts", type: "nvarchar(255)", maxLength: 255, nullable: true);
        migrationBuilder.AddColumn<string>("ContactName", "CustomerAccounts", type: "nvarchar(160)", maxLength: 160, nullable: true);
        migrationBuilder.AddColumn<string>("ContactPhone", "CustomerAccounts", type: "nvarchar(40)", maxLength: 40, nullable: true);
        migrationBuilder.AddColumn<string>("ContactEmail", "CustomerAccounts", type: "nvarchar(254)", maxLength: 254, nullable: true);
        migrationBuilder.AddColumn<string>("PriceListCode", "CustomerAccounts", type: "nvarchar(40)", maxLength: 40, nullable: true);
        migrationBuilder.AddColumn<string>("ReceivableAccountCode", "CustomerAccounts", type: "nvarchar(40)", maxLength: 40, nullable: true);
        migrationBuilder.AddColumn<string>("PayableAccountCode", "CustomerAccounts", type: "nvarchar(40)", maxLength: 40, nullable: true);
        migrationBuilder.AddColumn<string>("BankName", "CustomerAccounts", type: "nvarchar(120)", maxLength: 120, nullable: true);
        migrationBuilder.AddColumn<string>("BankBranchCode", "CustomerAccounts", type: "nvarchar(40)", maxLength: 40, nullable: true);
        migrationBuilder.AddColumn<string>("Iban", "CustomerAccounts", type: "varchar(34)", maxLength: 34, nullable: true);

        migrationBuilder.AddForeignKey(
            name: "FK_SalesQuotes_CustomerAccounts_TenantId_CustomerId",
            table: "SalesQuotes",
            columns: new[] { "TenantId", "CustomerId" },
            principalTable: "CustomerAccounts",
            principalColumns: new[] { "TenantId", "Id" },
            onDelete: ReferentialAction.Restrict);
    }

    protected override void Down(MigrationBuilder migrationBuilder) =>
        throw new InvalidOperationException("Prospect teklifleri cari bağlantısı içermeyebilir; veri kaybını önlemek için bu şema geriye alınamaz.");
}
