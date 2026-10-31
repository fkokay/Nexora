import { lazy, Suspense, type RefObject } from 'react'
import { X } from 'lucide-react'
import { WorkspaceSearchDialog } from './WorkspaceSearchDialog'
import { WorkspaceTopbar } from './WorkspaceTopbar'
import { StandaloneStudioHeader } from './StandaloneStudioHeader'
import { WorkspacePageRouter } from './WorkspacePageRouter'
import { WorkspaceTabs, KeepAliveViews, type GlobalSearchResult, type Locale } from './WorkspaceComponents'
import type { ModuleMenuSelection } from './ModuleMarketplacePage'
import type { Dashboard, Tenant, Theme } from './erp-types'
type ApiRequest = typeof import('./erpApi').api

const DeveloperModePanel = lazy(() => import('./DeveloperModePanel').then(module => ({ default: module.DeveloperModePanel })))
const TenantModuleNavigation = lazy(() => import('./ModuleMarketplacePage').then(module => ({ default: module.TenantModuleNavigation })))

type Tab = { id: string; label: string }
type Props = {
  page: string
  token: string
  tenant: Tenant
  tenants: Tenant[]
  locale: Locale
  theme: Theme
  standaloneStudio: boolean
  developerModeOpen: boolean
  moduleTabs: Tab[]
  dirtyTabs: Set<string>
  error: string
  notice: string
  dashboard: Dashboard | null
  platformStatus: string
  selectedModuleMenu: ModuleMenuSelection | null
  pendingCustomerInvoiceId: string | null
  pendingPurchaseSupplier: { id: string; name: string } | null
  initialCustomerSearch: string
  globalSearchOpen: boolean
  globalSearchQuery: string
  globalSearchResults: GlobalSearchResult[]
  globalSearchPages: GlobalSearchResult[]
  globalQuickLinks: GlobalSearchResult[]
  globalSearchActiveIndex: number
  globalSearchInputRef: RefObject<HTMLInputElement | null>
  globalQuickMenuEditMode: boolean
  globalQuickMenuPageIds: string[]
  onToggleMenu: () => void
  onOpenSearch: () => void
  onThemeChange: (theme: Theme) => void
  onLocaleChange: (locale: Locale) => void
  onSelectTenant: (tenant: Tenant) => void | Promise<void>
  onSignOut: () => void
  onOpenCompanySettings: () => void
  onOpenDeveloperMode: () => void
  onCloseDeveloperMode: () => void
  onOpenLicenseSettings: () => void
  onOpenStudioSource: () => void
  onNavigate: (page: string) => void
  onCloseTab: (tabId: string) => void
  onMoveTab: (draggedId: string, targetId: string) => void
  onDismissError: () => void
  onDismissNotice: () => void
  onMarkDirty: (page: string) => void
  onSearchItems: (items: GlobalSearchResult[]) => void
  onSelectModule: (item: ModuleMenuSelection) => void
  onInitialInvoiceOpened: () => void
  onInitialSupplierOpened: () => void
  onOpenSalesInvoice: (id: string) => void
  onOpenPurchaseInvoices: (supplier: { id: string; name: string }) => void
  onOpenStudio: () => void
  onDevelopModuleStarter: (template: { code: string; moduleCode: string; name: string }) => void
  onQueryChange: (value: string) => void
  onMoveActiveIndex: (delta: number) => void
  onOpenSearchResult: (result: GlobalSearchResult) => void
  onCloseSearch: () => void
  onToggleEditMode: () => void
  onToggleQuickLink: (page: string) => void
  onShowMarketplace: () => void
  requestApi: ApiRequest
}

