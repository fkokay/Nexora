import { lazy, useCallback } from 'react'
import type { Locale } from './WorkspaceComponents'
import type { ModuleMenuSelection } from './ModuleMarketplacePage'
import type * as AppTypes from './erp-types'
import type { ErpDashboardSummary } from './dashboard/types'

const PurchaseDeliveryNotesPage = lazy(() => import('./PurchaseDeliveryNotesPage'))
const CustomersPage = lazy(() => import('./CustomersPage').then(module => ({ default: module.CustomersPage })))
const AISettingsPage = lazy(() => import('./AISettingsPage'))
const ModuleMarketplacePage = lazy(() => import('./ModuleMarketplacePage'))
const TenantModuleScreen = lazy(() => import('./ModuleMarketplacePage').then(module => ({ default: module.TenantModuleScreen })))
const CustomMenusPage = lazy(() => import('./CustomMenusPage'))
const CustomFormsPage = lazy(() => import('./CustomFormsPage'))
const WorkflowPage = lazy(() => import('./WorkflowPage'))
const BusinessRulesPage = lazy(() => import('./BusinessRulesPage'))
const ReportsPage = lazy(() => import('./ReportsPage'))
const CustomListsPage = lazy(() => import('./CustomListsPage'))
const CrmOpportunitiesPage = lazy(() => import('./CrmOpportunitiesPage'))
const ManufacturingRecipesPage = lazy(() => import('./ManufacturingRecipesPage'))
const ManufacturingRecipeCreatePage = lazy(() => import('./ManufacturingRecipeCreatePage'))
const ManufacturingWorkCentersPage = lazy(() => import('./ManufacturingWorkCentersPage'))
const ManufacturingOrdersPage = lazy(() => import('./ManufacturingOrdersPage'))
const ManufacturingMrpPage = lazy(() => import('./ManufacturingMrpPage'))
const ManufacturingCostVariancePage = lazy(() => import('./ManufacturingCostVariancePage'))
const FixedAssetsPage = lazy(() => import('./FixedAssetsPage'))
const CommercialContractsPage = lazy(() => import('./CommercialContractsPage'))
const IntegrationQueuePage = lazy(() => import('./IntegrationQueuePage'))
const HumanResourcesPage = lazy(() => import('./HumanResourcesPage'))
const TenantOperationalSettingsPage = lazy(() => import('./TenantOperationalSettingsPage'))
const TenantLicensePage = lazy(() => import('./TenantLicensePage'))
const PaymentInstrumentsPage = lazy(() => import('./PaymentInstrumentsPage'))
const ForeignTradePage = lazy(() => import('./ForeignTradePage'))
const WarehouseLocationsPage = lazy(() => import('./WarehouseLocationsPage'))
const InventoryTrackingPage = lazy(() => import('./InventoryTrackingPage'))
const FinanceBudgetPage = lazy(() => import('./FinanceBudgetPage'))
const DirectCashBudgetPage = lazy(() => import('./DirectCashBudgetPage'))
const FinanceAccountsPage = lazy(() => import('./FinanceAccountsPage'))
const FinanceCashAccountsPage = lazy(() => import('./FinanceCashAccountsPage'))
const FinanceBankAccountsPage = lazy(() => import('./FinanceBankAccountsPage'))
const BankStatementsPage = lazy(() => import('./BankStatementsPage'))
const CashFlowPage = lazy(() => import('./CashFlowPage'))
const FxSettingsPage = lazy(() => import('./FxSettingsPage'))
const LedgerOverviewPage = lazy(() => import('./LedgerOverviewPage'))
const FxExposurePage = lazy(() => import('./FxExposurePage'))
const MaturityTrackingPage = lazy(() => import('./MaturityTrackingPage'))
const CreditFacilitiesPage = lazy(() => import('./CreditFacilitiesPage'))
const BuiltInScreenViewsPage = lazy(() => import('./BuiltInScreenViewsPage'))
const SalesPromotionsPage = lazy(() => import('./SalesPromotionsPage'))
const SalesDistributionPage = lazy(() => import('./SalesDistributionPage'))
const SalesQuotesPage = lazy(() => import('./SalesQuotesPage'))
const SalesRequestsPage = lazy(() => import('./SalesRequestsPage'))
const PurchaseSupplierQuotesScreenPage = lazy(() => import('./PurchaseSupplierQuotesScreenPage'))
const SalesOrdersPage = lazy(() => import('./SalesOrdersPage'))
const SalesInvoicesPage = lazy(() => import('./SalesInvoicesPage'))
const SalesDeliveriesScreenPage = lazy(() => import('./SalesDeliveriesScreenPage'))
const SupplierOrdersPage = lazy(() => import('./SupplierOrdersPage'))
const PurchaseInvoicesPage = lazy(() => import('./PurchaseInvoicesPage'))
const PurchaseReceiptsPage = lazy(() => import('./PurchaseReceiptsPage'))
const PurchaseInvoiceEntryScreenPage = lazy(() => import('./PurchaseInvoiceEntryScreenPage'))
const SupplierInvoiceDraftsPage = lazy(() => import('./SupplierInvoiceDraftsPage'))
const OperationalProjectsPage = lazy(() => import('./OperationalProjectsPage'))
const OperationalDefinitionsPage = lazy(() => import('./OperationalDefinitionsPage'))
const InventoryStockPage = lazy(() => import('./InventoryStockPage'))
const InventoryValuationPage = lazy(() => import('./InventoryValuationPage'))
const InventoryWarehousesPage = lazy(() => import('./InventoryWarehousesPage'))
const InventoryTransfersPage = lazy(() => import('./InventoryTransfersPage'))
const DashboardPage = lazy(() => import('./DashboardPage').then(module => ({ default: module.DashboardPage })))
const WorkspaceSettingsPage = lazy(() => import('./WorkspaceSettingsPage').then(module => ({ default: module.WorkspaceSettingsPage })))
const CustomerLocationDefinitionsPage = lazy(() => import('./CustomerLocationDefinitionsPage').then(module => ({ default: module.CustomerLocationDefinitionsPage })))
const ERPAssistantPage = lazy(() => import('./ERPAssistantPage').then(module => ({ default: module.ERPAssistantPage })))
const AccessControlPage = lazy(() => import('./AccessControlPage').then(module => ({ default: module.AccessControlPage })))
const AuditLogPage = lazy(() => import('./AuditLogPage').then(module => ({ default: module.AuditLogPage })))

