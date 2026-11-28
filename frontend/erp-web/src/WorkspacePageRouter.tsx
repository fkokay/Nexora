import { lazy } from "react";
import type { Locale } from "./WorkspaceComponents";
import type { ModuleMenuSelection } from "./ModuleMarketplacePage";
import type * as AppTypes from "./erp-types";
import type { SystemPageMap } from "./system-pages/useSystemPageMap";
import { canBeSystemPage, canBeSystemPageAlias } from "./system-pages/systemPageKeys";
import { requestClosePage, setPageParams, usePageParams } from "./pageNavigation";
import { useEffect } from "react";
import { LegacyScreenBar } from "./system-pages/LegacyScreenBar";
import { systemPreviewFor } from "./workspace-storage";

const PurchaseDeliveryNotesPage = lazy(
  () => import("./PurchaseDeliveryNotesPage"),
);
const CustomersPage = lazy(() =>
  import("./CustomersPage").then((module) => ({
    default: module.CustomersPage,
  })),
);
const CustomerLedgerPage = lazy(() => import("./CustomerLedgerPage"));
const AISettingsPage = lazy(() => import("./AISettingsPage"));
const ModuleMarketplacePage = lazy(() => import("./ModuleMarketplacePage"));
const TenantModuleScreen = lazy(() =>
  import("./ModuleMarketplacePage").then((module) => ({
    default: module.TenantModuleScreen,
  })),
);
const CustomMenusPage = lazy(() => import("./CustomMenusPage"));
const TenantCustomPage = lazy(() => import("./TenantCustomPage"));
const CustomFormsPage = lazy(() => import("./CustomFormsPage"));
const WorkflowPage = lazy(() => import("./WorkflowPage"));
const BusinessRulesPage = lazy(() => import("./BusinessRulesPage"));
const ReportsPage = lazy(() => import("./ReportsPage"));
const CustomListsPage = lazy(() => import("./CustomListsPage"));
const CrmOpportunitiesPage = lazy(() => import("./CrmOpportunitiesPage"));
const ManufacturingRecipesPage = lazy(
  () => import("./ManufacturingRecipesPage"),
);
const ManufacturingRecipeCreatePage = lazy(
  () => import("./ManufacturingRecipeCreatePage"),
);
const ManufacturingWorkCentersPage = lazy(
  () => import("./ManufacturingWorkCentersPage"),
);
const ManufacturingWorkCenterCreatePage = lazy(
  () => import("./ManufacturingWorkCenterCreatePage"),
);
const ManufacturingOrdersPage = lazy(() => import("./ManufacturingOrdersPage"));
const ManufacturingOrderCreatePage = lazy(() => import("./ManufacturingOrderCreatePage"));
const ManufacturingMrpPage = lazy(() => import("./ManufacturingMrpPage"));
const ManufacturingCostVariancePage = lazy(
  () => import("./ManufacturingCostVariancePage"),
);
const FixedAssetsPage = lazy(() => import("./FixedAssetsPage"));
const CommercialContractsPage = lazy(() => import("./CommercialContractsPage"));
const IntegrationQueuePage = lazy(() => import("./IntegrationQueuePage"));
const HumanResourcesPage = lazy(() => import("./HumanResourcesPage"));
const TenantOperationalSettingsPage = lazy(
  () => import("./TenantOperationalSettingsPage"),
);
const TenantLicensePage = lazy(() => import("./TenantLicensePage"));
const PaymentInstrumentsPage = lazy(() => import("./PaymentInstrumentsPage"));
const ForeignTradePage = lazy(() => import("./ForeignTradePage"));
const WarehouseLocationsPage = lazy(() => import("./WarehouseLocationsPage"));
const InventoryTrackingPage = lazy(() => import("./InventoryTrackingPage"));
const InventoryMovementsPage = lazy(() => import("./InventoryMovementsPage"));
const FinanceBudgetPage = lazy(() => import("./FinanceBudgetPage"));
const DirectCashBudgetPage = lazy(() => import("./DirectCashBudgetPage"));
const FinanceAccountsPage = lazy(() => import("./FinanceAccountsPage"));
const BankStatementsPage = lazy(() => import("./BankStatementsPage"));
const CashFlowPage = lazy(() => import("./CashFlowPage"));
const FxSettingsPage = lazy(() => import("./FxSettingsPage"));
const LedgerOverviewPage = lazy(() => import("./LedgerOverviewPage"));
const FxExposurePage = lazy(() => import("./FxExposurePage"));
const MaturityTrackingPage = lazy(() => import("./MaturityTrackingPage"));
const CreditFacilitiesPage = lazy(() => import("./CreditFacilitiesPage"));
const BuiltInScreenViewsPage = lazy(() => import("./BuiltInScreenViewsPage"));
const SalesPromotionsPage = lazy(() => import("./SalesPromotionsPage"));
const SalesDistributionPage = lazy(() => import("./SalesDistributionPage"));
const SalesQuotesPage = lazy(() => import("./SalesQuotesPage"));
const SalesRequestsPage = lazy(() => import("./SalesRequestsPage"));
const PurchaseSupplierQuotesScreenPage = lazy(
  () => import("./PurchaseSupplierQuotesScreenPage"),
);
const SalesOrdersPage = lazy(() => import("./SalesOrdersPage"));
const SalesInvoicesPage = lazy(() => import("./SalesInvoicesPage"));
const SalesDeliveriesScreenPage = lazy(
  () => import("./SalesDeliveriesScreenPage"),
);
const SupplierOrdersPage = lazy(() => import("./SupplierOrdersPage"));
const PurchaseInvoicesPage = lazy(() => import("./PurchaseInvoicesPage"));
const PurchaseReceiptsPage = lazy(() => import("./PurchaseReceiptsPage"));
const SalesReturnsPage = lazy(() => import("./SalesReturnsPage"));
const SalesCustomerRequestsPage = lazy(() => import("./sales-customer-requests/SalesCustomerRequestsPage"));
const PurchaseReturnsPage = lazy(() => import("./PurchaseReturnsPage"));
const PurchaseInvoiceEntryScreenPage = lazy(
  () => import("./PurchaseInvoiceEntryScreenPage"),
);
const SupplierInvoiceDraftsPage = lazy(
  () => import("./SupplierInvoiceDraftsPage"),
);
const OperationalProjectsPage = lazy(() => import("./OperationalProjectsPage"));
const OperationalDefinitionsPage = lazy(
  () => import("./OperationalDefinitionsPage"),
);
const InventoryStockPage = lazy(() => import("./InventoryStockPage"));
const InventoryCostPage = lazy(() => import("./InventoryCostPage"));
const InventoryWarehousesPage = lazy(() => import("./InventoryWarehousesPage"));
const InventoryTransfersPage = lazy(() => import("./InventoryTransfersPage"));
const WorkspaceSettingsPage = lazy(() =>
  import("./WorkspaceSettingsPage").then((module) => ({
    default: module.WorkspaceSettingsPage,
  })),
);
const CustomerLocationDefinitionsPage = lazy(() =>
  import("./CustomerLocationDefinitionsPage").then((module) => ({
    default: module.CustomerLocationDefinitionsPage,
  })),
);
const CustomerGroupsPage = lazy(() =>
  import("./CustomerGroupsPage").then((module) => ({
    default: module.CustomerGroupsPage,
  })),
);
const ERPAssistantPage = lazy(() =>
  import("./ERPAssistantPage").then((module) => ({
    default: module.ERPAssistantPage,
  })),
);
const AccessControlPage = lazy(() =>
  import("./AccessControlPage").then((module) => ({
    default: module.AccessControlPage,
  })),
);
const AuditLogPage = lazy(() =>
  import("./AuditLogPage").then((module) => ({ default: module.AuditLogPage })),
);

