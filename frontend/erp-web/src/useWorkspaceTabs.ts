import { useCallback, useEffect, useRef, useState } from 'react'
import type { GlobalSearchResult, Locale } from './WorkspaceComponents'
import type { ModuleMenuSelection } from './ModuleMarketplacePage'
import { getInitialPage, isPersistablePage, readWorkspacePreferences, readWorkspaceTabs, workspaceStorageKey } from './workspace-storage'
import { standalonePageTitle } from './workspace-navigation'
import { CLOSE_PAGE_EVENT, forgetOpener, OPEN_PAGE_EVENT, RECORDS_DELETED_EVENT, setPageParams, tabRecordIds, type RecordsDeletedDetail, type WorkspaceOpenRequest } from './pageNavigation'

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

const tabLimitNotice = (locale: Locale) =>
  locale === 'en' ? 'Close a workspace tab before opening another screen.' : 'Yeni ekran açmak için önce bir çalışma sekmesini kapatın.'
export const isTabLimitNotice = (text: string) => text === tabLimitNotice('en') || text === tabLimitNotice('tr')

export function useWorkspaceTabs({ standaloneStudio, embeddedStudioTool, tenantId, platformSession, locale, pageResults, onSelectModule }: Props) {
  const [page, setActivePage] = useState<string>(() => getInitialPage(standaloneStudio, embeddedStudioTool))
  const [moduleTabs, setModuleTabs] = useState<Tab[]>(() => readWorkspaceTabs(tenantId))
  const [dirtyTabs, setDirtyTabs] = useState<Set<string>>(() => new Set())
  const [notice, setNotice] = useState('')
  const [pendingCloseTab, setPendingCloseTab] = useState<string | null>(null)
  // The tab-limit warning is only true while the limit blocks a screen: opening one or closing a tab removes it.
  const clearTabLimitNotice = useCallback(() => setNotice(current => isTabLimitNotice(current) ? '' : current), [])
  // The tab that opened each tab through a page action (list → card): closing a deleted record's card returns there.
  const openers = useRef(new Map<string, string>())
  // Several deletes may land before the next render (bulk delete): the handler reads and advances these, not the render's values.
  const latestTabs = useRef({ moduleTabs, page })
  latestTabs.current = { moduleTabs, page }

  /** Opens (or switches to) a tab; false when the tab limit refused it. */
  const setPage = useCallback((nextPage: string, labelOverride?: string): boolean => {
    if (nextPage === 'launcher' || nextPage === 'dashboard') {
      setActivePage('launcher')
      return true
    }
    const result = pageResults.find(item => item.page === nextPage)
    if (result?.selection) onSelectModule(result.selection)
    const pageLabel = nextPage === 'erp-assistant' ? (locale === 'en' ? 'AI ERP Assistant' : 'AI ERP Asistanı') : nextPage === 'sales-order-create' ? (locale === 'en' ? 'New sales order' : 'Yeni Sipariş') : nextPage === 'sales-quote-create' ? (locale === 'en' ? 'New quote' : 'Yeni Teklif') : nextPage === 'customer-edit' ? (locale === 'en' ? 'Edit Customer' : 'Cari Düzenle') : undefined
    const knownLabel = labelOverride || pageLabel || result?.label || standalonePageTitle(nextPage, locale) || (nextPage.startsWith('module:') ? nextPage.split(':').at(-1) || 'Modül' : undefined)
    // Başlığı bilinmeyen ekranda ham anahtar yalnızca yeni sekmede kullanılır; var olan sekmenin başlığı ezilmez.
    const label = knownLabel || nextPage.replace(/[-_]/g, ' ')
    let pendingCustomerAction = false
    try {
      const action = JSON.parse(sessionStorage.getItem('nexora.customer-sales-action') || 'null') as { page?: string; customerId?: string } | null
      pendingCustomerAction = action?.page === nextPage && Boolean(action.customerId)
    } catch { /* Session storage is optional; keep the normal tab limit if unavailable. */ }
    // The latest tabs, not the render's: a tab closed by an event just before this open (CLOSE_PAGE_EVENT) no longer counts.
    const openTabs = latestTabs.current.moduleTabs
    if (!pendingCustomerAction && !openTabs.some(tab => tab.id === nextPage) && openTabs.length >= 12) {
      setNotice(tabLimitNotice(locale))
      return false
    }
    clearTabLimitNotice()
    setActivePage(nextPage)
    setModuleTabs(current => current.some(tab => tab.id === nextPage)
      ? current.map(tab => tab.id === nextPage ? { ...tab, label: knownLabel || tab.label } : tab)
      : [...current, { id: nextPage, label }])
    return true
  }, [pageResults, moduleTabs, locale, onSelectModule, clearTabLimitNotice])

  /**
   * Özel sayfanın gezinme eylemi: `replace` ise hedef, açan sekmenin (`from`) yerine açılır. Açan sekme açık değilse, kirliyse
   * ya da hedef zaten açıksa hedef normal yolla (yeni sekme ya da var olan sekmeye geçiş) açılır.
   */
  useEffect(() => {
    const onOpen = (event: Event) => {
      const request = (event as CustomEvent<WorkspaceOpenRequest>).detail
      if (!request || typeof request.page !== 'string' || request.page === '') return
      const from = request.from
      // `keepParams` (back to the opener after a record save/delete): the returning card is not the opener's opener.
      if (from && from !== request.page && !request.keepParams) openers.current.set(request.page, from)
      if (request.notice) setNotice(request.notice)
      const canReplace = request.replace && !!from && from !== request.page && request.page !== 'launcher' && request.page !== 'dashboard'
        && moduleTabs.some(tab => tab.id === from) && !moduleTabs.some(tab => tab.id === request.page) && !dirtyTabs.has(from)
      if (!canReplace) {
        // A refused open (tab limit) did not open the tab: the opener openWorkspacePage recorded for it is dropped.
        if (!setPage(request.page) && !request.keepParams) { forgetOpener(request.page); openers.current.delete(request.page) }
        return
      }
      const result = pageResults.find(item => item.page === request.page)
      if (result?.selection) onSelectModule(result.selection)
      const label = result?.label || standalonePageTitle(request.page, locale) || request.page.replace(/[-_]/g, ' ')
      clearTabLimitNotice()
      setActivePage(request.page)
      setModuleTabs(current => current.map(tab => tab.id === from ? { id: request.page, label } : tab))
      if (from) {
        openers.current.delete(request.page)
        // The replaced tab is gone: opened again later (menu, rail) it was opened directly, not by its old opener.
        openers.current.delete(from)
        forgetOpener(from)
      }
    }
    window.addEventListener(OPEN_PAGE_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_PAGE_EVENT, onOpen)
  }, [moduleTabs, dirtyTabs, pageResults, locale, onSelectModule, setPage, clearTabLimitNotice])

  const removeModuleTab = useCallback((tabId: string) => {
    if (tabId === 'dashboard') return
    const nextTabs = moduleTabs.filter(tab => tab.id !== tabId)
    setModuleTabs(nextTabs)
    // A closed tab forgets its page params: reopening it from the menu or the rail starts without the last record (e.g. a
    // card opened for editing with `customerId` reopens as a new card).
    setPageParams(tabId, {})
    openers.current.delete(tabId)
    forgetOpener(tabId)
    clearTabLimitNotice()
    setDirtyTabs(current => { const next = new Set(current); next.delete(tabId); return next })
    if (page === tabId) setPage(nextTabs.at(-1)?.id || 'launcher')
  }, [moduleTabs, page, setPage, clearTabLimitNotice])

  /**
   * A deleted record's tabs close without the unsaved-changes prompt (the record no longer exists); other tabs keep their
   * state. `from` (the deleting tab, else the active one) stays open unless `closeSource`. An active closed tab hands over
   * to the tab that opened it, else to the deleting tab, else to the last remaining tab.
   */
  useEffect(() => {
    const onDeleted = (event: Event) => {
      const detail = (event as CustomEvent<RecordsDeletedDetail>).detail
      if (!detail || !Array.isArray(detail.ids) || detail.ids.length === 0) return
      const deleted = new Set(detail.ids)
      const { moduleTabs, page } = latestTabs.current
      const source = detail.from ?? page
      const closing = new Set(moduleTabs.filter(tab => tab.id !== 'dashboard' && (tab.id !== source || detail.closeSource === true)
        && [...tabRecordIds(tab.id)].some(id => deleted.has(id))).map(tab => tab.id))
      if (closing.size === 0) return
      const nextTabs = moduleTabs.filter(tab => !closing.has(tab.id))
      let nextPage = page
      setModuleTabs(nextTabs)
      for (const tabId of closing) setPageParams(tabId, {})
      clearTabLimitNotice()
      setDirtyTabs(current => { const next = new Set(current); for (const tabId of closing) next.delete(tabId); return next })
      setPendingCloseTab(current => current && closing.has(current) ? null : current)
      if (closing.has(page)) {
        const open = (tabId: string | undefined) => tabId && nextTabs.some(tab => tab.id === tabId) ? tabId : undefined
        nextPage = open(openers.current.get(page)) || open(source) || nextTabs.at(-1)?.id || 'launcher'
        setPage(nextPage)
      }
      for (const tabId of closing) { openers.current.delete(tabId); forgetOpener(tabId) }
      latestTabs.current = { moduleTabs: nextTabs, page: nextPage === 'dashboard' ? 'launcher' : nextPage }
    }
    window.addEventListener(RECORDS_DELETED_EVENT, onDeleted)
    return () => window.removeEventListener(RECORDS_DELETED_EVENT, onDeleted)
  }, [setPage, clearTabLimitNotice])

  /**
   * A page asks to close its own tab without the unsaved-changes prompt (requestClosePage: a record card after its save or
   * delete). It reads and advances the latest tabs like a delete, so an open request right after it (back to the opener) sees
   * the tab already gone. An active closed tab hands over to the tab that opened it, else to the last remaining tab.
   */
  useEffect(() => {
    const onClose = (event: Event) => {
      const tabId = (event as CustomEvent<{ page?: unknown }>).detail?.page
      if (typeof tabId !== 'string' || tabId === '' || tabId === 'dashboard') return
      const { moduleTabs, page } = latestTabs.current
      setPageParams(tabId, {})
      forgetOpener(tabId)
      if (!moduleTabs.some(tab => tab.id === tabId)) { openers.current.delete(tabId); return }
      const nextTabs = moduleTabs.filter(tab => tab.id !== tabId)
      let nextPage = page
      setModuleTabs(current => current.filter(tab => tab.id !== tabId))
      clearTabLimitNotice()
      setDirtyTabs(current => { const next = new Set(current); next.delete(tabId); return next })
      setPendingCloseTab(current => current === tabId ? null : current)
      latestTabs.current = { moduleTabs: nextTabs, page }
      if (page === tabId) {
        const opener = openers.current.get(tabId)
        nextPage = (opener && nextTabs.some(tab => tab.id === opener) ? opener : undefined) || nextTabs.at(-1)?.id || 'launcher'
        setPage(nextPage)
      }
      openers.current.delete(tabId)
      latestTabs.current = { moduleTabs: nextTabs, page: nextPage === 'dashboard' ? 'launcher' : nextPage }
    }
    window.addEventListener(CLOSE_PAGE_EVENT, onClose)
    return () => window.removeEventListener(CLOSE_PAGE_EVENT, onClose)
  }, [setPage, clearTabLimitNotice])

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
