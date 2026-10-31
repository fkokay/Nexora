import { isApproved, type PlanScreenField, type PlanSummary } from '../types'

type Props = { plans: PlanSummary[]; fields: PlanScreenField[]; loading: boolean; busy: boolean; admin: boolean; selectedId?: string; editing: boolean; onOpen: (plan: PlanSummary) => void }

export default function DirectCashBudgetPlanList({ plans, fields, loading, busy, admin, selectedId, editing, onOpen }: Props) {
  return <section className="panel direct-cash-budget-list" aria-labelledby="direct-cash-budget-list-title">
    <div className="panel-heading"><div><h2 id="direct-cash-budget-list-title">Bütçe planları</h2><p>{loading ? 'Planlar yükleniyor…' : `${plans.length} kayıt · firma kapsamlı`}</p></div></div>
    {loading ? <div className="budget-state" role="status">Nakit bütçeleri yükleniyor…</div> : plans.length === 0 ? <div className="budget-state budget-empty"><strong>Henüz plan yok</strong><span>{admin ? 'Bir taslak oluşturarak başlayın.' : 'Firma yöneticisi bir nakit bütçesi oluşturduğunda burada görünür.'}</span></div> : <div className="budget-plan-list" aria-label="Nakit bütçesi planları">
      {plans.map(plan => <article key={plan.id} className={`budget-plan-item direct-cash-budget-plan-card ${selectedId === plan.id && !editing ? 'active' : ''}`}>
        <div className="direct-cash-budget-plan-fields">
          {fields.filter(field => field.visible && field.key !== 'actions').map(field => <span className={`direct-cash-budget-plan-field direct-cash-budget-field-${field.key}`} key={field.key}>
            <small>{field.label}</small>
            {field.key === 'status'
              ? <span className={`quote-status ${isApproved(plan.status) ? 'accepted' : 'pending'}`}>{isApproved(plan.status) ? 'Onaylı' : 'Taslak'}</span>
              : <strong>{field.key === 'name' ? plan.name : field.key === 'fiscalYear' ? plan.fiscalYear : field.key === 'currencyCode' ? plan.currencyCode : field.key === 'lineCount' ? `${plan.lineCount} satır` : `Sürüm ${plan.revision}`}</strong>}
          </span>)}
        </div>
        <button type="button" className="secondary small-button direct-cash-budget-open" onClick={() => onOpen(plan)} disabled={busy} aria-label={`${fields.find(field => field.key === 'actions')?.label ?? 'Aç'}: ${plan.name}`}>{fields.find(field => field.key === 'actions')?.label ?? 'Aç'}</button>
      </article>)}
    </div>}
  </section>
}
