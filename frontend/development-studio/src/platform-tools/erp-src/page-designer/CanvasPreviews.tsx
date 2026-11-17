import { Children, type CSSProperties, type ReactNode } from "react";
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
  const Icon = typeof icon === "string" && Object.hasOwn(ICONS, icon) ? ICONS[icon] : undefined;
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
          const inTotals = totals.includes(column.code);
          const text = total !== null ? formatCell(total, formats[column.code] === "money" ? "money" : "number") : inTotals ? "—" : "";
          if (index === 0 && total !== null) return <td key={column.code}><span className="pd-total-label">{totalLabel}</span><span className="num">{text}</span></td>;
          return <td key={column.code} className={total !== null ? "num" : undefined}>{index === 0 ? totalLabel : text}</td>;
        })}
        {rowAction && <td />}
      </tr></tfoot>}
    </table></div>
  </article>;
}

// Düzen bileşenleri önizlemeleri: ERP LayoutComponents.tsx (FormCard / FilterChips / FacetPanel / ContextPanel) ile aynı yapı; etkileşimsizdir.

export function FormCardPreview({ title, columns, children, style }: { title: string; columns: 1 | 2 | 3; children: ReactNode; style: CSSProperties }) {
  return <section className="pd-layout-block pd-form-card" style={style}>
    {title && <h3>{title}</h3>}
    <div className={`pd-form-card-grid is-cols-${columns}`}>
      {Children.map(children, (child) => child == null || child === false ? null : <div className="pd-form-card-cell">{child}</div>)}
    </div>
  </section>;
}

/** Çip yoksa bileşen tuvalde kaybolmasın diye soluk bir örnek çip gösterilir. */
export function FilterChipsPreview({ chips, style }: { chips: { id: string; label: string; text: string }[]; style: CSSProperties }) {
  if (chips.length === 0) return <div className="pd-chips" style={style}><span className="pd-chip is-sample"><span className="pd-chip-label">Örnek:</span><strong>değer</strong></span></div>;
  return <div className="pd-chips" style={style} role="group" aria-label="Etkin süzgeçler">
    {chips.map((chip) => <span className="pd-chip" key={chip.id}><span className="pd-chip-label">{chip.label}:</span><strong>{chip.text}</strong><span className="pd-chip-x" aria-hidden="true">✕</span></span>)}
    <span className="pd-chips-clear" aria-label="Tüm süzgeçleri temizle">Temizle</span>
  </div>;
}

export type FacetPreviewGroup = { id: string; label: string; options: { label: string; count?: number }[]; ready: boolean };
const FACET_OPTION_LIMIT = 8;

export function FacetPanelPreview({ title, groups, style }: { title: string; groups: FacetPreviewGroup[]; style: CSSProperties }) {
  return <aside className="pd-layout-block pd-facet" style={style}>
    <div className="pd-facet-head"><h3>{title}</h3><span className="pd-facet-clear" aria-label={`${title || "Süzgeç"} süzgeçlerini temizle`}>Temizle</span></div>
    {groups.map((group) => <div className="pd-facet-group" key={group.id} role="group" aria-label={group.label}>
      <div className="pd-facet-label">{group.label}</div>
      {!group.ready ? <p className="pd-facet-state">Seçenekler için sorguyu önizleyin</p> : <>
        <div className="pd-facet-option is-selected"><span>Tümü</span></div>
        {group.options.slice(0, FACET_OPTION_LIMIT).map((option, index) => <div className="pd-facet-option" key={index}>
          <span>{option.label}</span>
          {option.count !== undefined && <span className="pd-facet-count">{option.count.toLocaleString("tr-TR")}</span>}
        </div>)}
      </>}
    </div>)}
  </aside>;
}

export function ContextPanelPreview({ title, row, fields, related, style }: {
  title: string; row: Record<string, unknown> | null; fields: { code: string; label: string; text: string }[];
  related?: { title: string; rows: string[] }; style: CSSProperties;
}) {
  return <aside className="pd-layout-block pd-context" style={style}>
    {title && <h3>{title}</h3>}
    {row === null ? <p className="pd-context-empty">Bir satır seçin</p> : <>
      <dl className="pd-context-fields">
        {fields.map((field) => <div className="pd-context-field" key={field.code}><dt>{field.label}</dt><dd>{field.text}</dd></div>)}
      </dl>
      {related && <section className="pd-context-related">
        <h4>{related.title}</h4>
        {related.rows.length === 0 ? <p className="pd-context-note">Kayıt yok</p> : <ul>{related.rows.slice(0, 5).map((text, index) => <li key={index}>{text}</li>)}</ul>}
      </section>}
    </>}
  </aside>;
}
