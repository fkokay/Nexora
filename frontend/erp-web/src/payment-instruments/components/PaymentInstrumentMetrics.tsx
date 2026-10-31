import { CircleDollarSign, FileClock, XCircle } from 'lucide-react'
import type { PortfolioSummary } from '../paymentInstrumentTypes'

export function PaymentInstrumentMetrics({ summary, portfolioSummary }: { summary: PortfolioSummary; portfolioSummary: string }) {
  return <div className="payment-instrument-metrics">
    <article><span><CircleDollarSign size={18}/></span><small>Açık portföy</small><b>{portfolioSummary}</b><em>seçili filtrelere göre, döviz ayrımıyla</em></article>
    <article><span><FileClock size={18}/></span><small>Vadesi gelen</small><b>{summary.dueCount}</b><em>seçili filtrelere göre</em></article>
    <article><span><XCircle size={18}/></span><small>Karşılıksız</small><b>{summary.bouncedCount}</b><em>seçili filtrelere göre</em></article>
  </div>
}
