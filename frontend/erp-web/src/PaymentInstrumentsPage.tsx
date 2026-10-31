import { useCallback, useEffect, useState } from 'react'
import { authenticatedFetch } from './authApi';
import { ArrowLeftRight, CheckCircle2, FileText, Plus, RefreshCw, ShieldCheck, XCircle } from 'lucide-react'
import { localDateString } from './dateUtils'
import './payment-instruments.css'
import { PaymentInstrumentMetrics } from './payment-instruments/components/PaymentInstrumentMetrics'
import { PaymentInstrumentListToolbar } from './payment-instruments/components/PaymentInstrumentListToolbar'
import { PaymentInstrumentGrid } from './payment-instruments/components/PaymentInstrumentGrid'
import type { Draft, FinanceAccount, Item, KindFilter, PageResult, ScreenField, StatusFilter } from './payment-instruments/paymentInstrumentTypes'
import { statusText } from './payment-instruments/paymentInstrumentTypes'
import { PaymentInstrumentCreateForm } from './payment-instruments/components/PaymentInstrumentCreateForm'

const initial = ():Draft => ({ type:'Check', direction:'Receivable', instrumentNumber:'', counterpartyName:'', bankName:'', currencyCode:'TRY', amount:'', issueDate:localDateString(), dueDate:localDateString(), portfolioDate:localDateString(), notes:'' })

