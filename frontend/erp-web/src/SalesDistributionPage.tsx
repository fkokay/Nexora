import { useCallback, useEffect, useMemo, useState } from 'react'
import { authenticatedFetch } from './authApi'
import DistributionFilters from './sales-distribution/components/DistributionFilters'
import DistributionPlanPanel from './sales-distribution/components/DistributionPlanPanel'
import DistributionSummary from './sales-distribution/components/DistributionSummary'
import type { DistributionPage, ScreenField, Warehouse } from './sales-distribution/components/types'
import './sales-distribution.css'

type Props = { token: string }
const defaultScreenFields: ScreenField[] = [
  { key: 'stock', label: 'Stok kodu / adı', visible: true, position: 0 },
  { key: 'openDemand', label: 'Açık talep', visible: true, position: 1 },
  { key: 'onHand', label: 'Depo mevcudu', visible: true, position: 2 },
  { key: 'activeReserved', label: 'Rezervasyon', visible: true, position: 3 },
  { key: 'available', label: 'Kullanılabilir', visible: true, position: 4 },
  { key: 'uncovered', label: 'Açıkta kalan', visible: true, position: 5 },
  { key: 'openOrderCount', label: 'Sipariş', visible: true, position: 6 }
]

async function request<T>(url: string, token: string): Promise<T> {
  const response = await authenticatedFetch(url, token, { headers: { Authorization: `Bearer ${token}` } })
  if (!response.ok) {
    let message = `İstek başarısız (${response.status})`
    try { const body = await response.json(); message = body.error || body.title || message } catch { /* keep status text */ }
    throw new Error(message)
  }
  return await response.json() as T
}

export default function SalesDistributionPage({ token }: Props) {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [warehouseId, setWarehouseId] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState<DistributionPage | null>(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [selectedStockId, setSelectedStockId] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [screenFields, setScreenFields] = useState<ScreenField[]>(defaultScreenFields)
  useEffect(() => {
    let cancelled = false
    request<{ fields?: ScreenField[] }>('/api/screen-views/sales-distribution-plan/active', token)
      .then(view => { if (!cancelled && view.fields?.length) setScreenFields(view.fields.filter(field => defaultScreenFields.some(allowed => allowed.key === field.key) && field.visible).sort((a, b) => a.position - b.position)) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [token])
  const loadWarehouses = useCallback(async () => {
    const rows = await request<Warehouse[]>('/api/warehouses/', token)
    setWarehouses(rows.filter(x => x.isActive))
    setWarehouseId(current => current || rows.find(x => x.isActive)?.id || '')
  }, [token])
  const load = useCallback(async () => {
    if (!warehouseId) { setPage(null); return }
    setBusy(true); setError('')
    try {
      const params = new URLSearchParams({ warehouseId, page: String(pageNumber), pageSize: '25' })
      if (query.trim()) params.set('q', query.trim())
      const result = await request<DistributionPage>(`/api/sales/orders/distribution-plan?${params}`, token)
      setPage(result)
      setSelectedStockId(current => result.items.some(item => item.stockItemId === current) ? current : result.items[0]?.stockItemId || '')
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }, [token, warehouseId, query, pageNumber])
  useEffect(() => { void loadWarehouses().catch(e => setError((e as Error).message)) }, [loadWarehouses])
  useEffect(() => { void load() }, [load])
  const selected = useMemo(() => page?.items.find(item => item.stockItemId === selectedStockId) ?? null, [page, selectedStockId])
  const totalUncovered = page?.items.reduce((sum, item) => sum + item.uncovered, 0) ?? 0
  const totalOpenDemand = page?.items.reduce((sum, item) => sum + item.openDemand, 0) ?? 0
  const visibleFields = screenFields.filter(field => field.visible)

  return <main className="sales-distribution-page">
    <header className="sales-distribution-header"><div><p className="eyebrow">SATIŞ OPERASYONLARI</p><h1>Dağıtım ihtiyaç planı</h1><p className="muted">Açık sipariş taleplerini seçilen depodaki mevcut stok ve aktif rezervasyonlarla karşılaştırın.</p></div></header>
    {error && <div className="alert inline-alert" role="alert">{error}</div>}
    <DistributionFilters warehouses={warehouses} warehouseId={warehouseId} query={query} busy={busy} onWarehouseChange={id => { setWarehouseId(id); setPageNumber(1) }} onQueryChange={value => { setQuery(value); setPageNumber(1) }} onRefresh={() => void load()} />
    <DistributionSummary totalCount={page?.totalCount ?? 0} totalOpenDemand={totalOpenDemand} totalUncovered={totalUncovered} warehouseCode={page?.warehouse?.code ?? '—'} />
    <DistributionPlanPanel page={page} busy={busy} visibleFields={visibleFields} pageNumber={pageNumber} selectedStockId={selectedStockId} selected={selected} onSelectStock={setSelectedStockId} onPreviousPage={() => setPageNumber(value => Math.max(1, value - 1))} onNextPage={() => setPageNumber(value => value + 1)} />
  </main>
}
