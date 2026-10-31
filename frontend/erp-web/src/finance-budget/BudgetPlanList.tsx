import type { Plan, PlanView } from './types'

type Props = {
  plans: Plan[]
  selected: PlanView|null
  editing: boolean
  loading: boolean
  loadError: string
  controlsLocked: boolean
  admin: boolean
  baseCurrency: string
  openingPlanId: string
  onOpen: (plan:Plan)=>void
  onNew: ()=>void
  onRetry: ()=>void
  money: (amount:number,currency?:string)=>string
}

export default function BudgetPlanList({plans,selected,editing,loading,loadError,controlsLocked,admin,baseCurrency,openingPlanId,onOpen,onNew,onRetry,money}:Props) {
  return <section className="panel budget-list" aria-labelledby="budget-list-title">
    <div className="panel-heading">
      <div><h2 id="budget-list-title">Bütçe senaryoları</h2><p>{loading?'Senaryolar yükleniyor…':`${plans.length} kayıt · firma kapsamlı`}</p></div>
      {admin&&<button type="button" className="primary" onClick={onNew} disabled={controlsLocked||!baseCurrency}>Yeni bütçe</button>}
    </div>
    {loading?<div className="budget-state" role="status"><span className="budget-spinner" aria-hidden="true"/>Bütçe senaryoları yükleniyor…</div>
      :loadError?<div className="budget-state budget-empty budget-load-error" role="alert"><strong>Bütçe senaryoları yüklenemedi</strong><span>{loadError}</span><button type="button" className="secondary" onClick={onRetry} disabled={controlsLocked}>Yeniden dene</button></div>
      :plans.length===0?<div className="budget-state budget-empty"><strong>Henüz bütçe senaryosu yok</strong><span>{admin?'İlk bütçe taslağınızı oluşturarak başlayın.':'Firma yöneticisi bir bütçe senaryosu oluşturduğunda burada görünür.'}</span>{admin&&<button type="button" className="secondary" onClick={onNew} disabled={controlsLocked}>İlk bütçeyi oluştur</button>}</div>
      :<div className="budget-plan-list" aria-label="Bütçe senaryoları">
        {plans.map(plan=><button type="button" key={plan.id} className={`budget-plan-item ${selected?.plan.id===plan.id&&!editing?'active':''}`} onClick={()=>onOpen(plan)} disabled={controlsLocked} aria-pressed={selected?.plan.id===plan.id&&!editing}>
          <span className="budget-plan-top"><span className="budget-plan-title">{plan.name}</span><span className={`quote-status ${isApproved(plan.status)?'accepted':'pending'}`}>{planStatus(plan.status)}</span></span>
          <span className="budget-plan-meta">{plan.fiscalYear} · {plan.currencyCode} · {plan.lineCount} satır</span>
          <span className="budget-plan-total-label">Plan toplamı (brüt · {plan.currencyCode})</span><strong className="budget-plan-total">{money(plan.plannedTotal,plan.currencyCode)}</strong>
          <span className="budget-plan-meta">Yevmiye gerçekleşeni (brüt · {baseCurrency})</span><span className="budget-plan-actual">{money(plan.actualTotal,baseCurrency)}</span>
          {openingPlanId===plan.id&&<span className="budget-opening" role="status">Açılıyor…</span>}
        </button>)}
      </div>}
  </section>
}

function isApproved(status:Plan['status']) { return status===2||status==='Approved' }
function planStatus(status:Plan['status']) { return isApproved(status)?'Onaylı':status===1||status==='Draft'?'Taslak':String(status) }
