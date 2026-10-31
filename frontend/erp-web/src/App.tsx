import { WorkspaceAuthPage } from './WorkspaceAuthPage'
import { PlatformAdminShellPage } from './PlatformAdminShellPage'
import { EmbeddedStudioWaitingPage } from './EmbeddedStudioWaitingPage'
import { type GlobalSearchResult, type Locale } from './WorkspaceComponents'
import { WorkspaceShellPage } from './WorkspaceShellPage'
import { ModuleLauncher } from './ModuleLauncherPage'
import { useWorkspaceTabs } from './useWorkspaceTabs'
import { useWorkspaceShortcuts } from './useWorkspaceShortcuts'
import { useWorkspaceSearch } from './useWorkspaceSearch'
import type { ModuleMenuSelection } from './ModuleMarketplacePage'
import { useEffect, useMemo, useState } from 'react'
import './service-status.css'
import './erp-assistant.css'
import './erp-redesign.css'
import './inventory-management.css'
import './finance-workbench.css'
import './sales-purchasing-workbench.css'
import './security-workbench.css'
import './screen-design-system.css'
import './erp-navigation.css'
import { api } from './erpApi'
import { tokenKey, refreshTokenKey, activeTenantKey, platformAdminAvailableKey, platformSessionKey, workspaceStorageKey } from './workspace-storage'

import { financePageTitles } from './financeCatalog'
import { shellText, inventoryPageTitles, inventoryPageTitle, manufacturingPageTitles, manufacturingPageTitle, salesNavigationPages, purchasingNavigationPages, salesPageTitle } from './workspace-navigation'
import type { Theme, Tenant, Dashboard, InventoryPageKey, ManufacturingPageKey } from './erp-types'
export type * from './erp-types'











const defaultGlobalQuickMenuPages = ['customers','sales-invoices','sales-purchase-invoices','sales-orders','inventory-stock','finance-accounts','finance-maturities','reports']




