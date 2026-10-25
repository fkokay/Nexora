import AdvancedDataGrid from './AdvancedDataGrid'
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { authenticatedFetch } from './authApi';
import { MapPin, Plus, RefreshCw, Search, ShieldCheck, Warehouse } from 'lucide-react'
import ScreenViewGroupHeader from './ScreenViewGroupHeader'
import './warehouse-locations.css'

type WarehouseRow = { id: string; code: string; name: string; isActive: boolean }
type Location = { id: string; warehouseId: string; code: string; name: string; parentLocationId: string | null; isActive: boolean; rowVersion: string }
type Balance = { stockItemId: string; stockItemCode: string; stockItemName: string; unitCode: string; quantity: number }
type Reconciliation = { stockItemId: string; stockItemCode: string; stockItemName: string; unitCode: string; warehouseQuantity: number; locatedQuantity: number; unlocatedQuantity: number }
type ScreenField = { key: keyof Pick<Balance, 'stockItemCode' | 'stockItemName' | 'quantity' | 'unitCode'>; label: string; visible: boolean; position: number; section?: string | null }

async function request<T>(url: string, token: string, init?: RequestInit): Promise<T> {
  const response = await authenticatedFetch(url, token, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers } })
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string; detail?: string } | null
    throw new Error(body?.error ?? body?.detail ?? `İstek başarısız (${response.status})`)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export default function WarehouseLocationsPage({ token, role }: { token: string; role: string }) {
  const [warehouses, setWarehouses] = useState<WarehouseRow[]>([])
  const [warehouseId, setWarehouseId] = useState('')
  const [locations, setLocations] = useState<Location[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [balances, setBalances] = useState<Balance[]>([])
  const [reconciliation, setReconciliation] = useState<Reconciliation[]>([])
  const [search, setSearch] = useState('')
  const [balanceFields, setBalanceFields] = useState<ScreenField[]>([
    { key: 'stockItemCode', label: 'Stok kodu', visible: true, position: 0 },
    { key: 'stockItemName', label: 'Stok adı', visible: true, position: 1 },
    { key: 'quantity', label: 'Konum miktarı', visible: true, position: 2 },
    { key: 'unitCode', label: 'Birim', visible: true, position: 3 },
  ])
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [parentLocationId, setParentLocationId] = useState('')
  const [editing, setEditing] = useState<Location | null>(null)
  const [editCode, setEditCode] = useState('')
  const [editName, setEditName] = useState('')
  const [editParentLocationId, setEditParentLocationId] = useState('')
  const [editIsActive, setEditIsActive] = useState(true)
  const [warehousesLoading, setWarehousesLoading] = useState(true)
  const [loading, setLoading] = useState(true)
  const [balancesLoading, setBalancesLoading] = useState(false)
  const [balanceError, setBalanceError] = useState('')
  const [reconciliationError, setReconciliationError] = useState('')
  const [reconciliationLoading, setReconciliationLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const locationRequestId = useRef(0)
  const balanceRequestId = useRef(0)
  const reconciliationRequestId = useRef(0)
  const selected = locations.find(location => location.id === selectedId) ?? null
  const activeWarehouses = useMemo(() => warehouses.filter(warehouse => warehouse.isActive), [warehouses])
  const filteredLocations = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('tr-TR')
    if (!term) return locations
    return locations.filter(location => {
      const parentCode = locations.find(row => row.id === location.parentLocationId)?.code ?? ''
      return `${location.code} ${location.name} ${parentCode}`.toLocaleLowerCase('tr-TR').includes(term)
    })
  }, [locations, search])
  const visibleBalanceFields = useMemo(() => balanceFields.filter(field => field.visible).sort((a, b) => a.position - b.position), [balanceFields])

  const loadWarehouses = useCallback(async () => {
    setError('')
    setWarehousesLoading(true)
    try {
      const rows = await request<WarehouseRow[]>('/api/warehouses/', token)
      setWarehouses(rows)
      setWarehouseId(current => current || rows.find(row => row.isActive)?.id || '')
    } catch (e) { setError((e as Error).message) }
    finally { setWarehousesLoading(false) }
  }, [token])

  const loadLocations = useCallback(async () => {
    const requestId = ++locationRequestId.current
    if (!warehouseId) { setLocations([]); setSelectedId(''); setBalances([]); setLoading(false); return }
    setLoading(true); setError('')
    try {
      const rows = await request<Location[]>(`/api/warehouses/${warehouseId}/locations`, token)
      if (requestId === locationRequestId.current) {
        setLocations(rows)
        setSelectedId(current => rows.some(row => row.id === current) ? current : rows.find(row => row.isActive)?.id ?? '')
      }
    } catch (e) { if (requestId === locationRequestId.current) setError((e as Error).message) }
    finally { if (requestId === locationRequestId.current) setLoading(false) }
  }, [token, warehouseId])

  const loadBalances = useCallback(async (locationId: string) => {
    const requestId = ++balanceRequestId.current
    if (!warehouseId || !locationId) { setBalances([]); setBalanceError(''); setBalancesLoading(false); return }
    setBalances([]); setBalancesLoading(true); setBalanceError('')
    try {
      const result = await request<{ items: Balance[] }>(`/api/warehouses/${warehouseId}/locations/${locationId}/balances`, token)
      if (requestId === balanceRequestId.current) setBalances(result.items)
    } catch (e) { if (requestId === balanceRequestId.current) setBalanceError((e as Error).message) }
    finally { if (requestId === balanceRequestId.current) setBalancesLoading(false) }
  }, [token, warehouseId])

  const loadReconciliation = useCallback(async () => {
    const requestId = ++reconciliationRequestId.current
    if (!warehouseId) { setReconciliation([]); setReconciliationError(''); setReconciliationLoading(false); return }
    setReconciliation([]); setReconciliationLoading(true); setReconciliationError('')
    try {
      const result = await request<{ items: Reconciliation[] }>(`/api/warehouses/${warehouseId}/location-reconciliation`, token)
      if (requestId === reconciliationRequestId.current) setReconciliation(result.items)
    } catch (e) { if (requestId === reconciliationRequestId.current) setReconciliationError((e as Error).message) }
    finally { if (requestId === reconciliationRequestId.current) setReconciliationLoading(false) }
  }, [token, warehouseId])

  useEffect(() => { void loadWarehouses() }, [loadWarehouses])
  useEffect(() => { void loadLocations() }, [loadLocations])
  useEffect(() => { void loadBalances(selectedId) }, [loadBalances, selectedId])
  useEffect(() => { void loadReconciliation() }, [loadReconciliation])
  useEffect(() => {
    let cancelled = false
    void request<{ fields: ScreenField[] }>('/api/screen-views/warehouse-location-balances/active', token)
      .then(view => { if (!cancelled && view.fields?.length) setBalanceFields(view.fields) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [token])
  useEffect(() => {
    if (!editing) return
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) setEditing(null)
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [editing, busy])

  async function refresh() {
    await loadWarehouses()
    await loadLocations()
    if (selectedId) await loadBalances(selectedId)
    await loadReconciliation()
  }

  async function createLocation(event: FormEvent) {
    event.preventDefault()
    if (!warehouseId) return
    setBusy(true); setError(''); setNotice('')
    try {
      const created = await request<Location>(`/api/warehouses/${warehouseId}/locations`, token, { method: 'POST', body: JSON.stringify({ code, name, parentLocationId: parentLocationId || null }) })
      setLocations(current => [...current, created].sort((a, b) => a.code.localeCompare(b.code, 'tr')))
      setSelectedId(created.id); setCode(''); setName(''); setParentLocationId(''); setSearch('')
      setNotice('Depo konumu oluşturuldu.')
    } catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }

  function beginEdit(location: Location) {
    setEditing(location); setEditCode(location.code); setEditName(location.name); setEditParentLocationId(location.parentLocationId ?? ''); setEditIsActive(location.isActive)
  }

  async function saveLocation(event: FormEvent) {
    event.preventDefault()
    if (!editing) return
    setBusy(true); setError(''); setNotice('')
    try {
      const updated = await request<Location>(`/api/warehouses/${warehouseId}/locations/${editing.id}`, token, { method: 'PUT', body: JSON.stringify({ code: editCode, name: editName, parentLocationId: editParentLocationId || null, isActive: editIsActive, rowVersion: editing.rowVersion }) })
      setLocations(current => current.map(row => row.id === updated.id ? updated : row).sort((a, b) => a.code.localeCompare(b.code, 'tr')))
      setEditing(null)
      setNotice('Depo konumu güncellendi.')
    } catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }

  return <div className="warehouse-locations-page">
    <div className="page-heading customer-heading"><div><p className="eyebrow">ERP CORE · STOK YERLEŞİMİ</p><h1>Depo konumları</h1><p className="muted">Ambar içindeki raf ve bölmeleri tanımlayın; konuma atanmış stok bakiyelerini izleyin.</p></div><div className="heading-actions"><button className="secondary" type="button" onClick={() => void refresh()} disabled={warehousesLoading || loading || balancesLoading || reconciliationLoading} aria-label="Depo, konum ve bakiyeleri yenile"><RefreshCw size={15} aria-hidden="true"/> Yenile</button></div></div>
    {error && <div className="alert inline-alert" role="alert">{error}<button type="button" aria-label="Hata mesajını kapat" onClick={() => setError('')}>×</button></div>}
    {notice && <div className="notice" role="status">{notice}<button type="button" onClick={() => setNotice('')}>Kapat</button></div>}
    <section className="warehouse-location-kpis" aria-label="Depo yerleşimi özeti"><article><span>Depo</span><b>{warehouses.find(row => row.id === warehouseId)?.name ?? 'Seçilmedi'}</b><small>{activeWarehouses.length} aktif depo</small></article><article><span>Depo konumu</span><b>{locations.length}</b><small>{locations.filter(row => row.isActive).length} aktif raf veya bölme</small></article><article><span>Seçili konum bakiyesi</span><b>{balances.length}</b><small>{selected?`${selected.code} · ${selected.name}`:'Bir konum seçin'}</small></article><span className="tenant-scope"><ShieldCheck size={14}/>Firma kapsamlı</span></section>
    <div className="customer-toolbar"><label className="warehouse-picker">Depo<select value={warehouseId} disabled={warehousesLoading} onChange={event => { const nextWarehouseId = event.target.value; setWarehouseId(nextWarehouseId); setSelectedId(''); setLocations([]); setBalances([]); setBalanceError(''); setLoading(Boolean(nextWarehouseId)); setSearch('') }}><option value="">{warehousesLoading ? 'Depolar yükleniyor…' : 'Depo seçin'}</option>{warehouses.map(row => <option key={row.id} value={row.id}>{row.code} · {row.name}{row.isActive ? '' : ' (Pasif)'}</option>)}</select></label><span className="date-pill">Firma kapsamlı · raf / bölme</span></div>
    <div className="warehouse-location-layout">
      <section className="panel warehouse-location-list-panel" aria-labelledby="warehouse-location-list-title" aria-busy={loading}><div className="panel-heading"><div><b id="warehouse-location-list-title">Raf ve bölmeler</b><small>{locations.filter(row => row.isActive).length} aktif · {locations.length} toplam</small></div></div><label className="warehouse-location-search"><Search size={16} aria-hidden="true"/><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Kod, ad veya üst konum ara" aria-label="Kod, ad veya üst konum ara" disabled={loading || locations.length === 0}/>{search && <button type="button" onClick={() => setSearch('')} aria-label="Aramayı temizle">×</button>}</label>{loading ? <div className="empty-small" role="status" aria-live="polite">Konumlar yükleniyor…</div> : !warehouseId ? <div className="empty-small">Konumları görmek için önce bir depo seçin.</div> : locations.length === 0 ? <div className="empty-small">Bu depoda henüz konum yok. Kod ve ad vererek raf ya da bölme ekleyin.</div> : filteredLocations.length === 0 ? <div className="empty-small" role="status">“{search}” aramasıyla eşleşen konum bulunamadı.</div> : <div className="requests-list">{filteredLocations.map(location => <article className={`request-row warehouse-location-row${selectedId === location.id ? ' selected' : ''}`} key={location.id}><button type="button" className="warehouse-location-select" aria-pressed={selectedId === location.id} onClick={() => setSelectedId(location.id)}><span className="warehouse-location-icon" aria-hidden="true"><MapPin size={16}/></span><span><b>{location.code} · {location.name}</b><small>{location.parentLocationId ? `Üst konum: ${locations.find(row => row.id === location.parentLocationId)?.code ?? '—'}` : 'Üst düzey konum'} · {location.isActive ? 'Aktif' : 'Pasif'}</small></span></button>{role === 'TenantAdmin' && <button type="button" className="row-action" disabled={busy} onClick={() => beginEdit(location)} aria-label={`${location.code} konumunu düzenle`}>Düzenle</button>}</article>)}</div>}</section>
      <section className="panel warehouse-location-detail" aria-labelledby="warehouse-location-balance-title" aria-busy={balancesLoading}><div className="panel-heading"><div><b id="warehouse-location-balance-title">{selected ? `${selected.code} · ${selected.name}` : 'Konum bakiyesi'}</b><small>{selected ? 'Bu konuma açıkça atanmış stok hareketlerinin net miktarı' : 'Bakiye görmek için bir konum seçin.'}</small></div><span className="tenant-scope"><Warehouse size={14} aria-hidden="true"/>{balances.length} stok satırı</span></div>{selected&&<div className="warehouse-record-summary"><div><small>Konum kodu</small><b>{selected.code}</b></div><div><small>Konum adı</small><b>{selected.name}</b></div><div><small>Üst konum</small><b>{selected.parentLocationId?locations.find(row=>row.id===selected.parentLocationId)?.code:"Üst düzey"}</b></div><span className={selected.isActive?"warehouse-location-state is-active":"warehouse-location-state"}>{selected.isActive?"Aktif":"Pasif"}</span>{role==="TenantAdmin"&&<button type="button" className="secondary" disabled={busy} onClick={()=>beginEdit(selected)}>Düzenle</button>}</div>}{balanceError ? <div className="empty-small" role="alert">{balanceError}</div> : !selected ? <div className="empty-small">Bir raf veya bölme seçin.</div> : balancesLoading ? <div className="empty-small" role="status" aria-live="polite">Konum bakiyesi yükleniyor…</div> : balances.length === 0 ? <div className="empty-small">Bu konumda stok bakiyesi bulunmuyor.</div> : visibleBalanceFields.length === 0 ? <div className="empty-small">Bakiye görünümünde açık sütun bulunmuyor.</div> : <div className="customer-table-wrap warehouse-location-table-wrap" role="region" aria-label="Konum stok bakiyesi tablosu" tabIndex={0}><AdvancedDataGrid  className="customer-table" aria-label={`${selected.code} konumundaki stok bakiyeleri`}><thead><ScreenViewGroupHeader fields={visibleBalanceFields}/><tr>{visibleBalanceFields.map(field => <th scope="col" key={field.key}>{field.label}</th>)}</tr></thead><tbody>{balances.map(row => <tr key={row.stockItemId}>{visibleBalanceFields.map(field => <td key={field.key}>{field.key === 'stockItemCode' ? <b>{row.stockItemCode}</b> : field.key === 'stockItemName' ? row.stockItemName : field.key === 'quantity' ? row.quantity.toLocaleString('tr-TR', { maximumFractionDigits: 4 }) : row.unitCode}</td>)}</tr>)}</tbody></AdvancedDataGrid></div>}</section>
    </div>
    <section className="panel warehouse-location-reconciliation" aria-labelledby="warehouse-location-reconciliation-title" aria-busy={reconciliationLoading}>
      <div className="panel-heading"><div><b id="warehouse-location-reconciliation-title">Konumlandırma denetimi</b><small>Raf/konum ataması olmayan hareketler nedeniyle depo bakiyesiyle konum bakiyeleri arasındaki fark</small></div><span className="tenant-scope"><Warehouse size={14} aria-hidden="true"/>{reconciliation.length} stok kalemi</span></div>
      <p className="warehouse-location-reconciliation-note">Konumu boş eski hareketler burada görünür; bu ekran geçmiş kayıtlara otomatik konum atamaz. Miktarlar kendi stok birimleri içinde karşılaştırılır.</p>
      {reconciliationError ? <div className="empty-small" role="alert">{reconciliationError}</div> : reconciliationLoading ? <div className="empty-small" role="status" aria-live="polite">Depo ve konum bakiyeleri karşılaştırılıyor…</div> : reconciliation.length === 0 ? <div className="empty-small">Konumu boş hareket kaynaklı fark bulunmuyor.</div> : <div className="customer-table-wrap warehouse-location-table-wrap" role="region" aria-label="Depo ve konum bakiyesi karşılaştırması" tabIndex={0}><AdvancedDataGrid  className="customer-table"><thead><tr><th scope="col">Stok kodu</th><th scope="col">Stok adı</th><th scope="col">Depo bakiyesi</th><th scope="col">Konumlandırılmış</th><th scope="col">Konumu boş</th><th scope="col">Birim</th></tr></thead><tbody>{reconciliation.map(row => <tr key={row.stockItemId}><td><b>{row.stockItemCode}</b></td><td>{row.stockItemName}</td><td>{row.warehouseQuantity.toLocaleString('tr-TR', { maximumFractionDigits: 4 })}</td><td>{row.locatedQuantity.toLocaleString('tr-TR', { maximumFractionDigits: 4 })}</td><td className="warehouse-unlocated-quantity">{row.unlocatedQuantity.toLocaleString('tr-TR', { maximumFractionDigits: 4 })}</td><td>{row.unitCode}</td></tr>)}</tbody></AdvancedDataGrid></div>}
    </section>
    {role === 'TenantAdmin' && <form className="panel warehouse-location-form" onSubmit={event => void createLocation(event)}><div className="panel-heading"><div><b><Plus size={16}/> Konum oluştur</b><small>Kod depo içinde benzersiz olmalıdır. Üst konum seçerek hiyerarşi kurabilirsiniz.</small></div></div><div className="form-three"><label>Konum kodu<input value={code} onChange={event => setCode(event.target.value.toUpperCase())} required maxLength={40} placeholder="A-01-03"/></label><label>Konum adı<input value={name} onChange={event => setName(event.target.value)} required maxLength={120} placeholder="Raf 3 · Göz 1"/></label><label>Üst konum<select value={parentLocationId} onChange={event => setParentLocationId(event.target.value)}><option value="">Üst düzey konum</option>{locations.filter(row => row.isActive).map(row => <option key={row.id} value={row.id}>{row.code} · {row.name}</option>)}</select></label></div><div className="modal-foot"><span>TenantAdmin yetkisiyle kaydedilir ve audit izi oluşturulur.</span><button className="primary" disabled={busy || !warehouseId || !code.trim() || !name.trim()}><Plus size={15}/> Konumu kaydet</button></div></form>}
    {editing && <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !busy) setEditing(null) }}><form className="modal warehouse-location-edit-modal" role="dialog" aria-modal="true" aria-labelledby="warehouse-location-edit-title" onSubmit={event => void saveLocation(event)}><div className="modal-head"><div><p className="eyebrow">DEPO YERLEŞİMİ · DÜZENLE</p><h2 id="warehouse-location-edit-title">{editing.code} konumunu düzenle</h2></div><button type="button" className="icon-button" aria-label="Kapat" disabled={busy} onClick={() => setEditing(null)}>×</button></div><div className="form-two"><label>Konum kodu<input autoFocus value={editCode} onChange={event => setEditCode(event.target.value.toUpperCase())} required maxLength={40}/></label><label>Konum adı<input value={editName} onChange={event => setEditName(event.target.value)} required maxLength={120}/></label></div><label>Üst konum<select value={editParentLocationId} onChange={event => setEditParentLocationId(event.target.value)}><option value="">Üst düzey konum</option>{locations.filter(row => row.isActive && row.id !== editing.id).map(row => <option key={row.id} value={row.id}>{row.code} · {row.name}</option>)}</select></label><label className="warehouse-location-active"><input type="checkbox" checked={editIsActive} onChange={event => setEditIsActive(event.target.checked)}/> Konum aktif</label><div className="modal-foot"><span>Güncelleme sürüm denetimiyle ve audit iziyle kaydedilir.</span><div><button type="button" className="secondary" disabled={busy} onClick={() => setEditing(null)}>Vazgeç</button><button className="primary" disabled={busy || !editCode.trim() || !editName.trim()}>Değişiklikleri kaydet</button></div></div></form></div>}
  </div>
}
