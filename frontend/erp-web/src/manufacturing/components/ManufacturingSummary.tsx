import type { ReactNode } from 'react'

type Metric = { label: string; value: ReactNode; detail: ReactNode }

export default function ManufacturingSummary({ workCenterMode, workCenterMetrics, generalMetrics }: {
  workCenterMode: boolean
  workCenterMetrics: Metric[]
  generalMetrics: Metric[]
}) {
  const metrics = workCenterMode ? workCenterMetrics : generalMetrics

  return (
    <section className={`manufacturing-kpis ${workCenterMode ? 'work-center-kpis' : ''}`} aria-label="Üretim özeti">
      {metrics.map(metric => (
        <article key={metric.label}>
          <span>{metric.label}</span>
          <b>{metric.value}</b>
          <small>{metric.detail}</small>
        </article>
      ))}
    </section>
  )
}
