import AdvancedDataGrid from './AdvancedDataGrid'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { authenticatedFetch } from './authApi'
import ScreenViewGroupHeader from './ScreenViewGroupHeader'
import SearchableRecordPicker from './SearchableRecordPicker'
import './sales-distribution.css'

type Warehouse = { id: string; code: string; name: string; isActive: boolean }
type Need = { stockItemId: string; stockCode: string; stockName: string; unitCode: string; openDemand: number; onHand: number; activeReserved: number; available: number; uncovered: number; openOrderCount: number }
type Page = { warehouse: { id: string; code: string; name: string } | null; items: Need[]; page: number; pageSize: number; totalCount: number; method: string }
type Props = { token: string }
type ScreenField = { key: string; label: string; visible: boolean; position: number; section?: string | null }
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
  const [page, setPage] = useState<Page | null>(null)
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
      const result = await request<Page>(`/api/sales/orders/distribution-plan?${params}`, token)
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
  const fieldValue = (item: Need, key: string) => key === 'stock' ? <><b>{item.stockCode}</b><small>{item.stockName}</small></> : key === 'openDemand' ? `${item.openDemand.toLocaleString('tr-TR')} ${item.unitCode}` : key === 'onHand' ? `${item.onHand.toLocaleString('tr-TR')} ${item.unitCode}` : key === 'activeReserved' ? `${item.activeReserved.toLocaleString('tr-TR')} ${item.unitCode}` : key === 'available' ? `${item.available.toLocaleString('tr-TR')} ${item.unitCode}` : key === 'uncovered' ? <b>{item.uncovered.toLocaleString('tr-TR')} {item.unitCode}</b> : item.openOrderCount

  return <main className="sales-distribution-page">
    <header className="sales-distribution-header"><div><p className="eyebrow">SATIŞ OPERASYONLARI</p><h1>Dağıtım ihtiyaç planı</h1><p className="muted">Açık sipariş taleplerini seçilen depodaki mevcut stok ve aktif rezervasyonlarla karşılaştırın.</p></div></header>
    {error && <div className="alert inline-alert" role="alert">{error}</div>}
    <section className="sales-distribution-toolbar" aria-label="Plan filtreleri">
      <label>Depo<SearchableRecordPicker options={warehouses.map(x=>({id:x.id,label:`${x.code} · ${x.name}`}))} selectedId={warehouseId} onSelect={id=>{setWarehouseId(id);setPageNumber(1)}} title="Depo seçin" placeholder="Depo seçin" clearable clearLabel="Depo filtresini kaldır" searchPlaceholder="Depo kodu veya adıyla ara" emptyMessage="Aramanızla eşleşen depo bulunamadı."/></label>
      <label>Stok kodu veya adı<input value={query} maxLength={120} onChange={event => { setQuery(event.target.value); setPageNumber(1) }} placeholder="Kod veya stok adı ara"/></label>
      <button type="button" className="secondary" onClick={() => void load()} disabled={busy}>Yenile</button>
    </section>
    <div className="sales-distribution-kpis"><article><span>Listelenen stok kalemi</span><b>{page?.totalCount ?? 0}</b></article><article><span>Sayfadaki açık talep</span><b>{totalOpenDemand.toLocaleString('tr-TR')}</b></article><article><span>Sayfadaki karşılanmamış miktar</span><b>{totalUncovered.toLocaleString('tr-TR')}</b></article><article><span>Depo</span><b>{page?.warehouse?.code ?? '—'}</b></article></div>
    <section className="sales-distribution-panel" aria-busy={busy}>
      <div className="sales-distribution-panel-heading"><div><h2>Stok ihtiyaçları</h2><p>{page?.warehouse ? `${page.warehouse.code} · ${page.totalCount} stok kalemi · yalnız açık siparişler` : 'Önce depo seçin'}</p></div><span>{busy ? 'Yükleniyor…' : page?.method ?? ''}</span></div>
      <div className="sales-distribution-workspace"><div className="sales-distribution-table-wrap"><AdvancedDataGrid hideSearch><thead><ScreenViewGroupHeader fields={visibleFields}/><tr>{visibleFields.map(field => <th key={field.key}>{field.label}</th>)}</tr></thead><tbody>{page?.items.map(item => <tr key={item.stockItemId} tabIndex={0} aria-selected={selectedStockId === item.stockItemId} onClick={() => setSelectedStockId(item.stockItemId)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedStockId(item.stockItemId) } }}>{visibleFields.map(field => <td key={field.key}>{fieldValue(item, field.key)}</td>)}</tr>)}{page?.items.length === 0 && <tr><td colSpan={Math.max(1, visibleFields.length)} className="sales-distribution-empty">Açık satış siparişlerinde eşleşen ihtiyaç bulunamadı.</td></tr>}{!page && !busy && <tr><td colSpan={Math.max(1, visibleFields.length)} className="sales-distribution-empty">İhtiyaçları görmek için depo seçin.</td></tr>}</tbody></AdvancedDataGrid></div>
        <aside className="sales-distribution-detail" aria-label="Seçili stok özeti">{selected ? <><small>SEÇİLİ STOK</small><h3>{selected.stockCode}</h3><p>{selected.stockName}</p><dl><div><dt>Açık talep</dt><dd>{selected.openDemand.toLocaleString('tr-TR')} {selected.unitCode}</dd></div><div><dt>Depo mevcudu</dt><dd>{selected.onHand.toLocaleString('tr-TR')} {selected.unitCode}</dd></div><div><dt>Aktif rezervasyon</dt><dd>{selected.activeReserved.toLocaleString('tr-TR')} {selected.unitCode}</dd></div><div><dt>Kullanılabilir</dt><dd>{selected.available.toLocaleString('tr-TR')} {selected.unitCode}</dd></div><div><dt>Karşılanmamış</dt><dd>{selected.uncovered.toLocaleString('tr-TR')} {selected.unitCode}</dd></div><div><dt>Açık sipariş</dt><dd>{selected.openOrderCount}</dd></div></dl><p className="sales-distribution-note">Bu görünüm ihtiyaç analizi sağlar; stok rezervasyonu veya sipariş değişikliği yapmaz.</p></> : <div className="sales-distribution-placeholder"><b>Stok satırı seçin</b><span>Karşılanabilir miktar ve açık ihtiyaç özeti burada gösterilir.</span></div>}</aside></div>
      <footer className="sales-distribution-pagination"><span>Sayfa {pageNumber} / {Math.max(1, Math.ceil((page?.totalCount ?? 0) / (page?.pageSize ?? 25)))}</span><div><button className="secondary" disabled={busy || pageNumber <= 1} onClick={() => setPageNumber(x => Math.max(1, x - 1))}>Önceki</button><button className="secondary" disabled={busy || !page || pageNumber * page.pageSize >= page.totalCount} onClick={() => setPageNumber(x => x + 1)}>Sonraki</button></div></footer>
    </section>
  </main>
}
