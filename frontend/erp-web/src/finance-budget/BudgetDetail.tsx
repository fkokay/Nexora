import AdvancedDataGrid from '../AdvancedDataGrid'
import type { BudgetLayoutField, Line, PlanView } from './types'

type Props = {
  selected: PlanView
  draft: boolean
  admin: boolean
  currencyMismatch: boolean
  baseCurrency: string
  visibleFields: BudgetLayoutField[]
  controlsLocked: boolean
  busy: boolean
  onEdit: (plan: PlanView) => void
  onApprove: () => void
  money: (amount: number, currency?: string) => string
}

export default function BudgetDetail({
  selected, draft, admin, currencyMismatch, baseCurrency, visibleFields,
  controlsLocked, busy, onEdit, onApprove, money,
}: Props) {
  return (
    <section className="panel budget-detail" aria-labelledby="budget-detail-title">
      <div className="panel-heading budget-detail-heading">
        <div>
          <p className="eyebrow">{selected.plan.fiscalYear} · {selected.plan.currencyCode}</p>
          <h2 id="budget-detail-title">{selected.plan.name}</h2>
          <p>{isApproved(selected.plan.status)
            ? `Onaylayan: ${selected.plan.approvedByUserId || '—'}`
            : 'Taslak · Onay için farklı bir TenantAdmin gerekir'}</p>
        </div>
        <div className="budget-actions">
          {draft && admin && !currencyMismatch && <>
            <button type="button" className="secondary" onClick={() => onEdit(selected)} disabled={controlsLocked}>Düzenle</button>
            <button type="button" className="primary" disabled={controlsLocked || selected.lines.length === 0} onClick={onApprove} aria-busy={busy}>
              {busy ? 'Onaylanıyor…' : 'Onayla'}
            </button>
          </>}
        </div>
      </div>
      {currencyMismatch && <div className="budget-currency-warning" role="status">
        <strong>Para birimi uyumsuzluğu</strong>
        <span>Bu senaryo {selected.plan.currencyCode} ile oluşturulmuş; firmanın güncel baz para birimi {baseCurrency}. Plan tutarları {selected.plan.currencyCode}, yevmiye gerçekleşenleri {baseCurrency} cinsindedir ve aralarında kur çevrimi yapılmaz. Fark gösterilmez. Bu senaryo düzenlenemez veya onaylanamaz; güncel baz para biriminde yeni bir taslak oluşturun.</span>
      </div>}
      {selected.lines.length === 0 ? (
        <div className="budget-state budget-empty">
          <strong>Bu senaryoda bütçe satırı yok</strong>
          <span>{draft && admin && !currencyMismatch
            ? 'Taslağı düzenleyip satır ekleyebilirsiniz.'
            : 'Senaryo henüz herhangi bir bütçe satırı içermiyor.'}</span>
          {draft && admin && !currencyMismatch && <button type="button" className="secondary" onClick={() => onEdit(selected)} disabled={controlsLocked}>Taslağı düzenle</button>}
        </div>
      ) : (
        <div className="ledger-list budget-ledger-wrap">
          <AdvancedDataGrid className="customer-table budget-ledger">
            <caption>{selected.plan.name} bütçe ve yevmiye gerçekleşenleri</caption>
            <thead><tr>{visibleFields.map(field => <th key={field.key} scope="col">
              {field.key === 'plannedAmount' ? `${field.label} (${selected.plan.currencyCode})`
                : field.key === 'actualAmount' ? `${field.label} (${baseCurrency})`
                  : field.key === 'variance' ? `${field.label}${currencyMismatch ? ' (hesaplanmıyor)' : ` (${baseCurrency})`}`
                    : field.label}
            </th>)}</tr></thead>
            <tbody>
              {selected.lines.map((line, index) => {
                const variance = line.variance
                const favorable = variance !== null && variance !== undefined
                  && (line.statementSection === 'Revenue' ? variance >= 0 : variance <= 0)
                return <tr key={line.id || `${line.accountId}-${line.periodStart}-${index}`}>
                  {visibleFields.map(field => {
                    const value = getLineValue(field, line, selected.plan.currencyCode, baseCurrency, money)
                    return <td key={field.key} data-label={field.label}
                      className={field.key === 'variance' && variance != null ? (favorable ? 'positive' : 'negative') : undefined}>
                      {value}
                    </td>
                  })}
                </tr>
              })}
            </tbody>
          </AdvancedDataGrid>
        </div>
      )}
    </section>
  )
}

function getLineValue(
  field: BudgetLayoutField,
  line: Line,
  planCurrency: string,
  baseCurrency: string,
  money: Props['money'],
) {
  switch (field.key) {
    case 'periodStart': return formatPeriod(line.periodStart)
    case 'account': return <><b>{line.accountCode || '—'}</b><small className="cell-subtitle">{line.accountName}</small></>
    case 'section': return line.statementSection === 'Revenue' ? 'Gelir' : line.statementSection === 'Expense' ? 'Gider' : '—'
    case 'plannedAmount': return money(line.plannedAmount, planCurrency)
    case 'actualAmount': return money(line.actualAmount ?? 0, baseCurrency)
    case 'variance': return line.variance == null ? '—' : money(line.variance, baseCurrency)
    case 'notes': return line.notes || '—'
    default: return '—'
  }
}

function isApproved(status: PlanView['plan']['status']) {
  return status === 2 || status === 'Approved'
}

function formatPeriod(value: string) {
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric' }).format(date)
}