type ApiRequest = typeof import('./erpApi').api
type Props = {
  page: string
  token: string
  tenant: AppTypes.Tenant
  locale: Locale
  dashboard: AppTypes.Dashboard | null
  platformStatus: string
  selectedModuleMenu: ModuleMenuSelection | null
  pendingCustomerInvoiceId: string | null
  initialCustomerSearch: string
  onOpenSalesInvoice: (id:string) => void
  onOpenPurchaseInvoices: (supplier:{id:string;name:string}) => void
  onInitialInvoiceOpened: () => void
  pendingPurchaseSupplier: {id:string;name:string} | null
  onInitialSupplierOpened: () => void
  onNavigate: (page:string) => void
  onLocaleChange: (locale:Locale) => void
  onThemeChange: (theme:AppTypes.Theme) => void
  requestApi: ApiRequest
  onOpenStudio: () => void
  onDevelopModuleStarter: (template:{code:string;moduleCode:string;name:string}) => void
}

export function WorkspacePageRouter({page,token,tenant,locale,dashboard,platformStatus,selectedModuleMenu,pendingCustomerInvoiceId,initialCustomerSearch,onOpenSalesInvoice,onOpenPurchaseInvoices,onInitialInvoiceOpened,pendingPurchaseSupplier,onInitialSupplierOpened,onNavigate,onLocaleChange,onThemeChange,requestApi,onOpenStudio,onDevelopModuleStarter}:Props) {
  const salesPageProps={token,role:tenant.role,onNavigate,initialInvoiceId:pendingCustomerInvoiceId,onInitialInvoiceOpened,initialSupplier:pendingPurchaseSupplier,onInitialSupplierOpened}
  const loadDashboardSummary = useCallback(() => requestApi<ErpDashboardSummary>('/api/dashboard/erp-summary', token), [requestApi, token])
  if(page==='projects')return <OperationalProjectsPage token={token} locale={locale}/>
  if(page==='foreign-trade')return <ForeignTradePage token={token} role={tenant.role}/>
  if(page==='integrations')return <IntegrationQueuePage token={token} requestApi={requestApi}/>
  if(page==='erp-assistant')return <ERPAssistantPage token={token}/>
  if(page==='screen-views')return <BuiltInScreenViewsPage token={token} role={tenant.role} locale={locale}/>
  if(page==='custom-lists')return <CustomListsPage token={token} role={tenant.role}/>
  if(page==='custom-menus')return <CustomMenusPage token={token} role={tenant.role}/>
  if(page==='business-rules')return <BusinessRulesPage token={token} role={tenant.role}/>
  if(page==='reports')return <ReportsPage token={token} role={tenant.role} onNavigate={onNavigate}/>
  if(page==='workflows')return <WorkflowPage token={token} role={tenant.role}/>
  if(page==='custom-forms')return <CustomFormsPage token={token} role={tenant.role}/>
  if(page.startsWith('module:')&&selectedModuleMenu)return <TenantModuleScreen token={token} selection={selectedModuleMenu}/>
  if(page==='customers')return <CustomersPage token={token} role={tenant.role} initialSearch={initialCustomerSearch} onOpenSalesInvoice={onOpenSalesInvoice} onOpenPurchaseInvoices={onOpenPurchaseInvoices}/>
  if(page==='crm-opportunities')return <CrmOpportunitiesPage token={token}/>
  if(page==='fixed-assets')return <FixedAssetsPage token={token} locale={locale}/>
  if(page==='human-resources')return <HumanResourcesPage token={token} role={tenant.role} locale={locale}/>
  if(page==='manufacturing-cost-variance')return <ManufacturingCostVariancePage token={token}/>
  const manufacturingPageProps={token,onNavigate}
  if(page==='manufacturing-recipes')return <ManufacturingRecipesPage {...manufacturingPageProps}/>
  if(page==='manufacturing-recipe-create')return <ManufacturingRecipeCreatePage {...manufacturingPageProps}/>
  if(page==='manufacturing-work-centers')return <ManufacturingWorkCentersPage {...manufacturingPageProps}/>
  if(page==='manufacturing-orders')return <ManufacturingOrdersPage {...manufacturingPageProps}/>
  if(page==='manufacturing-mrp')return <ManufacturingMrpPage {...manufacturingPageProps}/>
  if(page==='modules')return <ModuleMarketplacePage token={token} role={tenant.role} onDevelopStarter={onDevelopModuleStarter}/>
  if(page==='inventory-tracking')return <InventoryTrackingPage token={token}/>
  if(page==='inventory-locations')return <WarehouseLocationsPage token={token} role={tenant.role}/>
  if(page==='inventory-stock')return <InventoryStockPage token={token} role={tenant.role}/>
  if(page==='inventory-valuation')return <InventoryValuationPage token={token} role={tenant.role}/>
  if(page==='inventory-warehouses')return <InventoryWarehousesPage token={token} role={tenant.role}/>
  if(page==='inventory-transfers')return <InventoryTransfersPage token={token} role={tenant.role}/>
  if(page==='commercial-contracts')return <CommercialContractsPage token={token} role={tenant.role} locale={locale}/>
  if(page==='sales-distribution')return <SalesDistributionPage token={token}/>
  if(page==='sales-promotions')return <SalesPromotionsPage token={token} role={tenant.role} onBack={()=>onNavigate('sales-quotes')}/>
  if(page==='sales-purchase-delivery-notes')return <PurchaseDeliveryNotesPage token={token}/>
  if(page==='sales-quotes')return <SalesQuotesPage {...salesPageProps}/>
  if(page==='sales-requests')return <SalesRequestsPage {...salesPageProps}/>
  if(page==='sales-purchase-quotes')return <PurchaseSupplierQuotesScreenPage {...salesPageProps}/>
  if(page==='sales-orders')return <SalesOrdersPage {...salesPageProps}/>
  if(page==='sales-invoices')return <SalesInvoicesPage {...salesPageProps}/>
  if(page==='sales-deliveries')return <SalesDeliveriesScreenPage {...salesPageProps}/>
  if(page==='sales-purchasing')return <SupplierOrdersPage {...salesPageProps}/>
  if(page==='sales-purchase-invoices')return <PurchaseInvoicesPage {...salesPageProps}/>
  if(page==='sales-purchase-receipts')return <PurchaseReceiptsPage {...salesPageProps}/>
  if(page==='sales-purchase-invoice-entry')return <PurchaseInvoiceEntryScreenPage {...salesPageProps}/>
  if(page==='sales-purchase-invoice-drafts')return <SupplierInvoiceDraftsPage {...salesPageProps}/>
  if(page==='finance-instruments')return <div className='finance-embedded-workbench'><PaymentInstrumentsPage token={token} role={tenant.role}/></div>
  if(page==='finance-budget')return <div className='finance-embedded-workbench'><FinanceBudgetPage token={token} role={tenant.role}/></div>
  if(page==='finance-cash-budget')return <div className='finance-embedded-workbench'><DirectCashBudgetPage token={token} role={tenant.role}/></div>
  if(page==='finance-accounts')return <FinanceAccountsPage token={token} role={tenant.role}/>
  if(page==='finance-cash-accounts')return <FinanceCashAccountsPage token={token} role={tenant.role}/>
  if(page==='finance-bank-accounts')return <FinanceBankAccountsPage token={token} role={tenant.role}/>
  if(page==='finance-statements')return <BankStatementsPage token={token} role={tenant.role}/>
  if(page==='finance-cash-flow')return <CashFlowPage token={token} role={tenant.role}/>
  if(page==='finance-fx')return <FxSettingsPage token={token} role={tenant.role}/>
  if(page==='finance-ledger')return <LedgerOverviewPage token={token} role={tenant.role}/>
  if(page==='finance-exposure')return <FxExposurePage token={token} role={tenant.role}/>
  if(page==='finance-maturities')return <MaturityTrackingPage token={token} role={tenant.role}/>
  if(page==='finance-credit-facilities')return <CreditFacilitiesPage token={token} role={tenant.role}/>
  if(page==='location-definitions'&&tenant.role==='TenantAdmin')return <OperationalDefinitionsPage token={token} locale={locale} onNavigate={onNavigate}/>
  if(page==='address-definitions'&&tenant.role==='TenantAdmin')return <CustomerLocationDefinitionsPage token={token}/>
  if(page==='audit')return <AuditLogPage token={token}/>
  if(page==='access')return <AccessControlPage token={token}/>
  if(page==='company-settings')return <TenantOperationalSettingsPage token={token} role={tenant.role} tenant={tenant} onNavigate={onNavigate}/>
  if(page==='license-settings')return <TenantLicensePage token={token} role={tenant.role} onBack={()=>onNavigate('company-settings')}/>
  if(page==='settings')return <WorkspaceSettingsPage tenantName={tenant.name} locale={locale} onLocaleChange={onLocaleChange} onThemeChange={onThemeChange} onNavigate={onNavigate}/>
  if(page==='ai-settings')return <AISettingsPage token={token} requestApi={requestApi}/>
  if(page==='dashboard')return <DashboardPage tenantName={tenant.name} dashboardName={dashboard?.tenantName} platformStatus={platformStatus} onNavigate={onNavigate} loadSummary={loadDashboardSummary}/>
  return <><div className="page-heading studio-heading"><div><p className="eyebrow">GELİŞTİRME ALANI</p><h1>AI Development Studio</h1><p className="muted">Proje ve workspace geliştirme araçları ayrı, yetkilendirilmiş Studio uygulamasında çalışır.</p></div></div><div className="panel standalone-studio-card"><div className="panel-heading"><div><h3>Ayrı geliştirme çalışma alanı</h3><p>Yetkili projeler, Project Explorer, geliştirme talepleri ve AI Developer araçları.</p></div><button className="primary" onClick={onOpenStudio}>Studio’yu aç <span>↗</span></button></div><div className="boundary-note"><span>Studio kendi frontend origin’inde Platform hesabıyla oturum açar; proje ve workspace izinleri API tarafında denetlenir.</span></div></div></>
}