export default function App() {
  const searchParams=new URLSearchParams(window.location.search)
  const standaloneStudio=searchParams.get('app')==='studio'
  const embeddedStudioTool=searchParams.get('embeddedStudio')==='1'
  const trustedStudioOrigin=(()=>{const configuredStudioUrl=import.meta.env.VITE_STUDIO_URL||(import.meta.env.DEV?'http://localhost:5174/':'https://nexorastudio.ozgurteknolojiyazilim.com/');try{return new URL(configuredStudioUrl,window.location.origin).origin}catch{return 'https://nexorastudio.ozgurteknolojiyazilim.com'}})()
  useEffect(()=>{document.documentElement.classList.toggle('embedded-studio-tool',embeddedStudioTool);return()=>document.documentElement.classList.remove('embedded-studio-tool')},[embeddedStudioTool])
  const [locale,setLocale]=useState<Locale>(()=>localStorage.getItem('aierp.locale')==='en'?'en':'tr')
  const [theme,setTheme]=useState<Theme>(()=>{const initialTheme=localStorage.getItem('aierp.theme')==='dark'?'dark':'light';document.documentElement.dataset.theme=initialTheme;return initialTheme})
  const tx=(key:string)=>shellText[locale][key]??key
  useEffect(()=>{document.documentElement.dataset.theme=theme;localStorage.setItem('aierp.theme',theme)},[theme])
  useEffect(()=>{
    if(locale!=='en')return
    let active=true;let observer:MutationObserver|undefined
    const root=document.getElementById('root')??document.body
    void import('./locale').then(({localizeMountedUi})=>{if(!active)return;const apply=()=>localizeMountedUi(root,locale);apply();observer=new MutationObserver(apply);observer.observe(root,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['placeholder','title','aria-label','aria-description','alt']})})
    return()=>{active=false;observer?.disconnect()}
  },[locale])
  function changeLocale(next: Locale) { setLocale(next); localStorage.setItem('aierp.locale', next); window.dispatchEvent(new Event('aierp:localechange')) }
  const studioUrl = import.meta.env.VITE_STUDIO_URL || (import.meta.env.DEV ? 'http://localhost:5174/' : '')
  const [token, setToken] = useState(localStorage.getItem(tokenKey) || '')
  const [tenant, setTenant] = useState<Tenant | null>(() => { try { return JSON.parse(localStorage.getItem(activeTenantKey) || 'null') } catch { return null } })
  useEffect(() => {
    if (!embeddedStudioTool) return
    const receiveStudioSession = (event: MessageEvent<unknown>) => {
      if (event.origin !== trustedStudioOrigin || event.source !== window.parent || !event.data || typeof event.data !== 'object') return
      const message = event.data as { type?: unknown; token?: unknown; tenant?: unknown }
      if (message.type !== 'NEXORA_STUDIO_AUTH' || typeof message.token !== 'string' || !message.token.trim() || !message.tenant || typeof message.tenant !== 'object') return
      const nextTenant = message.tenant as Partial<Tenant>
      if (typeof nextTenant.id !== 'string' || typeof nextTenant.name !== 'string' || typeof nextTenant.slug !== 'string' || typeof nextTenant.role !== 'string') return
      setToken(message.token)
      setTenant({ id: nextTenant.id, name: nextTenant.name, slug: nextTenant.slug, role: nextTenant.role })
    }
    window.addEventListener('message', receiveStudioSession)
    return () => window.removeEventListener('message', receiveStudioSession)
  }, [embeddedStudioTool, trustedStudioOrigin])
  const [tenants, setTenants] = useState<Tenant[]>(() => { try { return JSON.parse(localStorage.getItem('aierp.tenants') || '[]') } catch { return [] } })
  const [platformAdminAvailable, setPlatformAdminAvailable] = useState(localStorage.getItem(platformAdminAvailableKey) === 'true')
  const [platformSession, setPlatformSession] = useState(localStorage.getItem(platformSessionKey) === 'true')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [platformStatus, setPlatformStatus] = useState<'checking' | 'ready' | 'unavailable'>('checking')
  const [globalQuickMenuEditMode, setGlobalQuickMenuEditMode] = useState(false)
  const globalQuickMenuStorageKey = `aierp.quick-menu.${encodeURIComponent((localStorage.getItem('aierp.user')||'user').trim().toLocaleLowerCase('tr-TR'))}`
  const [globalQuickMenuPageIds, setGlobalQuickMenuPageIds] = useState<string[]>(()=>{
    try { const saved=localStorage.getItem(globalQuickMenuStorageKey); return saved===null?defaultGlobalQuickMenuPages:JSON.parse(saved) as string[] }
    catch { return defaultGlobalQuickMenuPages }
  })
  const [pendingCustomerInvoiceId,setPendingCustomerInvoiceId]=useState<string|null>(null)
  const [pendingPurchaseSupplier,setPendingPurchaseSupplier]=useState<{id:string;name:string}|null>(null)
  const [selectedModuleMenu, setSelectedModuleMenu] = useState<ModuleMenuSelection | null>(null)
  const [tenantModuleSearchItems,setTenantModuleSearchItems]=useState<GlobalSearchResult[]>([])
  const [tenantModuleSearchReady,setTenantModuleSearchReady]=useState(false)
  const [developerModeOpen, setDeveloperModeOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const globalSearchPages: GlobalSearchResult[] = useMemo(() => {
    const pageResults: GlobalSearchResult[] = [
      {page:'dashboard',label:tx('overview'),description:'Platform'},
      {page:'customers',label:tx('customers'),description:'Satış & cari'},
      {page:'crm-opportunities',label:tx('crm'),description:'Satış & cari'},
      ...Object.keys(inventoryPageTitles).map(key=>({page:key,label:inventoryPageTitle(key as InventoryPageKey,locale),description:tx('inventory')})),
      ...salesNavigationPages.map(key=>({page:key,label:salesPageTitle(key,locale),description:tx('sales')})),
      ...purchasingNavigationPages.filter(key=>!salesNavigationPages.includes(key)).map(key=>({page:key,label:salesPageTitle(key,locale),description:tx('purchasing')})),
      ...Object.entries(financePageTitles).map(([key,label])=>({page:key,label:locale==='en'?({ 'finance-accounts':'Cash & Bank','finance-statements':'Bank statements','finance-cash-flow':'Cash flow','finance-fx':'FX & valuation','finance-ledger':'General ledger','finance-budget':'Budget planning','finance-cash-budget':'Direct cash budget','finance-exposure':'FX exposure','finance-maturities':'Maturity tracking','finance-instruments':'Checks & promissory notes','finance-credit-facilities':'Loans & financing' } as Record<string,string>)[key]:label,description:tx('finance')})),
      ...Object.keys(manufacturingPageTitles).map(key=>({page:key,label:manufacturingPageTitle(key as ManufacturingPageKey,locale),description:tx('manufacturing')})),
      {page:'reports',label:tx('reports'),description:tx('platformTools')},
      {page:'audit',label:tx('audit'),description:tx('management')},
      {page:'access',label:tx('access'),description:tx('management')},
      {page:'settings',label:tx('settings'),description:tx('management')},
      {page:'ai-settings',label:locale==='en'?'AI provider settings':'AI sağlayıcı ayarları',description:tx('platformTools')}
    ]
    return [...pageResults,...tenantModuleSearchItems].filter(result=>!['audit','access','settings'].includes(result.page||'')||tenant?.role==='TenantAdmin')
  },[locale,tenant?.role,tenantModuleSearchItems])
  const { page, setActivePage, setPage, moduleTabs, setModuleTabs, dirtyTabs, setDirtyTabs, notice, setNotice, closeModuleTab, moveModuleTab, resetWorkspace } = useWorkspaceTabs({
    standaloneStudio,
    embeddedStudioTool,
    tenantId: tenant?.id,
    platformSession,
    locale,
    pageResults: globalSearchPages,
    onSelectModule: setSelectedModuleMenu
  })
  const dashboardSearchResult = globalSearchPages.find(result=>result.page==='dashboard')
  const globalQuickLinks = useMemo(() => [dashboardSearchResult,...globalQuickMenuPageIds.map(key=>globalSearchPages.find(result=>result.page===key))].filter((result,index,array):result is GlobalSearchResult=>Boolean(result)&&array.findIndex(item=>item?.page===result?.page)===index),[globalSearchPages,globalQuickMenuPageIds,dashboardSearchResult])
  const workspaceSearch = useWorkspaceSearch({ pages: globalSearchPages, quickLinks: globalQuickLinks, locale, token, tenant, page, setPage, onSelectModule: setSelectedModuleMenu })
  const { activeIndex: globalSearchActiveIndex, open: globalSearchOpen, setOpen: setGlobalSearchOpen, query: globalSearchQuery, customerSearch: globalCustomerSearch, inputRef: globalSearchInputRef, results: globalSearchResults, openSearch: openGlobalSearch, toggleSearch: toggleGlobalSearch, moveActiveIndex, changeQuery, openResult: runGlobalSearchResult, clearQuery: clearGlobalSearchQuery } = workspaceSearch
  useEffect(()=>{try{const saved=localStorage.getItem(globalQuickMenuStorageKey);setGlobalQuickMenuPageIds(saved===null?defaultGlobalQuickMenuPages:JSON.parse(saved) as string[])}catch{setGlobalQuickMenuPageIds(defaultGlobalQuickMenuPages)}},[globalQuickMenuStorageKey])
  function toggleGlobalQuickMenuPage(pageId:string) { setGlobalQuickMenuPageIds(current=>{const next=current.includes(pageId)?current.filter(id=>id!==pageId):[...current,pageId];localStorage.setItem(globalQuickMenuStorageKey,JSON.stringify(next));return next}) }
  useWorkspaceShortcuts({
    page,
    moduleTabs,
    searchOpen: globalSearchOpen,
    searchInputRef: globalSearchInputRef,
    onOpenSearch: openGlobalSearch,
    onToggleSearch: toggleGlobalSearch,
    onCloseSearch: () => setGlobalSearchOpen(false),
    onClearSearch: clearGlobalSearchQuery,
    onSelectTab: setPage,
    onCloseTab: closeModuleTab
  })
  useEffect(()=>{if(!tenantModuleSearchReady)return;const activeModule=tenantModuleSearchItems.find(item=>item.page===page);if(activeModule?.selection)setSelectedModuleMenu(activeModule.selection);else if(page.startsWith('module:')){setActivePage('launcher');setModuleTabs(current=>current.filter(tab=>!tab.id.startsWith('module:')))}},[tenantModuleSearchReady,tenantModuleSearchItems,page])
  useEffect(() => {
    if (!token) return
    const onTokenRefreshed = (event: Event) => {
      const refreshedToken = (event as CustomEvent<string>).detail
      if (refreshedToken) setToken(refreshedToken)
    }
    const onSessionExpired = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== token) return
      logout()
      setError(locale === 'en' ? 'Your session expired. Sign in again.' : 'Oturum süreniz doldu. Lütfen yeniden giriş yapın.')
    }
    window.addEventListener('aierp:token-refreshed', onTokenRefreshed)
    window.addEventListener('aierp:session-expired', onSessionExpired)
    return () => { window.removeEventListener('aierp:token-refreshed', onTokenRefreshed); window.removeEventListener('aierp:session-expired', onSessionExpired) }
  }, [token, locale])

  function openStudio(contextPage = page, section?: string) {
    if (!studioUrl) {
      setError('AI Development Studio adresi yapılandırılmamış. Üretim ortamında VITE_STUDIO_URL değerini ayarlayın.')
      return
    }
    const destination = new URL(studioUrl, window.location.origin)
    destination.searchParams.set('contextPage', contextPage)
    destination.searchParams.set('platformOrigin', window.location.origin)
    const labels: Record<string, string> = { dashboard: 'Genel Bakış', customers: 'Cari Yönetimi', 'crm-opportunities': 'CRM Fırsatları', 'human-resources': 'İnsan Kaynakları', 'fixed-assets': 'Sabit Kıymetler', 'manufacturing-recipes': 'Tanımlı Reçeteler', 'manufacturing-recipe-create': 'Reçete Oluştur', 'manufacturing-work-centers': 'İş Merkezleri', 'manufacturing-orders': 'Üretim Emirleri', 'manufacturing-mrp': 'Malzeme Planlama', 'inventory-stock': 'Stok Kartları', 'inventory-warehouses': 'Depo Yönetimi', 'sales-quotes': 'Satış Teklifleri', 'sales-orders': 'Satış Siparişleri', 'sales-invoices': 'Satış Faturaları', 'sales-deliveries': 'İrsaliyeler', 'sales-purchase-invoices': 'Alış Faturaları', 'sales-purchase-receipts': 'Mal Kabulleri', 'finance-accounts': 'Kasa ve Banka', 'finance-ledger': 'Genel Muhasebe', 'custom-forms': 'Özel Formlar', 'custom-lists': 'Dinamik Listeler', 'custom-menus': 'Özel Menüler', workflows: 'İş Akışları', 'business-rules': 'İş Kuralları', reports: 'Raporlar' }
    destination.searchParams.set('contextLabel', (selectedModuleMenu?.entry.label || labels[contextPage] || contextPage).slice(0, 100))
    if (section) destination.hash = section
    window.open(destination.toString(), '_blank', 'noopener,noreferrer')
  }

  function openStudioForModuleStarter(template: { code: string; moduleCode: string; name: string }) {
    if (!studioUrl) {
      setError('AI Development Studio adresi yapılandırılmamış. Üretim ortamında VITE_STUDIO_URL değerini ayarlayın.')
      return
    }
    const destination = new URL(studioUrl, window.location.origin)
    destination.searchParams.set('contextPage', `module:${template.moduleCode}:starter`)
    destination.searchParams.set('contextLabel', template.name)
    destination.searchParams.set('moduleStarter', template.code)
    destination.searchParams.set('platformOrigin', window.location.origin)
    window.open(destination.toString(), '_blank', 'noopener,noreferrer')
  }

  useEffect(() => { if (token && tenant) void loadTenantData(token) }, [token, tenant?.id])
  async function loadTenantData(access: string) {
    setPlatformStatus('checking')
    setError('')
    try {
      setDashboard(await api<Dashboard>('/api/dashboard', access))
      setPlatformStatus('ready')
    } catch (e) { setDashboard(null); setPlatformStatus('unavailable'); setError((e as Error).message) }
    try {
      const currentAccess = localStorage.getItem(tokenKey) || access
      const accessibleTenants = await api<Tenant[]>('/api/auth/tenants', currentAccess)
      const companyList = tenant && !accessibleTenants.some(item => item.id === tenant.id) ? [tenant, ...accessibleTenants] : accessibleTenants
      setTenants(companyList)
      localStorage.setItem('aierp.tenants', JSON.stringify(companyList))
    } catch { /* Keep the login-provided list if the membership refresh is temporarily unavailable. */ }
  }
  async function login(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('')
    try {
      const result = await api<{ accessToken: string; displayName: string; platformAdminAvailable: boolean; tenants: Tenant[] }>('/api/auth/login', undefined, { method: 'POST', body: JSON.stringify({ email, password }) })
      localStorage.setItem(tokenKey, result.accessToken); localStorage.setItem('aierp.user', result.displayName); localStorage.setItem('aierp.tenants', JSON.stringify(result.tenants)); setToken(result.accessToken); setTenants(result.tenants)
      localStorage.setItem(platformAdminAvailableKey, String(result.platformAdminAvailable)); setPlatformAdminAvailable(result.platformAdminAvailable); setPlatformSession(false); localStorage.removeItem(platformSessionKey)
      if (result.tenants.length === 1 && !result.platformAdminAvailable) await selectTenant(result.tenants[0], result.accessToken)
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  async function selectTenant(item: Tenant, access = token) {
    setBusy(true); setError('')
    try {
      const result = await api<{ accessToken: string; refreshToken: string; tenant: Tenant }>('/api/auth/select-tenant', access, { method: 'POST', body: JSON.stringify({ tenantId: item.id }) })
      localStorage.setItem(tokenKey, result.accessToken); localStorage.setItem(activeTenantKey, JSON.stringify(result.tenant))
      localStorage.setItem(refreshTokenKey, result.refreshToken)
      localStorage.removeItem(platformSessionKey); setPlatformSession(false)
      setTenant(result.tenant); setToken(result.accessToken)
      setPage('launcher')
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  async function selectPlatformAdmin() {
    setBusy(true); setError('')
    try {
      const result = await api<{ accessToken: string }>('/api/auth/platform/select', token, { method: 'POST' })
      if (!result.accessToken) throw new Error('Platform oturum yanıtı eksik.')
      localStorage.setItem(tokenKey, result.accessToken)
      localStorage.removeItem(refreshTokenKey); localStorage.removeItem(activeTenantKey); localStorage.removeItem('aierp.tenants')
      localStorage.setItem(platformSessionKey, 'true')
      setToken(result.accessToken); setTenant(null); setTenants([]); setDashboard(null); setPlatformSession(true); setPage('platform-tenants')
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  function logout() {
    const refreshToken = localStorage.getItem(refreshTokenKey)
    const isPlatformSession = localStorage.getItem(platformSessionKey) === 'true'
    if(tenant?.id)sessionStorage.removeItem(workspaceStorageKey(tenant.id))
    localStorage.removeItem(tokenKey); localStorage.removeItem(refreshTokenKey); localStorage.removeItem(activeTenantKey); localStorage.removeItem('aierp.tenants'); localStorage.removeItem('aierp.user'); localStorage.removeItem(platformSessionKey); localStorage.removeItem(platformAdminAvailableKey)
    if (isPlatformSession) void fetch('/api/auth/platform/logout', { method: 'POST', headers: { 'X-Platform-Session': 'cookie' }, credentials: 'same-origin' }).catch(() => {})
    else if (refreshToken) void fetch('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken }) }).catch(() => {})
    setToken(''); setTenant(null); setDashboard(null); setPlatformStatus('checking'); setTenants([]); setPlatformSession(false); setPlatformAdminAvailable(false); resetWorkspace()
  }
  if (!embeddedStudioTool && !tenant && platformSession) return <PlatformAdminShellPage page={page} token={token} locale={locale} onNavigate={setPage} onLocaleChange={changeLocale} onSignOut={logout}/>
  if (embeddedStudioTool && (!token || !tenant)) return <EmbeddedStudioWaitingPage/>
  if (!tenant) return <WorkspaceAuthPage
    locale={locale}
    theme={theme}
    onThemeChange={setTheme}
    hasSession={Boolean(token)}
    tenants={tenants}
    busy={busy}
    error={error}
    email={email}
    password={password}
    platformAdminAvailable={platformAdminAvailable}
    onLocaleChange={changeLocale}
    onEmailChange={setEmail}
    onPasswordChange={setPassword}
    onLogin={login}
    onSelectTenant={tenant => { void selectTenant(tenant) }}
    onSelectPlatformAdmin={() => { void selectPlatformAdmin() }}
    onSignOut={logout}
  />

  if (!embeddedStudioTool && !standaloneStudio && tenant && page === 'launcher') return <ModuleLauncher tenant={tenant} tenants={tenants} canDefineCompany={platformAdminAvailable} onSelectTenant={item=>{void selectTenant(item)}} onDefineCompany={()=>{void selectPlatformAdmin()}} userInitial={(localStorage.getItem('aierp.user')||'A').slice(0,1).toUpperCase()} locale={locale} query={globalSearchQuery} results={globalSearchResults} allItems={globalSearchPages} quickLinks={globalQuickLinks} activeIndex={globalSearchActiveIndex} inputRef={globalSearchInputRef} onMoveActiveIndex={moveActiveIndex} theme={theme} onLocaleChange={changeLocale} onThemeToggle={()=>setTheme(current=>current==='dark'?'light':'dark')} onQueryChange={changeQuery} onOpenResult={runGlobalSearchResult} onShowModules={()=>setPage('modules')} editMode={globalQuickMenuEditMode} quickMenuPageIds={globalQuickMenuPageIds} onToggleEditMode={()=>setGlobalQuickMenuEditMode(value=>!value)} onToggleQuickLink={toggleGlobalQuickMenuPage} onSignOut={logout}/>
    return <WorkspaceShellPage
      page={page}
      token={token}
      tenant={tenant}
      tenants={tenants}
      locale={locale}
      theme={theme}
      standaloneStudio={standaloneStudio}
      developerModeOpen={developerModeOpen}
      moduleTabs={moduleTabs}
      dirtyTabs={dirtyTabs}
      error={error}
      notice={notice}
      dashboard={dashboard}
      platformStatus={platformStatus}
      selectedModuleMenu={selectedModuleMenu}
      pendingCustomerInvoiceId={pendingCustomerInvoiceId}
      pendingPurchaseSupplier={pendingPurchaseSupplier}
      initialCustomerSearch={globalCustomerSearch}
      globalSearchOpen={globalSearchOpen}
      globalSearchQuery={globalSearchQuery}
      globalSearchResults={globalSearchResults}
      globalSearchPages={globalSearchPages}
      globalQuickLinks={globalQuickLinks}
      globalSearchActiveIndex={globalSearchActiveIndex}
      globalSearchInputRef={globalSearchInputRef}
      globalQuickMenuEditMode={globalQuickMenuEditMode}
      globalQuickMenuPageIds={globalQuickMenuPageIds}
      onToggleMenu={toggleGlobalSearch}
      onOpenSearch={openGlobalSearch}
      onThemeChange={setTheme}
      onLocaleChange={changeLocale}
      onSelectTenant={selectTenant}
      onSignOut={logout}
      onOpenCompanySettings={() => setPage('company-settings')}
      onOpenDeveloperMode={() => { setDeveloperModeOpen(false); openStudio(page, 'adaptation') }}
      onCloseDeveloperMode={() => setDeveloperModeOpen(false)}
      onOpenLicenseSettings={() => { setDeveloperModeOpen(false); setPage('license-settings') }}
      onOpenStudioSource={() => { setDeveloperModeOpen(false); openStudio(page) }}
      onNavigate={setPage}
      onCloseTab={closeModuleTab}
      onMoveTab={moveModuleTab}
      onDismissError={() => setError('')}
      onDismissNotice={() => setNotice('')}
      onMarkDirty={dirtyPage => setDirtyTabs(current => new Set(current).add(dirtyPage))}
      onSearchItems={items => { setTenantModuleSearchItems(items); setTenantModuleSearchReady(true) }}
      onSelectModule={item => { setSelectedModuleMenu(item); setPage(`module:${item.moduleCode}:${item.entry.code}`, item.entry.label) }}
      onInitialInvoiceOpened={() => setPendingCustomerInvoiceId(null)}
      onInitialSupplierOpened={() => setPendingPurchaseSupplier(null)}
      onOpenSalesInvoice={id => { setPendingCustomerInvoiceId(id); setPage('sales-invoices') }}
      onOpenPurchaseInvoices={supplier => { setPendingPurchaseSupplier(supplier); setPage('sales-purchase-invoices') }}
      onOpenStudio={() => openStudio()}
      onDevelopModuleStarter={openStudioForModuleStarter}
      onQueryChange={changeQuery}
      onMoveActiveIndex={moveActiveIndex}
      onOpenSearchResult={runGlobalSearchResult}
      onCloseSearch={() => setGlobalSearchOpen(false)}
      onToggleEditMode={() => setGlobalQuickMenuEditMode(value => !value)}
      onToggleQuickLink={toggleGlobalQuickMenuPage}
      onShowMarketplace={() => { setGlobalSearchOpen(false); setPage('modules') }}
      requestApi={api}
    />
}





