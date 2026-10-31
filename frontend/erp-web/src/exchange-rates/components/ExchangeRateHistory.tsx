import ScreenViewGroupHeader from '../../ScreenViewGroupHeader'
import type { BuiltInScreenLayoutField } from '../../erp-types'
import type { ExchangeRate } from '../types'

type Props = {
  rates: ExchangeRate[]
  base: string
  fields: BuiltInScreenLayoutField[]
}

export default function ExchangeRateHistory({ rates, base, fields }: Props) {
  const visibleFields = fields.filter(field => field.visible).sort((a, b) => a.position - b.position)

  return <section className="finance-workbench-card finance-rate-list">
    <div className="list-toolbar">
      <div><h4>Kur geçmişi</h4><p>{rates.length} kayıt · baz para {base}</p></div>
    </div>
    <div className="ledger-list">
      <table className="customer-table">
        <thead>
          <ScreenViewGroupHeader fields={visibleFields} />
          <tr>{visibleFields.map(field => <th key={field.key}>{field.label}</th>)}</tr>
        </thead>
        <tbody>
          {rates.map(rate => <tr key={rate.id}>
            {visibleFields.map(field => <td key={field.key}>{formatField(rate, field, base)}</td>)}
          </tr>)}
          {rates.length === 0 && <tr><td colSpan={Math.max(1, visibleFields.length)} className="table-empty">Henüz döviz kuru girilmedi.</td></tr>}
        </tbody>
      </table>
    </div>
  </section>
}

function formatField(rate: ExchangeRate, field: BuiltInScreenLayoutField, base: string) {
  switch (field.key) {
    case 'rateDate': return rate.rateDate.split('-').reverse().join('.')
    case 'currencyCode': return rate.currencyCode
    case 'rate': return `${rate.rate.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 8 })} ${base}`
    case 'revision': return rate.revision
    case 'source': return rate.source || '—'
    default: return '—'
  }
}