export default function PaymentInstrumentsPage({ token, role }:{token:string;role:string}) {
  const [items,setItems]=useState<Item[]>([]),[accounts,setAccounts]=useState<FinanceAccount[]>([])
  const [draft,setDraft]=useState<Draft>(initial),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true)
  const [error,setError]=useState(''),[notice,setNotice]=useState(''),[filter,setFilter]=useState<StatusFilter>('All'),[kindFilter,setKindFilter]=useState<KindFilter>('All'),[searchDraft,setSearchDraft]=useState(''),[searchTerm,setSearchTerm]=useState('')
  const [page,setPage]=useState(1),[totalCount,setTotalCount]=useState(0),[summary,setSummary]=useState<PageResult['summary']>({openByCurrency:[],dueCount:0,bouncedCount:0})
  const [showCreate,setShowCreate]=useState(false),[collectAccount,setCollectAccount]=useState<Record<string,string>>({})
  const [screenFields,setScreenFields]=useState<ScreenField[]>([
    {key:'instrumentNumber',label:'Çek/senet no',visible:true,position:0}, {key:'code',label:'Portföy kodu',visible:true,position:1},
    {key:'type',label:'Tür',visible:true,position:2}, {key:'direction',label:'Yön',visible:true,position:3},
    {key:'counterpartyName',label:'Cari',visible:true,position:4}, {key:'bankName',label:'Banka',visible:true,position:5},
    {key:'dueDate',label:'Vade tarihi',visible:true,position:6}, {key:'amount',label:'Tutar',visible:true,position:7},
    {key:'currencyCode',label:'Döviz',visible:true,position:8}, {key:'status',label:'Durum',visible:true,position:9},
    {key:'actions',label:'İşlemler',visible:true,position:10,fixed:true}
  ])
  const isAdmin=role==='TenantAdmin'
  const load=useCallback(async()=>{
    setLoading(true);setError('')
    try {
      const params=new URLSearchParams({page:String(page),pageSize:'25'});if(filter!=='All')params.set('status',filter);if(kindFilter!=='All')params.set('type',kindFilter);if(searchTerm)params.set('term',searchTerm)
      const [rows,accountRows]=await Promise.all([
        authenticatedFetch(`/api/finance/payment-instruments/?${params}`, token, {headers:{Authorization:`Bearer ${token}`}}),
        authenticatedFetch('/api/finance/accounts', token, {headers:{Authorization:`Bearer ${token}`}})
      ])
      if(!rows.ok)throw new Error(rows.status===403?'Erişim reddedildi (403). Oturumun firma üyeliği veya rolü çek/senet listesine erişemiyor.':'Çek/senet listesi alınamadı ('+rows.status+').')
      if(!accountRows.ok)throw new Error(accountRows.status===403?'Erişim reddedildi (403). Oturumun firma üyeliği veya rolü finans hesaplarına erişemiyor.':'Finans hesapları alınamadı ('+accountRows.status+').')
      const result=await rows.json() as PageResult;setItems(result.items);setTotalCount(result.totalCount);setSummary(result.summary);setAccounts((await accountRows.json() as FinanceAccount[]).filter(x=>x.isActive))
    } catch(cause) { setError((cause as Error).message) } finally { setLoading(false) }
  },[token,page,filter,kindFilter,searchTerm])
  useEffect(()=>{void load()},[load])
  useEffect(()=>{let cancelled=false;authenticatedFetch('/api/screen-views/payment-instruments/active', token, {headers:{Authorization:`Bearer ${token}`}}).then(async response=>{if(!response.ok)return;const view=await response.json() as {fields?:ScreenField[]};if(!cancelled&&view.fields?.length)setScreenFields(view.fields)}).catch(()=>{});return()=>{cancelled=true}},[token])
  const visible=items
  const visibleFields=screenFields.filter(field=>field.visible).sort((a,b)=>a.position-b.position)
  const portfolioSummary=summary.openByCurrency.map(x=>`${x.currencyCode} ${x.amount.toLocaleString('tr-TR',{minimumFractionDigits:2})}`).join(' · ')||'—'
  function applySearch(event:React.FormEvent){event.preventDefault();const value=searchDraft.trim();if(value&&value.length<2){setError('Arama için en az 2 karakter girin.');return}setError('');setPage(1);setSearchTerm(value)}
  function clearSearch(){setError('');setSearchDraft('');setPage(1);setSearchTerm('')}
  async function request<T>(path:string,method='GET',body?:unknown):Promise<T>{
    const response=await authenticatedFetch(path, token, {method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)})
    if(!response.ok){const payload=await response.json().catch(()=>null) as {error?:string;title?:string}|null;throw new Error(payload?.error||payload?.title||(response.status===403?'Erişim reddedildi (403). Bu çek/senet işlemi için firma yöneticisi (TenantAdmin) rolü gerekir.':`İstek başarısız (${response.status}).`))}
    return response.status===204?undefined as T:await response.json() as T
  }
  async function create(event:React.FormEvent){event.preventDefault();if(busy)return;setBusy(true);setError('');setNotice('')
    try{await request('/api/finance/payment-instruments/','POST',{...draft,requestId:crypto.randomUUID(),amount:Number(draft.amount),currencyCode:draft.currencyCode.toUpperCase()});setDraft(initial());setShowCreate(false);setNotice('Çek/senet portföye kaydedildi.');await load()}
    catch(cause){setError((cause as Error).message)}finally{setBusy(false)}
  }
  async function action(item:Item,kind:'endorse'|'collect'|'bounce'|'cancel'){
    if(busy)return
    const note=window.prompt(kind==='bounce'?'Karşılıksız işlem notu (zorunlu):':'İşlem açıklaması (isteğe bağlı):')
    if(note===null)return
    const accountId=kind==='collect'?collectAccount[item.id]:undefined
    if(kind==='collect'&&!accountId){setError('Tahsilat/ödeme için finans hesabı seçin.');return}
    const endorsedTo=kind==='endorse'?window.prompt('Ciro edilecek kişi/kurum:')?.trim():undefined
    if(kind==='endorse'&&!endorsedTo)return
    if(kind==='bounce'&&!note.trim()){setError('Karşılıksız işleminde açıklama girilmelidir.');return}
    if(kind==='cancel'&&!window.confirm(`${item.code} kaydı iptal edilsin mi? Bu işlem geri alınamaz.`))return
    const eventType=({endorse:'Ciro edildi',collect:'Tahsil/ödeme edildi',bounce:'Karşılıksız',cancel:'İptal'} as const)[kind]
    setBusy(true);setError('');setNotice('')
    try{await request(`/api/finance/payment-instruments/${item.id}/${kind}`,'POST',{requestId:crypto.randomUUID(),rowVersion:item.rowVersion,eventDate:localDateString(),financialAccountId:accountId||null,endorsedTo:endorsedTo||null,note:note.trim()||null});setNotice(`${item.code}: ${eventType}.`);await load()}
    catch(cause){setError((cause as Error).message)}finally{setBusy(false)}
  }
  return <div className="page-content payment-instruments-page">
    <div className="page-heading"><div><p className="eyebrow">FİNANS · PORTFÖY YÖNETİMİ</p><h1>Çek ve senet</h1><p className="muted">Alınan ve verilen çek/senetleri vadeleri ve durum geçmişiyle izleyin.</p></div><div className="payment-instrument-heading-actions"><button className="secondary" onClick={()=>void load()} disabled={loading||busy}><RefreshCw size={15}/> Yenile</button>{isAdmin&&<button className="primary" onClick={()=>setShowCreate(value=>!value)}><Plus size={16}/> Yeni kayıt</button>}</div></div>
    {error&&<div className="alert inline-alert" role="alert">{error}<button onClick={()=>setError('')} aria-label="Uyarıyı kapat">×</button></div>}{notice&&<div className="notice" role="status">{notice}<button onClick={()=>setNotice('')} aria-label="Bildirimi kapat">×</button></div>}
    <PaymentInstrumentMetrics summary={summary} portfolioSummary={portfolioSummary}/>
    {showCreate&&<PaymentInstrumentCreateForm draft={draft} busy={busy} onDraftChange={setDraft} onSubmit={event=>void create(event)}/>}
    <section className="panel payment-instrument-list"><div className="payment-instrument-list-heading"><div><h3><FileText size={17}/> Portföy kayıtları</h3><p>{totalCount} kayıt · sayfa {page} · firma veritabanı kapsamı</p></div></div>
      <PaymentInstrumentListToolbar searchDraft={searchDraft} searchTerm={searchTerm} filter={filter} kindFilter={kindFilter} onSearchDraftChange={setSearchDraft} onSearch={applySearch} onClearSearch={clearSearch} onFilterChange={value=>{setPage(1);setFilter(value)}} onKindFilterChange={value=>{setPage(1);setKindFilter(value)}}/>
      <PaymentInstrumentGrid fields={visibleFields} items={visible} loading={loading} renderCell={(field,item)=>renderInstrumentField(field.key,item,isAdmin,busy,accounts,collectAccount,setCollectAccount,action)}/>
      {totalCount>25&&<div className="payment-instrument-pagination"><button className="secondary" onClick={()=>setPage(value=>Math.max(1,value-1))} disabled={page<=1||loading}>Önceki</button><span>Sayfa {page} / {Math.ceil(totalCount/25)}</span><button className="secondary" onClick={()=>setPage(value=>value+1)} disabled={page>=Math.ceil(totalCount/25)||loading}>Sonraki</button></div>}
    </section>
    <div className="boundary-note payment-instrument-boundary"><ShieldCheck size={16}/><span>Çek/senet işlemleri durum ve denetim geçmişi oluşturur. Tahsilat/ödeme banka veya kasa hareketi yazar; cari fatura tahsilatına otomatik mahsup yapmaz.</span></div>
  </div>
}

