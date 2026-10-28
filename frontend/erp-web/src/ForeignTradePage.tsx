import AdvancedDataGrid from './AdvancedDataGrid'
import { useEffect, useMemo, useState } from 'react'
import { authenticatedFetch } from './authApi';
import { localizedText } from './locale'
import { ArrowRight, FileText, Globe2, PackageCheck, Plus, RefreshCw, Ship, X } from 'lucide-react'
import './foreign-trade.css'

type Direction = 'Import' | 'Export'
type TradeStatus = 'Draft' | 'Booked' | 'Shipped' | 'CustomsClearance' | 'Arrived' | 'Closed' | 'Cancelled'
type TradeOrder = { id: string; code: string; counterpartyName: string; orderDate: string; currencyCode: string; grandTotal: number; status: string; direction: Direction }
type TradeCase = { id: string; direction: Direction; status: TradeStatus; purchaseOrderId: string | null; salesOrderId: string | null; referenceCode: string; originCountryCode: string; destinationCountryCode: string; incotermsCode: string | null; harmonizedSystemCode: string | null; transportMode: string; carrierReference: string | null; customsReference: string | null; declaredValue: number; currencyCode: string; plannedShipDate: string | null; actualShipDate: string | null; plannedArrivalDate: string | null; actualArrivalDate: string | null; notes: string | null; updatedAt: string; inventoryPostingRequired: boolean; purchaseReceiptId: string | null; salesDeliveryId: string | null; inventoryDocumentLinkedAt: string | null }
type InventoryDocument = { id: string; code: string; documentDate: string; warehouseName: string; lineCount: number; isLinked: boolean }
type CasePage = { items: TradeCase[]; total: number }
type TradeCapabilities = { canCreate: boolean; canUpdate: boolean; canAdvance: boolean }
type Draft = { direction: Direction; orderId: string; referenceCode: string; originCountryCode: string; destinationCountryCode: string; incotermsCode: string; harmonizedSystemCode: string; transportMode: string; carrierReference: string; customsReference: string; declaredValue: string; plannedShipDate: string; plannedArrivalDate: string; notes: string }
const blankDraft = (): Draft => ({ direction: 'Import', orderId: '', referenceCode: '', originCountryCode: '', destinationCountryCode: '', incotermsCode: '', harmonizedSystemCode: '', transportMode: 'Road', carrierReference: '', customsReference: '', declaredValue: '', plannedShipDate: '', plannedArrivalDate: '', notes: '' })
const tr = (turkish: string, english: string) => localizedText(turkish, english)
const locale = () => localizedText('tr-TR', 'en-US')
const statusLabels: Record<TradeStatus, [string, string]> = { Draft: ['Taslak', 'Draft'], Booked: ['Planlandı', 'Booked'], Shipped: ['Sevkte', 'Shipped'], CustomsClearance: ['Gümrükte', 'Customs clearance'], Arrived: ['Ulaştı', 'Arrived'], Closed: ['Kapandı', 'Closed'], Cancelled: ['İptal', 'Cancelled'] }
const statusLabel = (status: TradeStatus) => tr(...statusLabels[status])
const directionLabel = (direction: Direction) => tr(direction === 'Import' ? 'İthalat' : 'İhracat', direction)
const transportLabel = (mode: string) => {
  const labels: Record<string, [string, string]> = { Road: ['Kara', 'Road'], Sea: ['Deniz', 'Sea'], Air: ['Hava', 'Air'], Rail: ['Demir yolu', 'Rail'], Multimodal: ['Çok modlu', 'Multimodal'] }
  const label = labels[mode]
  return label ? tr(...label) : mode
}
const nextStatus: Partial<Record<TradeStatus, TradeStatus>> = { Draft: 'Booked', Booked: 'Shipped', Shipped: 'CustomsClearance', CustomsClearance: 'Arrived', Arrived: 'Closed' }

function requiredPermission(url: string, method?: string) {
  if (url.endsWith('/capabilities')) return tr('firma üyeliği ve oturum', 'company membership and session')
  if (url.endsWith('/transition') || url.endsWith('/inventory-document')) return 'erp.foreign-trade.execute'
  if (url.includes('/orders') || url.includes('/cases') && (!method || method.toUpperCase() === 'GET')) return 'erp.foreign-trade.read'
  if (method?.toUpperCase() === 'PUT') return 'erp.foreign-trade.update'
  return 'erp.foreign-trade.create'
}

