import type { FormEvent, MouseEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
import { authenticatedFetch } from './authApi'
import InventoryTrackingHeader from './inventory-tracking/components/InventoryTrackingHeader'
import InventoryTrackingAlerts from './inventory-tracking/components/InventoryTrackingAlerts'
import InventoryTrackingSummary from './inventory-tracking/components/InventoryTrackingSummary'
import InventoryTrackingFilters from './inventory-tracking/components/InventoryTrackingFilters'
import InventoryTrackingResults from './inventory-tracking/components/InventoryTrackingResults'
import InventoryTrackingBalanceTable from './inventory-tracking/components/InventoryTrackingBalanceTable'
import InventoryTrackingDetail from './inventory-tracking/components/InventoryTrackingDetail'
import InventoryTrackingPagination from './inventory-tracking/components/InventoryTrackingPagination'
import InventoryTrackingBoundaryNote from './inventory-tracking/components/InventoryTrackingBoundaryNote'
import type { Balance, Page, ScreenField, Warehouse } from './inventory-tracking/types'
import './inventory-tracking.css'

async function request<T>(url: string, token: string): Promise<T> {
  const response = await authenticatedFetch(url, token, { headers: { Authorization: `Bearer ${token}` } })
  const body = await response.json()
  if (!response.ok) throw new Error(body.error || `İstek başarısız (${response.status})`)
  return body as T
}

export default function InventoryTrackingPage({ token }: { token: string }) {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]), [warehouseId, setWarehouseId] = useState('')
  const [selectedBalance, setSelectedBalance] = useState<Balance | null>(null)
  const [query, setQuery] = useState(''), [search, setSearch] = useState(''), [trackingMode, setTrackingMode] = useState('')
  const [result, setResult] = useState<Page | null>(null), [page, setPage] = useState(1), [loading, setLoading] = useState(true), [error, setError] = useState(''), [warehouseError, setWarehouseError] = useState(''), [warehousesLoading, setWarehousesLoading] = useState(true)
  const [screenFields, setScreenFields] = useState<ScreenField[]>([
    { key: 'trackingCode', label: 'Lot / seri', visible: true, position: 0 }, { key: 'trackingMode', label: 'İz türü', visible: true, position: 1 },
    { key: 'stockItem', label: 'Stok', visible: true, position: 2 }, { key: 'warehouse', label: 'Depo', visible: true, position: 3 },
    { key: 'quantityOnHand', label: 'Mevcut miktar', visible: true, position: 4 }, { key: 'expiryDate', label: 'Son kullanma', visible: true, position: 5 },
    { key: 'lastMovementDate', label: 'Son hareket', visible: true, position: 6 }
  ])
  const latestRequest = useRef(0)
  const pageSize = 50

  async function load(nextPage = page) {
    const requestId = ++latestRequest.current
    setLoading(true); setError('')
    const params = new URLSearchParams({ page: String(nextPage), pageSize: String(pageSize) })
    if (search.trim()) params.set('q', search.trim())
    if (warehouseId) params.set('warehouseId', warehouseId)
    if (trackingMode) params.set('trackingMode', trackingMode)
    try {
      const data = await request<Page>(`/api/inventory-tracking/balances?${params}`, token)
      if (requestId === latestRequest.current) { setResult(data); setPage(nextPage) }
    } catch (e) {
      if (requestId === latestRequest.current) setError((e as Error).message)
    } finally {
      if (requestId === latestRequest.current) setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    setWarehousesLoading(true); setWarehouseError('')
    request<Warehouse[]>('/api/warehouses/', token).then(rows => { if (!cancelled) setWarehouses(rows) }).catch(e => { if (!cancelled) setWarehouseError((e as Error).message) }).finally(() => { if (!cancelled) setWarehousesLoading(false) })
    return () => { cancelled = true }
  }, [token])

  useEffect(() => {
    let cancelled = false
    request<{ fields?: ScreenField[] }>('/api/screen-views/inventory-trace-balances/active', token).then(view => { if (!cancelled && view.fields?.length) setScreenFields(view.fields as ScreenField[]) }).catch(() => {})
    return () => { cancelled = true }
  }, [token])

  useEffect(() => { void load(1) }, [token, search, warehouseId, trackingMode])

  useEffect(() => {
    if (!result?.items.length) { setSelectedBalance(null); return }
    const current = result.items.find(row => row.stockItemId === selectedBalance?.stockItemId && row.warehouseId === selectedBalance?.warehouseId && row.trackingCode === selectedBalance?.trackingCode)
    const next = current ?? result.items[0]
    if (next !== selectedBalance) setSelectedBalance(next)
  }, [result, selectedBalance])

  const maxPage = Math.max(1, Math.ceil((result?.totalCount ?? 0) / pageSize))
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setSearch(query); if (search === query) void load(1) }
  function clearFilters() { setQuery(''); setSearch(''); setWarehouseId(''); setTrackingMode('') }
  const hasFilters = Boolean(search || warehouseId || trackingMode)
  const visibleFields = screenFields.filter(field => field.visible).sort((a, b) => a.position - b.position)

  function renderField(row: Balance, field: ScreenField) {
    switch (field.key) {
      case 'trackingCode': return <button type="button" className="inventory-record-pick" aria-pressed={selectedBalance?.stockItemId === row.stockItemId && selectedBalance?.warehouseId === row.warehouseId && selectedBalance?.trackingCode === row.trackingCode} onClick={event => { event.stopPropagation(); setSelectedBalance(row) }}>{row.trackingCode}</button>
      case 'trackingMode': return <span className={`inventory-tracking-mode ${row.trackingMode === 'Lot' ? 'is-lot' : 'is-serial'}`}>{row.trackingMode === 'Lot' ? 'Lot' : 'Seri'}</span>
      case 'stockItem': return <><b>{row.stockItemCode}</b><small className="cell-subtitle">{row.stockItemName}</small></>
      case 'warehouse': return <>{row.warehouseCode}<small className="cell-subtitle">{row.warehouseName}</small></>
      case 'quantityOnHand': return <b>{row.quantityOnHand.toLocaleString('tr-TR', { maximumFractionDigits: 4 })} {row.unitCode}</b>
      case 'expiryDate': return row.expiryDate ? new Date(`${row.expiryDate}T00:00:00`).toLocaleDateString('tr-TR') : '—'
      case 'lastMovementDate': return new Date(`${row.lastMovementDate}T00:00:00`).toLocaleDateString('tr-TR')
    }
  }

  function selectTableRow(event: MouseEvent<HTMLDivElement>) {
    const row = (event.target as HTMLElement).closest('tbody tr')
    if (!row) return
    const index = Array.from(row.parentElement?.children ?? []).indexOf(row)
    const item = result?.items[index]
    if (item) setSelectedBalance(item)
  }

  return <div className="inventory-tracking-page">
    <InventoryTrackingHeader loading={loading} onRefresh={() => void load()}/>
    <InventoryTrackingAlerts warehouseError={warehouseError} error={error} loading={loading} onRetry={() => void load()}/>
    <InventoryTrackingSummary totalCount={result?.totalCount ?? 0} itemCount={result?.items.length ?? 0} page={page} maxPage={maxPage} hasFilters={hasFilters} pageSize={pageSize}/>
    <InventoryTrackingFilters query={query} onQueryChange={setQuery} trackingMode={trackingMode} onTrackingModeChange={setTrackingMode} warehouseId={warehouseId} onWarehouseSelect={setWarehouseId} warehouses={warehouses} warehousesLoading={warehousesLoading} warehouseError={warehouseError} hasFilters={hasFilters} loading={loading} onSubmit={submit} onClear={clearFilters}/>
    <InventoryTrackingResults loading={loading} error={error} totalCount={result?.totalCount ?? 0} hasFilters={hasFilters} search={search} trackingMode={trackingMode} warehouseId={warehouseId} warehouses={warehouses}/>
    <div className="inventory-workbench-body">
      <InventoryTrackingBalanceTable fields={visibleFields} rows={result?.items ?? []} totalCount={result?.totalCount ?? 0} loading={loading} error={error} hasFilters={hasFilters} onClick={selectTableRow} renderField={renderField}/>
      <InventoryTrackingDetail balance={selectedBalance}/>
    </div>
    <InventoryTrackingPagination totalCount={result?.totalCount ?? 0} page={page} maxPage={maxPage} loading={loading} onPageChange={nextPage => void load(nextPage)}/>
    <InventoryTrackingBoundaryNote/>
  </div>
}
