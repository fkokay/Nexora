import type { ReactNode } from 'react'

type MetricProps = { icon: ReactNode; label: string; value: string; note: string; tone: string }
export function DashboardMetricCard({ icon, label, value, note, tone }: MetricProps) {
  return <article className={`metric-card ${tone}`}><div className={`metric-icon ${tone}`}>{icon}</div><span className="metric-label">{label}</span><strong>{value}</strong><small>{note}</small></article>
}

type Props = { children: ReactNode }
export default function DashboardKpiGrid({ children }: Props) {
  return <section className="erp-home-kpis dashboard-reference-kpis" aria-label="Firma özeti">{children}</section>
}
