import { useCallback, useEffect, useState } from 'react'
import type { GlobalSearchResult, Locale } from './WorkspaceComponents'
import type { ModuleMenuSelection } from './ModuleMarketplacePage'
import { getInitialPage, isPersistablePage, readWorkspacePreferences, readWorkspaceTabs, workspaceStorageKey } from './workspace-storage'

type Tab = { id: string; label: string }
type Props = {
  standaloneStudio: boolean
  embeddedStudioTool: boolean
  tenantId?: string
  platformSession: boolean
  locale: Locale
  pageResults: GlobalSearchResult[]
  onSelectModule: (selection: ModuleMenuSelection) => void
}

export function useWorkspaceTabs({ standaloneStudio, embeddedStudioTool, tenantId, platformSession, locale, pageResults, onSelectModule }: Props) {
  const [page, setActivePage] = useState<string>(() => getInitialPage(standaloneStudio, embeddedStudioTool))
  const [moduleTabs, setModuleTabs] = useState<Tab[]>(() => readWorkspaceTabs(tenantId))
  const [dirtyTabs, setDirtyTabs] = useState<Set<string>>(() => new Set())
  const [notice, setNotice] = useState('')
  const [pendingCloseTab, setPendingCloseTab] = useState<string | null>(null)

  const setPage = useCallback((nextPage: string, labelOverride?: string) => {
    if (nextPage === 'launcher' || nextPage === 'dashboard') {
      setActivePage('launcher')
      return
    }
    const result = pageResults.find(item => item.page === nextPage)
    if (result?.selection) onSelectModule(result.selection)
    const pageLabel = nextPage === 'erp-assistant' ? (locale === 'en' ? 'AI ERP Assistant' : 'AI ERP Asistanı') : nextPage === 'sales-order-create' ? (locale === 'en' ? 'New sales order' : 'Yeni Sipariş') : nextPage === 'sales-quote-create' ? (locale === 'en' ? 'New quote' : 'Yeni Teklif') : nextPage === 'customer-edit' ? (locale === 'en' ? 'Edit Customer' : 'Cari Düzenle') : undefined
    const label = labelOverride || pageLabel || result?.label || (nextPage === 'modules' ? (locale === 'en' ? 'Module marketplace' : 'Modül pazaryeri') : nextPage.startsWith('module:') ? result?.label || nextPage.split(':').at(-1) || 'Modül' : nextPage.replace(/[-_]/g, ' '))
    let pendingCustomerAction = false
    try {
      const action = JSON.parse(sessionStorage.getItem('nexora.customer-sales-action') || 'null') as { page?: string; customerId?: string } | null
      pendingCustomerAction = action?.page === nextPage && Boolean(action.customerId)
    } catch { /* Session storage is optional; keep the normal tab limit if unavailable. */ }
    if (!pendingCustomerAction && !moduleTabs.some(tab => tab.id === nextPage) && moduleTabs.length >= 12) {
      setNotice(locale === 'en' ? 'Close a workspace tab before opening another screen.' : 'Yeni ekran açmak için önce bir çalışma sekmesini kapatın.')
      return
    }
    setActivePage(nextPage)
    setModuleTabs(current => current.some(tab => tab.id === nextPage)
      ? current.map(tab => tab.id === nextPage ? { ...tab, label } : tab)
      : [...current, { id: nextPage, label }])
  }, [pageResults, moduleTabs, locale, onSelectModule])

  const removeModuleTab = useCallback((tabId: string) => {
    if (tabId === 'dashboard') return
    const nextTabs = moduleTabs.filter(tab => tab.id !== tabId)
    setModuleTabs(nextTabs)
    setDirtyTabs(current => { const next = new Set(current); next.delete(tabId); return next })
    if (page === tabId) setPage(nextTabs.at(-1)?.id || 'launcher')
  }, [moduleTabs, page, setPage])

  const closeModuleTab = useCallback((tabId: string) => {
    if (tabId === 'dashboard') return
    if (dirtyTabs.has(tabId) && readWorkspacePreferences().confirmTabClose !== false) {
      setPendingCloseTab(tabId)
      return
    }
    removeModuleTab(tabId)
  }, [dirtyTabs, removeModuleTab])

  const confirmCloseModuleTab = useCallback(() => {
    if (pendingCloseTab) removeModuleTab(pendingCloseTab)
    setPendingCloseTab(null)
  }, [pendingCloseTab, removeModuleTab])

  const moveModuleTab = useCallback((draggedId: string, targetId: string) => {
    if (draggedId === targetId) return
    setModuleTabs(current => {
      const from = current.findIndex(tab => tab.id === draggedId)
      const to = current.findIndex(tab => tab.id === targetId)
      if (from < 0 || to < 0) return current
      const next = [...current]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }, [])

  const resetWorkspace = useCallback(() => {
    setModuleTabs([])
    setActivePage('launcher')
    setDirtyTabs(new Set())
  }, [])

  const markTabClean = useCallback(() => setDirtyTabs(current => { const next = new Set(current); next.delete(page); return next }), [page])

  useEffect(() => {
    if (!tenantId || platformSession || standaloneStudio || page.startsWith('custom-page-preview:')) return
    const safeTabs = moduleTabs.filter(tab => isPersistablePage(tab.id))
    try {
      if (readWorkspacePreferences().rememberTabs === false) sessionStorage.removeItem(workspaceStorageKey(tenantId))
      else sessionStorage.setItem(workspaceStorageKey(tenantId), JSON.stringify({ tabs: safeTabs, activePage: isPersistablePage(page) ? page : 'launcher' }))
    } catch { /* Workspace restore is optional when browser storage is unavailable. */ }
  }, [page, moduleTabs, tenantId, platformSession, standaloneStudio])

  useEffect(() => {
    if (page.startsWith('custom-page-preview:')) return
    const persistAfterPreferenceChange = () => {
      if (!tenantId || platformSession || standaloneStudio) return
      const safeTabs = moduleTabs.filter(tab => isPersistablePage(tab.id))
      try {
        const preferences = readWorkspacePreferences()
        if (preferences.rememberTabs === false || preferences.restoreTabs === false) sessionStorage.removeItem(workspaceStorageKey(tenantId))
        else sessionStorage.setItem(workspaceStorageKey(tenantId), JSON.stringify({ tabs: safeTabs, activePage: isPersistablePage(page) ? page : 'launcher' }))
      } catch { /* Workspace restore is optional when browser storage is unavailable. */ }
    }
    window.addEventListener('nexora:preferences-saved', persistAfterPreferenceChange)
    return () => window.removeEventListener('nexora:preferences-saved', persistAfterPreferenceChange)
  }, [page, moduleTabs, tenantId, platformSession, standaloneStudio])

  useEffect(() => {
    window.addEventListener('nexora:workspace-clean', markTabClean)
    return () => window.removeEventListener('nexora:workspace-clean', markTabClean)
  }, [markTabClean])

  return { page, setActivePage, setPage, moduleTabs, setModuleTabs, dirtyTabs, setDirtyTabs, notice, setNotice, closeModuleTab, confirmCloseModuleTab, pendingCloseTab, cancelCloseModuleTab: () => setPendingCloseTab(null), moveModuleTab, resetWorkspace }
}