export default function ForeignTradePage({ token }: { token: string; role: string }) {
  const [cases, setCases] = useState<TradeCase[]>([])
  const [selectedCase, setSelectedCase] = useState<TradeCase|null>(null)
  const [orders, setOrders] = useState<TradeOrder[]>([])
  const [draft, setDraft] = useState<Draft>(blankDraft())
  const [creating, setCreating] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [filter, setFilter] = useState<'All' | Direction>('All')
  const [query, setQuery] = useState('')
  const [capabilities, setCapabilities] = useState<TradeCapabilities>({ canCreate: false, canUpdate: false, canAdvance: false })
  const [inventoryDocuments, setInventoryDocuments] = useState<InventoryDocument[]>([])
  const [inventoryDocumentId, setInventoryDocumentId] = useState('')

  async function api<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await authenticatedFetch(url, token, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init?.headers } })
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { error?: string; title?: string } | null
      if (response.status === 403) {
        const permission = requiredPermission(url, init?.method)
        throw new Error(tr(`Bu firmada ${permission} erişiminiz yok. Dış ticaret izinlerini firma yöneticiniz İzin politikaları ekranından tanımlayabilir. Bu kodu iletin: ${permission}.`, `You do not have ${permission} access in this company. Ask your company administrator to configure foreign trade permissions on the Access policies page. Provide this code: ${permission}.`))
      }
      throw new Error(body?.error || body?.title || tr(`İstek başarısız (${response.status}).`, `Request failed (${response.status}).`))
    }
    return (response.status === 204 ? undefined : response.json()) as Promise<T>
  }

  async function load() {
    setLoading(true); setError('')
    try {
      const [casePage, imports, exports, permissions] = await Promise.all([
        api<CasePage>('/api/foreign-trade/cases?page=1&pageSize=100'),
        api<TradeOrder[]>('/api/foreign-trade/orders?direction=Import'),
        api<TradeOrder[]>('/api/foreign-trade/orders?direction=Export'),
        api<TradeCapabilities>('/api/foreign-trade/capabilities')
      ])
      setCapabilities(permissions)
      setCases(casePage.items); setSelectedCase(current => current ? casePage.items.find(x => x.id === current.id) || null : null); setOrders([...imports.map(x=>({...x,direction:'Import' as const})), ...exports.map(x=>({...x,direction:'Export' as const}))])
    } catch (cause) { setError((cause as Error).message) }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [token])
  useEffect(() => {
    setInventoryDocuments([]); setInventoryDocumentId('')
    if (!selectedCase) return
    let active = true
    void api<InventoryDocument[]>(`/api/foreign-trade/cases/${selectedCase.id}/inventory-documents`).then(items => { if (active) { setInventoryDocuments(items); setInventoryDocumentId(items.find(x => x.isLinked)?.id || '') } }).catch(cause => { if (active) setError((cause as Error).message) })
    return () => { active = false }
  }, [selectedCase?.id, token])

  const filtered = useMemo(() => cases.filter(item => (filter === 'All' || item.direction === filter) && `${item.referenceCode} ${item.customsReference || ''} ${item.carrierReference || ''}`.toLocaleLowerCase(locale()).includes(query.toLocaleLowerCase(locale()))), [cases, filter, query])
  const selectedNextStatus = selectedCase ? nextStatus[selectedCase.status] : undefined
  const orderMap = useMemo(() => new Map(orders.map(order => [order.id, order])), [orders])
  const selectedOrder = orders.find(order => order.id === draft.orderId)

  function startCreate(direction: Direction) { setError(''); setNotice(''); setDraft({ ...blankDraft(), direction }); setCreating(true) }
  async function create(event: React.FormEvent) {
    event.preventDefault(); if (!selectedOrder || !capabilities.canCreate) return
    setBusyId('create'); setError('')
    try {
      const payload = { direction: draft.direction, purchaseOrderId: draft.direction === 'Import' ? draft.orderId : null, salesOrderId: draft.direction === 'Export' ? draft.orderId : null,
        referenceCode: draft.referenceCode, originCountryCode: draft.originCountryCode, destinationCountryCode: draft.destinationCountryCode, incotermsCode: draft.incotermsCode || null,
        harmonizedSystemCode: draft.harmonizedSystemCode || null, transportMode: draft.transportMode, carrierReference: draft.carrierReference || null, customsReference: draft.customsReference || null,
        declaredValue: Number(draft.declaredValue || selectedOrder.grandTotal), plannedShipDate: draft.plannedShipDate || null, plannedArrivalDate: draft.plannedArrivalDate || null, notes: draft.notes || null }
      await api<TradeCase>('/api/foreign-trade/cases', { method: 'POST', body: JSON.stringify(payload) })
      setCreating(false); setNotice(tr('Dış ticaret dosyası oluşturuldu ve denetim kaydına eklendi.', 'Foreign trade case created and added to the audit log.')); await load()
    } catch (cause) { setError((cause as Error).message) }
    finally { setBusyId('') }
  }
  async function transition(item: TradeCase, status: TradeStatus) {
    if (!capabilities.canAdvance) return
    setBusyId(item.id); setError(''); setNotice('')
    try {
      await api<TradeCase>(`/api/foreign-trade/cases/${item.id}/transition`, { method: 'POST', body: JSON.stringify({ status }) })
      setSelectedCase({...item,status}); setNotice(tr(`${item.referenceCode}: ${statusLabel(status)} durumuna geçirildi.`, `${item.referenceCode}: moved to ${statusLabel(status)}.`)); await load()
    } catch (cause) { setError((cause as Error).message) }
    finally { setBusyId('') }
  }
  async function linkInventoryDocument(item: TradeCase) {
    if (!inventoryDocumentId || !capabilities.canAdvance) return
    setBusyId(item.id); setError(''); setNotice('')
    try {
      await api<TradeCase>(`/api/foreign-trade/cases/${item.id}/inventory-document`, { method: 'POST', body: JSON.stringify({ documentId: inventoryDocumentId }) })
      setNotice(tr('Standart stok belgesi dış ticaret dosyasına bağlandı; stok defterine ikinci kez kayıt yapılmadı.', 'The standard inventory document was linked; no duplicate stock posting was created.'))
      setInventoryDocuments(await api<InventoryDocument[]>(`/api/foreign-trade/cases/${item.id}/inventory-documents`))
      await load()
    } catch (cause) { setError((cause as Error).message) }
    finally { setBusyId('') }
  }

  return <div className="page-content foreign-trade-page">
    <header className="foreign-trade-hero screen-page-header"><div className="foreign-trade-hero-icon"><Globe2 size={24}/></div><div><p className="eyebrow">{tr('ERP CORE · DIŞ TİCARET', 'ERP CORE · FOREIGN TRADE')}</p><h1>{tr('İthalat ve ihracat dosyaları', 'Import and export cases')}</h1><p>{tr('Satın alma ve satış siparişlerine bağlı lojistik, gümrük referansı ve sevkiyat adımlarını izleyin.', 'Track logistics, customs references and shipment steps linked to purchase and sales orders.')}</p><small>{tr('Operasyon takibi sağlar; gümrük beyannamesi veya mevzuat uygunluğu üretmez.', 'For operational tracking only; it does not create customs declarations or certify regulatory compliance.')}</small></div><div className="foreign-trade-hero-actions"><button className="secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={15}/>{tr('Yenile', 'Refresh')}</button>{capabilities.canCreate && <><button className="secondary" onClick={() => startCreate('Import')}><Plus size={15}/>{tr('İthalat dosyası', 'Import case')}</button><button className="primary" onClick={() => startCreate('Export')}><Plus size={15}/>{tr('İhracat dosyası', 'Export case')}</button></>}</div></header>
    {(!capabilities.canCreate || !capabilities.canAdvance) && !loading && !error && <div className="foreign-trade-access-note" role="note"><strong>{tr('Eksik işlem izni', 'Missing action permission')}</strong><span>{[!capabilities.canCreate && 'erp.foreign-trade.create', !capabilities.canAdvance && 'erp.foreign-trade.execute'].filter(Boolean).join(' · ')} {tr('izinlerini firma yöneticiniz İzin politikaları ekranında bu üyeye veya TenantUser rolüne tanımlayabilir. Kayıtları görüntülemek için ayrıca', 'permissions can be assigned to this member or the TenantUser role by your company administrator on the Access policies page. Viewing records also requires')} <code>erp.foreign-trade.read</code> {tr('gerekir.', 'permission.')}</span></div>}
    {error && <div className="alert inline-alert" role="alert">{error}</div>}{notice && <div className="notice" role="status">{notice}</div>}
    <div className="foreign-trade-metrics"><article className="panel"><span><FileText size={17}/></span><b>{cases.length}</b><small>{tr('Toplam dosya', 'Total cases')}</small></article><article className="panel"><span><PackageCheck size={17}/></span><b>{cases.filter(x => x.status === 'CustomsClearance').length}</b><small>{tr('Gümrük adımı', 'At customs')}</small></article><article className="panel"><span><Ship size={17}/></span><b>{cases.filter(x => x.status === 'Shipped' || x.status === 'CustomsClearance').length}</b><small>{tr('Yolda', 'In transit')}</small></article></div>
    {creating && <div className="foreign-trade-modal-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setCreating(false)}}><section className="panel foreign-trade-create" role="dialog" aria-modal="true" aria-labelledby="foreign-trade-create-title"><div className="panel-heading"><div><p className="eyebrow">{tr('YENİ DOSYA', 'NEW CASE')}</p><h2 id="foreign-trade-create-title">{tr(`${directionLabel(draft.direction)} dosyası oluştur`, `Create ${draft.direction.toLowerCase()} case`)}</h2></div><button className="secondary" type="button" onClick={() => setCreating(false)}>{tr('Vazgeç', 'Cancel')}</button></div><form onSubmit={create}>
      <div className="form-two"><label>{tr('Bağlı sipariş', 'Linked order')}<select required value={draft.orderId} onChange={e => { const orderId=e.target.value; const order=orders.find(x=>x.id===orderId); setDraft(x=>({...x,orderId,declaredValue:order?String(order.grandTotal):''})) }}><option value="">{tr('Sipariş seçin', 'Select an order')}</option>{orders.filter(order => order.direction===draft.direction && order.status !== 'Cancelled').map(order => <option value={order.id} key={order.id}>{order.code} · {order.counterpartyName} · {order.grandTotal.toLocaleString(locale())} {order.currencyCode}</option>)}</select></label><label>{tr('Dış ticaret referansı', 'Foreign trade reference')}<input required maxLength={50} value={draft.referenceCode} onChange={e=>setDraft(x=>({...x,referenceCode:e.target.value}))} placeholder={draft.direction === 'Import' ? 'IMP-2026-001' : 'EXP-2026-001'}/></label></div>
      <div className="form-two"><label>{tr('Çıkış ülkesi (ISO alfa-2)', 'Origin country (ISO alpha-2)')}<input required maxLength={2} pattern="[A-Za-z]{2}" value={draft.originCountryCode} onChange={e=>setDraft(x=>({...x,originCountryCode:e.target.value.toUpperCase()}))} placeholder="TR"/></label><label>{tr('Varış ülkesi (ISO alfa-2)', 'Destination country (ISO alpha-2)')}<input required maxLength={2} pattern="[A-Za-z]{2}" value={draft.destinationCountryCode} onChange={e=>setDraft(x=>({...x,destinationCountryCode:e.target.value.toUpperCase()}))} placeholder="DE"/></label></div>
      <div className="form-three"><label>Incoterms 2020<select value={draft.incotermsCode} onChange={e=>setDraft(x=>({...x,incotermsCode:e.target.value}))}><option value="">{tr('Seçin', 'Select')}</option>{['EXW','FCA','CPT','CIP','DAP','DPU','DDP','FAS','FOB','CFR','CIF'].map(code=><option key={code}>{code}</option>)}</select></label><label>{tr('HS kodu', 'HS code')}<input maxLength={10} pattern="[0-9]{0,10}" value={draft.harmonizedSystemCode} onChange={e=>setDraft(x=>({...x,harmonizedSystemCode:e.target.value}))} placeholder={tr('6–10 rakam', '6–10 digits')}/></label><label>{tr('Taşıma', 'Transport')}<select value={draft.transportMode} onChange={e=>setDraft(x=>({...x,transportMode:e.target.value}))}>{(['Road','Sea','Air','Rail','Multimodal'] as const).map(mode=><option key={mode} value={mode}>{transportLabel(mode)}</option>)}</select></label></div>
      <div className="form-three"><label>{tr('Beyan değeri', 'Declared value')} ({selectedOrder?.currencyCode || tr('sipariş para birimi', 'order currency')})<input type="number" min="0" step="0.01" value={draft.declaredValue} onChange={e=>setDraft(x=>({...x,declaredValue:e.target.value}))} placeholder={selectedOrder ? String(selectedOrder.grandTotal) : tr('Sipariş seçin', 'Select an order')}/></label><label>{tr('Planlanan sevkiyat', 'Planned shipment')}<input type="date" value={draft.plannedShipDate} onChange={e=>setDraft(x=>({...x,plannedShipDate:e.target.value}))}/></label><label>{tr('Planlanan varış', 'Planned arrival')}<input type="date" value={draft.plannedArrivalDate} onChange={e=>setDraft(x=>({...x,plannedArrivalDate:e.target.value}))}/></label></div>
      <div className="form-two"><label>{tr('Taşıyıcı / takip referansı', 'Carrier / tracking reference')}<input maxLength={100} value={draft.carrierReference} onChange={e=>setDraft(x=>({...x,carrierReference:e.target.value}))}/></label><label>{tr('Gümrük referansı', 'Customs reference')}<input maxLength={100} value={draft.customsReference} onChange={e=>setDraft(x=>({...x,customsReference:e.target.value}))}/></label></div><label>{tr('Operasyon notu', 'Operational notes')}<textarea rows={2} maxLength={1000} value={draft.notes} onChange={e=>setDraft(x=>({...x,notes:e.target.value}))}/></label>
      <div className="modal-foot"><span>{tr('Sipariş, firma veritabanında doğrulanır ve referans değişiklikleri denetlenir.', 'The order is validated in the company database and reference changes are audited.')}</span><button className="primary" disabled={busyId==='create'||!selectedOrder}>{busyId==='create'?tr('Kaydediliyor…', 'Saving…'):tr('Dosya oluştur', 'Create case')}</button></div>
    </form></section></div>}
    <section className="panel foreign-trade-list"><div className="panel-heading"><div><h2>{tr('Dış ticaret kayıtları', 'Foreign trade cases')}</h2><p>{tr('İthalat ve ihracat dosyaları, bağlı sipariş ve güncel lojistik adım.', 'Import and export cases, linked orders and current logistics step.')}</p></div><div className="foreign-trade-filters"><input aria-label={tr('Referans ara', 'Search references')} placeholder={tr('Referans ara…', 'Search references…')} value={query} onChange={e=>setQuery(e.target.value)}/><select aria-label={tr('Yön filtresi', 'Filter by direction')} value={filter} onChange={e=>setFilter(e.target.value as 'All'|Direction)}><option value="All">{tr('Tüm yönler', 'All directions')}</option><option value="Import">{tr('İthalat', 'Import')}</option><option value="Export">{tr('İhracat', 'Export')}</option></select></div></div>
      <div className={`foreign-trade-workspace${selectedCase?' has-selection':''}`}><div className="foreign-trade-record-list">{loading?<div className="foreign-trade-empty-state is-loading"><span className="foreign-trade-empty-icon"><RefreshCw size={19}/></span><b>{tr('Dış ticaret kayıtları yükleniyor', 'Loading foreign trade cases')}</b><span>{tr('Güncel sipariş ve sevkiyat bilgileri alınıyor.', 'Loading current order and shipment information.')}</span></div>:filtered.length===0?<div className="foreign-trade-empty-state" role="status"><span className="foreign-trade-empty-icon"><Globe2 size={21}/></span><b>{cases.length?tr('Eşleşen dosya bulunamadı', 'No matching cases found'):tr('Henüz dış ticaret dosyası yok', 'No foreign trade cases yet')}</b><span>{cases.length?tr('Arama metnini veya yön filtresini değiştirerek tekrar deneyin.', 'Change the search text or direction filter and try again.'):tr('İthalat veya ihracat siparişine bağlı yeni dosya oluşturarak sevkiyat sürecini izlemeye başlayın.', 'Create a case linked to an import or export order to start tracking its shipment.')}</span>{!cases.length&&capabilities.canCreate&&<small>{tr('Dosya türünü üstteki İthalat dosyası veya İhracat dosyası düğmesinden seçebilirsiniz.', 'Select the case type with the Import case or Export case button above.')}</small>}</div>:<div className="table-wrap"><AdvancedDataGrid hideSearch><thead><tr><th>{tr('Referans', 'Reference')}</th><th>{tr('Yön', 'Direction')}</th><th>{tr('Bağlı sipariş', 'Linked order')}</th><th>{tr('Ülkeler', 'Countries')}</th><th>{tr('Durum', 'Status')}</th><th>{tr('İşlem', 'Action')}</th></tr></thead><tbody>{filtered.map(item=>{const order=orderMap.get(item.purchaseOrderId||item.salesOrderId||'');const next=nextStatus[item.status];return <tr key={item.id} tabIndex={0} aria-selected={selectedCase?.id===item.id} onClick={()=>setSelectedCase(item)} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();setSelectedCase(item)}}}><td><b>{item.referenceCode}</b><small>{item.customsReference||item.carrierReference||tr('Referans bekleniyor', 'Awaiting reference')}</small></td><td><span className={`trade-direction ${item.direction.toLowerCase()}`}>{directionLabel(item.direction)}</span></td><td>{order?<><b>{order.code}</b><small>{order.counterpartyName}</small></>:<span>{tr('Sipariş', 'Order')}</span>}</td><td>{item.originCountryCode} <ArrowRight size={13}/> {item.destinationCountryCode}</td><td><span className={`trade-status ${item.status.toLowerCase()}`}>{statusLabel(item.status)}</span></td><td>{capabilities.canAdvance&&next&&<button className="secondary small-button" disabled={busyId===item.id} onClick={event=>{event.stopPropagation();void transition(item,next)}}>{busyId===item.id?'…':`${statusLabel(next)} →`}</button>}{capabilities.canAdvance&&['Draft','Booked'].includes(item.status)&&<button className="row-action danger-action" disabled={busyId===item.id} onClick={event=>{event.stopPropagation();void transition(item,'Cancelled')}}>{tr('İptal et', 'Cancel')}</button>}</td></tr>})}</tbody></AdvancedDataGrid></div>}</div>
        <aside className="foreign-trade-detail" aria-label={tr('Seçili dış ticaret dosyası', 'Selected foreign trade case')}>{selectedCase?<><div className="foreign-trade-detail-head"><div><small>{selectedCase.referenceCode} · {directionLabel(selectedCase.direction)}</small><h3>{statusLabel(selectedCase.status)}</h3></div><button className="secondary" aria-label={tr('Seçimi kaldır', 'Clear selection')} onClick={()=>setSelectedCase(null)}><X size={15}/></button></div><dl><div><dt>{tr('Bağlı sipariş', 'Linked order')}</dt><dd>{orderMap.get(selectedCase.purchaseOrderId||selectedCase.salesOrderId||'')?.code||'—'}</dd></div><div><dt>{tr('Rota', 'Route')}</dt><dd>{selectedCase.originCountryCode} → {selectedCase.destinationCountryCode}</dd></div><div><dt>Incoterms / {tr('taşıma', 'transport')}</dt><dd>{selectedCase.incotermsCode||'—'} · {transportLabel(selectedCase.transportMode)}</dd></div><div><dt>{tr('Beyan değeri', 'Declared value')}</dt><dd>{selectedCase.declaredValue.toLocaleString(locale(),{minimumFractionDigits:2})} {selectedCase.currencyCode}</dd></div><div><dt>{tr('Planlanan sevkiyat', 'Planned shipment')}</dt><dd>{selectedCase.plannedShipDate ? new Date(`${selectedCase.plannedShipDate}T00:00:00`).toLocaleDateString(locale()) : '—'}</dd></div><div><dt>{tr('Planlanan varış', 'Planned arrival')}</dt><dd>{selectedCase.plannedArrivalDate ? new Date(`${selectedCase.plannedArrivalDate}T00:00:00`).toLocaleDateString(locale()) : '—'}</dd></div><div><dt>{tr('Taşıyıcı referansı', 'Carrier reference')}</dt><dd>{selectedCase.carrierReference||'—'}</dd></div><div><dt>{tr('Gümrük referansı', 'Customs reference')}</dt><dd>{selectedCase.customsReference||'—'}</dd></div></dl>{selectedCase.notes&&<p className="foreign-trade-detail-notes">{selectedCase.notes}</p>}
          <section className="foreign-trade-inventory-link"><h4>{tr('Stok belgesi', 'Inventory document')}</h4><p>{tr('Stok hareketini standart mal kabul veya teslimat ekranında oluşturun. Bu adım yalnızca mevcut belgeyi bağlar; stok ikinci kez işlenmez.', 'Post stock in the standard receipt or delivery screen. This only links the existing document; it does not post inventory again.')}</p>
            {selectedCase.purchaseReceiptId || selectedCase.salesDeliveryId ? <div className="foreign-trade-linked-document"><PackageCheck size={16}/><span>{inventoryDocuments.find(x => x.isLinked)?.code || selectedCase.purchaseReceiptId || selectedCase.salesDeliveryId}</span></div> : <>
              {((selectedCase.direction === 'Import' && ['Arrived','Closed'].includes(selectedCase.status)) || (selectedCase.direction === 'Export' && ['Shipped','CustomsClearance','Arrived','Closed'].includes(selectedCase.status))) && capabilities.canAdvance && <div className="foreign-trade-link-controls"><select aria-label={tr('Stok belgesi seçin', 'Select inventory document')} value={inventoryDocumentId} onChange={event=>setInventoryDocumentId(event.target.value)}><option value="">{tr('Kayıtlı stok belgesi seçin', 'Select a posted inventory document')}</option>{inventoryDocuments.map(doc=><option key={doc.id} value={doc.id}>{doc.code} · {doc.warehouseName} · {doc.lineCount} {tr('satır', 'lines')}</option>)}</select><button className="secondary" disabled={!inventoryDocumentId||busyId===selectedCase.id} onClick={()=>void linkInventoryDocument(selectedCase)}>{tr('Belgeyi bağla', 'Link document')}</button></div>}
              {!inventoryDocuments.length && <small>{tr('Uygun kayıtlı stok belgesi bulunamadı. Önce standart mal kabul veya teslimat işlemini tamamlayın.', 'No eligible posted inventory document was found. Complete the standard receipt or delivery first.')}</small>}
            </>}
          </section>
          {capabilities.canAdvance&&<div className="foreign-trade-detail-actions">{selectedNextStatus&&<button className="primary" disabled={busyId===selectedCase.id} onClick={()=>void transition(selectedCase,selectedNextStatus)}>{tr(`${statusLabel(selectedNextStatus)} aşamasına geçir`, `Move to ${statusLabel(selectedNextStatus)}`)}</button>}{['Draft','Booked'].includes(selectedCase.status)&&<button className="secondary" disabled={busyId===selectedCase.id} onClick={()=>void transition(selectedCase,'Cancelled')}>{tr('Dosyayı iptal et', 'Cancel case')}</button>}</div>}</>:<div className="foreign-trade-detail-empty"><Globe2 size={20}/><b>{tr('Dosya seçin', 'Select a case')}</b><span>{tr('Seçili dosyanın rota, taşıma ve gümrük bilgileri burada görünür.', 'The selected case route, transport and customs details appear here.')}</span></div>}</aside>
      </div>
    </section><p className="foreign-trade-footnote">{tr('Bu ekran siparişe bağlı iç operasyon kaydıdır. HS kodu, Incoterms, taşıma ve beyan bilgileri kullanıcı tarafından doğrulanmalıdır; resmî gümrük beyannamesi veya e-belge gönderimi değildir.', 'This is an internal operations record linked to an order. Users must verify HS codes, Incoterms, transport and declaration details; this is not an official customs declaration or e-document submission.')}</p>
  </div>
}
