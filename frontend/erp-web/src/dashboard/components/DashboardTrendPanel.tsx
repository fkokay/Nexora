import { ArrowRight } from 'lucide-react'
import type { TrendMonth } from '../types'

type Props = { months: TrendMonth[]; currency: string; loading: boolean; canReadSales: boolean; canReadPurchases: boolean; money: (value: number, code?: string) => string; onNavigate: (page: string) => void }
const ticks = [1, .75, .5, .25, 0]

function TrendChart({ months, currency, loading, canReadSales, canReadPurchases, money }: Omit<Props, 'onNavigate'>) {
  const max = Math.max(1, ...months.map(month => Math.max(month.sales, month.purchase)))
  return <div className="dashboard-trend" role="img" aria-label={`Son altı ayın ${currency} satış ve satın alma faturaları`}>
    <div className="dashboard-trend-axis">{ticks.map(tick => <span key={tick}>{money(max * tick)}</span>)}</div>
    <div className="dashboard-trend-plot"><div className="dashboard-trend-grid">{ticks.map(tick => <i key={tick}/>)}</div>
      {loading ? <div className="dashboard-empty-state">Fatura verileri yükleniyor…</div> : !canReadSales && !canReadPurchases ? <div className="dashboard-empty-state">Fatura görüntüleme yetkisi yok.</div> : <div className="dashboard-trend-columns">{months.map(month => <div className="dashboard-trend-month" key={month.key} title={`${month.fullLabel}: Satış ${money(month.sales)}, Satın Alma ${money(month.purchase)}`}><div className="dashboard-trend-bars"><i className="dashboard-bar sales" style={{ height: `${Math.max(2, month.sales / max * 100)}%` }}/><i className="dashboard-bar purchase" style={{ height: `${Math.max(2, month.purchase / max * 100)}%` }}/></div><small>{month.label}</small></div>)}</div>}
    </div>
  </div>
}

export default function DashboardTrendPanel({ months, currency, loading, canReadSales, canReadPurchases, money, onNavigate }: Props) {
  return <section className="erp-home-panel dashboard-reference-trend">
    <header><div><h2>Satış ve satın alma trendi</h2><p>Son 6 ay · {currency}</p></div><button className="secondary compact" type="button" onClick={() => onNavigate('reports')}>Raporları aç <ArrowRight size={14}/></button></header>
    <TrendChart months={months} currency={currency} loading={loading} canReadSales={canReadSales} canReadPurchases={canReadPurchases} money={money}/>
    <div className="dashboard-chart-legend"><span><i className="sales"/>Satış</span><span><i className="purchase"/>Satın Alma</span></div>
  </section>
}
