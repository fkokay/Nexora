using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

[DbContext(typeof(TenantDbContext))]
[Migration("20261106120000_AddInvoiceEDocumentFields")]
public sealed class AddInvoiceEDocumentFields : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>("EDocumentScenario", "SalesInvoices", maxLength: 32, nullable: true);
        migrationBuilder.AddColumn<string>("EDocumentTypeCode", "SalesInvoices", maxLength: 32, nullable: true);
        migrationBuilder.AddColumn<string>("EDocumentRecipientAlias", "SalesInvoices", maxLength: 255, nullable: true);
        migrationBuilder.AddColumn<string>("ECommercePurchaseUrl", "SalesInvoices", maxLength: 255, nullable: true);
        migrationBuilder.AddColumn<string>("ECommercePaymentTaxId", "SalesInvoices", maxLength: 11, nullable: true);
        migrationBuilder.AddColumn<string>("ECommercePaymentTitle", "SalesInvoices", maxLength: 255, nullable: true);
        migrationBuilder.AddColumn<string>("ECommercePaymentAlias", "SalesInvoices", maxLength: 255, nullable: true);
        migrationBuilder.AddColumn<string>("ECommercePaymentAgentName", "SalesInvoices", maxLength: 127, nullable: true);
        migrationBuilder.AddColumn<string>("ECommercePaymentType", "SalesInvoices", maxLength: 127, nullable: true);
        migrationBuilder.AddColumn<DateTimeOffset>("ECommercePaymentDate", "SalesInvoices", nullable: true);
        migrationBuilder.AddColumn<DateTimeOffset>("ECommercePaymentDueDate", "SalesInvoices", nullable: true);
        migrationBuilder.AddColumn<string>("ECommercePaymentMeans", "SalesInvoices", maxLength: 32, nullable: true);
        migrationBuilder.AddColumn<string>("ECommercePaymentInstructionNote", "SalesInvoices", maxLength: 255, nullable: true);
        migrationBuilder.AddColumn<string>("ECommerceIntermediaryCountry", "SalesInvoices", maxLength: 127, nullable: true);
        migrationBuilder.AddColumn<string>("ECommerceIntermediaryCountryCode", "SalesInvoices", maxLength: 3, nullable: true);
        migrationBuilder.AddColumn<string>("ECommerceIntermediaryCity", "SalesInvoices", maxLength: 127, nullable: true);
        migrationBuilder.AddColumn<string>("ECommerceIntermediaryDistrict", "SalesInvoices", maxLength: 127, nullable: true);
        migrationBuilder.AddColumn<string>("DeliveryCarrierTaxId", "SalesInvoices", maxLength: 11, nullable: true);
        migrationBuilder.AddColumn<string>("DeliveryCarrierName", "SalesInvoices", maxLength: 255, nullable: true);
        migrationBuilder.AddColumn<string>("DeliveryCarrierSurname", "SalesInvoices", maxLength: 255, nullable: true);
        migrationBuilder.AddColumn<DateOnly>("DeliverySentAt", "SalesInvoices", nullable: true);
        migrationBuilder.AddColumn<Guid>("ProviderInvoiceUuid", "PurchaseInvoices", nullable: true);
        migrationBuilder.AddColumn<string>("ProviderScenario", "PurchaseInvoices", maxLength: 32, nullable: true);
        migrationBuilder.AddColumn<string>("ProviderInvoiceTypeCode", "PurchaseInvoices", maxLength: 32, nullable: true);
        migrationBuilder.AddColumn<string>("ProviderSenderAlias", "PurchaseInvoices", maxLength: 255, nullable: true);
        migrationBuilder.CreateIndex("IX_PurchaseInvoices_TenantId_ProviderInvoiceUuid", "PurchaseInvoices",
            new[] { "TenantId", "ProviderInvoiceUuid" }, unique: true, filter: "[ProviderInvoiceUuid] IS NOT NULL");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropIndex("IX_PurchaseInvoices_TenantId_ProviderInvoiceUuid", "PurchaseInvoices");
        migrationBuilder.DropColumn("EDocumentScenario", "SalesInvoices");
        migrationBuilder.DropColumn("EDocumentTypeCode", "SalesInvoices");
        migrationBuilder.DropColumn("EDocumentRecipientAlias", "SalesInvoices");
        migrationBuilder.DropColumn("ECommercePurchaseUrl", "SalesInvoices");
        migrationBuilder.DropColumn("ECommercePaymentTaxId", "SalesInvoices");
        migrationBuilder.DropColumn("ECommercePaymentTitle", "SalesInvoices");
        migrationBuilder.DropColumn("ECommercePaymentAlias", "SalesInvoices");
        migrationBuilder.DropColumn("ECommercePaymentAgentName", "SalesInvoices");
        migrationBuilder.DropColumn("ECommercePaymentType", "SalesInvoices");
        migrationBuilder.DropColumn("ECommercePaymentDate", "SalesInvoices");
        migrationBuilder.DropColumn("ECommercePaymentDueDate", "SalesInvoices");
        migrationBuilder.DropColumn("ECommercePaymentMeans", "SalesInvoices");
        migrationBuilder.DropColumn("ECommercePaymentInstructionNote", "SalesInvoices");
        migrationBuilder.DropColumn("ECommerceIntermediaryCountry", "SalesInvoices");
        migrationBuilder.DropColumn("ECommerceIntermediaryCountryCode", "SalesInvoices");
        migrationBuilder.DropColumn("ECommerceIntermediaryCity", "SalesInvoices");
        migrationBuilder.DropColumn("ECommerceIntermediaryDistrict", "SalesInvoices");
        migrationBuilder.DropColumn("DeliveryCarrierTaxId", "SalesInvoices");
        migrationBuilder.DropColumn("DeliveryCarrierName", "SalesInvoices");
        migrationBuilder.DropColumn("DeliveryCarrierSurname", "SalesInvoices");
        migrationBuilder.DropColumn("DeliverySentAt", "SalesInvoices");
        migrationBuilder.DropColumn("ProviderInvoiceUuid", "PurchaseInvoices");
        migrationBuilder.DropColumn("ProviderScenario", "PurchaseInvoices");
        migrationBuilder.DropColumn("ProviderInvoiceTypeCode", "PurchaseInvoices");
        migrationBuilder.DropColumn("ProviderSenderAlias", "PurchaseInvoices");
    }
}
