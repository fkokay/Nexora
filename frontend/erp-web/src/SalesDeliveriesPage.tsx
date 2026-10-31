import { useEffect, useState } from 'react'
import type * as AppTypes from './erp-types'
import { api } from './erpApi'
import { ArrowLeftRight, Boxes, Plus, Search, X } from 'lucide-react'
import { StandaloneFulfillmentPanel } from './StandaloneFulfillmentPanel'
import { SalesInvoiceModal } from './SalesInvoiceModal'
import ScreenViewGroupHeader from './ScreenViewGroupHeader'
type BuiltInScreenLayoutField=AppTypes.BuiltInScreenLayoutField
type SalesCustomer=AppTypes.SalesCustomer
type SalesDeliverySummary=AppTypes.SalesDeliverySummary
type StockItem=AppTypes.StockItem
type Warehouse=AppTypes.Warehouse

export function SalesDeliveriesScreen({token,role,warehouses,customers,stockItems}:{token:string;role:string;warehouses:Warehouse[];customers:SalesCustomer[];stockItems:StockItem[]}) {
  const [items,setItems]=useState<SalesDeliverySummary[]>([]),[total,setTotal]=useState(0),[page,setPage]=useState(1),[search,setSearch]=useState(''),[selectedId,setSelectedId]=useState<string|null>(null)
  const [creating,setCreating]=useState(false)
  const [screenFields,setScreenFields]=useState<BuiltInScreenLayoutField[]>([
    {key:'code',label:'İrsaliye no',visible:true,position:0},{key:'orderCode',label:'Sipariş no',visible:true,position:1},
    {key:'deliveryDate',label:'Sevk tarihi',visible:true,position:2},{key:'warehouseName',label:'Depo',visible:true,position:3},
    {key:'lineCount',label:'Satır',visible:true,position:4},{key:'status',label:'Durum',visible:true,position:5},
    {key:'invoiceStatus',label:'Fatura',visible:true,position:6},{key:'actions',label:'İşlemler',visible:true,position:7,fixed:true}
  ])
  const [detail,setDetail]=useState<{id:string;code:string;orderId:string;orderCode:string;warehouseName:string;deliveryDate:string;status:'Posted'|'Voided';lines:{orderLineNumber:number;stockItemId:string;stockCode:string;stockName:string;unitCode:string;quantity:number}[];hasSalesInvoice:boolean;invoiceStatus:'Posted'|'Voided'|null;invoiceId:string|null}|null>(null)
  const [invoiceId,setInvoiceId]=useState<string|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  useEffect(()=>{if(!detail)return;const closeOnEscape=(event:KeyboardEvent)=>{if(event.key==='Escape')setDetail(null)};window.addEventListener('keydown',closeOnEscape);return()=>window.removeEventListener('keydown',closeOnEscape)},[detail])
  const pageSize=25
  async function load(){setLoading(true);setError('');try{const result=await api<{items:SalesDeliverySummary[];totalCount:number}>(`/api/sales/deliveries/?page=${page}&pageSize=${pageSize}`,token);setItems(result.items);setTotal(result.totalCount)}catch(e){setError((e as Error).message)}finally{setLoading(false)}}
  useEffect(()=>{void load()},[token,page])
  useEffect(()=>{let cancelled=false;api<{fields:BuiltInScreenLayoutField[]}>('/api/screen-views/sales-deliveries/active',token).then(view=>{if(!cancelled&&view.fields?.length)setScreenFields(view.fields.map((field,index)=>({...field,fixed:field.key==='actions',position:field.position??index}))) }).catch(()=>{});return()=>{cancelled=true}},[token])
  const filtered=items.filter(x=>!search||`${x.code} ${x.orderCode} ${x.warehouseName}`.toLocaleLowerCase('tr').includes(search.toLocaleLowerCase('tr')))
  const selected=filtered.find(x=>x.id===selectedId)??filtered[0]??null
  const visibleFields=screenFields.filter(field=>field.visible).sort((a,b)=>a.position-b.position)
  function renderField(item:SalesDeliverySummary,field:BuiltInScreenLayoutField){switch(field.key){case 'code':return <button type="button" className="erp-link-button customer-code" aria-haspopup="dialog" aria-label={`${item.code} irsaliye ayrıntılarını aç`} onClick={event=>{event.stopPropagation();setSelectedId(item.id);void open(item.id)}}>{item.code}</button>;case 'orderCode':return item.orderCode;case 'deliveryDate':return item.deliveryDate.split('-').reverse().join('.');case 'warehouseName':return item.warehouseName;case 'lineCount':return item.lineCount;case 'status':return <span className={`quote-status ${item.status==='Posted'?'accepted':'rejected'}`}>{item.status==='Posted'?'Sevk edildi':'İptal'}</span>;case 'invoiceStatus':return item.invoiceId?<button className="row-action" onClick={()=>setInvoiceId(item.invoiceId)}>Faturayı aç</button>:<span className="cell-subtitle">Yok</span>;case 'actions':return <div className="row-actions"><button className="row-action" onClick={()=>void open(item.id)}>Satırları gör</button>{item.status==='Posted'&&!item.hasSalesInvoice&&role==='TenantAdmin'&&<button className="row-action danger-action" disabled={busy} onClick={()=>void voidDelivery(item)}>İptal et</button>}</div>;default:return null}}
  async function open(id:string){setError('');try{setDetail(await api<typeof detail>(`/api/sales/deliveries/${id}`,token))}catch(e){setError((e as Error).message)}}
  async function voidDelivery(item:SalesDeliverySummary){if(!window.confirm(`${item.code} irsaliyesi iptal edilsin mi? Stok çıkışı ters hareketle geri alınır.`))return;setBusy(true);setError('');try{await api<void>(`/api/sales/deliveries/${item.id}/void`,token,{method:'POST'});setDetail(null);await load()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
  return <div className={`delivery-screen${creating?' delivery-create-screen':''}`}><div className="page-heading customer-heading"><div><p className="eyebrow">ERP CORE · SATIŞ</p><h1>{creating?'Yeni satış irsaliyesi':'Satış irsaliyeleri'}</h1><p className="muted">{creating?'Siparişe bağlı olmadan sevk belgesi taslağı oluşturun.':'Sevk edilen sipariş satırlarını, depoları ve bağlı faturaları izleyin.'}</p></div>{creating?<button className="secondary" onClick={()=>setCreating(false)}><ArrowLeftRight size={15}/>İrsaliye listesine dön</button>:<button className="primary" onClick={()=>setCreating(true)}><Plus size={16}/>Yeni irsaliye</button>}</div>
    {error&&<div className="alert inline-alert" role="alert">{error}<button onClick={()=>setError('')}><X size={15}/></button></div>}
    {creating?<StandaloneFulfillmentPanel token={token} sales customers={customers} stockItems={stockItems} warehouses={warehouses}/>:<>
    <div className="customer-summary"><div className="customer-summary-icon"><Boxes size={19}/></div><div><b>{total} satış irsaliyesi</b><small>Siparişe bağlı sevkiyatlar burada listelenir.</small></div></div>
    <div className="customer-toolbar"><label className="customer-search"><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="İrsaliye, sipariş veya depo ara"/></label><span className="date-pill">{loading?'Yükleniyor…':`${total===0?0:(page-1)*pageSize+1}–${Math.min(page*pageSize,total)} / ${total}`}</span><button className="secondary" disabled={loading} onClick={()=>void load()}>Yenile</button></div>
    <div className="customer-table-wrap"><table className="customer-table quote-table"><thead><ScreenViewGroupHeader fields={visibleFields}/><tr>{visibleFields.map(field=><th key={field.key}>{field.label}</th>)}</tr></thead><tbody>{loading?<tr><td colSpan={visibleFields.length} className="table-empty">İrsaliyeler yükleniyor…</td></tr>:filtered.length===0?<tr><td colSpan={visibleFields.length} className="table-empty">{search?'Aramanızla eşleşen irsaliye yok.':'Henüz satış irsaliyesi yok. İrsaliye, açık sipariş ayrıntısından oluşturulur.'}</td></tr>:filtered.map(item=><tr key={item.id} className={selected?.id===item.id?'erp-selected-row':''} onClick={()=>setSelectedId(item.id)} aria-selected={selected?.id===item.id}>{visibleFields.map(field=><td key={field.key}>{renderField(item,field)}</td>)}</tr>)}</tbody></table></div>
    <div className="table-pagination"><span>Sayfa {page} / {Math.max(1,Math.ceil(total/pageSize))}</span><div><button className="secondary" disabled={page<=1||loading} onClick={()=>setPage(x=>Math.max(1,x-1))}>Önceki</button><button className="secondary" disabled={page*pageSize>=total||loading} onClick={()=>setPage(x=>x+1)}>Sonraki</button></div></div>
    </>}
    {detail&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setDetail(null)}}><div className="modal sales-detail-modal sales-delivery-detail-modal" role="dialog" aria-modal="true" aria-labelledby="sales-delivery-detail-title">
      <div className="modal-head"><div><p className="eyebrow">SATIŞ · SEVK BELGESİ</p><h2 id="sales-delivery-detail-title">İrsaliye ayrıntısı</h2><span className="delivery-document-code">{detail.code}</span></div><button type="button" className="icon-button" aria-label="İrsaliye ayrıntısını kapat" onClick={()=>setDetail(null)}><X size={19}/></button></div>
      <div className="delivery-detail-statusbar"><span className={`quote-status ${detail.status==='Posted'?'accepted':'rejected'}`}>{detail.status==='Posted'?'Sevk edildi':'İptal edildi'}</span><span>Satış irsaliyesi</span></div>
      <section className="delivery-detail-summary" aria-label="İrsaliye bilgileri">
        <article><small>İrsaliye numarası</small><b>{detail.code}</b><span>Belge numarası</span></article>
        <article><small>Bağlı sipariş</small><b>{detail.orderCode}</b><span>Satış siparişi</span></article>
        <article><small>Sevk deposu</small><b>{detail.warehouseName}</b><span>Stok çıkış noktası</span></article>
        <article><small>Sevk tarihi</small><b>{detail.deliveryDate.split('-').reverse().join('.')}</b><span>{detail.lines.length} stok kalemi</span></article>
      </section>
      <section className="delivery-detail-lines-section"><div className="delivery-detail-section-head"><div><p className="eyebrow">SEVK İÇERİĞİ</p><h3>İrsaliye kalemleri</h3></div><span>{detail.lines.length} satır</span></div><div className="customer-table-wrap sales-delivery-lines-wrap"><table className="customer-table sales-delivery-lines-table"><thead><tr><th>#</th><th>Stok kartı</th><th>Sipariş satırı</th><th>Sevk miktarı</th></tr></thead><tbody>{detail.lines.map((line,index)=><tr key={`${line.orderLineNumber}-${line.stockItemId}-${index}`}><td>{index+1}</td><td><b>{line.stockCode}</b><small className="cell-subtitle">{line.stockName}</small></td><td>{line.orderLineNumber}</td><td><strong>{line.quantity.toLocaleString('tr-TR',{maximumFractionDigits:4})}</strong><span className="delivery-line-unit">{line.unitCode}</span></td></tr>)}{detail.lines.length===0&&<tr><td colSpan={4} className="table-empty">İrsaliye kalemi bulunamadı.</td></tr>}</tbody></table></div></section>
      <section className="delivery-detail-invoice"><div><p className="eyebrow">FATURA BAĞLANTISI</p><h3>{detail.hasSalesInvoice?'Fatura oluşturulmuş':'Henüz fatura yok'}</h3><span>{detail.hasSalesInvoice?`Fatura durumu: ${detail.invoiceStatus==='Posted'?'İşlendi':'İptal edildi'}`:'İrsaliye, bağlı sipariş üzerinden faturalanabilir.'}</span></div>{detail.invoiceId&&<button type="button" className="secondary" onClick={()=>setInvoiceId(detail.invoiceId)}>Faturayı aç</button>}</section>
      <div className="modal-foot"><span>İrsaliye ve stok çıkış kaydı bağlı satış siparişinden izlenir.</span><button type="button" className="secondary" onClick={()=>setDetail(null)}>Kapat</button></div>
    </div></div>}
    {invoiceId&&<SalesInvoiceModal invoiceId={invoiceId} token={token} role={role} warehouses={warehouses} onClose={()=>setInvoiceId(null)} onSaved={load}/>}
  </div>
}
