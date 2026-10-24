import { useEffect, useMemo, useState } from 'react'
import { authenticatedFetch } from './authApi';
import { ArrowRight, FileText, Globe2, PackageCheck, Plus, RefreshCw, Ship } from 'lucide-react'
import './foreign-trade.css'

type Direction = 'Import' | 'Export'
type TradeStatus = 'Draft' | 'Booked' | 'Shipped' | 'CustomsClearance' | 'Arrived' | 'Closed' | 'Cancelled'
type TradeOrder = { id: string; code: string; counterpartyName: string; orderDate: string; currencyCode: string; grandTotal: number; status: string; direction: Direction }
type TradeCase = { id: string; direction: Direction; status: TradeStatus; purchaseOrderId: string | null; salesOrderId: string | null; referenceCode: string; originCountryCode: string; destinationCountryCode: string; incotermsCode: string | null; harmonizedSystemCode: string | null; transportMode: string; carrierReference: string | null; customsReference: string | null; declaredValue: number; currencyCode: string; plannedShipDate: string | null; actualShipDate: string | null; plannedArrivalDate: string | null; actualArrivalDate: string | null; notes: string | null; updatedAt: string }
type CasePage = { items: TradeCase[]; total: number }
type TradeCapabilities = { canCreate: boolean; canUpdate: boolean; canAdvance: boolean }
type Draft = { direction: Direction; orderId: string; referenceCode: string; originCountryCode: string; destinationCountryCode: string; incotermsCode: string; harmonizedSystemCode: string; transportMode: string; carrierReference: string; customsReference: string; declaredValue: string; plannedShipDate: string; plannedArrivalDate: string; notes: string }
const blankDraft = (): Draft => ({ direction: 'Import', orderId: '', referenceCode: '', originCountryCode: '', destinationCountryCode: '', incotermsCode: '', harmonizedSystemCode: '', transportMode: 'Road', carrierReference: '', customsReference: '', declaredValue: '', plannedShipDate: '', plannedArrivalDate: '', notes: '' })
const statusLabel: Record<TradeStatus, string> = { Draft: 'Taslak', Booked: 'Planlandı', Shipped: 'Sevkte', CustomsClearance: 'Gümrükte', Arrived: 'Ulaştı', Closed: 'Kapandı', Cancelled: 'İptal' }
const nextStatus: Partial<Record<TradeStatus, TradeStatus>> = { Draft: 'Booked', Booked: 'Shipped', Shipped: 'CustomsClearance', CustomsClearance: 'Arrived', Arrived: 'Closed' }

function requiredPermission(url: string, method?: string) {
  if (url.endsWith('/capabilities')) return 'firma üyeliği ve oturum'
  if (url.endsWith('/transition')) return 'erp.foreign-trade.execute'
  if (url.includes('/orders') || url.includes('/cases') && (!method || method.toUpperCase() === 'GET')) return 'erp.foreign-trade.read'
  if (method?.toUpperCase() === 'PUT') return 'erp.foreign-trade.update'
  return 'erp.foreign-trade.create'
}