type ApiRequest = typeof import("./erpApi").api;
type Props = {
  page: string;
  token: string;
  tenant: AppTypes.Tenant;
  locale: Locale;
  platformStatus: string;
  selectedModuleMenu: ModuleMenuSelection | null;
  pendingCustomerInvoiceId: string | null;
  initialCustomerSearch: string;
  onOpenSalesInvoice: (id: string) => void;
  onOpenPurchaseInvoices: (supplier: { id: string; name: string }) => void;
  onInitialInvoiceOpened: () => void;
  pendingPurchaseSupplier: { id: string; name: string } | null;
  onInitialSupplierOpened: () => void;
  onNavigate: (page: string, label?: string) => void;
  onLocaleChange: (locale: Locale) => void;
  onThemeChange: (theme: AppTypes.Theme) => void;
  requestApi: ApiRequest;
  onOpenStudio: () => void;
  onDevelopModuleStarter: (template: {
    code: string;
    moduleCode: string;
    name: string;
  }) => void;
};
type RouterProps = Props & {
  /** Runtime map of system pages for the selected tenant; without it every key renders its legacy screen. */
  systemPages?: SystemPageMap;
};

// Keys that are not built-in screens: they never have a system page design.
const nonBuiltInPrefixes = ["custom-page:", "custom-page-preview:", "module:"];
const isBuiltInPageKey = (key: string) => !nonBuiltInPrefixes.some((prefix) => key.startsWith(prefix));

