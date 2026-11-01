import { CalendarDays, RefreshCw, ShieldCheck, WalletCards } from 'lucide-react'
import { FinanceStudioGrid } from '../../FinanceStudioGrid'
import { financeGridDefaults } from '../../financeCatalog'
import type { CashFlowReport } from '../../erp-types'

type Props = {
  token: string
  report: CashFlowReport | null
  loading: boolean
  from: string
  to: string
  onFromChange: (value: string) => void
  onToChange: (value: string) => void
  onRefresh: () => void
}

const amount = (value: number) => value.toLocaleString('tr-TR', { minimumFractionDigits: 2 })

export function CashFlowReportPanel({ token, report, loading, from, to, onFromChange, onToChange, onRefresh }: Props) {
  return <section className="panel cash-flow-report-panel">
    <div className="cash-flow-report-header">
      <div className="cash-flow-report-title"><span className="cash-flow-icon"><WalletCards size={18}/></span><div><p className="eyebrow">HESAP HAREKETLERİ</p><h2>Nakit akışı</h2><p>Seçilen dönemdeki kasa ve banka hareketlerinin özeti.</p></div></div>
      <div className="cash-flow-period-controls">
        <label><span><CalendarDays size={13}/> Başlangıç</span><input type="date" value={from} max={to || undefined} onChange={event => onFromChange(event.target.value)}/></label>
        <label><span><CalendarDays size={13}/> Bitiş</span><input type="date" value={to} min={from || undefined} onChange={event => onToChange(event.target.value)}/></label>
        <button className="primary" disabled={loading} onClick={onRefresh}><RefreshCw size={15}/>{loading ? 'Yükleniyor…' : 'Dönemi getir'}</button>
      </div>
    </div>
    <div className="cash-flow-report-context"><ShieldCheck size={15}/><span>Bu görünüm kasa/banka hareketlerinden hazırlanır; yasal nakit akış tablosu değildir.</span>{report&&<span className={`cash-flow-completion ${report.isComplete?'complete':'incomplete'}`}>{report.isComplete?'Kontrol edildi':'Sınıflandırma bekliyor'}</span>}</div>
    {report && !report.isComplete && <div className="boundary-note cash-flow-warning"><ShieldCheck size={16}/><span>{report.unclassifiedMovementCount} hareket henüz sınıflandırılmadı. Ekstre hareketleri şu an sınıflandırılmamış görünür.</span></div>}
    <div className="ledger-list cash-flow-table-wrap"><FinanceStudioGrid token={token} screenKey="finance-cash-flow-report" defaults={financeGridDefaults['finance-cash-flow-report']}>
      <table className="customer-table"><thead><tr><th>Döviz</th><th>Dönem başı</th><th>İşletme</th><th>Yatırım</th><th>Finansman</th><th>İç transfer</th><th>Sınıflandırılmamış</th><th>Açılış düzeltmesi</th><th>Net değişim</th><th>Dönem sonu</th><th>Kontrol</th></tr></thead>
        <tbody>{report?.currencies.map(row => <tr key={row.currencyCode}><td><span className="cash-flow-currency">{row.currencyCode}</span></td><td>{amount(row.openingBalance)}</td><td>{amount(row.operating)}</td><td>{amount(row.investing)}</td><td>{amount(row.financing)}</td><td>{amount(row.internalTransfers)}</td><td>{amount(row.unclassified)}</td><td>{amount(row.openingAdjustments)}</td><td><b>{amount(row.netChange)}</b></td><td><b>{amount(row.closingBalance)}</b></td><td><span className={`cash-flow-reconcile ${row.reconciles?'matched':'unmatched'}`}>{row.reconciles ? 'Mutabık' : 'Fark var'}</span></td></tr>)}
          {loading && <tr><td colSpan={11} className="table-empty" role="status">Nakit akışı yükleniyor…</td></tr>}
          {!loading && report?.currencies.length === 0 && <tr><td colSpan={11} className="table-empty">Seçilen dönemde kasa/banka hareketi yok.</td></tr>}
        </tbody>
      </table>
    </FinanceStudioGrid></div>
  </section>
}
