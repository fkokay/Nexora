import { useEffect, useState } from 'react'
import { authenticatedFetch } from './authApi'
import SupplierQuoteDetailPane from './purchase-supplier-quotes/components/SupplierQuoteDetailPane'
import SupplierQuotesFilters from './purchase-supplier-quotes/components/SupplierQuotesFilters'
import SupplierQuotesHeader from './purchase-supplier-quotes/components/SupplierQuotesHeader'
import SupplierQuotesPagination from './purchase-supplier-quotes/components/SupplierQuotesPagination'
import SupplierQuotesSummary from './purchase-supplier-quotes/components/SupplierQuotesSummary'
import SupplierQuotesTable from './purchase-supplier-quotes/components/SupplierQuotesTable'
import type { Quote, QuoteDetail, QuotePage } from './purchase-supplier-quotes/types'

type Props = { token: string; onOpenRequests: () => void }

async function request<T>(url: string, token: string): Promise<T> {
  const response = await authenticatedFetch(url, token, { headers: { Authorization: `Bearer ${token}` } })
  if (!response.ok) {
    let message = `İstek başarısız (${response.status})`
    try {
      const body = await response.json()
      message = body.error || body.title || message
    } catch {
      // Response may be empty.
    }
    throw new Error(message)
  }
  return await response.json() as T
}

export default function PurchaseSupplierQuotesPage({ token, onOpenRequests }: Props) {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [data, setData] = useState<QuotePage | null>(null)
  const [selected, setSelected] = useState<Quote | null>(null)
  const [detail, setDetail] = useState<QuoteDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    const params = new URLSearchParams({ page: String(page), pageSize: '50' })
    if (search.trim()) params.set('search', search.trim())
    if (status) params.set('status', status)
    request<QuotePage>(`/api/purchasing/supplier-quotes/?${params}`, token)
      .then(result => {
        if (cancelled) return
        setData(result)
        setSelected(current => current && result.items.some(item => item.id === current.id)
          ? result.items.find(item => item.id === current.id) ?? null
          : result.items[0] ?? null)
      })
      .catch(error => {
        if (!cancelled) setError((error as Error).message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [token, page, search, status])

  useEffect(() => {
    let cancelled = false
    setDetail(null)
    if (!selected) return
    request<QuoteDetail[]>(`/api/purchasing/requests/${selected.purchaseRequestId}/supplier-quotes`, token)
      .then(items => {
        if (!cancelled) setDetail(items.find(item => item.id === selected.id) ?? null)
      })
      .catch(error => {
        if (!cancelled) setError((error as Error).message)
      })
    return () => { cancelled = true }
  }, [token, selected?.id])

  const pages = Math.max(1, Math.ceil((data?.totalCount ?? 0) / 50))

  return (
    <div className="purchase-requests-page supplier-quotes-page">
      <SupplierQuotesHeader onOpenRequests={onOpenRequests} />
      <SupplierQuotesSummary totalCount={data?.totalCount ?? 0} />
      {error && <div role="alert" className="inline-error">{error}</div>}
      <div className={`supplier-quotes-workspace${selected ? ' has-selection' : ''}`}>
        <section className="supplier-quotes-list" aria-label="Tedarikçi teklif listesi">
          <SupplierQuotesFilters
            search={search}
            status={status}
            onSearchChange={value => { setPage(1); setSearch(value) }}
            onStatusChange={value => { setPage(1); setStatus(value) }}
          />
          <SupplierQuotesTable
            items={data?.items ?? []}
            loading={loading}
            selectedId={selected?.id}
            onSelect={setSelected}
          />
          <SupplierQuotesPagination
            page={page}
            pages={pages}
            totalCount={data?.totalCount ?? 0}
            loading={loading}
            onPrevious={() => setPage(current => current - 1)}
            onNext={() => setPage(current => current + 1)}
          />
        </section>
        {selected && (
          <SupplierQuoteDetailPane
            selected={selected}
            detail={detail}
            onOpenRequests={onOpenRequests}
          />
        )}
      </div>
    </div>
  )
}
