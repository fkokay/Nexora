import { useEffect, useRef, useState } from 'react'
import { Barcode, RefreshCw, Search, ShieldCheck } from 'lucide-react'
import './inventory-tracking.css'

type Warehouse = { id:string; code:string; name:string; isActive:boolean }
type Balance = { stockItemId:string; stockItemCode:string; stockItemName:string; unitCode:string; trackingMode:'Lot'|'Serial'; warehouseId:string; warehouseCode:string; warehouseName:string; trackingCode:string; expiryDate:string|null; quantityOnHand:number; lastMovementDate:string }
type Page = { items:Balance[]; page:number; pageSize:number; totalCount:number }

async function request<T>(url:string, token:string):Promise<T>{
  const response=await fetch(url,{headers:{Authorization:`Bearer ${token}`}})
  const body=await response.json()
  if(!response.ok)throw new Error(body.error||`İstek başarısız (${response.status})`)
  return body as T
}

export default function InventoryTrackingPage({token}:{token:string}){
  const [warehouses,setWarehouses]=useState<Warehouse[]>([]),[warehouseId,setWarehouseId]=useState('')
  const [query,setQuery]=useState(''),[search,setSearch]=useState(''),[trackingMode,setTrackingMode]=useState('')
  const [result,setResult]=useState<Page|null>(null),[page,setPage]=useState(1),[loading,setLoading]=useState(true),[error,setError]=useState(''),[warehouseError,setWarehouseError]=useState(''),[warehousesLoading,setWarehousesLoading]=useState(true)
  const latestRequest=useRef(0)
  const pageSize=50
  async function load(nextPage=page){
    const requestId=++latestRequest.current
    setLoading(true);setError('')
    const params=new URLSearchParams({page:String(nextPage),pageSize:String(pageSize)})
    if(search.trim())params.set('q',search.trim())
    if(warehouseId)params.set('warehouseId',warehouseId)
    if(trackingMode)params.set('trackingMode',trackingMode)
    try{const data=await request<Page>(`/api/inventory-tracking/balances?${params}`,token);if(requestId===latestRequest.current){setResult(data);setPage(nextPage)}}catch(e){if(requestId===latestRequest.current)setError((e as Error).message)}finally{if(requestId===latestRequest.current)setLoading(false)}
  }
  useEffect(()=>{let cancelled=false;setWarehousesLoading(true);setWarehouseError('');request<Warehouse[]>('/api/warehouses/',token).then(rows=>{if(!cancelled)setWarehouses(rows)}).catch(e=>{if(!cancelled)setWarehouseError((e as Error).message)}).finally(()=>{if(!cancelled)setWarehousesLoading(false)});return()=>{cancelled=true}},[token])
  useEffect(()=>{void load(1)},[token,search,warehouseId,trackingMode])
  const maxPage=Math.max(1,Math.ceil((result?.totalCount??0)/pageSize))
  function submit(event:React.FormEvent){event.preventDefault();setSearch(query);if(search===query)void load(1)}
  function clearFilters(){setQuery('');setSearch('');setWarehouseId('');setTrackingMode('')}
  const hasFilters=Boolean(search||warehouseId||trackingMode)
  return <div className="inventory-tracking-page">
    <div className="page-heading customer-heading"><div><p className="eyebrow">ERP CORE · STOK İZLENEBİLİRLİĞİ</p><h1>Lot / seri izleme</h1><p className="muted">Depolardaki izlenen lot ve seri numaralarının güncel bakiyesini ve son hareket tarihini bulun.</p></div><button className="secondary" type="button" disabled={loading} onClick={()=>void load()} aria-label="Lot ve seri bakiyelerini yenile"><RefreshCw size={15} aria-hidden="true"/> Yenile</button></div>
    {warehouseError&&<div className="alert inline-alert" role="alert">Depo listesi yüklenemedi: {warehouseError}</div>}
    {error&&<div className="alert inline-alert inventory-tracking-error" role="alert"><span>Lot / seri bakiyeleri yüklenemedi: {error}</span><button className="secondary" type="button" onClick={()=>void load()} disabled={loading}>Yeniden dene</button></div>}
    <section className="customer-summary"><div className="customer-summary-icon"><Barcode size={19} aria-hidden="true"/></div><div><b>{result?.totalCount??0} izlenen bakiye</b><small>Yalnızca sıfırdan farklı, izli hareket bakiyeleri listelenir.</small></div><span className="tenant-scope"><ShieldCheck size={14} aria-hidden="true"/>Firma kapsamlı</span></section>
    <form className="customer-toolbar inventory-tracking-toolbar" onSubmit={submit} role="search" aria-label="Lot ve seri bakiyelerini filtrele">
      <label className="customer-search" htmlFor="inventory-tracking-search"><Search size={16} aria-hidden="true"/><input id="inventory-tracking-search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Lot/seri kodu, stok veya depo ara" autoComplete="off"/></label>
      <label htmlFor="inventory-tracking-mode">İz türü<select id="inventory-tracking-mode" value={trackingMode} onChange={event=>setTrackingMode(event.target.value)}><option value="">Tümü</option><option value="Lot">Lot</option><option value="Serial">Seri</option></select></label>
      <label htmlFor="inventory-tracking-warehouse">Depo<select id="inventory-tracking-warehouse" value={warehouseId} onChange={event=>setWarehouseId(event.target.value)} disabled={warehousesLoading} aria-describedby={warehouseError?'inventory-tracking-warehouse-error':undefined}><option value="">Tüm depolar</option>{warehouses.map(row=><option key={row.id} value={row.id}>{row.code} · {row.name}</option>)}</select>{warehouseError&&<span id="inventory-tracking-warehouse-error" className="inventory-tracking-field-error">Depo seçenekleri kullanılamıyor.</span>}</label>
      <div className="inventory-tracking-filter-actions"><button className="secondary" type="submit" disabled={loading}><Search size={14} aria-hidden="true"/> Ara</button>{hasFilters&&<button className="inventory-tracking-clear" type="button" onClick={clearFilters}>Filtreleri temizle</button>}</div>
    </form>
    <div className="inventory-tracking-results" aria-live="polite" aria-atomic="true"><span>{loading?'Bakiyeler yükleniyor…':error?'Sonuçlar yüklenemedi.':`${result?.totalCount??0} kayıt bulundu`}</span>{hasFilters&&!loading&&!error&&<span>Uygulanan filtreler: {[search&&`Arama: ${search}`,trackingMode&&`İz türü: ${trackingMode==='Lot'?'Lot':'Seri'}`,warehouseId&&`Depo: ${warehouses.find(row=>row.id===warehouseId)?.code??'Seçili depo'}`].filter(Boolean).join(' · ')}</span>}</div>
    <div className="customer-table-wrap inventory-tracking-table-wrap" role="region" aria-label="Lot ve seri bakiyeleri tablosu" tabIndex={0}>
      <table className="customer-table quote-table inventory-tracking-table"><caption className="inventory-tracking-sr-only">Lot ve seri bazında stok bakiyesi, depo, son kullanma ve son hareket bilgileri</caption><thead><tr><th scope="col">Lot / seri</th><th scope="col">İz türü</th><th scope="col">Stok</th><th scope="col">Depo</th><th scope="col">Mevcut miktar</th><th scope="col">Son kullanma</th><th scope="col">Son hareket</th></tr></thead><tbody>
        {loading?<tr><td colSpan={7} className="table-empty" role="status">İz kayıtları yükleniyor…</td></tr>:error?<tr><td colSpan={7} className="table-empty">Sonuçlar gösterilemiyor. Yeniden denemek için üstteki düğmeyi kullanın.</td></tr>:result?.items.length===0?<tr><td colSpan={7} className="table-empty">{hasFilters?'Bu filtrelerle aktif lot veya seri bakiyesi bulunamadı.':'Aktif lot veya seri bakiyesi bulunamadı.'}</td></tr>:result?.items.map(row=><tr key={`${row.stockItemId}:${row.warehouseId}:${row.trackingCode}:${row.expiryDate??''}`}><td><span className="customer-code">{row.trackingCode}</span></td><td><span className={`inventory-tracking-mode ${row.trackingMode==='Lot'?'is-lot':'is-serial'}`}>{row.trackingMode==='Lot'?'Lot':'Seri'}</span></td><td><b>{row.stockItemCode}</b><small className="cell-subtitle">{row.stockItemName}</small></td><td>{row.warehouseCode}<small className="cell-subtitle">{row.warehouseName}</small></td><td className="inventory-tracking-quantity"><b>{row.quantityOnHand.toLocaleString('tr-TR',{maximumFractionDigits:4})} {row.unitCode}</b></td><td>{row.expiryDate?new Date(`${row.expiryDate}T00:00:00`).toLocaleDateString('tr-TR'):'—'}</td><td>{new Date(`${row.lastMovementDate}T00:00:00`).toLocaleDateString('tr-TR')}</td></tr>)}
      </tbody></table>
    </div>
    <div className="table-pagination inventory-tracking-pagination"><span>{result?.totalCount??0} kayıt · Sayfa {page} / {maxPage}</span><div><button className="secondary" type="button" disabled={loading||page<=1} onClick={()=>void load(page-1)}>Önceki</button><button className="secondary" type="button" disabled={loading||page>=maxPage} onClick={()=>void load(page+1)}>Sonraki</button></div></div>
    <div className="boundary-note inventory-tracking-boundary"><ShieldCheck size={16} aria-hidden="true"/><span>Bakiye yalnız iz kodu bulunan stok hareketlerinden hesaplanır. Geçmişte konum veya iz kodu kaydedilmemiş hareketler geriye dönük atanmaz.</span></div>
  </div>
}