export function WorkspaceShellPage(props: Props) {
  const {
    page, token, tenant, tenants, locale, theme, standaloneStudio, developerModeOpen,
    moduleTabs, dirtyTabs, error, notice, dashboard, platformStatus, selectedModuleMenu,
    pendingCustomerInvoiceId, pendingPurchaseSupplier, initialCustomerSearch,
    globalSearchOpen, globalSearchQuery, globalSearchResults, globalSearchPages,
    globalQuickLinks, globalSearchActiveIndex, globalSearchInputRef, globalQuickMenuEditMode,
    globalQuickMenuPageIds, onToggleMenu, onOpenSearch, onThemeChange, onLocaleChange,
    onSelectTenant, onSignOut, onOpenCompanySettings, onOpenDeveloperMode,
    onCloseDeveloperMode, onOpenLicenseSettings, onOpenStudioSource, onNavigate, onCloseTab, onMoveTab, onDismissError,
    onDismissNotice, onMarkDirty, onSearchItems, onSelectModule, onInitialInvoiceOpened,
    onInitialSupplierOpened, onOpenSalesInvoice, onOpenPurchaseInvoices, onOpenStudio,
    onDevelopModuleStarter, onQueryChange, onMoveActiveIndex, onOpenSearchResult,
    onCloseSearch, onToggleEditMode, onToggleQuickLink, onShowMarketplace, requestApi
  } = props

  return <div className={`app-shell${standaloneStudio ? ' standalone-studio' : ''}`}>
    <div className="workspace-search-index" aria-hidden="true"><Suspense fallback={null}><TenantModuleNavigation token={token} page={page} onSearchItems={onSearchItems} onSelect={onSelectModule}/></Suspense></div>
    <main className="main-area">
      <WorkspaceTopbar locale={locale} tenant={tenant} tenants={tenants} theme={theme} standaloneStudio={standaloneStudio} developerModeOpen={developerModeOpen} onToggleMenu={onToggleMenu} onOpenSearch={onOpenSearch} onThemeChange={onThemeChange} onLocaleChange={onLocaleChange} onOpenDeveloperMode={onOpenDeveloperMode} onSelectTenant={onSelectTenant} onOpenCompanySettings={onOpenCompanySettings} onNavigate={onNavigate} onSignOut={onSignOut}/>
      {developerModeOpen && <Suspense fallback={null}><DeveloperModePanel page={page} locale={locale} token={token} onClose={onCloseDeveloperMode} onNavigate={onNavigate} onLicense={onOpenLicenseSettings} onOpenSource={onOpenStudioSource}/></Suspense>}
      {standaloneStudio && <StandaloneStudioHeader tenant={tenant} locale={locale} onReturn={() => window.location.assign('/')} onSignOut={onSignOut}/>}
      <WorkspaceTabs tabs={moduleTabs} activeId={page} locale={locale} dirtyTabs={dirtyTabs} onSelect={onNavigate} onClose={onCloseTab} onMove={onMoveTab}/>
      <section className="content" onInputCapture={event => { const target=event.target as HTMLElement; if (target.closest('form') && !target.closest('.customer-search, .customer-toolbar, .global-search-dialog')) onMarkDirty(page) }} onChangeCapture={event => { const target=event.target as HTMLElement; if (target.closest('form') && !target.closest('.customer-search, .customer-toolbar, .global-search-dialog')) onMarkDirty(page) }}>
        {error && <div className="alert inline-alert">{error}<button onClick={onDismissError}><X size={15}/></button></div>}
        {notice && <div className="notice">{notice}<button onClick={onDismissNotice}><X size={15}/></button></div>}
        <KeepAliveViews activeKey={page} openKeys={moduleTabs.map(tab => tab.id)}><Suspense fallback={<div className="panel page-loading" role="status">Sayfa yükleniyor…</div>}>
          <WorkspacePageRouter page={page} token={token} tenant={tenant} locale={locale} dashboard={dashboard} platformStatus={platformStatus} selectedModuleMenu={selectedModuleMenu} pendingCustomerInvoiceId={pendingCustomerInvoiceId} onInitialInvoiceOpened={onInitialInvoiceOpened} pendingPurchaseSupplier={pendingPurchaseSupplier} onInitialSupplierOpened={onInitialSupplierOpened} initialCustomerSearch={initialCustomerSearch} onOpenSalesInvoice={onOpenSalesInvoice} onOpenPurchaseInvoices={onOpenPurchaseInvoices} onNavigate={onNavigate} onLocaleChange={onLocaleChange} onThemeChange={onThemeChange} requestApi={requestApi} onOpenStudio={onOpenStudio} onDevelopModuleStarter={onDevelopModuleStarter}/>
        </Suspense></KeepAliveViews>
        <WorkspaceSearchDialog open={globalSearchOpen} locale={locale} query={globalSearchQuery} results={globalSearchResults} allItems={globalSearchPages} quickLinks={globalQuickLinks} activeIndex={globalSearchActiveIndex} inputRef={globalSearchInputRef} editMode={globalQuickMenuEditMode} quickMenuPageIds={globalQuickMenuPageIds} onQueryChange={onQueryChange} onMoveActiveIndex={onMoveActiveIndex} onOpenResult={onOpenSearchResult} onClose={onCloseSearch} onToggleEditMode={onToggleEditMode} onToggleQuickLink={onToggleQuickLink} onShowMarketplace={onShowMarketplace}/>
      </section>
    </main>
  </div>
}
