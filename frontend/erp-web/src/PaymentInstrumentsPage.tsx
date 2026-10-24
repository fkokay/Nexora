import { useCallback, useEffect, useState } from 'react'
import { ArrowLeftRight, Banknote, CheckCircle2, CircleDollarSign, FileClock, FileText, Plus, RefreshCw, ShieldCheck, XCircle } from 'lucide-react'
import ScreenViewGroupHeader from './ScreenViewGroupHeader'
import './payment-instruments.css'

type Kind = 'Check' | 'PromissoryNote'
type Direction = 'Receivable' | 'Payable'
type Status = 'Portfolio' | 'Endorsed' | 'Collected' | 'Bounced' | 'Cancelled'
type Item = { id:string; code:string; type:Kind; direction:Direction; status:Status; instrumentNumber:string; counterpartyName:string; bankName:string; currencyCode:string; amount:number; issueDate:string; dueDate:string; portfolioDate:string; endorsedTo:string|null; endorsedAt:string|null; collectedAt:string|null; financialAccountId:string|null; notes:string|null; rowVersion:string; createdAt:string }
type FinanceAccount = { id:string; name:string; code:string; type:'Cash'|'Bank'; currencyCode:string; isActive:boolean }
type PageResult = {items:Item[];page:number;pageSize:number;totalCount:number;summary:{openByCurrency:{currencyCode:string;amount:number}[];dueCount:number;bouncedCount:number}}
type ScreenField = {key:string;label:string;visible:boolean;position:number;fixed?:boolean;section?:string|null}
type Draft = { type:Kind; direction:Direction; instrumentNumber:string; counterpartyName:string; bankName:string; currencyCode:string; amount:string; issueDate:string; dueDate:string; portfolioDate:string; notes:string }
const initial = ():Draft => ({ type:'Check', direction:'Receivable', instrumentNumber:'', counterpartyName:'', bankName:'', currencyCode:'TRY', amount:'', issueDate:new Date().toISOString().slice(0,10), dueDate:new Date().toISOString().slice(0,10), portfolioDate:new Date().toISOString().slice(0,10), notes:'' })
const statusText:Record<Status,string>={Portfolio:'Portföyde',Endorsed:'Ciro edildi',Collected:'Tahsil/ödeme edildi',Bounced:'Karşılıksız',Cancelled:'İptal'}

