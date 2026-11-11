import type { CSSProperties, ReactNode } from "react";

type MetricProps = {
  icon: ReactNode;
  label: string;
  value: string;
  note: string;
  tone: string;
  style?: CSSProperties;
};
export function DashboardMetricCard({
  icon,
  label,
  value,
  note,
  tone,
  style,
}: MetricProps) {
  return (
    <article className={`metric-card ${tone}`} style={style}>
      <div className={`metric-icon ${tone}`}>{icon}</div>
      <span className="metric-label">{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}
