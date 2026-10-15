using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace AIERP.Platform.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddTenantPermissionPolicies : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "PermissionDefinitions",
                columns: table => new
                {
                    Code = table.Column<string>(type: "varchar(120)", unicode: false, maxLength: 120, nullable: false),
                    ResourceType = table.Column<string>(type: "varchar(80)", unicode: false, maxLength: 80, nullable: false),
                    Action = table.Column<string>(type: "varchar(32)", unicode: false, maxLength: 32, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(240)", maxLength: 240, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PermissionDefinitions", x => x.Code);
                });

            migrationBuilder.CreateTable(
                name: "TenantPermissionRules",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SubjectType = table.Column<int>(type: "int", nullable: false),
                    SubjectRole = table.Column<string>(type: "varchar(64)", unicode: false, maxLength: 64, nullable: true),
                    SubjectUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    PermissionCode = table.Column<string>(type: "varchar(120)", unicode: false, maxLength: 120, nullable: false),
                    Effect = table.Column<int>(type: "int", nullable: false),
                    ResourceType = table.Column<string>(type: "varchar(80)", unicode: false, maxLength: 80, nullable: true),
                    AttributeName = table.Column<string>(type: "varchar(120)", unicode: false, maxLength: 120, nullable: true),
                    AttributeOperator = table.Column<int>(type: "int", nullable: true),
                    AttributeValue = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TenantPermissionRules", x => x.Id);
                    table.UniqueConstraint("AK_TenantPermissionRules_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_TenantPermissionRules_Attribute", "([AttributeName] IS NULL AND [AttributeOperator] IS NULL AND [AttributeValue] IS NULL) OR ([AttributeName] IS NOT NULL AND [AttributeOperator] IS NOT NULL AND [AttributeValue] IS NOT NULL)");
                    table.CheckConstraint("CK_TenantPermissionRules_Subject", "([SubjectType] = 1 AND [SubjectRole] IS NOT NULL AND [SubjectUserId] IS NULL) OR ([SubjectType] = 2 AND [SubjectRole] IS NULL AND [SubjectUserId] IS NOT NULL)");
                    table.ForeignKey(
                        name: "FK_TenantPermissionRules_PermissionDefinitions_PermissionCode",
                        column: x => x.PermissionCode,
                        principalTable: "PermissionDefinitions",
                        principalColumn: "Code",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_TenantPermissionRules_TenantMemberships_TenantId_CreatedByUserId",
                        columns: x => new { x.TenantId, x.CreatedByUserId },
                        principalTable: "TenantMemberships",
                        principalColumns: new[] { "TenantId", "UserId" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_TenantPermissionRules_TenantMemberships_TenantId_SubjectUserId",
                        columns: x => new { x.TenantId, x.SubjectUserId },
                        principalTable: "TenantMemberships",
                        principalColumns: new[] { "TenantId", "UserId" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_TenantPermissionRules_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.InsertData(
                table: "PermissionDefinitions",
                columns: new[] { "Code", "Action", "Description", "ResourceType" },
                values: new object[,]
                {
                    { "erp.access-control.create", "create", "create · Tenant permissions and policies", "erp.access-control" },
                    { "erp.access-control.delete", "delete", "delete · Tenant permissions and policies", "erp.access-control" },
                    { "erp.access-control.execute", "execute", "execute · Tenant permissions and policies", "erp.access-control" },
                    { "erp.access-control.read", "read", "read · Tenant permissions and policies", "erp.access-control" },
                    { "erp.access-control.update", "update", "update · Tenant permissions and policies", "erp.access-control" },
                    { "erp.audit-events.create", "create", "create · Tenant audit history", "erp.audit-events" },
                    { "erp.audit-events.delete", "delete", "delete · Tenant audit history", "erp.audit-events" },
                    { "erp.audit-events.execute", "execute", "execute · Tenant audit history", "erp.audit-events" },
                    { "erp.audit-events.read", "read", "read · Tenant audit history", "erp.audit-events" },
                    { "erp.audit-events.update", "update", "update · Tenant audit history", "erp.audit-events" },
                    { "erp.bank-statements.create", "create", "create · Bank statements and reconciliation", "erp.bank-statements" },
                    { "erp.bank-statements.delete", "delete", "delete · Bank statements and reconciliation", "erp.bank-statements" },
                    { "erp.bank-statements.execute", "execute", "execute · Bank statements and reconciliation", "erp.bank-statements" },
                    { "erp.bank-statements.read", "read", "read · Bank statements and reconciliation", "erp.bank-statements" },
                    { "erp.bank-statements.update", "update", "update · Bank statements and reconciliation", "erp.bank-statements" },
                    { "erp.customer-collections.create", "create", "create · Customer collections", "erp.customer-collections" },
                    { "erp.customer-collections.delete", "delete", "delete · Customer collections", "erp.customer-collections" },
                    { "erp.customer-collections.execute", "execute", "execute · Customer collections", "erp.customer-collections" },
                    { "erp.customer-collections.read", "read", "read · Customer collections", "erp.customer-collections" },
                    { "erp.customer-collections.update", "update", "update · Customer collections", "erp.customer-collections" },
                    { "erp.customer-groups.create", "create", "create · Customer groups", "erp.customer-groups" },
                    { "erp.customer-groups.delete", "delete", "delete · Customer groups", "erp.customer-groups" },
                    { "erp.customer-groups.execute", "execute", "execute · Customer groups", "erp.customer-groups" },
                    { "erp.customer-groups.read", "read", "read · Customer groups", "erp.customer-groups" },
                    { "erp.customer-groups.update", "update", "update · Customer groups", "erp.customer-groups" },
                    { "erp.customers.create", "create", "create · Customer and supplier accounts", "erp.customers" },
                    { "erp.customers.delete", "delete", "delete · Customer and supplier accounts", "erp.customers" },
                    { "erp.customers.execute", "execute", "execute · Customer and supplier accounts", "erp.customers" },
                    { "erp.customers.read", "read", "read · Customer and supplier accounts", "erp.customers" },
                    { "erp.customers.update", "update", "update · Customer and supplier accounts", "erp.customers" },
                    { "erp.dashboard.create", "create", "create · ERP dashboard", "erp.dashboard" },
                    { "erp.dashboard.delete", "delete", "delete · ERP dashboard", "erp.dashboard" },
                    { "erp.dashboard.execute", "execute", "execute · ERP dashboard", "erp.dashboard" },
                    { "erp.dashboard.read", "read", "read · ERP dashboard", "erp.dashboard" },
                    { "erp.dashboard.update", "update", "update · ERP dashboard", "erp.dashboard" },
                    { "erp.exchange-rates.create", "create", "create · Tenant exchange rates", "erp.exchange-rates" },
                    { "erp.exchange-rates.delete", "delete", "delete · Tenant exchange rates", "erp.exchange-rates" },
                    { "erp.exchange-rates.execute", "execute", "execute · Tenant exchange rates", "erp.exchange-rates" },
                    { "erp.exchange-rates.read", "read", "read · Tenant exchange rates", "erp.exchange-rates" },
                    { "erp.exchange-rates.update", "update", "update · Tenant exchange rates", "erp.exchange-rates" },
                    { "erp.finance-accounts.create", "create", "create · Cash and bank accounts", "erp.finance-accounts" },
                    { "erp.finance-accounts.delete", "delete", "delete · Cash and bank accounts", "erp.finance-accounts" },
                    { "erp.finance-accounts.execute", "execute", "execute · Cash and bank accounts", "erp.finance-accounts" },
                    { "erp.finance-accounts.read", "read", "read · Cash and bank accounts", "erp.finance-accounts" },
                    { "erp.finance-accounts.update", "update", "update · Cash and bank accounts", "erp.finance-accounts" },
                    { "erp.finance-currency.create", "create", "create · Tenant base currency", "erp.finance-currency" },
                    { "erp.finance-currency.delete", "delete", "delete · Tenant base currency", "erp.finance-currency" },
                    { "erp.finance-currency.execute", "execute", "execute · Tenant base currency", "erp.finance-currency" },
                    { "erp.finance-currency.read", "read", "read · Tenant base currency", "erp.finance-currency" },
                    { "erp.finance-currency.update", "update", "update · Tenant base currency", "erp.finance-currency" },
                    { "erp.financial-transfers.create", "create", "create · Financial account transfers", "erp.financial-transfers" },
                    { "erp.financial-transfers.delete", "delete", "delete · Financial account transfers", "erp.financial-transfers" },
                    { "erp.financial-transfers.execute", "execute", "execute · Financial account transfers", "erp.financial-transfers" },
                    { "erp.financial-transfers.read", "read", "read · Financial account transfers", "erp.financial-transfers" },
                    { "erp.financial-transfers.update", "update", "update · Financial account transfers", "erp.financial-transfers" },
                    { "erp.fx-exposure.create", "create", "create · Foreign currency exposure", "erp.fx-exposure" },
                    { "erp.fx-exposure.delete", "delete", "delete · Foreign currency exposure", "erp.fx-exposure" },
                    { "erp.fx-exposure.execute", "execute", "execute · Foreign currency exposure", "erp.fx-exposure" },
                    { "erp.fx-exposure.read", "read", "read · Foreign currency exposure", "erp.fx-exposure" },
                    { "erp.fx-exposure.update", "update", "update · Foreign currency exposure", "erp.fx-exposure" },
                    { "erp.fx-revaluations.create", "create", "create · Period-end FX revaluation vouchers", "erp.fx-revaluations" },
                    { "erp.fx-revaluations.delete", "delete", "delete · Period-end FX revaluation vouchers", "erp.fx-revaluations" },
                    { "erp.fx-revaluations.execute", "execute", "execute · Period-end FX revaluation vouchers", "erp.fx-revaluations" },
                    { "erp.fx-revaluations.read", "read", "read · Period-end FX revaluation vouchers", "erp.fx-revaluations" },
                    { "erp.fx-revaluations.update", "update", "update · Period-end FX revaluation vouchers", "erp.fx-revaluations" },
                    { "erp.inventory-cost-adjustments.create", "create", "create · Inventory landed costs and revaluation", "erp.inventory-cost-adjustments" },
                    { "erp.inventory-cost-adjustments.delete", "delete", "delete · Inventory landed costs and revaluation", "erp.inventory-cost-adjustments" },
                    { "erp.inventory-cost-adjustments.execute", "execute", "execute · Inventory landed costs and revaluation", "erp.inventory-cost-adjustments" },
                    { "erp.inventory-cost-adjustments.read", "read", "read · Inventory landed costs and revaluation", "erp.inventory-cost-adjustments" },
                    { "erp.inventory-cost-adjustments.update", "update", "update · Inventory landed costs and revaluation", "erp.inventory-cost-adjustments" },
                    { "erp.inventory-transfers.create", "create", "create · Warehouse transfers", "erp.inventory-transfers" },
                    { "erp.inventory-transfers.delete", "delete", "delete · Warehouse transfers", "erp.inventory-transfers" },
                    { "erp.inventory-transfers.execute", "execute", "execute · Warehouse transfers", "erp.inventory-transfers" },
                    { "erp.inventory-transfers.read", "read", "read · Warehouse transfers", "erp.inventory-transfers" },
                    { "erp.inventory-transfers.update", "update", "update · Warehouse transfers", "erp.inventory-transfers" },
                    { "erp.maturities.create", "create", "create · Receivable and payable maturities", "erp.maturities" },
                    { "erp.maturities.delete", "delete", "delete · Receivable and payable maturities", "erp.maturities" },
                    { "erp.maturities.execute", "execute", "execute · Receivable and payable maturities", "erp.maturities" },
                    { "erp.maturities.read", "read", "read · Receivable and payable maturities", "erp.maturities" },
                    { "erp.maturities.update", "update", "update · Receivable and payable maturities", "erp.maturities" },
                    { "erp.purchase-invoices.create", "create", "create · Purchase invoices", "erp.purchase-invoices" },
                    { "erp.purchase-invoices.delete", "delete", "delete · Purchase invoices", "erp.purchase-invoices" },
                    { "erp.purchase-invoices.execute", "execute", "execute · Purchase invoices", "erp.purchase-invoices" },
                    { "erp.purchase-invoices.read", "read", "read · Purchase invoices", "erp.purchase-invoices" },
                    { "erp.purchase-invoices.update", "update", "update · Purchase invoices", "erp.purchase-invoices" },
                    { "erp.purchase-orders.create", "create", "create · Purchase orders", "erp.purchase-orders" },
                    { "erp.purchase-orders.delete", "delete", "delete · Purchase orders", "erp.purchase-orders" },
                    { "erp.purchase-orders.execute", "execute", "execute · Purchase orders", "erp.purchase-orders" },
                    { "erp.purchase-orders.read", "read", "read · Purchase orders", "erp.purchase-orders" },
                    { "erp.purchase-orders.update", "update", "update · Purchase orders", "erp.purchase-orders" },
                    { "erp.purchase-receipts.create", "create", "create · Purchase receipts and landed costs", "erp.purchase-receipts" },
                    { "erp.purchase-receipts.delete", "delete", "delete · Purchase receipts and landed costs", "erp.purchase-receipts" },
                    { "erp.purchase-receipts.execute", "execute", "execute · Purchase receipts and landed costs", "erp.purchase-receipts" },
                    { "erp.purchase-receipts.read", "read", "read · Purchase receipts and landed costs", "erp.purchase-receipts" },
                    { "erp.purchase-receipts.update", "update", "update · Purchase receipts and landed costs", "erp.purchase-receipts" },
                    { "erp.purchase-requests.create", "create", "create · Purchase requests", "erp.purchase-requests" },
                    { "erp.purchase-requests.delete", "delete", "delete · Purchase requests", "erp.purchase-requests" },
                    { "erp.purchase-requests.execute", "execute", "execute · Purchase requests", "erp.purchase-requests" },
                    { "erp.purchase-requests.read", "read", "read · Purchase requests", "erp.purchase-requests" },
                    { "erp.purchase-requests.update", "update", "update · Purchase requests", "erp.purchase-requests" },
                    { "erp.sales-deliveries.create", "create", "create · Sales deliveries", "erp.sales-deliveries" },
                    { "erp.sales-deliveries.delete", "delete", "delete · Sales deliveries", "erp.sales-deliveries" },
                    { "erp.sales-deliveries.execute", "execute", "execute · Sales deliveries", "erp.sales-deliveries" },
                    { "erp.sales-deliveries.read", "read", "read · Sales deliveries", "erp.sales-deliveries" },
                    { "erp.sales-deliveries.update", "update", "update · Sales deliveries", "erp.sales-deliveries" },
                    { "erp.sales-invoices.create", "create", "create · Sales invoices", "erp.sales-invoices" },
                    { "erp.sales-invoices.delete", "delete", "delete · Sales invoices", "erp.sales-invoices" },
                    { "erp.sales-invoices.execute", "execute", "execute · Sales invoices", "erp.sales-invoices" },
                    { "erp.sales-invoices.read", "read", "read · Sales invoices", "erp.sales-invoices" },
                    { "erp.sales-invoices.update", "update", "update · Sales invoices", "erp.sales-invoices" },
                    { "erp.sales-orders.create", "create", "create · Sales orders and reservations", "erp.sales-orders" },
                    { "erp.sales-orders.delete", "delete", "delete · Sales orders and reservations", "erp.sales-orders" },
                    { "erp.sales-orders.execute", "execute", "execute · Sales orders and reservations", "erp.sales-orders" },
                    { "erp.sales-orders.read", "read", "read · Sales orders and reservations", "erp.sales-orders" },
                    { "erp.sales-orders.update", "update", "update · Sales orders and reservations", "erp.sales-orders" },
                    { "erp.sales-quotes.create", "create", "create · Sales quotes", "erp.sales-quotes" },
                    { "erp.sales-quotes.delete", "delete", "delete · Sales quotes", "erp.sales-quotes" },
                    { "erp.sales-quotes.execute", "execute", "execute · Sales quotes", "erp.sales-quotes" },
                    { "erp.sales-quotes.read", "read", "read · Sales quotes", "erp.sales-quotes" },
                    { "erp.sales-quotes.update", "update", "update · Sales quotes", "erp.sales-quotes" },
                    { "erp.sales-returns.create", "create", "create · Sales returns", "erp.sales-returns" },
                    { "erp.sales-returns.delete", "delete", "delete · Sales returns", "erp.sales-returns" },
                    { "erp.sales-returns.execute", "execute", "execute · Sales returns", "erp.sales-returns" },
                    { "erp.sales-returns.read", "read", "read · Sales returns", "erp.sales-returns" },
                    { "erp.sales-returns.update", "update", "update · Sales returns", "erp.sales-returns" },
                    { "erp.stock-items.create", "create", "create · Stock cards and units", "erp.stock-items" },
                    { "erp.stock-items.delete", "delete", "delete · Stock cards and units", "erp.stock-items" },
                    { "erp.stock-items.execute", "execute", "execute · Stock cards and units", "erp.stock-items" },
                    { "erp.stock-items.read", "read", "read · Stock cards and units", "erp.stock-items" },
                    { "erp.stock-items.update", "update", "update · Stock cards and units", "erp.stock-items" },
                    { "erp.supplier-payments.create", "create", "create · Supplier payments", "erp.supplier-payments" },
                    { "erp.supplier-payments.delete", "delete", "delete · Supplier payments", "erp.supplier-payments" },
                    { "erp.supplier-payments.execute", "execute", "execute · Supplier payments", "erp.supplier-payments" },
                    { "erp.supplier-payments.read", "read", "read · Supplier payments", "erp.supplier-payments" },
                    { "erp.supplier-payments.update", "update", "update · Supplier payments", "erp.supplier-payments" },
                    { "erp.supplier-quotes.create", "create", "create · Supplier quotes", "erp.supplier-quotes" },
                    { "erp.supplier-quotes.delete", "delete", "delete · Supplier quotes", "erp.supplier-quotes" },
                    { "erp.supplier-quotes.execute", "execute", "execute · Supplier quotes", "erp.supplier-quotes" },
                    { "erp.supplier-quotes.read", "read", "read · Supplier quotes", "erp.supplier-quotes" },
                    { "erp.supplier-quotes.update", "update", "update · Supplier quotes", "erp.supplier-quotes" },
                    { "erp.supplier-returns.create", "create", "create · Supplier returns", "erp.supplier-returns" },
                    { "erp.supplier-returns.delete", "delete", "delete · Supplier returns", "erp.supplier-returns" },
                    { "erp.supplier-returns.execute", "execute", "execute · Supplier returns", "erp.supplier-returns" },
                    { "erp.supplier-returns.read", "read", "read · Supplier returns", "erp.supplier-returns" },
                    { "erp.supplier-returns.update", "update", "update · Supplier returns", "erp.supplier-returns" },
                    { "erp.warehouses.create", "create", "create · Warehouses and stock balances", "erp.warehouses" },
                    { "erp.warehouses.delete", "delete", "delete · Warehouses and stock balances", "erp.warehouses" },
                    { "erp.warehouses.execute", "execute", "execute · Warehouses and stock balances", "erp.warehouses" },
                    { "erp.warehouses.read", "read", "read · Warehouses and stock balances", "erp.warehouses" },
                    { "erp.warehouses.update", "update", "update · Warehouses and stock balances", "erp.warehouses" },
                    { "studio.ai-analysis.create", "create", "create · AI source and test analysis", "studio.ai-analysis" },
                    { "studio.ai-analysis.delete", "delete", "delete · AI source and test analysis", "studio.ai-analysis" },
                    { "studio.ai-analysis.execute", "execute", "execute · AI source and test analysis", "studio.ai-analysis" },
                    { "studio.ai-analysis.read", "read", "read · AI source and test analysis", "studio.ai-analysis" },
                    { "studio.ai-analysis.update", "update", "update · AI source and test analysis", "studio.ai-analysis" },
                    { "studio.ai-plans.create", "create", "create · AI test and architecture plans", "studio.ai-plans" },
                    { "studio.ai-plans.delete", "delete", "delete · AI test and architecture plans", "studio.ai-plans" },
                    { "studio.ai-plans.execute", "execute", "execute · AI test and architecture plans", "studio.ai-plans" },
                    { "studio.ai-plans.read", "read", "read · AI test and architecture plans", "studio.ai-plans" },
                    { "studio.ai-plans.update", "update", "update · AI test and architecture plans", "studio.ai-plans" },
                    { "studio.capabilities.create", "create", "create · Studio capabilities", "studio.capabilities" },
                    { "studio.capabilities.delete", "delete", "delete · Studio capabilities", "studio.capabilities" },
                    { "studio.capabilities.execute", "execute", "execute · Studio capabilities", "studio.capabilities" },
                    { "studio.capabilities.read", "read", "read · Studio capabilities", "studio.capabilities" },
                    { "studio.capabilities.update", "update", "update · Studio capabilities", "studio.capabilities" },
                    { "studio.code-suggestions.create", "create", "create · AI code suggestions and changes", "studio.code-suggestions" },
                    { "studio.code-suggestions.delete", "delete", "delete · AI code suggestions and changes", "studio.code-suggestions" },
                    { "studio.code-suggestions.execute", "execute", "execute · AI code suggestions and changes", "studio.code-suggestions" },
                    { "studio.code-suggestions.read", "read", "read · AI code suggestions and changes", "studio.code-suggestions" },
                    { "studio.code-suggestions.update", "update", "update · AI code suggestions and changes", "studio.code-suggestions" },
                    { "studio.conversations.create", "create", "create · Studio conversations", "studio.conversations" },
                    { "studio.conversations.delete", "delete", "delete · Studio conversations", "studio.conversations" },
                    { "studio.conversations.execute", "execute", "execute · Studio conversations", "studio.conversations" },
                    { "studio.conversations.read", "read", "read · Studio conversations", "studio.conversations" },
                    { "studio.conversations.update", "update", "update · Studio conversations", "studio.conversations" },
                    { "studio.deployments.create", "create", "create · Staging and production deployments", "studio.deployments" },
                    { "studio.deployments.delete", "delete", "delete · Staging and production deployments", "studio.deployments" },
                    { "studio.deployments.execute", "execute", "execute · Staging and production deployments", "studio.deployments" },
                    { "studio.deployments.read", "read", "read · Staging and production deployments", "studio.deployments" },
                    { "studio.deployments.update", "update", "update · Staging and production deployments", "studio.deployments" },
                    { "studio.production-approvals.create", "create", "create · Production promotion approvals", "studio.production-approvals" },
                    { "studio.production-approvals.delete", "delete", "delete · Production promotion approvals", "studio.production-approvals" },
                    { "studio.production-approvals.execute", "execute", "execute · Production promotion approvals", "studio.production-approvals" },
                    { "studio.production-approvals.read", "read", "read · Production promotion approvals", "studio.production-approvals" },
                    { "studio.production-approvals.update", "update", "update · Production promotion approvals", "studio.production-approvals" },
                    { "studio.projects.create", "create", "create · Development projects and members", "studio.projects" },
                    { "studio.projects.delete", "delete", "delete · Development projects and members", "studio.projects" },
                    { "studio.projects.execute", "execute", "execute · Development projects and members", "studio.projects" },
                    { "studio.projects.read", "read", "read · Development projects and members", "studio.projects" },
                    { "studio.projects.update", "update", "update · Development projects and members", "studio.projects" },
                    { "studio.release-candidates.create", "create", "create · Release candidates and versions", "studio.release-candidates" },
                    { "studio.release-candidates.delete", "delete", "delete · Release candidates and versions", "studio.release-candidates" },
                    { "studio.release-candidates.execute", "execute", "execute · Release candidates and versions", "studio.release-candidates" },
                    { "studio.release-candidates.read", "read", "read · Release candidates and versions", "studio.release-candidates" },
                    { "studio.release-candidates.update", "update", "update · Release candidates and versions", "studio.release-candidates" },
                    { "studio.release-packages.create", "create", "create · Release packages", "studio.release-packages" },
                    { "studio.release-packages.delete", "delete", "delete · Release packages", "studio.release-packages" },
                    { "studio.release-packages.execute", "execute", "execute · Release packages", "studio.release-packages" },
                    { "studio.release-packages.read", "read", "read · Release packages", "studio.release-packages" },
                    { "studio.release-packages.update", "update", "update · Release packages", "studio.release-packages" },
                    { "studio.requests.create", "create", "create · Development requests", "studio.requests" },
                    { "studio.requests.delete", "delete", "delete · Development requests", "studio.requests" },
                    { "studio.requests.execute", "execute", "execute · Development requests", "studio.requests" },
                    { "studio.requests.read", "read", "read · Development requests", "studio.requests" },
                    { "studio.requests.update", "update", "update · Development requests", "studio.requests" },
                    { "studio.workspace-files.create", "create", "create · Project workspace files and source", "studio.workspace-files" },
                    { "studio.workspace-files.delete", "delete", "delete · Project workspace files and source", "studio.workspace-files" },
                    { "studio.workspace-files.execute", "execute", "execute · Project workspace files and source", "studio.workspace-files" },
                    { "studio.workspace-files.read", "read", "read · Project workspace files and source", "studio.workspace-files" },
                    { "studio.workspace-files.update", "update", "update · Project workspace files and source", "studio.workspace-files" },
                    { "studio.workspace-requests.create", "create", "create · Project workspace requests", "studio.workspace-requests" },
                    { "studio.workspace-requests.delete", "delete", "delete · Project workspace requests", "studio.workspace-requests" },
                    { "studio.workspace-requests.execute", "execute", "execute · Project workspace requests", "studio.workspace-requests" },
                    { "studio.workspace-requests.read", "read", "read · Project workspace requests", "studio.workspace-requests" },
                    { "studio.workspace-requests.update", "update", "update · Project workspace requests", "studio.workspace-requests" },
                    { "studio.workspace-tests.create", "create", "create · Workspace tests and builds", "studio.workspace-tests" },
                    { "studio.workspace-tests.delete", "delete", "delete · Workspace tests and builds", "studio.workspace-tests" },
                    { "studio.workspace-tests.execute", "execute", "execute · Workspace tests and builds", "studio.workspace-tests" },
                    { "studio.workspace-tests.read", "read", "read · Workspace tests and builds", "studio.workspace-tests" },
                    { "studio.workspace-tests.update", "update", "update · Workspace tests and builds", "studio.workspace-tests" },
                    { "system.session.create", "create", "create · User session information", "system.session" },
                    { "system.session.delete", "delete", "delete · User session information", "system.session" },
                    { "system.session.execute", "execute", "execute · User session information", "system.session" },
                    { "system.session.read", "read", "read · User session information", "system.session" },
                    { "system.session.update", "update", "update · User session information", "system.session" }
                });

            migrationBuilder.Sql("""
                INSERT INTO [dbo].[TenantPermissionRules]
                    ([Id], [TenantId], [SubjectType], [SubjectRole], [SubjectUserId], [PermissionCode], [Effect],
                     [ResourceType], [AttributeName], [AttributeOperator], [AttributeValue], [IsActive], [CreatedByUserId], [CreatedAt])
                SELECT NEWID(), tenant.[Id], 1, 'TenantUser', NULL, permission.[Code], 1,
                       NULL, NULL, NULL, NULL, 1, NULL, SYSUTCDATETIME()
                FROM [dbo].[Tenants] AS tenant
                CROSS JOIN [dbo].[PermissionDefinitions] AS permission
                WHERE permission.[ResourceType] NOT IN ('erp.access-control', 'erp.audit-events');
                """);

            migrationBuilder.CreateIndex(
                name: "IX_TenantPermissionRules_PermissionCode",
                table: "TenantPermissionRules",
                column: "PermissionCode");

            migrationBuilder.CreateIndex(
                name: "IX_TenantPermissionRules_TenantId_CreatedByUserId",
                table: "TenantPermissionRules",
                columns: new[] { "TenantId", "CreatedByUserId" });

            migrationBuilder.CreateIndex(
                name: "IX_TenantPermissionRules_TenantId_PermissionCode_IsActive",
                table: "TenantPermissionRules",
                columns: new[] { "TenantId", "PermissionCode", "IsActive" });

            migrationBuilder.CreateIndex(
                name: "IX_TenantPermissionRules_TenantId_SubjectRole_PermissionCode_IsActive",
                table: "TenantPermissionRules",
                columns: new[] { "TenantId", "SubjectRole", "PermissionCode", "IsActive" });

            migrationBuilder.CreateIndex(
                name: "IX_TenantPermissionRules_TenantId_SubjectUserId_PermissionCode_IsActive",
                table: "TenantPermissionRules",
                columns: new[] { "TenantId", "SubjectUserId", "PermissionCode", "IsActive" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "TenantPermissionRules");

            migrationBuilder.DropTable(
                name: "PermissionDefinitions");
        }
    }
}
