import { useCallback, useEffect, useState } from 'react'
import { authenticatedFetch } from './authApi';
import { addLocalCalendarDays, localDateString } from './dateUtils'
import type { FormEvent } from 'react'
import './sales-promotions.css'
import CampaignsSection from './sales-promotions/components/CampaignsSection'
import CampaignPerformanceSection from './sales-promotions/components/CampaignPerformanceSection'
import ApplyCampaignSection from './sales-promotions/components/ApplyCampaignSection'
import CampaignDialog from './sales-promotions/components/CampaignDialog'
import type { Campaign, CampaignScreenField, PerformancePage, PerformanceScreenField, Quote } from './sales-promotions/components/types'

const defaultCampaignScreenFields: CampaignScreenField[] = [
  { key:'code', label:'Kampanya kodu', visible:true, position:0 },
  { key:'name', label:'Kampanya adı', visible:true, position:1 },
  { key:'discountPercent', label:'İndirim', visible:true, position:2 },
  { key:'effectiveFrom', label:'Başlangıç', visible:true, position:3 },
  { key:'effectiveThrough', label:'Bitiş', visible:true, position:4 },
  { key:'status', label:'Durum', visible:true, position:5 },
  { key:'applicationCount', label:'Uygulama', visible:true, position:6 },
]
const campaignScreenKeys = new Set(defaultCampaignScreenFields.map(field => field.key))
const defaultPerformanceScreenFields:PerformanceScreenField[]=[
  {key:'campaign',label:'Kampanya',visible:true,position:0},{key:'applications',label:'Uygulama',visible:true,position:1},
  {key:'appliedQuotes',label:'Uygulanan teklifler',visible:true,position:2},{key:'discountTotals',label:'İndirim tutarı',visible:true,position:3},
  {key:'linkedOrders',label:'Bağlantılı sipariş',visible:true,position:4},{key:'linkedOrderTotals',label:'Sipariş toplamı',visible:true,position:5}
]
const performanceScreenKeys=new Set(defaultPerformanceScreenFields.map(field=>field.key))
type QuotePage = { items: Quote[]; page: number; pageSize: number; totalCount: number }
type Props = { token:string; role:string; onBack?:()=>void }