export function WorkspacePageRouter({ systemPages, ...props }: RouterProps) {
  const key = props.page;
  // An alias key (a standard's `aliases`, e.g. customer-edit → customer-create) opens the target's system page in its own tab,
  // with the alias tab's page params. Without the required param (a tab restored after reload) it stays on the legacy screen.
  const aliasMap = systemPages && canBeSystemPageAlias(key) ? systemPages : undefined;
  const aliasParams = usePageParams(aliasMap ? key : undefined);
  if (aliasMap) {
    if (aliasMap.status === "loading")
      return <div className="panel page-loading" role="status">Sayfa yükleniyor…</div>;
    const alias = aliasMap.aliases[key];
    const usable = !!alias && Object.prototype.hasOwnProperty.call(aliasMap.screens, alias.screenKey) && (aliasParams[alias.param] ?? "") !== "";
    if (!alias || !usable) return <LegacyPageRouter {...props} />;
    if (aliasMap.legacy.has(alias.screenKey))
      return (
        <>
          <LegacyScreenBar onBack={() => aliasMap.closeLegacy(alias.screenKey)} />
          <LegacyPageRouter {...props} />
        </>
      );
    return (
      <TenantCustomPage
        token={props.token}
        systemScreenKey={alias.screenKey}
        tabKey={key}
        onOpenLegacy={() => aliasMap.openLegacy(alias.screenKey)}
        onSystemPageMissing={() => aliasMap.dropScreen(alias.screenKey)}
      />
    );
  }
  // Studio's preview of a system page draft opens on the screen's own key, so the workspace shows it as that built-in
  // screen (module menu, breadcrumb, tab title) with the draft in place of the published design or the legacy screen.
  const previewId = isBuiltInPageKey(key) && canBeSystemPage(key) ? systemPreviewFor(key) : undefined;
  if (previewId)
    return <TenantCustomPage token={props.token} systemScreenKey={key} previewId={previewId} />;
  // A key without a standard definition is never in the runtime map, so it need not wait for the map to load.
  if (!systemPages || !isBuiltInPageKey(key) || !canBeSystemPage(key)) return <LegacyPageRouter {...props} />;
  if (systemPages.status === "loading")
    return <div className="panel page-loading" role="status">Sayfa yükleniyor…</div>;
  if (systemPages.legacy.has(key))
    return (
      <>
        <LegacyScreenBar onBack={() => systemPages.closeLegacy(key)} />
        <LegacyPageRouter {...props} />
      </>
    );
  if (Object.prototype.hasOwnProperty.call(systemPages.screens, key))
    return (
      <TenantCustomPage
        token={props.token}
        systemScreenKey={key}
        onOpenLegacy={() => systemPages.openLegacy(key)}
        onSystemPageMissing={() => systemPages.dropScreen(key)}
      />
    );
  return <LegacyPageRouter {...props} />;
}

