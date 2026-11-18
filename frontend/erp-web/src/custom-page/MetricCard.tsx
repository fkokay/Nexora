import type { CSSProperties, KeyboardEvent, MouseEvent, ReactNode } from "react";
import { METRIC_ICONS as ICONS } from "./metricIcons";
import { sparklinePath, type Tone } from "./cellFormat";

const TREND_WIDTH = 70;
const TREND_HEIGHT = 26;

/** Özet kartı: ikon kutusu, etiket/değer/açıklama ve sağda eğilim çizgisi; `onActivate` varsa tıkla-süz düğmesi. */
export function MetricCard({ title, value, description, tone, icon, trend, active, onActivate, hasError, footer, style }: {
  title: string; value: ReactNode; description: string; tone: Tone; icon?: string; trend?: number[];
  active?: boolean; onActivate?: () => void; hasError?: boolean; footer?: ReactNode; style: CSSProperties;
}) {
  const Icon = icon && Object.hasOwn(ICONS, icon) ? ICONS[icon] : undefined;
  const path = trend ? sparklinePath(trend, TREND_WIDTH, TREND_HEIGHT) : "";
  const interactive = onActivate && !hasError
    ? {
      role: "button" as const, tabIndex: 0, "aria-pressed": !!active,
      onClick: (event: MouseEvent<HTMLElement>) => {
        const nested = (event.target as HTMLElement).closest("button, a, input, select, textarea");
        if (nested && nested !== event.currentTarget) return;
        onActivate();
      },
      onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onActivate(); }
      },
    }
    : {};
  const className = ["tenant-page-metric", "tenant-page-report-widget", `tone-${tone}`, active ? "is-active" : "", onActivate && !hasError ? "is-clickable" : "", hasError ? "is-error" : ""].filter(Boolean).join(" ");
  return <article className={className} style={style} {...interactive}>
    {Icon && <span className="tenant-metric-icon" aria-hidden="true"><Icon size={16} /></span>}
    <div className="tenant-metric-body">
      {title && <span className="tenant-metric-label">{title}</span>}
      {value}
      {description && <small>{description}</small>}
      {footer}
    </div>
    {path && <svg className="tenant-metric-trend" width={TREND_WIDTH} height={TREND_HEIGHT} viewBox={`0 0 ${TREND_WIDTH} ${TREND_HEIGHT}`} aria-hidden="true">
      <polyline points={path} fill="none" />
    </svg>}
  </article>;
}
