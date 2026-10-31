import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CustomerItem } from './erp-types'
import type { GlobalSearchResult, Locale } from './WorkspaceComponents'
import { api } from './erpApi'
import type { Tenant } from './erp-types'
import type { ModuleMenuSelection } from './ModuleMarketplacePage'

type Props = {
  pages: GlobalSearchResult[]
  quickLinks: GlobalSearchResult[]
  locale: Locale
  token: string
  tenant: Tenant | null
  page: string
  setPage: (page: string, label?: string) => void
  onSelectModule: (selection: ModuleMenuSelection) => void
}

export function useWorkspaceSearch({ pages, quickLinks, locale, token, tenant, page, setPage, onSelectModule }: Props) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [customers, setCustomers] = useState<CustomerItem[]>([])
  const [customerSearch, setCustomerSearch] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const normalizedQuery = query.trim().toLocaleLowerCase(locale === 'tr' ? 'tr-TR' : 'en-US')

  const results = useMemo<GlobalSearchResult[]>(() => {
    if (!normalizedQuery) return quickLinks
    const matchingPages = pages.filter(result => `${result.label} ${result.description}`.toLocaleLowerCase(locale === 'tr' ? 'tr-TR' : 'en-US').includes(normalizedQuery))
    const matchingCustomers = customers.map(customer => ({
      kind: 'customer' as const,
      label: customer.name,
      description: `${customer.code} · ${customer.type === 'Supplier' ? 'Tedarikçi' : customer.type === 'Both' ? 'Müşteri / Tedarikçi' : 'Müşteri'}`,
      query: query.trim()
    }))
    return [...matchingCustomers, ...matchingPages].slice(0, 10)
  }, [pages, quickLinks, customers, query, normalizedQuery, locale])

  const clearQuery = useCallback(() => {
    setQuery('')
    setCustomers([])
    setActiveIndex(0)
  }, [])

  const changeQuery = useCallback((nextQuery: string) => {
    setQuery(nextQuery)
    setCustomers([])
    setActiveIndex(0)
  }, [])

  const openSearch = useCallback(() => {
    clearQuery()
    setOpen(true)
    window.setTimeout(() => inputRef.current?.focus(), 0)
  }, [clearQuery])

  const toggleSearch = useCallback(() => {
    if (open) setOpen(false)
    else openSearch()
  }, [open, openSearch])

  const moveActiveIndex = useCallback((delta: number) => {
    setActiveIndex(current => Math.max(0, Math.min(results.length - 1, current + delta)))
  }, [results.length])

  const openResult = useCallback((result: GlobalSearchResult) => {
    if (result.kind === 'customer') {
      setCustomerSearch(result.query || result.label)
      setPage('customers')
    } else if (result.selection && result.page) {
      onSelectModule(result.selection)
      setPage(result.page, result.label)
    } else if (result.page) {
      setPage(result.page)
    }
    setActiveIndex(0)
    setOpen(false)
  }, [onSelectModule, setPage])

  useEffect(() => {
    if ((!open && page !== 'launcher') || normalizedQuery.length < 1 || !token || !tenant) return
    let active = true
    const timer = window.setTimeout(() => {
      void api<{ items: CustomerItem[]; totalCount: number }>(`/api/customers/?q=${encodeURIComponent(query.trim())}&page=1&pageSize=6`, token)
        .then(data => { if (active) setCustomers(data.items) })
        .catch(() => { if (active) setCustomers([]) })
    }, 180)
    return () => { active = false; window.clearTimeout(timer) }
  }, [open, page, normalizedQuery, query, token, tenant?.id])

  return {
    activeIndex, setActiveIndex, open, setOpen, query, customers, customerSearch,
    inputRef, normalizedQuery, results, clearQuery, changeQuery, openSearch,
    toggleSearch, moveActiveIndex, openResult
  }
}
