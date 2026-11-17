import type { CSSProperties, ReactNode } from "react";
import { AlertTriangle, BarChart3, Box, CheckCircle2, Clock, Receipt, Users, Wallet, type LucideIcon } from "lucide-react";
import { columnTotal, formatCell, isRightAligned, parseColumnFormats, parseToneMap, sparklinePath, toneFor, trendPoints, type Tone } from "./cellFormat";

// Tuval önizlemeleri: ERP (MetricCard / QueryTable / PageBadge) görünümünü, sorgu önizleme verisiyle yansıtır.
const ICONS: Record<string, LucideIcon> = {
  box: Box, users: Users, receipt: Receipt, wallet: Wallet, chart: BarChart3, clock: Clock, check: CheckCircle2, alert: AlertTriangle,
};
const TREND_WIDTH = 70;
const TREND_HEIGHT = 26;
const TONE_NAMES: readonly string[] = ["info", "success", "warning", "danger"];

export const toneOf = (value: unknown): Tone => (TONE_NAMES.includes(String(value)) ? String(value) as Tone : "info");

export function MetricPreview({ title, value, description, tone, icon, trendRows, style }: {
  title: string; value: ReactNode; description: string; tone: Tone; icon?: unknown; trendRows?: Record<string, unknown>[]; style: CSSProperties;
}) {
  const Icon = typeof icon === "string" ? ICONS[icon] : undefined;
  const path = trendRows ? sparklinePath(trendPoints(trendRows), TREND_WIDTH, TREND_HEIGHT) : "";
  return <article className={`custom-page-preview-metric is-dl tone-${tone}`} style={style}>
    {Icon && <span className="pd-metric-icon" aria-hidden="true"><Icon size={16} /></span>}
    <div className="pd-metric-body">
      <span className="pd-metric-label">{title}</span>
      <b>{value}</b>
      {description && <small className="pd-metric-desc">{description}</small>}
    </div>
    {path && <svg className="pd-metric-trend" width={TREND_WIDTH} height={TREND_HEIGHT} viewBox={`0 0 ${TREND_WIDTH} ${TREND_HEIGHT}`} aria-hidden="true"><polyline points={path} fill="none" /></svg>}
  </article>;
}

export function BadgePreview({ text, variant, toneMap, style }: { text: string; variant?: unknown; toneMap?: unknown; style: CSSProperties }) {
  const tone = toneFor(text, parseToneMap(toneMap)) ?? toneOf(variant);
  return <span className={`custom-page-preview-badge tone-${tone}`} style={style}>{text}</span>;
}

type PreviewColumn = { code: string; label?: string; dataType?: string };

// Toplam satırı yalnız sorgu bağlı ızgarada (ERP QueryTable gibi) gösterilir; tuvalde toplam yalnız önizleme satırları üzerinden hesaplanır.
export function GridPreview({ title, subtitle, columns, rows, truncated, props, emptyText, rowAction, showTotals, style }: {
  title: string; subtitle: string; columns: PreviewColumn[]; rows: Record<string, unknown>[]; truncated: boolean;
  props: Record<string, unknown>; emptyText: string; rowAction?: string; showTotals?: boolean; style: CSSProperties;
}) {
  const formats = parseColumnFormats(props.columnFormats);
  const toneMap = parseToneMap(props.toneMap);
  const totals = Array.isArray(props.totals) ? props.totals.filter((item): item is string => typeof item === "string") : [];
  const comfort = props.density === "comfort";
  const hasTotals = showTotals === true && columns.some((column) => totals.includes(column.code)) && rows.length > 0;
  const totalLabel = truncated ? `Toplam · ilk ${rows.length} satır` : `Toplam · ${rows.length} kayıt`;
  const cellClass = (column: PreviewColumn) => [isRightAligned(formats[column.code], column.dataType) ? "num" : "", formats[column.code] === "code" ? "code" : ""].filter(Boolean).join(" ") || undefined;
  const cell = (column: PreviewColumn, row: Record<string, unknown>) => {
    const text = formatCell(row[column.code], formats[column.code], column.dataType);
    if (formats[column.code] !== "status" || text === "—") return text;
    const tone = toneFor(text, toneMap);
    return <span className={`pd-tag${tone ? ` tone-${tone}` : ""}`}>{text}</span>;
  };
  const colCount = columns.length + (rowAction ? 1 : 0);
  return <article className="custom-page-preview-card" style={style}>
    <div className="custom-page-preview-card-head"><b>{title}</b><small>{subtitle}</small></div>
    <div className="custom-page-preview-grid-scroll"><table className={`custom-page-preview-grid${comfort ? " is-comfort" : ""}`}>
      <thead><tr>{columns.map((column) => <th key={column.code} className={isRightAligned(formats[column.code], column.dataType) ? "num" : undefined}>{column.label || column.code}</th>)}{rowAction && <th scope="col">İşlemler</th>}</tr></thead>
      <tbody>{rows.length === 0 ? <tr><td colSpan={Math.max(1, colCount)}>{emptyText}</td></tr>
        : rows.map((row, rowIndex) => <tr key={String(row.id ?? rowIndex)}>{columns.map((column) => <td key={column.code} className={cellClass(column)}>{cell(column, row)}</td>)}{rowAction && <td><span className="custom-page-preview-row-action">{rowAction}</span></td>}</tr>)}</tbody>
      {hasTotals && <tfoot><tr className="pd-total">
        {columns.map((column, index) => {
          const total = totals.includes(column.code) ? columnTotal(rows, column.code) : null;
          const text = total === null ? "" : formatCell(total, formats[column.code] === "money" ? "money" : "number");
          if (index === 0 && total !== null) return <td key={column.code}><span className="pd-total-label">{totalLabel}</span><span className="num">{text}</span></td>;
          return <td key={column.code} className={total !== null ? "num" : undefined}>{index === 0 ? totalLabel : text}</td>;
        })}
        {rowAction && <td />}
      </tr></tfoot>}
    </table></div>
  </article>;
}
