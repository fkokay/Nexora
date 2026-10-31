type Props = { planCount: number; approvedCount: number; draftCount: number; forecastRowCount: number }

export default function DirectCashBudgetMetrics({ planCount, approvedCount, draftCount, forecastRowCount }: Props) {
  return <section className="direct-cash-budget-metrics" aria-label="Bütçe özeti">
    <article><span>Toplam plan</span><strong>{planCount}</strong><small>Firma kapsamındaki kayıtlar</small></article>
    <article><span>Onaylı plan</span><strong>{approvedCount}</strong><small>Nakit tahminine dahil</small></article>
    <article><span>Taslak</span><strong>{draftCount}</strong><small>Henüz tahmine dahil değil</small></article>
    <article><span>Tahmin satırı</span><strong>{forecastRowCount}</strong><small>Önümüzdeki 12 ay</small></article>
  </section>
}
