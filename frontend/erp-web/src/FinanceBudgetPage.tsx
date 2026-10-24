import { useEffect, useMemo, useState } from 'react'
import { authenticatedFetch } from './authApi';
import './finance-budget.css'

type Account = { id:string; code:string; name:string; isActive:boolean; statementSection:string }
type Line = { id?:string; accountId:string; accountCode?:string; accountName?:string; statementSection?:string; periodStart:string; plannedAmount:number; actualAmount?:number; variance?:number|null; notes:string|null }
type Plan = { id:string; name:string; fiscalYear:number; currencyCode:string; baseCurrencyCode:string; status:number|string; lineCount:number; plannedTotal:number; actualTotal:number; createdAt:string; createdByUserId:string; approvedByUserId:string|null; approvedAt:string|null; revision:number }
type PlanView = { plan:Plan; lines:Line[] }
type Entry = { accountId:string; periodStart:string; plannedAmount:number; notes:string|null }

async function request<T>(url:string, token:string, init?:RequestInit):Promise<T>{
  const response=await authenticatedFetch(url, token, {...init,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',...(init?.headers||{})}})
  if(!response.ok){let message=`İstek başarısız (${response.status})`;try{const body=await response.json();message=body.error||message}catch{}throw new Error(message)}
  return response.json() as Promise<T>
}

const money=(n:number,currency='TRY')=>{
  try{return new Intl.NumberFormat('tr-TR',{style:'currency',currency,maximumFractionDigits:2}).format(n)}
  catch{return `${new Intl.NumberFormat('tr-TR',{maximumFractionDigits:2}).format(n)} ${currency}`}
}
const isApproved=(status:Plan['status'])=>status===2||status==='Approved'
const planStatus=(status:Plan['status'])=>isApproved(status)?'Onaylı':status===1||status==='Draft'?'Taslak':String(status)
const formatPeriod=(value:string)=>{
  const date=new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime())?value:new Intl.DateTimeFormat('tr-TR',{month:'long',year:'numeric'}).format(date)
}

export default function FinanceBudgetPage({token,role}:{token:string;role:string}) {
  const admin=role==='TenantAdmin'
  const currentYear=new Date().getFullYear()
  const [plans,setPlans]=useState<Plan[]>([]),[accounts,setAccounts]=useState<Account[]>([]),[selected,setSelected]=useState<PlanView|null>(null)
  const [baseCurrency,setBaseCurrency]=useState(''),[loadError,setLoadError]=useState('')
  const [name,setName]=useState(''),[year,setYear]=useState(currentYear),[entries,setEntries]=useState<Entry[]>([{accountId:'',periodStart:`${currentYear}-01-01`,plannedAmount:0,notes:null}])
  const [editing,setEditing]=useState(false)
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[openingPlanId,setOpeningPlanId]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState('')
  const eligible=useMemo(()=>accounts.filter(x=>x.isActive&&['Revenue','Expense'].includes(x.statementSection)),[accounts])
  const controlsLocked=loading||busy||Boolean(openingPlanId)

  async function load(){
    setLoading(true);setError('');setLoadError('')
    try{
      const [p,a,currencySettings]=await Promise.all([request<Plan[]>('/api/finance/budgets/',token),request<Account[]>('/api/finance/general-ledger/accounts',token),request<{baseCurrencyCode:string}>('/api/finance/currency',token)])
      const base=currencySettings.baseCurrencyCode.trim().toUpperCase()
      if(!base){throw new Error('Firmanın baz para birimi alınamadı. Bütçe verileri yüklenemedi.')}
      setBaseCurrency(base);setPlans(p);setAccounts(a)
      if(selected){const updated=p.find(x=>x.id===selected.plan.id);if(updated)setSelected(await request<PlanView>(`/api/finance/budgets/${updated.id}`,token))}
    }catch(e){const message=(e as Error).message;setError(message);setLoadError(message)}finally{setLoading(false)}
  }
  useEffect(()=>{void load()},[token])

  function addLine(){setEntries(x=>[...x,{accountId:'',periodStart:`${year}-01-01`,plannedAmount:0,notes:null}])}
  function updateLine(i:number,patch:Partial<Entry>){setEntries(x=>x.map((item,index)=>index===i?{...item,...patch}:item))}
  async function save(e:React.FormEvent){
    e.preventDefault();if(busy||!baseCurrency)return;setBusy(true);setError('');setNotice('')
    try{
      const body={name,fiscalYear:year,currencyCode:baseCurrency,revision:selected?.plan.revision??0,lines:entries.map(x=>({...x,plannedAmount:Number(x.plannedAmount)}))}
      const result=await request<PlanView>(selected?`/api/finance/budgets/${selected.plan.id}`:'/api/finance/budgets/',token,{method:selected?'PUT':'POST',body:JSON.stringify(body)})
      setSelected(result);setNotice('Bütçe taslağı kaydedildi.');await load()
    }catch(e){setError((e as Error).message)}finally{setBusy(false)}
  }
  async function open(plan:Plan){
    if(controlsLocked)return
    setOpeningPlanId(plan.id);setError('');setNotice('')
    try{setSelected(await request<PlanView>(`/api/finance/budgets/${plan.id}`,token));setEditing(false)}
    catch(e){setError((e as Error).message)}finally{setOpeningPlanId('')}
  }
  function edit(plan:PlanView){if(controlsLocked||plan.plan.currencyCode!==baseCurrency)return;setName(plan.plan.name);setYear(plan.plan.fiscalYear);setEntries(plan.lines.map(x=>({accountId:x.accountId,periodStart:x.periodStart,plannedAmount:x.plannedAmount,notes:x.notes})));setSelected(plan);setEditing(true);setNotice('Taslak düzenleme için yüklendi.');setError('')}
  async function approve(){
    if(!selected||controlsLocked||selected.plan.currencyCode!==baseCurrency)return
    setBusy(true);setError('');setNotice('')
    try{const result=await request<PlanView>(`/api/finance/budgets/${selected.plan.id}/approve`,token,{method:'POST'});setSelected(result);setEditing(false);setNotice('Bütçe onaylandı.');await load()}
    catch(e){setError((e as Error).message)}finally{setBusy(false)}
  }
  function clearForm(){if(controlsLocked||!baseCurrency)return;setSelected(null);setName('');setYear(currentYear);setEntries([{accountId:'',periodStart:`${currentYear}-01-01`,plannedAmount:0,notes:null}]);setEditing(true);setNotice('');setError('')}

  const draft=selected&&(selected.plan.status===1||selected.plan.status==='Draft')
  const currencyMismatch=Boolean(selected&&baseCurrency&&selected.plan.currencyCode!==baseCurrency)
  return <div className="finance-page finance-budget-page">
    <header className="page-heading">
      <div><p className="eyebrow">FİNANS YÖNETİMİ · PLANLAMA</p><h1>Bütçe planı ve gerçekleşen</h1><p className="muted">Aylık gelir ve gider bütçelerini yevmiye kayıtlarıyla karşılaştırın. Onaylanan bütçeler değiştirilemez.</p></div>
      <button type="button" className="secondary" onClick={()=>void load()} disabled={controlsLocked} aria-busy={loading}>{loading?'Yenileniyor…':'Yenile'}</button>
    </header>

    {error&&<div className="alert inline-alert budget-alert" role="alert"><span>{error}</span><button type="button" className="row-action" onClick={()=>void load()} disabled={loading}>Yeniden dene</button></div>}
    {notice&&<div className="notice inline-notice budget-notice" role="status">{notice}</div>}

    <div className="budget-layout">
      <section className="panel budget-list" aria-labelledby="budget-list-title">
        <div className="panel-heading">
          <div><h2 id="budget-list-title">Bütçe senaryoları</h2><p>{loading?'Senaryolar yükleniyor…':`${plans.length} kayıt · firma kapsamlı`}</p></div>
          {admin&&<button type="button" className="primary" onClick={clearForm} disabled={controlsLocked||!baseCurrency}>Yeni bütçe</button>}
        </div>
        {loading?<div className="budget-state" role="status"><span className="budget-spinner" aria-hidden="true"/>Bütçe senaryoları yükleniyor…</div>
          :loadError?<div className="budget-state budget-empty budget-load-error" role="alert"><strong>Bütçe senaryoları yüklenemedi</strong><span>{loadError}</span><button type="button" className="secondary" onClick={()=>void load()} disabled={controlsLocked}>Yeniden dene</button></div>
          :plans.length===0?<div className="budget-state budget-empty"><strong>Henüz bütçe senaryosu yok</strong><span>{admin?'İlk bütçe taslağınızı oluşturarak başlayın.':'Firma yöneticisi bir bütçe senaryosu oluşturduğunda burada görünür.'}</span>{admin&&<button type="button" className="secondary" onClick={clearForm} disabled={controlsLocked}>İlk bütçeyi oluştur</button>}</div>
          :<div className="budget-plan-list" aria-label="Bütçe senaryoları">
            {plans.map(plan=><button type="button" key={plan.id} className={`budget-plan-item ${selected?.plan.id===plan.id&&!editing?'active':''}`} onClick={()=>void open(plan)} disabled={controlsLocked} aria-pressed={selected?.plan.id===plan.id&&!editing}>
              <span className="budget-plan-top"><span className="budget-plan-title">{plan.name}</span><span className={`quote-status ${isApproved(plan.status)?'accepted':'pending'}`}>{planStatus(plan.status)}</span></span>
              <span className="budget-plan-meta">{plan.fiscalYear} · {plan.currencyCode} · {plan.lineCount} satır</span>
              <span className="budget-plan-total-label">Plan toplamı (brüt · {plan.currencyCode})</span><strong className="budget-plan-total">{money(plan.plannedTotal,plan.currencyCode)}</strong>
              <span className="budget-plan-meta">Yevmiye gerçekleşeni (brüt · {baseCurrency})</span><span className="budget-plan-actual">{money(plan.actualTotal,baseCurrency)}</span>
              {openingPlanId===plan.id&&<span className="budget-opening" role="status">Açılıyor…</span>}
            </button>)}
          </div>}
      </section>

      {admin&&editing&&<section className="panel budget-editor" aria-labelledby="budget-editor-title">
        <div className="panel-heading"><div><h2 id="budget-editor-title">{selected?'Bütçe taslağını düzenle':'Yeni bütçe taslağı'}</h2><p>Yalnız aktif gelir ve gider hesapları seçilebilir.</p></div>{selected&&<button type="button" className="row-action" onClick={clearForm} disabled={controlsLocked}>Yeni</button>}</div>
        <form className="collection-form budget-form" onSubmit={save}>
          <div className="budget-form-basics">
            <label>Senaryo adı<input value={name} onChange={e=>setName(e.target.value)} maxLength={120} required autoComplete="off" disabled={controlsLocked} /></label>
            <label>Mali yıl<input type="number" min="2000" max="2100" value={year} onChange={e=>{const y=Number(e.target.value);setYear(y);if(Number.isFinite(y))setEntries(xs=>xs.map(x=>({...x,periodStart:`${y}-${x.periodStart.slice(5)}`})))}} required disabled={controlsLocked} /></label>
            <label>Baz para birimi<input value={baseCurrency} readOnly aria-readonly="true" aria-describedby="budget-currency-help" disabled={controlsLocked} /></label>
          </div>
          <p className="budget-field-help" id="budget-currency-help">Bütçe ve yevmiye gerçekleşenleri aynı ölçekte karşılaştırmak için yalnızca firmanın baz para birimi kullanılır. Döviz çevrimi uygulanmaz.</p>

          <div className="budget-entry-header"><div><h3>Aylık bütçe satırları</h3><p>Her satır bir hesap ve ay için planlanan tahakkuk tutarını belirtir.</p></div><button type="button" className="secondary small-button" onClick={addLine} disabled={controlsLocked}>+ Satır ekle</button></div>
          {entries.length===0&&<div className="budget-inline-empty">Henüz satır yok. Devam etmek için bir bütçe satırı ekleyin.</div>}
          <div className="budget-entry-list">
            {entries.map((line,index)=><fieldset className="budget-entry-row" key={index}>
              <legend>Satır {index+1}</legend>
              <label className="budget-entry-account">Gelir / gider hesabı<select value={line.accountId} onChange={e=>updateLine(index,{accountId:e.target.value})} required disabled={controlsLocked}><option value="">Hesap seçin</option>{eligible.map(account=><option key={account.id} value={account.id}>{account.code} · {account.name} ({account.statementSection==='Revenue'?'Gelir':'Gider'})</option>)}</select></label>
              <label>Ay<input type="month" value={line.periodStart.slice(0,7)} onChange={e=>updateLine(index,{periodStart:`${e.target.value}-01`})} required disabled={controlsLocked} /></label>
              <label>Planlanan tahakkuk tutarı<input type="number" min="0" step="0.01" value={line.plannedAmount} onChange={e=>updateLine(index,{plannedAmount:Number(e.target.value)})} required disabled={controlsLocked} /></label>
              <label className="budget-entry-note">Not <input value={line.notes||''} maxLength={240} onChange={e=>updateLine(index,{notes:e.target.value||null})} disabled={controlsLocked} /></label>
              <button type="button" className="row-action danger budget-remove" aria-label={`Satır ${index+1} sil`} disabled={controlsLocked||entries.length===1} onClick={()=>setEntries(xs=>xs.filter((_,i)=>i!==index))}>Sil</button>
            </fieldset>)}
          </div>
          <div className="budget-form-foot"><span>{eligible.length} uygun hesap</span><div><button type="button" className="secondary" onClick={()=>setEditing(false)} disabled={controlsLocked}>Vazgeç</button><button type="submit" className="primary" disabled={controlsLocked||!baseCurrency||eligible.length===0||entries.length===0} aria-busy={busy}>{busy?'Kaydediliyor…':selected?'Taslağı kaydet':'Taslak oluştur'}</button></div></div>
          {eligible.length===0&&<p className="budget-field-help" role="status">Aktif gelir veya gider hesabı bulunamadı. Bütçe oluşturmak için önce hesap planını güncelleyin.</p>}
        </form>
      </section>}
    </div>

    {selected&&<section className="panel budget-detail" aria-labelledby="budget-detail-title">
      <div className="panel-heading budget-detail-heading"><div><p className="eyebrow">{selected.plan.fiscalYear} · {selected.plan.currencyCode}</p><h2 id="budget-detail-title">{selected.plan.name}</h2><p>{isApproved(selected.plan.status)?`Onaylayan: ${selected.plan.approvedByUserId||'—'}`:'Taslak · Onay için farklı bir TenantAdmin gerekir'}</p></div><div className="budget-actions">{draft&&admin&&!currencyMismatch&&<><button type="button" className="secondary" onClick={()=>edit(selected)} disabled={controlsLocked}>Düzenle</button><button type="button" className="primary" disabled={controlsLocked||selected.lines.length===0} onClick={()=>void approve()} aria-busy={busy}>{busy?'Onaylanıyor…':'Onayla'}</button></>}</div></div>
      {currencyMismatch&&<div className="budget-currency-warning" role="status"><strong>Para birimi uyumsuzluğu</strong><span>Bu senaryo {selected.plan.currencyCode} ile oluşturulmuş; firmanın güncel baz para birimi {baseCurrency}. Plan tutarları {selected.plan.currencyCode}, yevmiye gerçekleşenleri {baseCurrency} cinsindedir ve aralarında kur çevrimi yapılmaz. Fark gösterilmez. Bu senaryo düzenlenemez veya onaylanamaz; güncel baz para biriminde yeni bir taslak oluşturun.</span></div>}
      {selected.lines.length===0?<div className="budget-state budget-empty"><strong>Bu senaryoda bütçe satırı yok</strong><span>{draft&&admin&&!currencyMismatch?'Taslağı düzenleyip satır ekleyebilirsiniz.':'Senaryo henüz herhangi bir bütçe satırı içermiyor.'}</span>{draft&&admin&&!currencyMismatch&&<button type="button" className="secondary" onClick={()=>edit(selected)} disabled={controlsLocked}>Taslağı düzenle</button>}</div>
        :<div className="ledger-list budget-ledger-wrap"><table className="customer-table budget-ledger"><caption>{selected.plan.name} bütçe ve yevmiye gerçekleşenleri</caption><thead><tr><th scope="col">Dönem</th><th scope="col">Hesap</th><th scope="col">Tür</th><th scope="col">Planlanan tahakkuk ({selected.plan.currencyCode})</th><th scope="col">Yevmiye gerçekleşeni ({baseCurrency})</th><th scope="col">Fark{currencyMismatch?' (hesaplanmıyor)':` (${baseCurrency})`}</th><th scope="col">Not</th></tr></thead><tbody>{selected.lines.map((line,index)=>{const variance=line.variance;const favorable=variance!==null&&variance!==undefined&&(line.statementSection==='Revenue'?variance>=0:variance<=0);return <tr key={line.id||`${line.accountId}-${line.periodStart}-${index}`}><td data-label="Dönem">{formatPeriod(line.periodStart)}</td><td data-label="Hesap"><b>{line.accountCode||'—'}</b><small className="cell-subtitle">{line.accountName}</small></td><td data-label="Tür">{line.statementSection==='Revenue'?'Gelir':line.statementSection==='Expense'?'Gider':'—'}</td><td data-label="Planlanan tahakkuk">{money(line.plannedAmount,selected.plan.currencyCode)}</td><td data-label="Yevmiye gerçekleşeni">{money(line.actualAmount??0,baseCurrency)}</td><td data-label="Fark" className={variance==null?'':favorable?'positive':'negative'}>{variance==null?'—':money(variance,baseCurrency)}</td><td data-label="Not">{line.notes||'—'}</td></tr>})}</tbody></table></div>}
    </section>}
    <div className="boundary-note"><span>Gerçekleşen değerler yalnız mali yıldaki yevmiye kayıtlarından ve firmanın baz para birimi ({baseCurrency||'yükleniyor'}) üzerinden hesaplanır. Gelir hesabında alacak − borç, gider hesabında borç − alacak kullanılır. Bu ekran kur çevrimi, bordro veya vergi mevzuatı hesabı yapmaz.</span></div>
  </div>
}
