import type { CSSProperties, KeyboardEvent, ReactNode } from "react";
import { AlertTriangle, BarChart3, Box, CheckCircle2, Clock, Receipt, Users, Wallet, type LucideIcon } from "lucide-react";
import { sparklinePath, type Tone } from "./cellFormat";

const ICONS: Record<string, LucideIcon> = {
  box: Box, users: Users, receipt: Receipt, wallet: Wallet, chart: BarChart3, clock: Clock, check: CheckCircle2, alert: AlertTriangle,
};

const TREND_WIDTH = 70;
const TREND_HEIGHT = 26;

/** Özet kartı: ikon kutusu, etiket/değer/açıklama ve sağda eğilim çizgisi; `onActivate` varsa tıkla-süz düğmesi. */
export function MetricCard({ title, value, description, tone, icon, trend, active, onActivate, hasError, style }: {
  title: string; value: ReactNode; description: string; tone: Tone; icon?: string; trend?: number[];
  active?: boolean; onActivate?: () => void; hasError?: boolean; style: CSSProperties;
}) {
  const Icon = icon ? ICONS[icon] : undefined;
  const path = trend ? sparklinePath(trend, TREND_WIDTH, TREND_HEIGHT) : "";
  const interactive = onActivate
    ? {
      role: "button" as const, tabIndex: 0, "aria-pressed": !!active, onClick: onActivate,
      onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onActivate(); }
      },
    }
    : {};
  const className = ["tenant-page-metric", "tenant-page-report-widget", `tone-${tone}`, active ? "is-active" : "", onActivate ? "is-clickable" : "", hasError ? "is-error" : ""].filter(Boolean).join(" ");
  return <article className={className} style={style} {...interactive}>
    {Icon && <span className="tenant-metric-icon" aria-hidden="true"><Icon size={16} /></span>}
    <div className="tenant-metric-body">
      {title && <span className="tenant-metric-label">{title}</span>}
      {value}
      {description && <small>{description}</small>}
    </div>
    {path && <svg className="tenant-metric-trend" width={TREND_WIDTH} height={TREND_HEIGHT} viewBox={`0 0 ${TREND_WIDTH} ${TREND_HEIGHT}`} aria-hidden="true">
      <polyline points={path} fill="none" />
    </svg>}
  </article>;
}