export default function ForeignTradePage({ token }: { token: string; role: string }) {
  const [cases, setCases] = useState<TradeCase[]>([])
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

  async function api<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await authenticatedFetch(url, token, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init?.headers } })
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { error?: string; title?: string } | null
      if (response.status === 403) {
        const permission = requiredPermission(url, init?.method)
        throw new Error(`Bu firmada ${permission} erişiminiz yok. Dış ticaret izinlerini firma yöneticiniz İzin politikaları ekranından tanımlayabilir. Bu kodu iletin: ${permission}.`)
      }
      throw new Error(body?.error || body?.title || `İstek başarısız (${response.status}).`)
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
      setCases(casePage.items); setOrders([...imports.map(x=>({...x,direction:'Import' as const})), ...exports.map(x=>({...x,direction:'Export' as const}))])
    } catch (cause) { setError((cause as Error).message) }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [token])

  const filtered = useMemo(() => cases.filter(item => (filter === 'All' || item.direction === filter) && `${item.referenceCode} ${item.customsReference || ''} ${item.carrierReference || ''}`.toLocaleLowerCase('tr-TR').includes(query.toLocaleLowerCase('tr-TR'))), [cases, filter, query])
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
      setCreating(false); setNotice('Dış ticaret dosyası oluşturuldu ve denetim kaydına eklendi.'); await load()
    } catch (cause) { setError((cause as Error).message) }
    finally { setBusyId('') }
  }
  async function transition(item: TradeCase, status: TradeStatus) {
    if (!capabilities.canAdvance) return
    setBusyId(item.id); setError(''); setNotice('')
    try {
      await api<TradeCase>(`/api/foreign-trade/cases/${item.id}/transition`, { method: 'POST', body: JSON.stringify({ status }) })
      setNotice(`${item.referenceCode}: ${statusLabel[status]} durumuna geçirildi.`); await load()
    } catch (cause) { setError((cause as Error).message) }
    finally { setBusyId('') }
  }

  return <div className="page-content foreign-trade-page">
    <header className="foreign-trade-hero"><div className="foreign-trade-hero-icon"><Globe2 size={24}/></div><div><p className="eyebrow">ERP CORE · DIŞ TİCARET</p><h1>İthalat ve ihracat dosyaları</h1><p>Satın alma ve satış siparişlerine bağlı lojistik, gümrük referansı ve sevkiyat adımlarını izleyin.</p><small>Operasyon takibi sağlar; gümrük beyannamesi veya mevzuat uygunluğu üretmez.</small></div><div className="foreign-trade-hero-actions"><button className="secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={15}/> Yenile</button>{capabilities.canCreate && <><button className="secondary" onClick={() => startCreate('Import')}><Plus size={15}/> İthalat dosyası</button><button className="primary" onClick={() => startCreate('Export')}><Plus size={15}/> İhracat dosyası</button></>}</div></header>
    {(!capabilities.canCreate || !capabilities.canAdvance) && !loading && !error && <div className="foreign-trade-access-note" role="note"><strong>Eksik işlem izni</strong><span>{[!capabilities.canCreate && 'erp.foreign-trade.create', !capabilities.canAdvance && 'erp.foreign-trade.execute'].filter(Boolean).join(' · ')} izinlerini firma yöneticiniz İzin politikaları ekranında bu üyeye veya TenantUser rolüne tanımlayabilir. Kayıtları görüntülemek için ayrıca <code>erp.foreign-trade.read</code> gerekir.</span></div>}
    {error && <div className="alert inline-alert" role="alert">{error}</div>}{notice && <div className="notice" role="status">{notice}</div>}
    <div className="foreign-trade-metrics"><article className="panel"><span><FileText size={17}/></span><b>{cases.length}</b><small>Toplam dosya</small></article><article className="panel"><span><PackageCheck size={17}/></span><b>{cases.filter(x => x.status === 'CustomsClearance').length}</b><small>Gümrük adımı</small></article><article className="panel"><span><Ship size={17}/></span><b>{cases.filter(x => x.status === 'Shipped' || x.status === 'CustomsClearance').length}</b><small>Yolda</small></article></div>
    {creating && <section className="panel foreign-trade-create"><div className="panel-heading"><div><p className="eyebrow">YENİ DOSYA</p><h2>{draft.direction === 'Import' ? 'İthalat dosyası oluştur' : 'İhracat dosyası oluştur'}</h2></div><button className="secondary" type="button" onClick={() => setCreating(false)}>Vazgeç</button></div><form onSubmit={create}>
      <div className="form-two"><label>Bağlı sipariş<select required value={draft.orderId} onChange={e => { const orderId=e.target.value; const order=orders.find(x=>x.id===orderId); setDraft(x=>({...x,orderId,declaredValue:order?String(order.grandTotal):''})) }}><option value="">Sipariş seçin</option>{orders.filter(order => order.direction===draft.direction && order.status !== 'Cancelled').map(order => <option value={order.id} key={order.id}>{order.code} · {order.counterpartyName} · {order.grandTotal.toLocaleString('tr-TR')} {order.currencyCode}</option>)}</select></label><label>Dış ticaret referansı<input required maxLength={50} value={draft.referenceCode} onChange={e=>setDraft(x=>({...x,referenceCode:e.target.value}))} placeholder="IMP-2026-001"/></label></div>
      <div className="form-two"><label>Çıkış ülkesi (ISO alfa-2)<input required maxLength={2} pattern="[A-Za-z]{2}" value={draft.originCountryCode} onChange={e=>setDraft(x=>({...x,originCountryCode:e.target.value.toUpperCase()}))} placeholder="TR"/></label><label>Varış ülkesi (ISO alfa-2)<input required maxLength={2} pattern="[A-Za-z]{2}" value={draft.destinationCountryCode} onChange={e=>setDraft(x=>({...x,destinationCountryCode:e.target.value.toUpperCase()}))} placeholder="DE"/></label></div>
      <div className="form-three"><label>Incoterms 2020<select value={draft.incotermsCode} onChange={e=>setDraft(x=>({...x,incotermsCode:e.target.value}))}><option value="">Seçin</option>{['EXW','FCA','CPT','CIP','DAP','DPU','DDP','FAS','FOB','CFR','CIF'].map(code=><option key={code}>{code}</option>)}</select></label><label>HS kodu<input maxLength={10} pattern="[0-9]{0,10}" value={draft.harmonizedSystemCode} onChange={e=>setDraft(x=>({...x,harmonizedSystemCode:e.target.value}))} placeholder="6–10 rakam"/></label><label>Taşıma<select value={draft.transportMode} onChange={e=>setDraft(x=>({...x,transportMode:e.target.value}))}><option value="Road">Kara</option><option value="Sea">Deniz</option><option value="Air">Hava</option><option value="Rail">Demir yolu</option><option value="Multimodal">Çok modlu</option></select></label></div>
      <div className="form-three"><label>Beyan değeri ({selectedOrder?.currencyCode || 'sipariş para birimi'})<input type="number" min="0" step="0.01" value={draft.declaredValue} onChange={e=>setDraft(x=>({...x,declaredValue:e.target.value}))} placeholder={selectedOrder ? String(selectedOrder.grandTotal) : 'Sipariş seçin'}/></label><label>Planlanan sevkiyat<input type="date" value={draft.plannedShipDate} onChange={e=>setDraft(x=>({...x,plannedShipDate:e.target.value}))}/></label><label>Planlanan varış<input type="date" value={draft.plannedArrivalDate} onChange={e=>setDraft(x=>({...x,plannedArrivalDate:e.target.value}))}/></label></div>
      <div className="form-two"><label>Taşıyıcı / takip referansı<input maxLength={100} value={draft.carrierReference} onChange={e=>setDraft(x=>({...x,carrierReference:e.target.value}))}/></label><label>Gümrük referansı<input maxLength={100} value={draft.customsReference} onChange={e=>setDraft(x=>({...x,customsReference:e.target.value}))}/></label></div><label>Operasyon notu<textarea rows={2} maxLength={1000} value={draft.notes} onChange={e=>setDraft(x=>({...x,notes:e.target.value}))}/></label>
      <div className="modal-foot"><span>Sipariş, firma veritabanında doğrulanır ve referans değişiklikleri denetlenir.</span><button className="primary" disabled={busyId==='create'||!selectedOrder}>{busyId==='create'?'Kaydediliyor…':'Dosya oluştur'}</button></div>
    </form></section>}
    <section className="panel foreign-trade-list"><div className="panel-heading"><div><h2>Dış ticaret kayıtları</h2><p>İthalat ve ihracat dosyaları, bağlı sipariş ve güncel lojistik adım.</p></div><div className="foreign-trade-filters"><input aria-label="Referans ara" placeholder="Referans ara…" value={query} onChange={e=>setQuery(e.target.value)}/><select aria-label="Yön filtresi" value={filter} onChange={e=>setFilter(e.target.value as 'All'|Direction)}><option value="All">Tüm yönler</option><option value="Import">İthalat</option><option value="Export">İhracat</option></select></div></div>
      {loading?<div className="empty-small">Dış ticaret kayıtları yükleniyor…</div>:filtered.length===0?<div className="empty-small">{cases.length?'Filtreyle eşleşen dosya yok.':'Henüz dış ticaret dosyası bulunmuyor. İthalat veya ihracat siparişine bağlı yeni dosya oluşturun.'}</div>:<div className="table-wrap"><table><thead><tr><th>Referans</th><th>Yön</th><th>Bağlı sipariş</th><th>Ülkeler</th><th>Incoterms / Taşıma</th><th>Beyan</th><th>Durum</th><th>İşlem</th></tr></thead><tbody>{filtered.map(item=>{const order=orderMap.get(item.purchaseOrderId||item.salesOrderId||'');const next=nextStatus[item.status];return <tr key={item.id}><td><b>{item.referenceCode}</b><small>{item.customsReference||item.carrierReference||'Referans bekleniyor'}</small></td><td><span className={`trade-direction ${item.direction.toLowerCase()}`}>{item.direction==='Import'?'İthalat':'İhracat'}</span></td><td>{order?<><b>{order.code}</b><small>{order.counterpartyName}</small></>:<span>Sipariş</span>}</td><td>{item.originCountryCode} <ArrowRight size={13}/> {item.destinationCountryCode}</td><td>{item.incotermsCode||'—'} · {item.transportMode}</td><td>{item.declaredValue.toLocaleString('tr-TR',{minimumFractionDigits:2})} {item.currencyCode}</td><td><span className={`trade-status ${item.status.toLowerCase()}`}>{statusLabel[item.status]}</span></td><td>{capabilities.canAdvance&&next&&<button className="secondary small-button" disabled={busyId===item.id} onClick={()=>void transition(item,next)}>{busyId===item.id?'…':`${statusLabel[next]} →`}</button>}{capabilities.canAdvance&&['Draft','Booked'].includes(item.status)&&<button className="row-action danger-action" disabled={busyId===item.id} onClick={()=>void transition(item,'Cancelled')}>İptal et</button>}</td></tr>})}</tbody></table></div>}
    </section><p className="foreign-trade-footnote">Bu ekran siparişe bağlı iç operasyon kaydıdır. HS kodu, Incoterms, taşıma ve beyan bilgileri kullanıcı tarafından doğrulanmalıdır; resmî gümrük beyannamesi veya e-belge gönderimi değildir.</p>
  </div>
}