function renderInstrumentField(key:string,item:Item,isAdmin:boolean,busy:boolean,accounts:FinanceAccount[],collectAccount:Record<string,string>,setCollectAccount:(value:Record<string,string>)=>void,action:(item:Item,kind:'endorse'|'collect'|'bounce'|'cancel')=>void){
  switch(key){
    case 'instrumentNumber': return <><b>{item.type==='Check'?'Çek':'Senet'}</b><small>{item.instrumentNumber}</small></>
    case 'code': return item.code
    case 'type': return item.type==='Check'?'Çek':'Senet'
    case 'direction': return item.direction==='Receivable'?'Alınan':'Verilen'
    case 'counterpartyName': return item.counterpartyName
    case 'bankName': return item.bankName
    case 'dueDate': return new Date(`${item.dueDate}T00:00:00`).toLocaleDateString('tr-TR')
    case 'amount': return <b>{item.amount.toLocaleString('tr-TR',{minimumFractionDigits:2})}</b>
    case 'currencyCode': return item.currencyCode
    case 'status': return <><span className={`payment-instrument-status ${item.status.toLowerCase()}`}>{statusText[item.status]}</span>{item.endorsedTo&&<small>Ciro: {item.endorsedTo}</small>}</>
    case 'actions': return <div className="payment-instrument-row-actions">{isAdmin&&(item.status==='Portfolio'||item.status==='Bounced')&&<><select aria-label={`${item.code} finans hesabı`} value={collectAccount[item.id]||''} onChange={e=>setCollectAccount({...collectAccount,[item.id]:e.target.value})}><option value="">Hesap seçin</option>{accounts.filter(a=>a.currencyCode===item.currencyCode).map(a=><option key={a.id} value={a.id}>{a.name} · {a.currencyCode}</option>)}</select><button className="primary small-button" disabled={busy} onClick={()=>action(item,'collect')}><CheckCircle2 size={14}/> Tahsil</button></>}{isAdmin&&item.type==='Check'&&item.direction==='Receivable'&&item.status==='Portfolio'&&<button className="secondary small-button" disabled={busy} onClick={()=>action(item,'endorse')}><ArrowLeftRight size={14}/> Ciro</button>}{isAdmin&&['Portfolio','Endorsed','Collected'].includes(item.status)&&<button className="secondary small-button" disabled={busy} onClick={()=>action(item,'bounce')}><XCircle size={14}/> Karşılıksız</button>}{isAdmin&&item.status==='Portfolio'&&<button className="secondary small-button" disabled={busy} onClick={()=>action(item,'cancel')}>İptal</button>}</div>
    default: return '—'
  }
}
