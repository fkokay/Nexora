import { Plus, Search, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { api, localDateString } from '../../erpApi'
import type { SalesCustomer, SalesDeliverySummary, SalesInvoiceCustomFieldDefinition, SalesInvoiceSummary, SalesOrderDetail, SalesOrderSummary, StockItem, Warehouse } from '../../erp-types'
import SearchableRecordPicker from '../../SearchableRecordPicker'

type Props = {
  deliveries: SalesDeliverySummary[]
  orders: SalesOrderSummary[]
  customers: SalesCustomer[]
  stockItems: StockItem[]
  warehouses: Warehouse[]
  token: string
  initialMode?: 'delivery'|'order'|'standalone'
  total: number
  page: number
  search: string
  loading: boolean
  busyDeliveryId: string | null
  error: string
  onClose: () => void
  onSearchChange: (value: string) => void
  onPageChange: (page: number) => void
  onCreateInvoice: (delivery: SalesDeliverySummary) => void
  onInvoiceCreated: (id:string) => Promise<void>
}

export default function SalesInvoiceFromDeliveryDialog({
  deliveries, orders, customers, stockItems, warehouses, token, initialMode='delivery', total, page, search, loading, busyDeliveryId, error,
  onClose, onSearchChange, onPageChange, onCreateInvoice, onInvoiceCreated,
}: Props) {
  const [mode,setMode]=useState<'delivery'|'order'|'standalone'>(initialMode)
  const [orderId,setOrderId]=useState(''),[order,setOrder]=useState<SalesOrderDetail|null>(null),[orderLoading,setOrderLoading]=useState(false)
  const [warehouseId,setWarehouseId]=useState(''),[deliveryDate,setDeliveryDate]=useState(localDateString()),[orderBusy,setOrderBusy]=useState(false),[orderError,setOrderError]=useState('')
  const [standaloneCustomerId,setStandaloneCustomerId]=useState(''),[invoiceDate,setInvoiceDate]=useState(localDateString()),[standaloneBusy,setStandaloneBusy]=useState(false),[standaloneError,setStandaloneError]=useState('')
  const [standaloneLines,setStandaloneLines]=useState([{stockItemId:'',quantity:'1',unitPrice:'0',discountPercent:'0',vatPercent:'20'}])
  const [invoiceCustomFields,setInvoiceCustomFields]=useState<SalesInvoiceCustomFieldDefinition[]>([]),[invoiceCustomFieldValues,setInvoiceCustomFieldValues]=useState<Record<string,string>>({})
  const pageCount = Math.max(1, Math.ceil(total / 25))
  const selectedOrder=orders.find(item=>item.id===orderId)
  useEffect(()=>{let active=true;void api<SalesInvoiceCustomFieldDefinition[]>('/api/sales/invoices/custom-fields',token).then(fields=>{if(active)setInvoiceCustomFields(fields)}).catch(()=>{});return()=>{active=false}},[token])
  function renderInvoiceCustomFields(){return invoiceCustomFields.length>0&&<section className="panel"><div className="panel-heading"><div><b>Fatura özel alanları</b><small>Fatura kaydı için tenant tarafından tanımlanan alanlar</small></div></div><div className="form-two">{invoiceCustomFields.map(field=><label key={field.id}>{field.label}{field.isRequired?' *':''}<small>{field.code} · {field.dataType}</small>{field.dataType==='Boolean'?<select required={field.isRequired} value={invoiceCustomFieldValues[field.code]||''} onChange={event=>setInvoiceCustomFieldValues(values=>({...values,[field.code]:event.target.value}))}><option value="">Seçin</option><option value="true">Evet</option><option value="false">Hayır</option></select>:<input type={field.dataType==='Decimal'?'number':field.dataType==='Date'?'date':'text'} step={field.dataType==='Decimal'?'any':undefined} maxLength={field.dataType==='Text'?field.maxLength:undefined} required={field.isRequired} value={invoiceCustomFieldValues[field.code]||''} onChange={event=>setInvoiceCustomFieldValues(values=>({...values,[field.code]:event.target.value}))}/>}</label>)}</div></section>}
  const customFieldsPayload=Object.fromEntries(invoiceCustomFields.map(field=>[field.code,invoiceCustomFieldValues[field.code]||'']))
  const reservedWarehouseIds=useMemo(()=>Array.from(new Set(order?.lines.filter(line=>line.remainingQuantity>0&&line.reservationId&&line.reservationWarehouseId).map(line=>line.reservationWarehouseId!)??[])),[order])
  useEffect(()=>{if(!orderId){setOrder(null);return}let active=true;setOrderLoading(true);setOrderError('');void api<SalesOrderDetail>(`/api/sales/orders/${orderId}`,token).then(result=>{if(active){setOrder(result);const reserved=Array.from(new Set(result.lines.filter(line=>line.remainingQuantity>0&&line.reservationId&&line.reservationWarehouseId).map(line=>line.reservationWarehouseId!)));setWarehouseId(reserved.length===1?reserved[0]:warehouses[0]?.id||'')}}).catch(error=>{if(active){setOrder(null);setOrderError((error as Error).message)}}).finally(()=>{if(active)setOrderLoading(false)});return()=>{active=false}},[orderId,token,warehouses])
  async function createInvoiceFromOrder(){if(!order||!warehouseId)return;setOrderBusy(true);setOrderError('');try{if(reservedWarehouseIds.length>1)throw new Error('Sipariş satırları farklı depolarda rezerve edilmiş. Önce rezervasyonları tek depoda birleştirin.');const lines=order.lines.filter(line=>line.remainingQuantity>0).map(line=>({orderLineNumber:line.lineNumber,quantity:line.remainingQuantity,unitCode:line.unitCode}));if(!lines.length)throw new Error('Siparişin faturalanabilecek kalan miktarı yok.');const delivery=await api<SalesDeliverySummary>(`/api/sales/orders/${order.id}/deliveries`,token,{method:'POST',body:JSON.stringify({requestId:crypto.randomUUID(),warehouseId,deliveryDate,lines})});try{const invoice=await api<SalesInvoiceSummary>(`/api/sales/deliveries/${delivery.id}/invoice`,token,{method:'POST',body:JSON.stringify({customFields:customFieldsPayload})});onClose();await onInvoiceCreated(invoice.id)}catch(error){throw new Error(`İrsaliye ${delivery.code} oluşturuldu ancak fatura kesilemedi: ${(error as Error).message} İrsaliyeler ekranından faturalaştırmayı tekrar deneyin.`)}}catch(error){setOrderError((error as Error).message)}finally{setOrderBusy(false)}}
  async function createStandaloneInvoice(event:FormEvent<HTMLFormElement>){event.preventDefault();if(!standaloneCustomerId||!warehouseId)return;setStandaloneBusy(true);setStandaloneError('');try{const invoice=await api<SalesInvoiceSummary>('/api/sales/invoices/',token,{method:'POST',body:JSON.stringify({requestId:crypto.randomUUID(),customerId:standaloneCustomerId,warehouseId,invoiceDate,customFields:customFieldsPayload,lines:standaloneLines.map(line=>({stockItemId:line.stockItemId,quantity:Number(line.quantity),unitPrice:Number(line.unitPrice),discountPercent:Number(line.discountPercent),vatPercent:Number(line.vatPercent)}))})});onClose();await onInvoiceCreated(invoice.id)}catch(error){setStandaloneError((error as Error).message)}finally{setStandaloneBusy(false)}}
  const standaloneTotal=standaloneLines.reduce((sum,line)=>{const base=Number(line.quantity||0)*Number(line.unitPrice||0)*(1-Number(line.discountPercent||0)/100);return sum+base*(1+Number(line.vatPercent||0)/100)},0)

  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busyDeliveryId) onClose() }}>
    <section className="modal" role="dialog" aria-modal="true" aria-labelledby="sales-invoice-create-title">
      <div className="modal-head"><div><p className="eyebrow">SATIŞ · FATURALAMA</p><h2 id="sales-invoice-create-title">{mode==='order'?'Siparişten irsaliye ve fatura':'Yeni satış faturası'}</h2></div><button type="button" className="icon-button" disabled={!!busyDeliveryId||standaloneBusy||orderBusy} aria-label="Pencereyi kapat" onClick={onClose}><X size={19}/></button></div>
      <p className="muted">{mode==='order'?'Açık siparişin kalan miktarından stok çıkışlı irsaliye ve fatura oluşturun.':mode==='standalone'?'Sipariş seçmeden fatura oluşturun. Seçilen depodan stok çıkışı ve faturaya bağlı irsaliye otomatik kaydedilir.':'Kaydedilmiş ve faturalanmamış irsaliyeyi seçerek faturayı oluşturun.'}</p>
      <nav className="customer-directory-tabs" aria-label="Fatura oluşturma yöntemi"><button type="button" className={mode==='delivery'?'active':''} onClick={()=>setMode('delivery')}>Mevcut irsaliyeden</button><button type="button" className={mode==='order'?'active':''} onClick={()=>setMode('order')}>Siparişten irsaliye oluştur</button><button type="button" className={mode==='standalone'?'active':''} onClick={()=>setMode('standalone')}>Siparişsiz fatura + irsaliye</button></nav>
      {mode==='delivery'&&<>
      <label className="customer-search"><Search size={16}/><input value={search} onChange={event => onSearchChange(event.target.value)} placeholder="İrsaliye no, sipariş no veya müşteriyle ara"/></label>
      {error && <div className="alert inline-alert" role="alert">{error}</div>}
      <div className="requests-list" style={{ maxHeight: 'min(48vh,420px)', overflowY: 'auto', marginTop: 12 }}>
        {loading ? <div className="empty-small" role="status">İrsaliyeler yükleniyor…</div> : deliveries.map(item => <article className="request-row" key={item.id}>
          <div className="request-info"><b>{item.code} · {item.orderCode}</b><small>{item.deliveryDate.split('-').reverse().join('.')} · {item.lineCount} satır · {item.warehouseName}</small></div>
          <button type="button" className="row-action" disabled={!!busyDeliveryId} onClick={() => onCreateInvoice(item)}>{busyDeliveryId === item.id ? 'Oluşturuluyor…' : 'Fatura kes'}</button>
        </article>)}
        {!loading && deliveries.length === 0 && !error && <div className="empty-small">{search ? 'Aramanızla eşleşen faturalanmamış irsaliye yok.' : 'Faturalanmamış, kaydedilmiş irsaliye bulunmuyor.'}</div>}
      </div>
      <div className="modal-foot"><span>{total} faturalanmamış irsaliye · Sayfa {page} / {pageCount}</span><div>
        <button type="button" className="secondary" disabled={page <= 1 || loading} onClick={() => onPageChange(Math.max(1, page - 1))}>Önceki</button>
        <button type="button" className="secondary" disabled={page >= pageCount || loading} onClick={() => onPageChange(page + 1)}>Sonraki</button>
        <button type="button" className="secondary" disabled={!!busyDeliveryId} onClick={onClose}>Kapat</button>
      </div></div>
      </>}
      {mode==='order'&&<div className="sales-invoice-from-order">
        <label>Açık satış siparişi<select value={orderId} onChange={event=>setOrderId(event.target.value)}><option value="">Sipariş seçin</option>{orders.filter(item=>item.status==='Open').map(item=><option key={item.id} value={item.id}>{item.code} · {item.customerName} · {item.currencyCode} {item.grandTotal.toLocaleString('tr-TR',{minimumFractionDigits:2})}</option>)}</select></label>
        {orderLoading&&<div className="empty-small" role="status">Sipariş satırları yükleniyor…</div>}
        {order&&<><div className="form-two"><label>Sevk deposu<select value={warehouseId} onChange={event=>setWarehouseId(event.target.value)} disabled={reservedWarehouseIds.length===1}><option value="">Depo seçin</option>{warehouses.filter(item=>!reservedWarehouseIds.length||reservedWarehouseIds.includes(item.id)).map(item=><option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label><label>İrsaliye tarihi<input type="date" value={deliveryDate} onChange={event=>setDeliveryDate(event.target.value)} required/></label></div><div className="requests-list">{order.lines.filter(line=>line.remainingQuantity>0).map(line=><article className="request-row" key={line.lineNumber}><div className="request-info"><b>{line.stockCode} · {line.stockName}</b><small>Faturalanacak kalan miktar: {line.remainingQuantity.toLocaleString('tr-TR',{maximumFractionDigits:4})} {line.unitCode}</small></div></article>)}{order.lines.every(line=>line.remainingQuantity<=0)&&<div className="empty-small">Bu siparişte sevk edilebilir miktar kalmamış.</div>}</div>{renderInvoiceCustomFields()}<p className="muted">İşlem, siparişin kalan miktarları için stok çıkışlı bir irsaliye oluşturur ve ardından faturayı keserek cari borcunu kaydeder.</p></>}
        {(orderError||error)&&<div className="alert inline-alert" role="alert">{orderError||error}</div>}
        <div className="modal-foot"><span>{selectedOrder?`Sipariş ${selectedOrder.code}`:'Sipariş seçilmedi'}</span><div><button type="button" className="secondary" disabled={orderBusy} onClick={onClose}>Vazgeç</button><button type="button" className="primary" disabled={!order||!warehouseId||orderLoading||orderBusy||reservedWarehouseIds.length>1||order.lines.every(line=>line.remainingQuantity<=0)} onClick={()=>void createInvoiceFromOrder()}>{orderBusy?'İrsaliye ve fatura oluşturuluyor…':'İrsaliye ve faturayı oluştur'}</button></div></div>
      </div>}
      {mode==='standalone'&&<form className="sales-invoice-standalone" onSubmit={event=>void createStandaloneInvoice(event)}>
        <div className="form-two"><label>Müşteri<SearchableRecordPicker options={customers.filter(customer=>customer.isActive&&customer.type!=='Supplier').map(customer=>({id:customer.id,label:`${customer.code} · ${customer.name}`,description:customer.currencyCode}))} selectedId={standaloneCustomerId} onSelect={id=>setStandaloneCustomerId(id)} title="Müşteri seçin" placeholder="Müşteri seçin" searchPlaceholder="Müşteri kodu veya unvanıyla ara" emptyMessage="Eşleşen aktif müşteri yok." required/></label><label>Depo<SearchableRecordPicker options={warehouses.filter(warehouse=>warehouse.isActive).map(warehouse=>({id:warehouse.id,label:`${warehouse.code} · ${warehouse.name}`,description:'Stok çıkışı bu depodan yapılır'}))} selectedId={warehouseId} onSelect={id=>setWarehouseId(id)} title="Depo seçin" placeholder="Depo seçin" searchPlaceholder="Depo kodu veya adıyla ara" emptyMessage="Aktif depo bulunamadı." required/></label><label>Fatura tarihi<input type="date" value={invoiceDate} onChange={event=>setInvoiceDate(event.target.value)} required/></label></div>
        <div className="sales-invoice-standalone-lines"><div className="sales-invoice-standalone-heading"><b>Fatura satırları</b><button type="button" className="secondary" onClick={()=>setStandaloneLines(lines=>[...lines,{stockItemId:'',quantity:'1',unitPrice:'0',discountPercent:'0',vatPercent:'20'}])}><Plus size={15}/> Satır ekle</button></div>
          {standaloneLines.map((line,index)=><div className="sales-invoice-standalone-line" key={index}><label className="standalone-stock">Stok<SearchableRecordPicker options={stockItems.filter(item=>item.isActive).map(item=>({id:item.id,label:`${item.code} · ${item.name}`,description:item.unitCode}))} selectedId={line.stockItemId} onSelect={id=>setStandaloneLines(lines=>lines.map((item,i)=>i===index?{...item,stockItemId:id}:item))} title="Stok seçin" placeholder="Stok kartı seçin" searchPlaceholder="Stok kodu veya adıyla ara" emptyMessage="Eşleşen aktif stok kartı yok." required/></label><label>Miktar<input type="number" min="0.0001" step="0.0001" value={line.quantity} onChange={event=>setStandaloneLines(lines=>lines.map((item,i)=>i===index?{...item,quantity:event.target.value}:item))} required/></label><label>Birim fiyat<input type="number" min="0" step="0.0001" value={line.unitPrice} onChange={event=>setStandaloneLines(lines=>lines.map((item,i)=>i===index?{...item,unitPrice:event.target.value}:item))} required/></label><label>İskonto %<input type="number" min="0" max="100" step="0.01" value={line.discountPercent} onChange={event=>setStandaloneLines(lines=>lines.map((item,i)=>i===index?{...item,discountPercent:event.target.value}:item))}/></label><label>KDV %<input type="number" min="0" max="100" step="0.01" value={line.vatPercent} onChange={event=>setStandaloneLines(lines=>lines.map((item,i)=>i===index?{...item,vatPercent:event.target.value}:item))}/></label><button type="button" className="icon-button standalone-remove" aria-label={`Satır ${index+1} sil`} disabled={standaloneLines.length===1} onClick={()=>setStandaloneLines(lines=>lines.filter((_,i)=>i!==index))}><Trash2 size={16}/></button></div>)}
        </div>{renderInvoiceCustomFields()}
        {standaloneError&&<div className="alert inline-alert" role="alert">{standaloneError}</div>}
        <div className="modal-foot"><span>İrsaliye ve stok çıkışı oluşturulur · Fatura toplamı {standaloneTotal.toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2})} {customers.find(customer=>customer.id===standaloneCustomerId)?.currencyCode||''}</span><div><button type="button" className="secondary" disabled={standaloneBusy} onClick={onClose}>Vazgeç</button><button type="submit" className="primary" disabled={standaloneBusy||!standaloneCustomerId||!warehouseId}>{standaloneBusy?'İrsaliye ve fatura kaydediliyor…':'İrsaliye ve faturayı oluştur'}</button></div></div>
      </form>}
    </section>
  </div>
}
