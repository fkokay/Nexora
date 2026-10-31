import type { CostReport } from './types'

const amount = (value: number | null | undefined, currency: string) => {
  if (value == null) return '—'
  try { return new Intl.NumberFormat('tr-TR', { style: 'currency', currency }).format(value) }
  catch { return `${new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(value)} ${currency}` }
}

export function ManufacturingCostVarianceSummary({ report, currency }: { report: CostReport; currency: string }) {
  return <section className="manufacturing-cost-summary" aria-label="Üretim maliyet özeti">
    <article><span>Üretim emri</span><b>{report.totalCount.toLocaleString('tr-TR')}</b><small>Seçili plan tarihi aralığı</small></article>
    <article><span>Planlanan malzeme</span><b>{amount(report.pageTotals.plannedMaterialBase, currency)}</b><small>Bu sayfa · fire dahil emir anlık görüntüsü</small></article>
    <article><span>Planlanan dönüşüm</span><b>{amount(report.pageTotals.plannedLaborBase + report.pageTotals.plannedOverheadBase + report.pageTotals.plannedEnergyBase, currency)}</b><small>Bu sayfa · işçilik, genel gider ve enerji</small></article>
    <article><span>Fiilî malzeme</span><b>{amount(report.pageTotals.actualMaterialBase, currency)}</b><small>Bu sayfa · emre bağlı bileşen hareketleri</small></article>
  </section>
}
