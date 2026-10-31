import type { CurrencySummary } from '../types'

type Props = { summaries:CurrencySummary[]; formatMoney:(amount:number,currency:string)=>string }

export function CreditFacilitiesSummary({summaries,formatMoney}:Props) {
  return summaries.length>0&&<section className="credit-overview" aria-label="Kredi bakiyesi özeti">{summaries.map(summary=><article className="credit-overview-card" key={summary.code}><div className="credit-overview-title"><h2>{summary.code} toplamı</h2><span>{summary.count} kayıt</span></div><dl><div><dt>Onaylı limit</dt><dd>{formatMoney(summary.approved,summary.code)}</dd></div><div><dt>Toplam kullandırım</dt><dd>{formatMoney(summary.drawdown,summary.code)}</dd></div><div className="credit-overview-emphasis"><dt>Açık anapara</dt><dd>{formatMoney(summary.outstanding,summary.code)}</dd></div><div><dt>Açık taksit toplamı</dt><dd>{formatMoney(summary.scheduled,summary.code)}</dd></div></dl></article>)}</section>
}