function LegacyPageRouter({
  page,
  token,
  tenant,
  locale,
  platformStatus,
  selectedModuleMenu,
  pendingCustomerInvoiceId,
  initialCustomerSearch,
  onOpenSalesInvoice,
  onOpenPurchaseInvoices,
  onInitialInvoiceOpened,
  pendingPurchaseSupplier,
  onInitialSupplierOpened,
  onNavigate,
  onLocaleChange,
  onThemeChange,
  requestApi,
  onOpenStudio,
  onDevelopModuleStarter,
}: Props) {
  const salesPageProps = {
    token,
    role: tenant.role,
    onNavigate,
    initialInvoiceId: pendingCustomerInvoiceId,
    onInitialInvoiceOpened,
    initialSupplier: pendingPurchaseSupplier,
    onInitialSupplierOpened,
  };
  if (page === "projects")
    return <OperationalProjectsPage token={token} locale={locale} />;
  if (page === "foreign-trade" || page === "foreign-trade-case")
    return (
      <ForeignTradePage
        token={token}
        role={tenant.role}
        recordParamPage={page === "foreign-trade-case" ? page : undefined}
      />
    );
  if (page === "integrations")
    return <IntegrationQueuePage token={token} requestApi={requestApi} />;
  if (page === "erp-assistant") return <ERPAssistantPage token={token} />;
  if (page === "screen-views")
    return (
      <BuiltInScreenViewsPage
        token={token}
        role={tenant.role}
        locale={locale}
      />
    );
  if (page === "custom-lists")
    return <CustomListsPage token={token} role={tenant.role} />;
  if (page === "custom-menus")
    return <CustomMenusPage token={token} role={tenant.role} />;
  if (page === "business-rules")
    return <BusinessRulesPage token={token} role={tenant.role} />;
  if (page === "reports")
    return (
      <ReportsPage token={token} role={tenant.role} onNavigate={onNavigate} />
    );
  if (page === "workflows")
    return <WorkflowPage token={token} role={tenant.role} />;
  if (page === "custom-forms")
    return <CustomFormsPage token={token} role={tenant.role} />;
  if (page.startsWith("custom-page:"))
    return <TenantCustomPage token={token} code={page.slice("custom-page:".length)} />;
  if (page.startsWith("custom-page-preview:"))
    return <TenantCustomPage token={token} previewId={page.slice("custom-page-preview:".length)} />;
  if (page.startsWith("module:") && selectedModuleMenu)
    return <TenantModuleScreen token={token} selection={selectedModuleMenu} />;
  if (page === "customers" || page === "customer-create" || page === "customer-edit")
    return (
      <CustomersPage
        token={token}
        role={tenant.role}
        initialSearch={initialCustomerSearch}
        initialCreate={page === "customer-create"}
        initialEdit={page === "customer-edit"}
        onNavigate={onNavigate}
        onOpenSalesInvoice={onOpenSalesInvoice}
        onOpenPurchaseInvoices={onOpenPurchaseInvoices}
      />
    );
  if (page === "customer-ledger")
    return <CustomerLedgerPage token={token} />;
  if (page === "crm-opportunities" || page === "crm-opportunity-create")
    return (
      <CrmOpportunitiesPage
        token={token}
        initialCreate={page === "crm-opportunity-create"}
        onNavigate={onNavigate}
      />
    );
  // The legacy screen has no separate create page or card; both keys open it.
  if (page === "fixed-assets" || page === "fixed-asset-create" || page === "fixed-asset-card")
    return (
      <FixedAssetsPage
        token={token}
        locale={locale}
        recordParamPage={page === "fixed-asset-card" ? page : undefined}
      />
    );
  if (page === "human-resources")
    return (
      <HumanResourcesPage token={token} role={tenant.role} locale={locale} />
    );
  // The hr-* system page keys have no legacy screen of their own: they open the matching tab of the HR screen.
  if (page === "hr-employees" || page === "hr-employee-create")
    return (
      <HumanResourcesPage
        token={token}
        role={tenant.role}
        locale={locale}
        initialSection="employees"
        recordParamPage={page === "hr-employee-create" ? page : undefined}
      />
    );
  if (page === "hr-leave-requests")
    return <HumanResourcesPage token={token} role={tenant.role} locale={locale} initialSection="leave" />;
  if (page === "hr-attendance")
    return <HumanResourcesPage token={token} role={tenant.role} locale={locale} initialSection="attendance" />;
  if (page === "hr-period-summary")
    return <HumanResourcesPage token={token} role={tenant.role} locale={locale} initialSection="report" />;
  if (page === "manufacturing-cost-variance")
    return <ManufacturingCostVariancePage token={token} />;
  const manufacturingPageProps = { token, onNavigate };
  if (page === "manufacturing-recipes")
    return <ManufacturingRecipesPage {...manufacturingPageProps} />;
  if (page === "manufacturing-recipe-create")
    return <ManufacturingRecipeCreatePage {...manufacturingPageProps} />;
  if (page === "manufacturing-work-centers")
    return <ManufacturingWorkCentersPage {...manufacturingPageProps} />;
  if (page === "manufacturing-work-center-create")
    return <ManufacturingWorkCenterCreatePage {...manufacturingPageProps} />;
  if (page === "manufacturing-orders")
    return <ManufacturingOrdersPage {...manufacturingPageProps} />;
  if (page === "manufacturing-order-create")
    return <ManufacturingOrderCreatePage {...manufacturingPageProps} />;
  if (page === "manufacturing-mrp")
    return <ManufacturingMrpPage {...manufacturingPageProps} />;
  if (page === "modules")
    return (
      <ModuleMarketplacePage
        token={token}
        role={tenant.role}
        onDevelopStarter={onDevelopModuleStarter}
      />
    );
  if (page === "inventory-tracking")
    return <InventoryTrackingPage token={token} />;
  if (page === "inventory-stock-movements")
    return <InventoryMovementsPage token={token} locale={locale} />;
  if (page === "inventory-cost")
    return <InventoryCostPage token={token} role={tenant.role} />;
  if (page === "inventory-locations")
    return <WarehouseLocationsPage token={token} role={tenant.role} />;
  if (page === "inventory-stock" || page === "inventory-stock-create")
    return (
      <InventoryStockPage
        token={token}
        role={tenant.role}
        section={page as "inventory-stock" | "inventory-stock-create"}
        onNavigate={onNavigate}
      />
    );
  if (page === "inventory-warehouses")
    return <InventoryWarehousesPage token={token} role={tenant.role} onNavigate={onNavigate} />;
  if (page === "inventory-transfers")
    return <InventoryTransfersPage token={token} role={tenant.role} />;
  if (page === "inventory-transfer-document")
    return <InventoryTransfersPage token={token} role={tenant.role} />;
  if (page === "commercial-contracts")
    return (
      <CommercialContractsPage
        token={token}
        role={tenant.role}
        locale={locale}
      />
    );
  if (page === "sales-distribution")
    return <SalesDistributionPage token={token} />;
  if (page === "sales-promotions")
    return (
      <SalesPromotionsPage
        token={token}
        role={tenant.role}
        onBack={() => onNavigate("sales-quotes")}
      />
    );
  if (page === "sales-purchase-delivery-notes")
    return <PurchaseDeliveryNotesPage token={token} />;
  if (page === "sales-quotes") return <SalesQuotesPage {...salesPageProps} />;
  if (page === "sales-quote-create")
    return <SalesQuotesPage {...salesPageProps} createQuotePage />;
  if (page === "sales-requests")
    return <SalesRequestsPage {...salesPageProps} />;
  if (page === "sales-purchase-quotes")
    return <PurchaseSupplierQuotesScreenPage {...salesPageProps} />;
  if (page === "sales-orders") return <SalesOrdersPage {...salesPageProps} />;
  if (page === "sales-order-create")
    return <SalesOrdersPage {...salesPageProps} createOrderPage />;
  if (page === "sales-order-document")
    return <LegacyDocumentCard onNavigate={onNavigate} documentKey="sales-order-document" noun="Sipariş"
      openKey="sales-orders" openParam="orderId" createKey="sales-order-create" />;
  if (page === "sales-quote-document")
    return <LegacyDocumentCard onNavigate={onNavigate} documentKey="sales-quote-document" noun="Teklif"
      openKey="sales-quote-create" openParam="quoteId" createKey="sales-quote-create" />;
  if (page === "sales-invoice-create")
    return <SalesInvoicesPage {...salesPageProps} openInvoiceCreate />;
  if (page === "sales-invoices")
    return <SalesInvoicesPage {...salesPageProps} />;
  if (page === "sales-deliveries")
    return <SalesDeliveriesScreenPage {...salesPageProps} />;
  if (page === "sales-delivery-create")
    return <SalesDeliveriesScreenPage {...salesPageProps} createDeliveryPage />;
  if (page === "sales-purchasing")
    return <SupplierOrdersPage {...salesPageProps} />;
  if (page === "sales-purchase-order-create")
    return <SupplierOrdersPage {...salesPageProps} createPurchaseOrderPage />;
  if (page === "sales-purchase-invoices")
    return <PurchaseInvoicesPage {...salesPageProps} />;
  if (page === "sales-purchase-receipts")
    return <PurchaseReceiptsPage {...salesPageProps} />;
  if (page === "sales-customer-requests")
    return <SalesCustomerRequestsPage token={token} onNavigate={onNavigate} />;
  if (page === "sales-returns")
    return <SalesReturnsPage token={token} role={tenant.role} onNavigate={onNavigate} />;
  if (page === "sales-purchase-returns")
    return <PurchaseReturnsPage token={token} role={tenant.role} onNavigate={onNavigate} />;
  if (page === "sales-purchase-invoice-entry")
    return <PurchaseInvoiceEntryScreenPage {...salesPageProps} />;
  if (page === "sales-purchase-invoice-drafts")
    return <SupplierInvoiceDraftsPage {...salesPageProps} />;
  if (page === "finance-instruments")
    return (
      <div className="finance-embedded-workbench">
        <PaymentInstrumentsPage token={token} role={tenant.role} />
      </div>
    );
  if (page === "finance-budget")
    return (
      <div className="finance-embedded-workbench">
        <FinanceBudgetPage token={token} role={tenant.role} />
      </div>
    );
  if (page === "finance-cash-budget")
    return (
      <div className="finance-embedded-workbench">
        <DirectCashBudgetPage token={token} role={tenant.role} />
      </div>
    );
  if (page === "finance-accounts")
    return <FinanceAccountsPage token={token} role={tenant.role} />;
  if (page === "finance-account-create")
    return (
      <FinanceAccountsPage token={token} role={tenant.role} createOnOpen />
    );
  if (page === "finance-banks")
    return (
      <FinanceAccountsPage
        token={token}
        role={tenant.role}
        section="finance-banks"
      />
    );
  if (page === "finance-statements")
    return <BankStatementsPage token={token} role={tenant.role} />;
  if (page === "finance-cash-flow")
    return <CashFlowPage token={token} role={tenant.role} />;
  if (page === "finance-fx")
    return <FxSettingsPage token={token} role={tenant.role} />;
  if (page === "finance-ledger")
    return (
      <LedgerOverviewPage
        token={token}
        role={tenant.role}
        onNavigate={onNavigate}
      />
    );
  if (
    page === "finance-ledger-chart" ||
    page === "finance-ledger-mappings" ||
    page === "finance-journal-vouchers" ||
    page === "finance-trial-balance" ||
    page === "finance-balance-sheet" ||
    page === "finance-journal-ledger" ||
    page === "finance-transfer-sources"
  )
    return (
      <LedgerOverviewPage
        token={token}
        role={tenant.role}
        section={page as AppTypes.FinancePageKey}
        onNavigate={onNavigate}
      />
    );
  if (page === "finance-exposure")
    return (
      <FxExposurePage
        token={token}
        role={tenant.role}
        onNavigate={onNavigate}
      />
    );
  if (page === "finance-maturities")
    return <MaturityTrackingPage token={token} role={tenant.role} />;
  if (page === "finance-credit-facilities")
    return (
      <CreditFacilitiesPage
        token={token}
        role={tenant.role}
        onNavigate={onNavigate}
      />
    );
  if (page === "finance-credit-facility-create")
    return (
      <CreditFacilitiesPage
        token={token}
        role={tenant.role}
        view="facility-create"
        onNavigate={onNavigate}
      />
    );
  if (page === "finance-credit-schedule-create")
    return (
      <CreditFacilitiesPage
        token={token}
        role={tenant.role}
        view="schedule-create"
        onNavigate={onNavigate}
      />
    );
  if (page === "finance-credit-movement-create")
    return (
      <CreditFacilitiesPage
        token={token}
        role={tenant.role}
        view="movement-create"
        onNavigate={onNavigate}
      />
    );
  if (page === "finance-credit-repayment-create")
    return (
      <CreditFacilitiesPage
        token={token}
        role={tenant.role}
        view="repayment-create"
        onNavigate={onNavigate}
      />
    );
  if (page === "finance-credit-security-create")
    return (
      <CreditFacilitiesPage
        token={token}
        role={tenant.role}
        view="security-create"
        onNavigate={onNavigate}
      />
    );
  if (page === "location-definitions" && tenant.role === "TenantAdmin")
    return (
      <OperationalDefinitionsPage
        token={token}
        locale={locale}
        onNavigate={onNavigate}
      />
    );
  if (page === "address-definitions" && tenant.role === "TenantAdmin")
    return <CustomerLocationDefinitionsPage token={token} />;
  // Every role: the former "Gruplar" dialog of the customer list was open to all, and the API has no role check.
  if (page === "customer-groups") return <CustomerGroupsPage token={token} />;
  if (page === "audit") return <AuditLogPage token={token} />;
  if (page === "access") return <AccessControlPage token={token} />;
  if (page === "company-settings")
    return (
      <TenantOperationalSettingsPage
        token={token}
        role={tenant.role}
        tenant={tenant}
        onNavigate={onNavigate}
      />
    );
  if (page === "license-settings")
    return (
      <TenantLicensePage
        token={token}
        role={tenant.role}
        onBack={() => onNavigate("company-settings")}
      />
    );
  if (page === "settings")
    return (
      <WorkspaceSettingsPage
        token={token}
        tenant={tenant}
        requestApi={requestApi}
        platformStatus={platformStatus}
        locale={locale}
        onLocaleChange={onLocaleChange}
        onThemeChange={onThemeChange}
        onNavigate={onNavigate}
      />
    );
  if (page === "ai-settings")
    return <AISettingsPage token={token} requestApi={requestApi} />;
  return (
    <>
      <div className="page-heading studio-heading">
        <div>
          <p className="eyebrow">GELİŞTİRME ALANI</p>
          <h1>AI Development Studio</h1>
          <p className="muted">
            Proje ve workspace geliştirme araçları ayrı, yetkilendirilmiş Studio
            uygulamasında çalışır.
          </p>
        </div>
      </div>
      <div className="panel standalone-studio-card">
        <div className="panel-heading">
          <div>
            <h3>Ayrı geliştirme çalışma alanı</h3>
            <p>
              Yetkili projeler, Project Explorer, geliştirme talepleri ve AI
              Developer araçları.
            </p>
          </div>
          <button className="primary" onClick={onOpenStudio}>
            Studio’yu aç <span>↗</span>
          </button>
        </div>
        <div className="boundary-note">
          <span>
            Studio kendi frontend origin’inde Platform hesabıyla oturum açar;
            proje ve workspace izinleri API tarafında denetlenir.
          </span>
        </div>
      </div>
    </>
  );
}

/**
 * Belge kartı (sales-order-document, sales-quote-document) bu firmada sistem sayfası olarak açık değilse: belgenin eski kartı açılır.
 * Kimlik varsa `openKey` ekranı `openParam` parametresiyle (sipariş: liste ayrıntısı, teklif: eski teklif kartı), yoksa eski Yeni ekranı
 * (`createKey`); bu sekme kapanır. Eski ekran Belge sayfasına geri dönmez, bu yüzden döngü olmaz.
 */
function LegacyDocumentCard({ onNavigate, documentKey, noun, openKey, openParam, createKey }: {
  onNavigate: (page: string, label?: string) => void; documentKey: string; noun: string; openKey: string; openParam: string; createKey: string;
}) {
  const params = usePageParams(documentKey);
  const id = params.id ?? "";
  useEffect(() => {
    if (id) setPageParams(openKey, { [openParam]: id });
    onNavigate(id ? openKey : createKey);
    requestClosePage(documentKey);
  }, [id, onNavigate, documentKey, openKey, openParam, createKey]);
  return <div className="panel page-loading" role="status">{noun} eski kartta açılıyor…</div>;
}
