using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Platform
{
    /// <inheritdoc />
    public partial class AddPlatformCustomDataPermissions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_CustomerAddresses_CustomerAccounts_TenantId_CustomerId",
                table: "CustomerAddresses");

            migrationBuilder.AddColumn<decimal>(
                name: "CommunicationTaxPercent",
                table: "StockItems",
                type: "decimal(5,2)",
                precision: 5,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<string>(
                name: "CostAccountCode",
                table: "StockItems",
                type: "nvarchar(40)",
                maxLength: 40,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "ExciseTaxPercent",
                table: "StockItems",
                type: "decimal(5,2)",
                precision: 5,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "GrossWeight",
                table: "StockItems",
                type: "decimal(18,4)",
                precision: 18,
                scale: 4,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "Height",
                table: "StockItems",
                type: "decimal(18,4)",
                precision: 18,
                scale: 4,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsVariantParent",
                table: "StockItems",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<decimal>(
                name: "Length",
                table: "StockItems",
                type: "decimal(18,4)",
                precision: 18,
                scale: 4,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "MarketplaceProductId",
                table: "StockItems",
                type: "nvarchar(120)",
                maxLength: 120,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "MaximumStock",
                table: "StockItems",
                type: "decimal(18,4)",
                precision: 18,
                scale: 4,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "NetWeight",
                table: "StockItems",
                type: "decimal(18,4)",
                precision: 18,
                scale: 4,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ParentStockItemId",
                table: "StockItems",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PriceCurrencyCode",
                table: "StockItems",
                type: "nchar(3)",
                fixedLength: true,
                maxLength: 3,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "ProductImageUrl",
                table: "StockItems",
                type: "nvarchar(1000)",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PurchaseAccountCode",
                table: "StockItems",
                type: "nvarchar(40)",
                maxLength: 40,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "PurchaseDiscountPercent",
                table: "StockItems",
                type: "decimal(5,2)",
                precision: 5,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "PurchaseListPrice",
                table: "StockItems",
                type: "decimal(18,4)",
                precision: 18,
                scale: 4,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "PurchaseVatPercent",
                table: "StockItems",
                type: "decimal(5,2)",
                precision: 5,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "ReorderPoint",
                table: "StockItems",
                type: "decimal(18,4)",
                precision: 18,
                scale: 4,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "SafetyStock",
                table: "StockItems",
                type: "decimal(18,4)",
                precision: 18,
                scale: 4,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<string>(
                name: "SalesAccountCode",
                table: "StockItems",
                type: "nvarchar(40)",
                maxLength: 40,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "SalesDiscountPercent",
                table: "StockItems",
                type: "decimal(5,2)",
                precision: 5,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "SalesListPrice",
                table: "StockItems",
                type: "decimal(18,4)",
                precision: 18,
                scale: 4,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "SalesVatPercent",
                table: "StockItems",
                type: "decimal(5,2)",
                precision: 5,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "StampTaxPercent",
                table: "StockItems",
                type: "decimal(5,2)",
                precision: 5,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<string>(
                name: "VariantAttributesJson",
                table: "StockItems",
                type: "nvarchar(2000)",
                maxLength: 2000,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "Width",
                table: "StockItems",
                type: "decimal(18,4)",
                precision: 18,
                scale: 4,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "WithholdingTaxPercent",
                table: "StockItems",
                type: "decimal(5,2)",
                precision: 5,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

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

            migrationBuilder.AddColumn<Guid>(
                name: "RevisionGroupId",
                table: "SalesQuotes",
                type: "uniqueidentifier",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AddColumn<int>(
                name: "RevisionNumber",
                table: "SalesQuotes",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "AccountingProfileCode",
                table: "SalesInvoices",
                type: "varchar(32)",
                unicode: false,
                maxLength: 32,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeliveryCarrierName",
                table: "SalesInvoices",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeliveryCarrierSurname",
                table: "SalesInvoices",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeliveryCarrierTaxId",
                table: "SalesInvoices",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<DateOnly>(
                name: "DeliverySentAt",
                table: "SalesInvoices",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ECommerceIntermediaryCity",
                table: "SalesInvoices",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ECommerceIntermediaryCountry",
                table: "SalesInvoices",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ECommerceIntermediaryCountryCode",
                table: "SalesInvoices",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ECommerceIntermediaryDistrict",
                table: "SalesInvoices",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ECommercePaymentAgentName",
                table: "SalesInvoices",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ECommercePaymentAlias",
                table: "SalesInvoices",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ECommercePaymentDate",
                table: "SalesInvoices",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ECommercePaymentDueDate",
                table: "SalesInvoices",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ECommercePaymentInstructionNote",
                table: "SalesInvoices",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ECommercePaymentMeans",
                table: "SalesInvoices",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ECommercePaymentTaxId",
                table: "SalesInvoices",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ECommercePaymentTitle",
                table: "SalesInvoices",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ECommercePaymentType",
                table: "SalesInvoices",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ECommercePurchaseUrl",
                table: "SalesInvoices",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "EDocumentRecipientAlias",
                table: "SalesInvoices",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "EDocumentScenario",
                table: "SalesInvoices",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "EDocumentTypeCode",
                table: "SalesInvoices",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "TaxBreakdownJson",
                table: "SalesInvoices",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "TaxBreakdownJson",
                table: "SalesInvoiceLines",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "AccountingProfileCode",
                table: "PurchaseInvoices",
                type: "varchar(32)",
                unicode: false,
                maxLength: 32,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ProviderInvoiceTypeCode",
                table: "PurchaseInvoices",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ProviderInvoiceUuid",
                table: "PurchaseInvoices",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ProviderScenario",
                table: "PurchaseInvoices",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ProviderSenderAlias",
                table: "PurchaseInvoices",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "TaxBreakdownJson",
                table: "PurchaseInvoices",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "TaxBreakdownJson",
                table: "PurchaseInvoiceLines",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<decimal>(
                name: "ActualGoodQuantity",
                table: "ManufacturingOrders",
                type: "decimal(18,4)",
                precision: 18,
                scale: 4,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "ScrapQuantity",
                table: "ManufacturingOrders",
                type: "decimal(18,4)",
                precision: 18,
                scale: 4,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ScrapReason",
                table: "ManufacturingOrders",
                type: "nvarchar(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "SourceSalesOrderId",
                table: "ManufacturingOrders",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "SourceSalesOrderLineNumber",
                table: "ManufacturingOrders",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "PerformedByEmployeeId",
                table: "ManufacturingOrderOperations",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "AccountType",
                table: "LedgerAccounts",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "CurrencyCode",
                table: "LedgerAccounts",
                type: "varchar(3)",
                unicode: false,
                maxLength: 3,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "IfrsAccountCode",
                table: "LedgerAccounts",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "IfrsAccountName",
                table: "LedgerAccounts",
                type: "nvarchar(160)",
                maxLength: 160,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "IfrsStatementSection",
                table: "LedgerAccounts",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "NormalBalance",
                table: "LedgerAccounts",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "AccountingBasis",
                table: "JournalEntries",
                type: "varchar(12)",
                unicode: false,
                maxLength: 12,
                nullable: false,
                defaultValue: "TDHP");

            migrationBuilder.AlterColumn<Guid>(
                name: "CustomerId",
                table: "CustomerAddresses",
                type: "uniqueidentifier",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier");

            migrationBuilder.AddColumn<string>(
                name: "BankBranchCode",
                table: "CustomerAccounts",
                type: "nvarchar(40)",
                maxLength: 40,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "BankName",
                table: "CustomerAccounts",
                type: "nvarchar(120)",
                maxLength: 120,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ContactEmail",
                table: "CustomerAccounts",
                type: "nvarchar(254)",
                maxLength: 254,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ContactName",
                table: "CustomerAccounts",
                type: "nvarchar(160)",
                maxLength: 160,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ContactPhone",
                table: "CustomerAccounts",
                type: "nvarchar(40)",
                maxLength: 40,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "EInvoiceRecipientAlias",
                table: "CustomerAccounts",
                type: "nvarchar(255)",
                maxLength: 255,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Email",
                table: "CustomerAccounts",
                type: "nvarchar(254)",
                maxLength: 254,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Iban",
                table: "CustomerAccounts",
                type: "varchar(34)",
                unicode: false,
                maxLength: 34,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsEInvoiceRegistered",
                table: "CustomerAccounts",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "PayableAccountCode",
                table: "CustomerAccounts",
                type: "nvarchar(40)",
                maxLength: 40,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Phone",
                table: "CustomerAccounts",
                type: "nvarchar(40)",
                maxLength: 40,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PriceListCode",
                table: "CustomerAccounts",
                type: "nvarchar(40)",
                maxLength: 40,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ReceivableAccountCode",
                table: "CustomerAccounts",
                type: "nvarchar(40)",
                maxLength: 40,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Website",
                table: "CustomerAccounts",
                type: "nvarchar(255)",
                maxLength: 255,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_StockItems_TenantId_ParentStockItemId",
                table: "StockItems",
                columns: new[] { "TenantId", "ParentStockItemId" });

            migrationBuilder.CreateIndex(
                name: "IX_SalesQuotes_TenantId_RevisionGroupId_RevisionNumber",
                table: "SalesQuotes",
                columns: new[] { "TenantId", "RevisionGroupId", "RevisionNumber" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ManufacturingOrders_TenantId_SourceSalesOrderId_SourceSalesOrderLineNumber",
                table: "ManufacturingOrders",
                columns: new[] { "TenantId", "SourceSalesOrderId", "SourceSalesOrderLineNumber" });

            migrationBuilder.AddCheckConstraint(
                name: "CK_ManufacturingOrders_ProductionActuals",
                table: "ManufacturingOrders",
                sql: "([ActualGoodQuantity] IS NULL AND [ScrapQuantity] IS NULL AND [ScrapReason] IS NULL) OR ([ActualGoodQuantity] IS NOT NULL AND [ScrapQuantity] IS NOT NULL AND [ActualGoodQuantity] > 0 AND [ScrapQuantity] >= 0 AND [ActualGoodQuantity] + [ScrapQuantity] = [PlannedQuantity] AND ([ScrapQuantity] = 0 OR NULLIF(LTRIM(RTRIM([ScrapReason])), '') IS NOT NULL))");

            migrationBuilder.CreateIndex(
                name: "IX_ManufacturingOrderOperations_TenantId_PerformedByEmployeeId",
                table: "ManufacturingOrderOperations",
                columns: new[] { "TenantId", "PerformedByEmployeeId" });

            migrationBuilder.AddForeignKey(
                name: "FK_CustomerAddresses_CustomerAccounts_TenantId_CustomerId",
                table: "CustomerAddresses",
                columns: new[] { "TenantId", "CustomerId" },
                principalTable: "CustomerAccounts",
                principalColumns: new[] { "TenantId", "Id" });

            migrationBuilder.AddForeignKey(
                name: "FK_ManufacturingOrderOperations_EmployeeRecords_TenantId_PerformedByEmployeeId",
                table: "ManufacturingOrderOperations",
                columns: new[] { "TenantId", "PerformedByEmployeeId" },
                principalTable: "EmployeeRecords",
                principalColumns: new[] { "TenantId", "Id" },
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_ManufacturingOrders_SalesOrderLines_TenantId_SourceSalesOrderId_SourceSalesOrderLineNumber",
                table: "ManufacturingOrders",
                columns: new[] { "TenantId", "SourceSalesOrderId", "SourceSalesOrderLineNumber" },
                principalTable: "SalesOrderLines",
                principalColumns: new[] { "TenantId", "OrderId", "LineNumber" },
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_StockItems_StockItems_TenantId_ParentStockItemId",
                table: "StockItems",
                columns: new[] { "TenantId", "ParentStockItemId" },
                principalTable: "StockItems",
                principalColumns: new[] { "TenantId", "Id" },
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_CustomerAddresses_CustomerAccounts_TenantId_CustomerId",
                table: "CustomerAddresses");

            migrationBuilder.DropForeignKey(
                name: "FK_ManufacturingOrderOperations_EmployeeRecords_TenantId_PerformedByEmployeeId",
                table: "ManufacturingOrderOperations");

            migrationBuilder.DropForeignKey(
                name: "FK_ManufacturingOrders_SalesOrderLines_TenantId_SourceSalesOrderId_SourceSalesOrderLineNumber",
                table: "ManufacturingOrders");

            migrationBuilder.DropForeignKey(
                name: "FK_StockItems_StockItems_TenantId_ParentStockItemId",
                table: "StockItems");

            migrationBuilder.DropIndex(
                name: "IX_StockItems_TenantId_ParentStockItemId",
                table: "StockItems");

            migrationBuilder.DropIndex(
                name: "IX_SalesQuotes_TenantId_RevisionGroupId_RevisionNumber",
                table: "SalesQuotes");

            migrationBuilder.DropIndex(
                name: "IX_ManufacturingOrders_TenantId_SourceSalesOrderId_SourceSalesOrderLineNumber",
                table: "ManufacturingOrders");

            migrationBuilder.DropCheckConstraint(
                name: "CK_ManufacturingOrders_ProductionActuals",
                table: "ManufacturingOrders");

            migrationBuilder.DropIndex(
                name: "IX_ManufacturingOrderOperations_TenantId_PerformedByEmployeeId",
                table: "ManufacturingOrderOperations");

            migrationBuilder.DropColumn(
                name: "CommunicationTaxPercent",
                table: "StockItems");

            migrationBuilder.DropColumn(
                name: "CostAccountCode",
                table: "StockItems");

            migrationBuilder.DropColumn(
                name: "ExciseTaxPercent",
                table: "StockItems");

            migrationBuilder.DropColumn(
                name: "GrossWeight",
                table: "StockItems");

            migrationBuilder.DropColumn(
                name: "Height",
                table: "StockItems");

            migrationBuilder.DropColumn(
                name: "IsVariantParent",
                table: "StockItems");

            migrationBuilder.DropColumn(
                name: "Length",
                table: "StockItems");

            migrationBuilder.DropColumn(
                name: "MarketplaceProductId",
                table: "StockItems");

            migrationBuilder.DropColumn(
                name: "MaximumStock",
                table: "StockItems");

            migrationBuilder.DropColumn(
                name: "NetWeight",
                table: "StockItems");

            migrationBuilder.DropColumn(
                name: "ParentStockItemId",
                table: "StockItems");

            migrationBuilder.DropColumn(
                name: "PriceCurrencyCode",
                table: "StockItems");

            migrationBuilder.DropColumn(
                name: "ProductImageUrl",
                table: "StockItems");

            migrationBuilder.DropColumn(
                name: "PurchaseAccountCode",
                table: "StockItems");

            migrationBuilder.DropColumn(
                name: "PurchaseDiscountPercent",
                table: "StockItems");

            migrationBuilder.DropColumn(
                name: "PurchaseListPrice",
                table: "StockItems");

            migrationBuilder.DropColumn(
                name: "PurchaseVatPercent",
                table: "StockItems");

            migrationBuilder.DropColumn(
                name: "ReorderPoint",
                table: "StockItems");

            migrationBuilder.DropColumn(
                name: "SafetyStock",
                table: "StockItems");

            migrationBuilder.DropColumn(
                name: "SalesAccountCode",
                table: "StockItems");

            migrationBuilder.DropColumn(
                name: "SalesDiscountPercent",
                table: "StockItems");

            migrationBuilder.DropColumn(
                name: "SalesListPrice",
                table: "StockItems");

            migrationBuilder.DropColumn(
                name: "SalesVatPercent",
                table: "StockItems");

            migrationBuilder.DropColumn(
                name: "StampTaxPercent",
                table: "StockItems");

            migrationBuilder.DropColumn(
                name: "VariantAttributesJson",
                table: "StockItems");

            migrationBuilder.DropColumn(
                name: "Width",
                table: "StockItems");

            migrationBuilder.DropColumn(
                name: "WithholdingTaxPercent",
                table: "StockItems");

            migrationBuilder.DropColumn(
                name: "ProspectCustomerName",
                table: "SalesQuotes");

            migrationBuilder.DropColumn(
                name: "RevisionGroupId",
                table: "SalesQuotes");

            migrationBuilder.DropColumn(
                name: "RevisionNumber",
                table: "SalesQuotes");

            migrationBuilder.DropColumn(
                name: "AccountingProfileCode",
                table: "SalesInvoices");

            migrationBuilder.DropColumn(
                name: "DeliveryCarrierName",
                table: "SalesInvoices");

            migrationBuilder.DropColumn(
                name: "DeliveryCarrierSurname",
                table: "SalesInvoices");

            migrationBuilder.DropColumn(
                name: "DeliveryCarrierTaxId",
                table: "SalesInvoices");

            migrationBuilder.DropColumn(
                name: "DeliverySentAt",
                table: "SalesInvoices");

            migrationBuilder.DropColumn(
                name: "ECommerceIntermediaryCity",
                table: "SalesInvoices");

            migrationBuilder.DropColumn(
                name: "ECommerceIntermediaryCountry",
                table: "SalesInvoices");

            migrationBuilder.DropColumn(
                name: "ECommerceIntermediaryCountryCode",
                table: "SalesInvoices");

            migrationBuilder.DropColumn(
                name: "ECommerceIntermediaryDistrict",
                table: "SalesInvoices");

            migrationBuilder.DropColumn(
                name: "ECommercePaymentAgentName",
                table: "SalesInvoices");

            migrationBuilder.DropColumn(
                name: "ECommercePaymentAlias",
                table: "SalesInvoices");

            migrationBuilder.DropColumn(
                name: "ECommercePaymentDate",
                table: "SalesInvoices");

            migrationBuilder.DropColumn(
                name: "ECommercePaymentDueDate",
                table: "SalesInvoices");

            migrationBuilder.DropColumn(
                name: "ECommercePaymentInstructionNote",
                table: "SalesInvoices");

            migrationBuilder.DropColumn(
                name: "ECommercePaymentMeans",
                table: "SalesInvoices");

            migrationBuilder.DropColumn(
                name: "ECommercePaymentTaxId",
                table: "SalesInvoices");

            migrationBuilder.DropColumn(
                name: "ECommercePaymentTitle",
                table: "SalesInvoices");

            migrationBuilder.DropColumn(
                name: "ECommercePaymentType",
                table: "SalesInvoices");

            migrationBuilder.DropColumn(
                name: "ECommercePurchaseUrl",
                table: "SalesInvoices");

            migrationBuilder.DropColumn(
                name: "EDocumentRecipientAlias",
                table: "SalesInvoices");

            migrationBuilder.DropColumn(
                name: "EDocumentScenario",
                table: "SalesInvoices");

            migrationBuilder.DropColumn(
                name: "EDocumentTypeCode",
                table: "SalesInvoices");

            migrationBuilder.DropColumn(
                name: "TaxBreakdownJson",
                table: "SalesInvoices");

            migrationBuilder.DropColumn(
                name: "TaxBreakdownJson",
                table: "SalesInvoiceLines");

            migrationBuilder.DropColumn(
                name: "AccountingProfileCode",
                table: "PurchaseInvoices");

            migrationBuilder.DropColumn(
                name: "ProviderInvoiceTypeCode",
                table: "PurchaseInvoices");

            migrationBuilder.DropColumn(
                name: "ProviderInvoiceUuid",
                table: "PurchaseInvoices");

            migrationBuilder.DropColumn(
                name: "ProviderScenario",
                table: "PurchaseInvoices");

            migrationBuilder.DropColumn(
                name: "ProviderSenderAlias",
                table: "PurchaseInvoices");

            migrationBuilder.DropColumn(
                name: "TaxBreakdownJson",
                table: "PurchaseInvoices");

            migrationBuilder.DropColumn(
                name: "TaxBreakdownJson",
                table: "PurchaseInvoiceLines");

            migrationBuilder.DropColumn(
                name: "ActualGoodQuantity",
                table: "ManufacturingOrders");

            migrationBuilder.DropColumn(
                name: "ScrapQuantity",
                table: "ManufacturingOrders");

            migrationBuilder.DropColumn(
                name: "ScrapReason",
                table: "ManufacturingOrders");

            migrationBuilder.DropColumn(
                name: "SourceSalesOrderId",
                table: "ManufacturingOrders");

            migrationBuilder.DropColumn(
                name: "SourceSalesOrderLineNumber",
                table: "ManufacturingOrders");

            migrationBuilder.DropColumn(
                name: "PerformedByEmployeeId",
                table: "ManufacturingOrderOperations");

            migrationBuilder.DropColumn(
                name: "AccountType",
                table: "LedgerAccounts");

            migrationBuilder.DropColumn(
                name: "CurrencyCode",
                table: "LedgerAccounts");

            migrationBuilder.DropColumn(
                name: "IfrsAccountCode",
                table: "LedgerAccounts");

            migrationBuilder.DropColumn(
                name: "IfrsAccountName",
                table: "LedgerAccounts");

            migrationBuilder.DropColumn(
                name: "IfrsStatementSection",
                table: "LedgerAccounts");

            migrationBuilder.DropColumn(
                name: "NormalBalance",
                table: "LedgerAccounts");

            migrationBuilder.DropColumn(
                name: "AccountingBasis",
                table: "JournalEntries");

            migrationBuilder.DropColumn(
                name: "BankBranchCode",
                table: "CustomerAccounts");

            migrationBuilder.DropColumn(
                name: "BankName",
                table: "CustomerAccounts");

            migrationBuilder.DropColumn(
                name: "ContactEmail",
                table: "CustomerAccounts");

            migrationBuilder.DropColumn(
                name: "ContactName",
                table: "CustomerAccounts");

            migrationBuilder.DropColumn(
                name: "ContactPhone",
                table: "CustomerAccounts");

            migrationBuilder.DropColumn(
                name: "EInvoiceRecipientAlias",
                table: "CustomerAccounts");

            migrationBuilder.DropColumn(
                name: "Email",
                table: "CustomerAccounts");

            migrationBuilder.DropColumn(
                name: "Iban",
                table: "CustomerAccounts");

            migrationBuilder.DropColumn(
                name: "IsEInvoiceRegistered",
                table: "CustomerAccounts");

            migrationBuilder.DropColumn(
                name: "PayableAccountCode",
                table: "CustomerAccounts");

            migrationBuilder.DropColumn(
                name: "Phone",
                table: "CustomerAccounts");

            migrationBuilder.DropColumn(
                name: "PriceListCode",
                table: "CustomerAccounts");

            migrationBuilder.DropColumn(
                name: "ReceivableAccountCode",
                table: "CustomerAccounts");

            migrationBuilder.DropColumn(
                name: "Website",
                table: "CustomerAccounts");

            migrationBuilder.AlterColumn<Guid>(
                name: "CustomerId",
                table: "SalesQuotes",
                type: "uniqueidentifier",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier",
                oldNullable: true);

            migrationBuilder.AlterColumn<Guid>(
                name: "CustomerId",
                table: "CustomerAddresses",
                type: "uniqueidentifier",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier",
                oldNullable: true);

            migrationBuilder.AddForeignKey(
                name: "FK_CustomerAddresses_CustomerAccounts_TenantId_CustomerId",
                table: "CustomerAddresses",
                columns: new[] { "TenantId", "CustomerId" },
                principalTable: "CustomerAccounts",
                principalColumns: new[] { "TenantId", "Id" },
                onDelete: ReferentialAction.Cascade);
        }
    }
}