async function request<T>(url:string, token:string, init:RequestInit={}):Promise<T>{
  const response=await authenticatedFetch(url, token, {...init,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',...init.headers}})
  if(!response.ok){let message=`İstek başarısız (${response.status})`;try{const body=await response.json();message=body.error||body.title||message}catch{}throw new Error(message)}
  return response.status===204?undefined as T:await response.json() as T
}

export default function SalesPromotionsPage({token,role,onBack}:Props){
  const [campaigns,setCampaigns]=useState<Campaign[]>([]),[quotes,setQuotes]=useState<Quote[]>([])
  const [code,setCode]=useState(''),[name,setName]=useState(''),[percent,setPercent]=useState('10'),[from,setFrom]=useState(localDateString()),[through,setThrough]=useState(addLocalCalendarDays(30))
  const [campaignId,setCampaignId]=useState(''),[quoteId,setQuoteId]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
  const [createOpen,setCreateOpen]=useState(false)
  const [editingCampaign,setEditingCampaign]=useState<Campaign|null>(null)
  const [activeSection,setActiveSection]=useState<'campaigns'|'performance'|'apply'>('campaigns')
  const [campaignScreenFields,setCampaignScreenFields]=useState(defaultCampaignScreenFields)
  const [performanceScreenFields,setPerformanceScreenFields]=useState(defaultPerformanceScreenFields)
  const [campaignQuery,setCampaignQuery]=useState('')
  const [performance,setPerformance]=useState<PerformancePage|null>(null),[reportQuery,setReportQuery]=useState(''),[reportFrom,setReportFrom]=useState(''),[reportThrough,setReportThrough]=useState(''),[reportPage,setReportPage]=useState(1)
  const load=useCallback(async()=>{const [campaignRows,quotePage]=await Promise.all([request<Campaign[]>('/api/sales/promotions/',token),request<QuotePage>('/api/sales/quotes/?page=1&pageSize=100',token)]);setCampaigns(campaignRows);setQuotes(quotePage.items.filter(x=>x.status==='Draft'&&x.lineCount>0));if(!campaignId)setCampaignId(campaignRows.find(x=>x.isActive)?.id||'')},[token,campaignId])
  const loadPerformance=useCallback(async()=>{const params=new URLSearchParams({page:String(reportPage),pageSize:'25'});if(reportQuery.trim())params.set('q',reportQuery.trim());if(reportFrom)params.set('from',reportFrom);if(reportThrough)params.set('through',reportThrough);setPerformance(await request<PerformancePage>(`/api/sales/quotes/campaign-performance?${params}`,token))},[token,reportQuery,reportFrom,reportThrough,reportPage])
  useEffect(()=>{void load().catch(e=>setError((e as Error).message))},[load])
  useEffect(()=>{
    let current=true
    void request<{fields?:CampaignScreenField[]}>('/api/screen-views/sales-promotions/active',token)
      .then(view=>{
        if(!current||!Array.isArray(view.fields))return
        const allowed=view.fields.filter(field=>campaignScreenKeys.has(field.key))
        setCampaignScreenFields(defaultCampaignScreenFields.map(fallback=>({...fallback,...(allowed.find(field=>field.key===fallback.key)??{})})).sort((a,b)=>a.position-b.position))
      })
      .catch(()=>{if(current)setCampaignScreenFields(defaultCampaignScreenFields)})
    return()=>{current=false}
  },[token])
  useEffect(()=>{
    let current=true
    void request<{fields?:PerformanceScreenField[]}>('/api/screen-views/sales-campaign-performance/active',token)
      .then(view=>{if(!current||!Array.isArray(view.fields))return;const allowed=view.fields.filter(field=>performanceScreenKeys.has(field.key));setPerformanceScreenFields(defaultPerformanceScreenFields.map(fallback=>({...fallback,...(allowed.find(field=>field.key===fallback.key)??{})})).sort((a,b)=>a.position-b.position))})
      .catch(()=>{if(current)setPerformanceScreenFields(defaultPerformanceScreenFields)})
    return()=>{current=false}
  },[token])
  useEffect(()=>{void loadPerformance().catch(e=>setError((e as Error).message))},[loadPerformance])
  function openCreate(){setEditingCampaign(null);setCode('');setName('');setPercent('10');setFrom(localDateString());setThrough(addLocalCalendarDays(30));setError('');setCreateOpen(true)}
  function openEdit(campaign:Campaign){setEditingCampaign(campaign);setCode(campaign.code);setName(campaign.name);setPercent(String(campaign.discountPercent));setFrom(campaign.effectiveFrom);setThrough(campaign.effectiveThrough);setError('');setCreateOpen(true)}
  async function saveCampaign(e:FormEvent):Promise<boolean>{e.preventDefault();setBusy(true);setError('');setNotice('');try{const body=JSON.stringify({code,name,discountPercent:Number(percent),effectiveFrom:from,effectiveThrough:through,isActive:editingCampaign?.isActive??true});const row=await request<Campaign>(editingCampaign?`/api/sales/promotions/${editingCampaign.id}`:'/api/sales/promotions/',token,{method:editingCampaign?'PUT':'POST',body});setCampaigns(current=>editingCampaign?current.map(item=>item.id===row.id?row:item):[row,...current]);setCampaignId(row.id);setNotice(editingCampaign?'Kampanya güncellendi.':'Kampanya oluşturuldu. Teklif tarihinin kampanya aralığında olması gerekir.');return true}catch(e){setError((e as Error).message);return false}finally{setBusy(false)}}
  async function toggleCampaignStatus(campaign:Campaign){setBusy(true);setError('');setNotice('');try{const row=await request<Campaign>(`/api/sales/promotions/${campaign.id}`,token,{method:'PUT',body:JSON.stringify({code:campaign.code,name:campaign.name,discountPercent:campaign.discountPercent,effectiveFrom:campaign.effectiveFrom,effectiveThrough:campaign.effectiveThrough,isActive:!campaign.isActive})});setCampaigns(current=>current.map(item=>item.id===row.id?row:item));setNotice(row.isActive?'Kampanya yeniden etkinleştirildi.':'Kampanya pasifleştirildi.')}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
  async function apply(e:FormEvent){e.preventDefault();setBusy(true);setError('');setNotice('');try{const result=await request<{discountAmount:number;grandTotal:number}>('/api/sales/promotions/'+campaignId+'/apply',token,{method:'POST',body:JSON.stringify({quoteId})});setNotice(`Kampanya uygulandı. Ek indirim: ${result.discountAmount.toLocaleString('tr-TR',{minimumFractionDigits:2})} · Yeni toplam: ${result.grandTotal.toLocaleString('tr-TR',{minimumFractionDigits:2})}`);await load()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
  const selectedCampaign=campaigns.find(item=>item.id===campaignId)||null
  const visibleCampaigns=campaigns.filter(item=>`${item.code} ${item.name}`.toLocaleLowerCase('tr-TR').includes(campaignQuery.trim().toLocaleLowerCase('tr-TR')))
  return <main className="sales-promotions-page">
    <header className="sales-promotions-header"><div><p className="eyebrow">SATIŞ YÖNETİMİ</p><h1>Kampanyalar ve promosyonlar</h1><p className="muted">Tarih aralığına bağlı yüzde indirimi taslak satış tekliflerine uygulayın.</p></div><div className="sales-promotions-header-actions">{onBack&&<button className="secondary" onClick={onBack}>Satışa dön</button>}{role==='TenantAdmin'&&<button className="primary" onClick={openCreate}>+ Kampanya oluştur</button>}</div></header>
    {error&&<div className="alert inline-alert" role="alert">{error}</div>}{notice&&<div className="notice inline-notice" role="status">{notice}</div>}
    <nav className="sales-campaign-tabs" role="tablist" aria-label="Kampanya işlemleri"><button type="button" role="tab" aria-selected={activeSection==='campaigns'} onClick={()=>setActiveSection('campaigns')}><b>Kampanyalar</b><small>İndirim kurallarını yönetin</small></button><button type="button" role="tab" aria-selected={activeSection==='performance'} onClick={()=>setActiveSection('performance')}><b>Performans</b><small>Uygulama ve sipariş sonuçları</small></button><button type="button" role="tab" aria-selected={activeSection==='apply'} onClick={()=>setActiveSection('apply')}><b>Teklife uygula</b><small>Taslak teklife indirim ekleyin</small></button></nav>
    {activeSection==='campaigns'&&<CampaignsSection campaigns={campaigns} visibleCampaigns={visibleCampaigns} selectedCampaign={selectedCampaign} selectedCampaignId={campaignId} fields={campaignScreenFields} query={campaignQuery} role={role} busy={busy} onQueryChange={setCampaignQuery} onRefresh={()=>void load().catch(e=>setError((e as Error).message))} onSelect={setCampaignId} onEdit={openEdit} onToggleStatus={campaign=>void toggleCampaignStatus(campaign)} />}
    {activeSection==='performance'&&<CampaignPerformanceSection performance={performance} fields={performanceScreenFields} query={reportQuery} from={reportFrom} through={reportThrough} page={reportPage} onQueryChange={value=>{setReportQuery(value);setReportPage(1)}} onFromChange={value=>{setReportFrom(value);setReportPage(1)}} onThroughChange={value=>{setReportThrough(value);setReportPage(1)}} onPageChange={setReportPage} onRefresh={()=>void loadPerformance().catch(e=>setError((e as Error).message))} />}
    {createOpen&&role==='TenantAdmin'&&<CampaignDialog editing={Boolean(editingCampaign)} code={code} name={name} percent={percent} from={from} through={through} busy={busy} onCodeChange={setCode} onNameChange={setName} onPercentChange={setPercent} onFromChange={setFrom} onThroughChange={setThrough} onClose={()=>{setCreateOpen(false);setEditingCampaign(null)}} onSubmit={event=>{void saveCampaign(event).then(saved=>{if(saved){setCreateOpen(false);setEditingCampaign(null)}})}} />}
    {activeSection==='apply'&&<ApplyCampaignSection campaigns={campaigns} quotes={quotes} campaignId={campaignId} quoteId={quoteId} busy={busy} onCampaignChange={setCampaignId} onQuoteChange={setQuoteId} onSubmit={apply} />}
  </main>
}