export default function PaymentInstrumentsPage({ token, role }:{token:string;role:string}) {
  const [items,setItems]=useState<Item[]>([]),[accounts,setAccounts]=useState<FinanceAccount[]>([])
  const [draft,setDraft]=useState<Draft>(initial),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true)
  const [error,setError]=useState(''),[notice,setNotice]=useState(''),[filter,setFilter]=useState<Status|'All'>('All'),[kindFilter,setKindFilter]=useState<Kind|'All'>('All')
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
      const params=new URLSearchParams({page:String(page),pageSize:'50'});if(filter!=='All')params.set('status',filter);if(kindFilter!=='All')params.set('type',kindFilter)
      const [rows,accountRows]=await Promise.all([
        fetch(`/api/finance/payment-instruments/?${params}`,{headers:{Authorization:`Bearer ${token}`}}),
        fetch('/api/finance/accounts',{headers:{Authorization:`Bearer ${token}`}})
      ])
      if(!rows.ok)throw new Error(`Çek/senet listesi alınamadı (${rows.status}).`)
      if(!accountRows.ok)throw new Error(`Finans hesapları alınamadı (${accountRows.status}).`)
      const result=await rows.json() as PageResult;setItems(result.items);setTotalCount(result.totalCount);setSummary(result.summary);setAccounts((await accountRows.json() as FinanceAccount[]).filter(x=>x.isActive))
    } catch(cause) { setError((cause as Error).message) } finally { setLoading(false) }
  },[token,page,filter,kindFilter])
  useEffect(()=>{void load()},[load])
  useEffect(()=>{let cancelled=false;fetch('/api/screen-views/payment-instruments/active',{headers:{Authorization:`Bearer ${token}`}}).then(async response=>{if(!response.ok)return;const view=await response.json() as {fields?:ScreenField[]};if(!cancelled&&view.fields?.length)setScreenFields(view.fields)}).catch(()=>{});return()=>{cancelled=true}},[token])
  const visible=items
  const visibleFields=screenFields.filter(field=>field.visible).sort((a,b)=>a.position-b.position)
  const portfolioSummary=summary.openByCurrency.map(x=>`${x.currencyCode} ${x.amount.toLocaleString('tr-TR',{minimumFractionDigits:2})}`).join(' · ')||'—'
  async function request<T>(path:string,method='GET',body?:unknown):Promise<T>{
    const response=await fetch(path,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)})
    if(!response.ok){const payload=await response.json().catch(()=>null) as {error?:string;title?:string}|null;throw new Error(payload?.error||payload?.title||`İstek başarısız (${response.status}).`)}
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
    try{await request(`/api/finance/payment-instruments/${item.id}/${kind}`,'POST',{requestId:crypto.randomUUID(),rowVersion:item.rowVersion,eventDate:new Date().toISOString().slice(0,10),financialAccountId:accountId||null,endorsedTo:endorsedTo||null,note:note.trim()||null});setNotice(`${item.code}: ${eventType}.`);await load()}
    catch(cause){setError((cause as Error).message)}finally{setBusy(false)}
  }
  return <div className="page-content payment-instruments-page">
    <div className="page-heading"><div><p className="eyebrow">FİNANS · PORTFÖY YÖNETİMİ</p><h1>Çek ve senet</h1><p className="muted">Alınan ve verilen çek/senetleri vadeleri ve durum geçmişiyle izleyin.</p></div><div className="payment-instrument-heading-actions"><button className="secondary" onClick={()=>void load()} disabled={loading||busy}><RefreshCw size={15}/> Yenile</button>{isAdmin&&<button className="primary" onClick={()=>setShowCreate(value=>!value)}><Plus size={16}/> Yeni kayıt</button>}</div></div>
    {error&&<div className="alert inline-alert" role="alert">{error}<button onClick={()=>setError('')} aria-label="Uyarıyı kapat">×</button></div>}{notice&&<div className="notice" role="status">{notice}<button onClick={()=>setNotice('')} aria-label="Bildirimi kapat">×</button></div>}
    <div className="payment-instrument-metrics"><article><span><CircleDollarSign size={18}/></span><small>Açık portföy</small><b>{portfolioSummary}</b><em>seçili filtrelere göre, döviz ayrımıyla</em></article><article><span><FileClock size={18}/></span><small>Vadesi gelen</small><b>{summary.dueCount}</b><em>seçili filtrelere göre</em></article><article><span><XCircle size={18}/></span><small>Karşılıksız</small><b>{summary.bouncedCount}</b><em>seçili filtrelere göre</em></article></div>
    {showCreate&&<section className="panel payment-instrument-create"><div className="panel-heading"><div><h3><Plus size={17}/> Portföye kayıt ekle</h3><p>Firma kapsamındaki çek veya senedi alınan/verilen yönüyle kaydedin.</p></div></div><form onSubmit={event=>void create(event)}>
      <div className="payment-instrument-form-grid"><label>Tür<select value={draft.type} onChange={e=>setDraft({...draft,type:e.target.value as Kind})}><option value="Check">Çek</option><option value="PromissoryNote">Senet</option></select></label><label>Yön<select value={draft.direction} onChange={e=>setDraft({...draft,direction:e.target.value as Direction})}><option value="Receivable">Alacak · alınan</option><option value="Payable">Borç · verilen</option></select></label>
      <label>Çek/senet numarası<input required maxLength={80} value={draft.instrumentNumber} onChange={e=>setDraft({...draft,instrumentNumber:e.target.value})}/></label><label>Cari unvanı<input required maxLength={160} value={draft.counterpartyName} onChange={e=>setDraft({...draft,counterpartyName:e.target.value})}/></label>
      <label>Banka<input required maxLength={120} value={draft.bankName} onChange={e=>setDraft({...draft,bankName:e.target.value})}/></label><label>Tutar<input required type="number" min="0.01" step="0.01" value={draft.amount} onChange={e=>setDraft({...draft,amount:e.target.value})}/></label>
      <label>Para birimi<input required minLength={3} maxLength={3} value={draft.currencyCode} onChange={e=>setDraft({...draft,currencyCode:e.target.value.toUpperCase()})}/></label><label>Düzenleme tarihi<input required type="date" value={draft.issueDate} onChange={e=>setDraft({...draft,issueDate:e.target.value})}/></label>
      <label>Vade tarihi<input required type="date" value={draft.dueDate} onChange={e=>setDraft({...draft,dueDate:e.target.value})}/></label><label>Portföye giriş tarihi<input required type="date" value={draft.portfolioDate} onChange={e=>setDraft({...draft,portfolioDate:e.target.value})}/></label>
      <label className="payment-instrument-wide">Açıklama<textarea maxLength={500} rows={2} value={draft.notes} onChange={e=>setDraft({...draft,notes:e.target.value})}/></label></div>
      <div className="payment-instrument-form-actions"><span>Kaydetmek finans hesabı bakiyesini değiştirmez; tahsil/ödeme ayrıca işlenir.</span><button className="primary" disabled={busy}>{busy?'Kaydediliyor…':'Portföye ekle'}</button></div></form></section>}
    <section className="panel payment-instrument-list"><div className="payment-instrument-list-heading"><div><h3><FileText size={17}/> Portföy kayıtları</h3><p>{totalCount} kayıt · sayfa {page} · firma veritabanı kapsamı</p></div><div className="payment-instrument-filters"><select aria-label="Duruma göre filtrele" value={filter} onChange={e=>{setPage(1);setFilter(e.target.value as Status|'All')}}><option value="All">Tüm durumlar</option>{Object.entries(statusText).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select><select aria-label="Türe göre filtrele" value={kindFilter} onChange={e=>{setPage(1);setKindFilter(e.target.value as Kind|'All')}}><option value="All">Çek ve senet</option><option value="Check">Çekler</option><option value="PromissoryNote">Senetler</option></select></div></div>
      {loading?<div className="payment-instrument-empty">Kayıtlar yükleniyor…</div>:visible.length===0?<div className="payment-instrument-empty"><Banknote size={20}/><b>Gösterilecek kayıt yok</b><span>Filtreleri değiştirebilir veya yeni çek/senet ekleyebilirsiniz.</span></div>:<div className="payment-instrument-table-wrap"><table className="payment-instrument-table"><thead><ScreenViewGroupHeader fields={visibleFields}/><tr>{visibleFields.map(field=><th key={field.key}>{field.label}</th>)}</tr></thead><tbody>{visible.map(item=><tr key={item.id}>{visibleFields.map(field=><td key={field.key}>{renderInstrumentField(field.key,item,isAdmin,busy,accounts,collectAccount,setCollectAccount,action)}</td>)}</tr>)}</tbody></table></div>}
      {totalCount>50&&<div className="payment-instrument-pagination"><button className="secondary" onClick={()=>setPage(value=>Math.max(1,value-1))} disabled={page<=1||loading}>Önceki</button><span>Sayfa {page} / {Math.ceil(totalCount/50)}</span><button className="secondary" onClick={()=>setPage(value=>value+1)} disabled={page>=Math.ceil(totalCount/50)||loading}>Sonraki</button></div>}
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
