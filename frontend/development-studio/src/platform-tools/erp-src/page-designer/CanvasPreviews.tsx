import { Children, useEffect, useRef, useState, type CSSProperties, type DragEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { useFlip } from "./useFlip";
import { AlertTriangle, CheckCircle2, ChevronDown, ImageIcon, Info, PanelRight, Search, ShieldAlert, ShieldCheck, type LucideIcon } from "lucide-react";
import { METRIC_ICONS as ICONS } from "./metricIcons";
import { columnTotal, formatCell, isRightAligned, parseColumnFormats, parseToneMap, sparklinePath, toneFor, trendPoints, type Tone } from "./cellFormat";
import type { GridColumn } from "./gridColumns";

// Tuval önizlemeleri: ERP (MetricCard / QueryTable / PageBadge) görünümünü, sorgu önizleme verisiyle yansıtır.
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
/** Sunucu sayfalı listenin tuval altbilgisi (ERP PagedTableFooter görünümü; düğmeler tuvalde kapalıdır). */
export type GridPaging = { pageSize: number; total: number; meta: { label: string; value: string }[]; search?: ReactNode };

/** `advanced`: sorguya bağlı tablo ERP'de gelişmiş ızgarayla çizilir; tuvalde de araç satırı ve onay kutusu sütunu görünür. */
export function GridPreview({ title, subtitle, columns, rows, truncated, props, emptyText, rowAction, rowActionLabels, showTotals, paging, style, advanced = false, detailToggleLabel }: {
  title: string; subtitle: string; columns: PreviewColumn[]; rows: Record<string, unknown>[]; truncated: boolean;
  props: Record<string, unknown>; emptyText: string; rowAction?: string;
  /** Satır işlemi düğmelerinin (rowActions) etiketleri: "İşlemler" sütununda satır başına çip olarak çizilir. */
  rowActionLabels?: string[];
  showTotals?: boolean; paging?: GridPaging; style: CSSProperties; advanced?: boolean;
  /** `detailToggleInput`: araç çubuğunda Sütunlar'ın yanında çizilen "Detay paneli" düğmesinin etiketi (ERP'de açıkken mavi). */
  detailToggleLabel?: string;
}) {
  const actionChips = [...(rowAction ? [rowAction] : []), ...(rowActionLabels ?? [])];
  const hasActions = actionChips.length > 0;
  const formats = parseColumnFormats(props.columnFormats);
  const toneMap = parseToneMap(props.toneMap);
  const totals = Array.isArray(props.totals) ? props.totals.filter((item): item is string => typeof item === "string") : [];
  const comfort = props.density === "comfort";
  const hasTotals = showTotals === true && columns.some((column) => totals.includes(column.code)) && rows.length > 0;
  const totalLabel = paging ? `Sayfa toplamı · ${rows.length} kayıt` : truncated ? `Toplam · ilk ${rows.length} satır` : `Toplam · ${rows.length} kayıt`;
  const number = (value: number) => value.toLocaleString("tr-TR");
  const pages = paging ? Math.max(1, Math.ceil(paging.total / paging.pageSize)) : 1;
  const range = paging ? paging.total <= 0 ? "0 / 0" : `1–${number(Math.min(paging.pageSize, paging.total))} / ${number(paging.total)}` : "";
  const cellClass = (column: PreviewColumn) => [isRightAligned(formats[column.code], column.dataType) ? "num" : "", formats[column.code] === "code" ? "code" : ""].filter(Boolean).join(" ") || undefined;
  const cell = (column: PreviewColumn, row: Record<string, unknown>) => {
    const text = formatCell(row[column.code], formats[column.code], column.dataType);
    if (formats[column.code] !== "status" || text === "—") return text;
    const tone = toneFor(text, toneMap);
    return <span className={`pd-tag${tone ? ` tone-${tone}` : ""}`}>{text}</span>;
  };
  const colCount = columns.length + (hasActions ? 1 : 0) + (advanced ? 1 : 0);
  const check = advanced ? <span className="pd-adv-check" aria-hidden="true" /> : null;
  return <article className="custom-page-preview-card" style={style}>
    <div className="custom-page-preview-card-head"><b>{title}</b><small>{subtitle}</small></div>
    {paging?.search && <div className="pd-grid-search">{paging.search}</div>}
    {advanced && <div className="pd-adv-toolbar" aria-hidden="true">
      {props.showGridSearch !== false && <span className="pd-adv-search"><Search size={13}/>Tüm sütunlarda ara</span>}
      {props.showColumnFilters !== false && <span className="pd-adv-menu">Sütun filtreleri</span>}{props.showColumnChooser !== false && <span className="pd-adv-menu">Sütunlar</span>}
      {detailToggleLabel && <span className="pd-adv-btn pd-adv-toggle"><PanelRight size={13}/>{detailToggleLabel}</span>}
      <span className="pd-adv-count">{paging ? number(paging.total) : rows.length} kayıt</span>
      {props.showExport !== false && <><span className="pd-adv-btn">XLSX</span>{props.showCsv !== false && <span className="pd-adv-btn">CSV</span>}</>}{props.showPivot !== false && <span className="pd-adv-btn">Pivot görünümü</span>}
    </div>}
    <div className={`custom-page-preview-grid-scroll${advanced ? " is-advanced" : ""}`}><table className={`custom-page-preview-grid${comfort ? " is-comfort" : ""}${advanced ? " is-advanced" : ""}`}>
      <thead><tr>{advanced && <th className="pd-adv-check-cell" title={props.showSelectedExport !== false ? "Satır seçilince: Excel (seçilenler)" : undefined}>{check}</th>}{columns.map((column) => <th key={column.code} className={isRightAligned(formats[column.code], column.dataType) ? "num" : undefined}>{column.label || column.code}</th>)}{hasActions &&<th scope="col">İşlemler</th>}</tr></thead>
      <tbody>{rows.length === 0 ? <tr><td colSpan={Math.max(1, colCount)}>{emptyText}</td></tr>
        : rows.map((row, rowIndex) => <tr key={String(row.id ?? rowIndex)}>{advanced && <td className="pd-adv-check-cell">{check}</td>}{columns.map((column) => <td key={column.code} className={cellClass(column)}>{cell(column, row)}</td>)}{hasActions &&<td>{actionChips.map((label, index) => <span key={index} className="custom-page-preview-row-action" style={index > 0 ? { marginLeft: 4 } : undefined}>{label}</span>)}</td>}</tr>)}</tbody>
      {hasTotals && <tfoot><tr className="pd-total">{advanced && <td />}
        {columns.map((column, index) => {
          const total = totals.includes(column.code) ? columnTotal(rows, column.code) : null;
          const inTotals = totals.includes(column.code);
          const text = total !== null ? formatCell(total, formats[column.code] === "money" ? "money" : "number") : inTotals ? "—" : "";
          if (index === 0 && total !== null) return <td key={column.code}><span className="pd-total-label">{totalLabel}</span><span className="num">{text}</span></td>;
          return <td key={column.code} className={total !== null ? "num" : undefined}>{index === 0 ? totalLabel : text}</td>;
        })}
        {hasActions &&<td />}
      </tr></tfoot>}
    </table></div>
    {paging && <div className="pd-pager">
      <span className="pd-pager-range">{range}</span>
      {paging.meta.map((item) => <span key={item.label} className="pd-pager-meta">{item.label}: {item.value}</span>)}
      <span className="pd-pager-grow" />
      <button type="button" tabIndex={-1} disabled>Önceki</button>
      <span className="pd-pager-page">Sayfa 1 / {number(pages)}</span>
      <button type="button" tabIndex={-1} disabled>Sonraki</button>
    </div>}
  </article>;
}

/** Arama kutusu (lookup) önizlemesi: arama simgeli metin kutusu ve ilk üç seçenek. */
/** `compact`: tek satırlık süzgeçte ERP'deki gibi kapalı açılır kutu (seçili değer ya da ilk seçenek, sağda ⌄). */
export function LookupPreview({ placeholder, value, options, ready, compact = false }: {
  placeholder: string; value: string; options: { label: string; description: string }[]; ready: boolean; compact?: boolean;
}) {
  if (compact) return <span className="pd-lookup-select"><input tabIndex={-1} readOnly placeholder={placeholder || "Seçin"} value={value || options[0]?.label || ""}/><ChevronDown size={14} aria-hidden="true"/></span>;
  return <div className="pd-lookup">
    <span className="pd-lookup-box"><Search size={13} aria-hidden="true" /><input tabIndex={-1} readOnly placeholder={placeholder || "Ara…"} value={value}/></span>
    <ul className="pd-lookup-list" aria-hidden="true">
      {options.length === 0 ? <li className="pd-lookup-empty">{ready ? "Sonuç bulunamadı." : "Seçenekler için sorguyu önizleyin"}</li>
        : options.slice(0, 3).map((option, index) => <li key={index}><span>{option.label}</span>{option.description && <small>{option.description}</small>}</li>)}
    </ul>
  </div>;
}

// Düzen bileşenleri önizlemeleri: ERP LayoutComponents.tsx (FormCard / FilterChips / FacetPanel / ContextPanel) ile aynı yapı; etkileşimsizdir.

/** `inline`: tek satırlık süzgeç dizilimi (ERP FormCard `layout: "inline"` ile aynı; başlık ve sütun sayısı kullanılmaz). */
export function FormCardPreview({ title, columns, children, style, inline = false }: { title: string; columns: 1 | 2 | 3; children: ReactNode; style: CSSProperties; inline?: boolean }) {
  return <section className={`pd-layout-block pd-form-card${inline ? " is-inline" : ""}`} style={style}>
    {title && !inline && <h3>{title}</h3>}
    <div className={inline ? "pd-form-card-grid is-inline" : `pd-form-card-grid is-cols-${columns}`}>
      {Children.map(children, (child) => child == null || child === false ? null : <div className="pd-form-card-cell">{child}</div>)}
    </div>
  </section>;
}

export type FilterBarPreviewField = { key: string; label: string; kind: "text" | "range" | "date" | "select" | "toggle"; sample?: string };

/**
 * Süzgeç alanı (ERP'deki tek satır süzgeç dizilimiyle aynı): arama kutusu, satırdaki süzgeçler, "＋ Daha fazla süzgeç (n)".
 * Tablo yoksa soluk bir örnek satır gösterilir.
 */
export function FilterBarPreview({ search, row, moreCount, style, empty }: {
  search: string | null; row: FilterBarPreviewField[]; moreCount: number; style: CSSProperties; empty?: string;
}) {
  return <section className="pd-layout-block pd-form-card is-inline pd-filterbar-preview" style={style} aria-label="Süzgeç alanı">
    <div className="pd-form-card-grid is-inline">
      {search !== null && <div className="pd-form-card-cell is-search"><span className="pd-inline-search"><Search size={13} aria-hidden="true"/><input tabIndex={-1} readOnly placeholder={search || "Ara"}/></span></div>}
      {row.map((field) => <div key={field.key} className="pd-form-card-cell">
        {field.kind === "toggle" ? <span className="pd-inline-toggle">{field.label}</span>
          : field.kind === "select" ? <span className="pd-filterbar-field"><span>{field.label}</span><span className="pd-lookup-select"><input tabIndex={-1} readOnly value={field.sample || "Tümü"}/><ChevronDown size={14} aria-hidden="true"/></span></span>
            : field.kind === "range" || field.kind === "date" ? <span className="pd-filterbar-field"><span>{field.label}</span><span className="pd-filterbar-range"><i>{field.kind === "date" ? "başlangıç" : "en az"}</i><i>{field.kind === "date" ? "bitiş" : "en çok"}</i></span></span>
              : <span className="pd-filterbar-field"><span>{field.label}</span><input tabIndex={-1} readOnly placeholder="içerir"/></span>}
      </div>)}
      {moreCount > 0 && <div className="pd-form-card-cell"><span className="pd-filterbar-more">＋ Daha fazla süzgeç ({moreCount})</span></div>}
      {search === null && row.length === 0 && moreCount === 0 && <div className="pd-form-card-cell"><span className="pd-filterbar-empty">{empty || "Süzgeç alanı: tablo ve süzgeç seçin"}</span></div>}
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
    {groups.map((group) => <FacetGroupPreview key={group.id} group={group}/>)}
  </aside>;
}

/** Yan filtre panelinin bir grubu (bir seçim girişi); panel tasarım ekranında tek başına blok olarak da çizilir. */
export function FacetGroupPreview({ group }: { group: FacetPreviewGroup }) {
  return <div className="pd-facet-group" role="group" aria-label={group.label}>
    <div className="pd-facet-label">{group.label}</div>
    {!group.ready ? <p className="pd-facet-state">Seçenekler için sorguyu önizleyin</p> : <>
      <div className="pd-facet-option is-selected"><span>Tümü</span></div>
      {group.options.slice(0, FACET_OPTION_LIMIT).map((option, index) => <div className="pd-facet-option" key={index}>
        <span>{option.label}</span>
        {option.count !== undefined && <span className="pd-facet-count">{option.count.toLocaleString("tr-TR")}</span>}
      </div>)}
    </>}
  </div>;
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

/**
 * ERP PageTabs önizlemesi: varsayılan sekme açık başlar, sekme başlığına tıklayınca o sekme gösterilir (yalnız tuvalde).
 * Sekmenin bileşenleri sahibin içinde çizilir; tıklanan bileşen müfettişte seçilir.
 */
export function TabsPreview({ tabs, defaultTab, renderOwned, spanFor, onSelect, style }: {
  tabs: { label: string; ids: string[] }[]; defaultTab: number; renderOwned: (id: string) => ReactNode; spanFor: (id: string) => number;
  onSelect: (id: string) => void; style: CSSProperties;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const fallback = Number.isInteger(defaultTab) && defaultTab >= 0 && defaultTab < tabs.length ? defaultTab : 0;
  const active = picked !== null && picked < tabs.length ? picked : fallback;
  if (tabs.length === 0) return <section className="pd-layout-block pd-tabs-preview" style={style}><p className="pd-tabs-empty">Sekme ekleyin</p></section>;
  return <section className="pd-layout-block pd-tabs-preview" style={style}>
    <div className="pd-tabs-preview-list" role="tablist" aria-label="Sekmeler">
      {tabs.map((tab, index) => <button type="button" role="tab" key={index} tabIndex={-1} aria-selected={index === active}
        className={index === active ? "is-active" : undefined} onClick={(event) => { event.stopPropagation(); setPicked(index); }}>{tab.label}</button>)}
    </div>
    <div className="pd-tabs-preview-panel" role="tabpanel">
      {tabs[active].ids.length === 0 ? <p className="pd-tabs-empty">Bu sekme boş.</p>
        : tabs[active].ids.map((id) => <div key={id} className="pd-tabs-preview-item" style={{ gridColumn: `span ${spanFor(id)}` }}
          title="Düzenlemek için tıklayın" onClick={(event) => { event.stopPropagation(); onSelect(id); }}>{renderOwned(id)}</div>)}
    </div>
  </section>;
}

type DragHit = { target: Element | null; x: number; y: number };

/**
 * Sayfadaki Sekmeler bileşeninin tuvaldeki düzenlenebilir kabı (taslak 08). Açık sekmenin gövdesi sayfa gibi 12 sütunlu
 * bir bırakma alanıdır: paletten ya da tuvalden sürüklenen bileşen yer tutucunun gösterdiği yere bırakılır, diğer bloklar
 * canlı olarak kayar. Sekme başlığının üzerine gelince o sekme açılır; başlığa bırakmak bileşeni o sekmenin sonuna alır.
 * Sekme adı çift tıklanarak değiştirilir; "+ Sekme" yeni sekme ekler. Kayıt biçimi değişmez (üst bileşen yazar).
 */
export function TabsCanvas({ tabs, active, canEdit, resizable, selectedId, draggingId, dropSpan, acceptsTab, renderChild, spanFor, labelFor, conditional,
  toolbarFor, onActivate, onSelect, onClaimDrag, onDrop, onItemDragStart, onDragEnd, onRename, onAddTab, onResizeStart, canAddTab, style }: {
  tabs: { label: string; ids: string[] }[]; active: number; canEdit: boolean; resizable: boolean; selectedId: string | null; draggingId: string | null;
  dropSpan: number; acceptsTab: (tabIndex: number) => boolean; renderChild: (id: string) => ReactNode; spanFor: (id: string) => number;
  labelFor: (id: string) => string; conditional: (id: string) => boolean; toolbarFor: (id: string) => ReactNode;
  onActivate: (index: number) => void; onSelect: (id: string) => void; onClaimDrag: () => void; onDrop: (tabIndex: number, position: number, event: DragEvent) => void;
  onItemDragStart: (id: string, event: DragEvent<HTMLElement>) => void; onDragEnd: () => void; onRename: (index: number, label: string) => void;
  onAddTab: () => void; onResizeStart: (id: string, event: ReactPointerEvent<HTMLSpanElement>) => void; canAddTab: boolean; style: CSSProperties;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const pending = useRef<DragHit | null>(null);
  const frame = useRef(0);
  const current = active >= 0 && active < tabs.length ? active : 0;
  const ids = tabs[current]?.ids ?? [];
  const accepting = !!draggingId && canEdit && tabs.length > 0 && acceptsTab(current);
  // Sürükleme bitince bekleyen konum hesabı da iptal edilir (sonraki sürüklemede hayalet yer tutucu kalmasın).
  useEffect(() => {
    if (draggingId) return;
    cancelAnimationFrame(frame.current); frame.current = 0; pending.current = null;
    setHover(null);
  }, [draggingId]);
  useEffect(() => { setHover(null); }, [current]);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  // Sürüklenen bileşen zaten bu sekmede ve yerinden oynamıyorsa yer tutucu gösterilmez (soluk kopyası yerini belirtir).
  const own = draggingId ? ids.indexOf(draggingId) : -1;
  const placeholderAt = accepting && hover !== null && !(own >= 0 && (hover === own || hover === own + 1)) ? Math.min(hover, ids.length) : null;
  useFlip(panelRef, `${current}|${ids.join(",")}|${placeholderAt ?? "-"}`);

  // Sürükleme sırasında konum hesabı kare başına bir kez yapılır (dragover saniyede onlarca kez gelir).
  const hitTest = () => {
    frame.current = 0;
    const hit = pending.current;
    pending.current = null;
    const panel = panelRef.current;
    if (!hit || !panel || !draggingId) return;
    const item = hit.target instanceof Element ? hit.target.closest<HTMLElement>("[data-tab-pos], [data-tab-placeholder]") : null;
    if (item && item.closest(".pd-tabs-canvas-panel") === panel) {
      if (item.dataset.tabPlaceholder !== undefined) return; // yer tutucunun üstünde: konum korunur
      const index = Number(item.dataset.tabPos);
      const rect = item.getBoundingClientRect();
      const horizontal = spanFor(ids[index]) < 12;
      const before = horizontal ? hit.x < rect.left + rect.width / 2 : hit.y < rect.top + rect.height / 2;
      setHover(before ? index : index + 1);
    } else setHover((value) => value ?? ids.length);
  };
  const dragOverPanel = (event: DragEvent<HTMLDivElement>) => {
    if (!accepting) return; // kabul edilmeyen sürükleme sayfaya (Sekmeler bloğunun kendisine) kalır
    event.preventDefault(); event.stopPropagation();
    onClaimDrag();
    event.dataTransfer.dropEffect = draggingId && ids.includes(draggingId) ? "move" : event.dataTransfer.effectAllowed === "copy" ? "copy" : "move";
    pending.current = { target: event.target as Element | null, x: event.clientX, y: event.clientY };
    if (!frame.current) frame.current = requestAnimationFrame(hitTest);
  };
  const dropPanel = (event: DragEvent<HTMLDivElement>) => {
    if (!accepting) return;
    event.preventDefault(); event.stopPropagation();
    const position = hover ?? ids.length;
    setHover(null);
    onDrop(current, position, event);
  };
  const leavePanel = (event: DragEvent<HTMLDivElement>) => {
    // relatedTarget sürüklemede bazı tarayıcılarda boş gelir; imlecin kabın dışına çıkıp çıkmadığına bakılır.
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.clientX <= rect.left || event.clientX >= rect.right || event.clientY <= rect.top || event.clientY >= rect.bottom) {
      cancelAnimationFrame(frame.current); frame.current = 0; pending.current = null;
      setHover(null);
    }
  };
  const commitRename = (index: number, value: string) => { setEditing(null); onRename(index, value); };
  const placeholder = (tabLabel: string) => <div key="__placeholder" data-flip="__placeholder" data-tab-placeholder="" className="pd-drop-placeholder"
    style={{ gridColumn: `span ${dropSpan}` }} onDragOver={(event) => { if (accepting) { event.preventDefault(); event.stopPropagation(); } }}>Buraya bırakın · {tabLabel} sekmesi</div>;

  return <section className="pd-layout-block pd-tabs-preview pd-tabs-canvas" style={style}>
    <div className="pd-tabs-preview-list" role="tablist" aria-label="Sekmeler">
      {tabs.map((tab, index) => editing === index
        ? <input key={index} className="pd-tab-rename" autoFocus defaultValue={tab.label} maxLength={40} aria-label="Sekme adı" draggable={false}
          onClick={(event) => event.stopPropagation()} onDragStart={(event) => { event.preventDefault(); event.stopPropagation(); }}
          onKeyDown={(event) => { event.stopPropagation(); if (event.key === "Enter") commitRename(index, event.currentTarget.value); else if (event.key === "Escape") setEditing(null); }}
          onBlur={(event) => commitRename(index, event.target.value)}/>
        : <button type="button" role="tab" key={index} aria-selected={index === current} className={index === current ? "is-active" : undefined}
          title={canEdit ? "Sekme adına çift tıklayarak değiştirin" : undefined}
          onClick={(event) => { event.stopPropagation(); onActivate(index); }}
          onDoubleClick={(event) => { event.stopPropagation(); if (canEdit) setEditing(index); }}
          onDragOver={(event) => {
            if (!draggingId || !canEdit || !acceptsTab(index)) return;
            event.preventDefault(); event.stopPropagation();
            onClaimDrag();
            if (index !== current) onActivate(index);
          }}
          onDrop={(event) => {
            if (!draggingId || !canEdit || !acceptsTab(index)) return;
            event.preventDefault(); event.stopPropagation();
            onDrop(index, Number.MAX_SAFE_INTEGER, event);
          }}>{tab.label}</button>)}
      {canEdit && <button type="button" className="pd-tab-add" disabled={!canAddTab} title={canAddTab ? undefined : "En fazla 8 sekme olabilir."}
        onClick={(event) => { event.stopPropagation(); onAddTab(); }}>+ Sekme</button>}
      {canEdit && <span className="pd-tab-rename-hint">Sekme adına çift tıklayarak değiştirin</span>}
    </div>
    {tabs.length === 0 ? <p className="pd-tabs-empty">Sekme ekleyin</p>
      : <div ref={panelRef} className={`pd-tabs-canvas-panel${accepting ? " is-accepting" : ""}`} role="tabpanel" onDragOver={dragOverPanel} onDrop={dropPanel} onDragLeave={leavePanel}>
        {ids.length === 0 && placeholderAt === null && <p className="pd-tabs-empty is-drop">Bu sekme boş. Soldan bir bileşeni buraya sürükleyin.</p>}
        {ids.flatMap((id, index) => {
          const selected = selectedId === id;
          const block = <div key={id} data-flip={id} data-tab-pos={index}
            className={`pd-block pd-tab-block${selected ? " is-selected" : ""}${draggingId === id ? " is-dragging" : ""}`}
            style={{ gridColumn: `span ${spanFor(id)}` }} draggable={canEdit}
            onClick={(event) => { event.stopPropagation(); onSelect(id); }}
            onDragStart={(event) => { event.stopPropagation(); onItemDragStart(id, event); }}
            onDragEnd={(event) => { event.stopPropagation(); onDragEnd(); }}>
            <span className="pd-block-label">{labelFor(id)}</span>
            {conditional(id) && <span className="pd-cond-chip">Koşullu</span>}
            {selected && canEdit && <div className="pd-block-toolbar" onClick={(event) => event.stopPropagation()}>{toolbarFor(id)}</div>}
            <div className="pd-block-render">{renderChild(id)}</div>
            {selected && canEdit && resizable && <span className="pd-resize" role="presentation" draggable={false} title="Genişliği sürükleyerek değiştirin"
              onDragStart={(event) => { event.preventDefault(); event.stopPropagation(); }} onPointerDown={(event) => onResizeStart(id, event)} onClick={(event) => event.stopPropagation()}/>}
          </div>;
          return placeholderAt === index ? [placeholder(tabs[current].label), block] : [block];
        })}
        {placeholderAt !== null && placeholderAt >= ids.length && placeholder(tabs[current].label)}
      </div>}
  </section>;
}

type ActionBarBound ={ new: boolean; open?: boolean; save: boolean; remove: boolean; filter: boolean; print: boolean; excel: boolean };

// Yalnız simge kipinde (`content=icon`) düğmede metin yerine çizilen işaretler.
const BAR_GLYPHS: Record<string, string> = { new: "+", open: "↗", save: "✓", delete: "✕", refresh: "↻", filter: "▽", print: "⎙", export: "⇩", more: "⋯" };
// Önizlemenin `look` öznitelikleri: varsayılana eşit değer hiç yazılmaz, böylece varsayılan çubuk bugünkü gibi çizilir.
const BAR_LOOK_ATTRS = ["align", "density", "size", "style", "content", "separators", "border", "radius"] as const;
const BAR_LOOK_DEFAULT: Record<string, string> = { align: "start", density: "normal", size: "md", style: "outline", content: "both", separators: "true", border: "bottom", radius: "soft" };

/** ERP'deki İşlem Çubuğu: sıra ve kısayollar sabittir; bağlanmamış komutlar soluk. Yenile her zaman etkindir; Aç özel sayfalarda kullanılmaz (hep soluk). */
/** `title`: ERP'deki gibi işlem çubuğunun üstündeki başlık satırı (sayfa adı ve `titleCount` varsa "N kayıt"). */
/**
 * `hidden`: `hiddenCommands` (gizli düğme çizilmez; boşalan grubun ayırıcısı düşer). `look`: `barLook` sözlüğü (barLook.ts barLookMap);
 * `unbound=hide` bağlanmamış düğmeleri, `title=false` başlık satırını gizler.
 */
export function ActionBarPreview({ bound, moreCount, style, title, count, hidden, look }: {
  bound: ActionBarBound; moreCount: number; style: CSSProperties; title?: string; count?: string | null; hidden?: string[]; look?: Record<string, string>;
}) {
  const lookOf = (key: string, fallback: string) => look?.[key] ?? fallback;
  const hideUnbound = lookOf("unbound", "dim") === "hide";
  const hints = lookOf("hints", "true") !== "false";
  const content = lookOf("content", "both");
  const shown = (id: string, on: boolean) => !hidden?.includes(id) && (on || !hideUnbound);
  // Birincil düğme: bağlıysa Kaydet, değilse bağlıysa Yeni, yoksa hiçbiri; soluk ya da gizli düğme asla birincil çizilmez.
  const primary = bound.save && shown("save", true) ? "save" : bound.new && shown("new", true) ? "new" : "";
  const face = (id: string, label: string) => content === "icon" ? <span aria-label={label}>{BAR_GLYPHS[id]}</span>
    : content === "text" ? label : <>{id === "new" ? "+ " : ""}{label}</>;
  const button = (id: string, label: string, key: string, on: boolean) =>
    // ERP'deki gibi kısayol düğmede rozet değil, üstüne gelince ipucudur: "Kaydet · Ctrl+S" / "Bu sayfada bağlanmadı · Ctrl+S".
    <span key={id} className={`pd-bar-btn${on && primary === id ? " is-primary" : ""}${on ? "" : " is-off"}`} title={`${on ? label : "Bu sayfada bağlanmadı"}${hints ? ` · ${key}` : ""}`} data-shortcut={key}>{face(id, label)}</span>;
  const groups: [string, string, string, boolean][][] = [
    [["new", "Yeni", "F2", bound.new], ["open", "Aç", "Enter", bound.open === true], ["save", "Kaydet", "Ctrl+S", bound.save], ["delete", "Sil", "Ctrl+Del", bound.remove]],
    [["refresh", "Yenile", "F5", true], ["filter", "Filtre", "Ctrl+F", bound.filter]],
    [["print", "Yazdır", "Ctrl+P", bound.print], ["export", "Excel", "Ctrl+E", bound.excel]],
  ];
  const visible = groups.map((group) => group.filter(([id, , , on]) => shown(id, on))).filter((group) => group.length > 0);
  const showMore = shown("more", moreCount > 0);
  const active = [bound.new && shown("new", true) && "Yeni", bound.save && shown("save", true) && "Kaydet", bound.remove && shown("delete", true) && "Sil", shown("refresh", true) && "Yenile",
    bound.filter && shown("filter", true) && "Filtre", bound.print && shown("print", true) && "Yazdır", bound.excel && shown("export", true) && "Excel", moreCount > 0 && showMore && "İşlemler"].filter(Boolean).join(", ");
  const attrs: Record<string, string> = {};
  for (const key of BAR_LOOK_ATTRS) if (look?.[key] && look[key] !== BAR_LOOK_DEFAULT[key]) attrs[`data-${key}`] = look[key];
  const colors: Record<string, string> = {};
  if (look?.accent) colors["--pd-bar-accent"] = look.accent;
  if (look?.background) colors["--pd-bar-bg"] = look.background;
  return <div className="pd-actionbar-wrap" style={{ ...style, ...colors }} {...attrs}>
    {title && lookOf("title", "true") !== "false" && <div className="pd-page-title"><h1>{title}</h1>{count != null && <span className="pd-page-title-count">{count} kayıt</span>}</div>}
    <div className="pd-actionbar" role="img" aria-label={`İşlem Çubuğu önizlemesi: ${active} bağlı`}>
      {visible.map((group, index) => [index > 0 && <span key={`sep${index}`} className="pd-bar-sep" />, ...group.map(([id, label, key, on]) => button(id, label, key, on))])}
      <span className="pd-bar-grow" />
      {showMore && <span className={`pd-bar-btn is-more${moreCount > 0 ? "" : " is-off"}`} title={`${moreCount > 0 ? "İşlemler" : "Bu sayfada bağlanmadı"}${hints ? " · Alt+İ" : ""}`} data-shortcut="Alt+İ">
        {content === "icon" ? <span aria-label="İşlemler">{BAR_GLYPHS.more}</span> : <>İşlemler{moreCount > 0 ? ` (${moreCount})` : ""} ▾</>}</span>}
    </div>
  </div>;
}

// Faz B önizlemeleri: ERP EditableGrid / CustomFieldsBlock / PageImage / PageDialog görünümünün etkileşimsiz karşılıkları.

/** Seçim hücresi ERP'deki gibi kapalı açılır kutudur: ilk satır ilk örnek seçeneği, ikinci satır ikinci örneği (yoksa boş) gösterir. */
const sampleCell = (column: GridColumn, row: number, picks: string[] = []): ReactNode => column.inputType === "lookup"
  ? (column.rules.readOnly ? (picks[row] ?? "").split(" · ")[0] : <LookupPreview placeholder="Seçin" value={picks[row] ?? ""} options={[]} ready compact/>)
  // Hesaplanan sütun önizleme sorgusundan gelir; tasarımda sonuç yoktur ("—").
  : column.inputType === "calc" ? <span className="pd-query-muted" title={column.calc ? `${column.calc.query} · ${column.calc.field}` : undefined}>—</span>
  : column.inputType === "checkbox" ? (row === 0 ? "✓" : "")
  : column.inputType === "number" ? String(row + 1) : column.inputType === "date" ? formatCell(`2026-01-0${row + 1}`, "date") : row === 0 ? "Örnek" : "Yeni değer";
const MATRIX_SAMPLE = [{ name: "Renk", values: "Kırmızı, Mavi" }, { name: "Beden", values: "S, M" }];
/** Örnek boyutlardan oluşacak varyant sayısı (değer sayılarının çarpımı). */
const variantCount = (rows: { values: string }[]) => rows.reduce((total, row) => total * row.values.split(",").filter((item) => item.trim() !== "").length, 1);

/** Düzenlenebilir tablo: başlık satırı ve iki örnek satır; stage kipinde ikinci satır "Yeni", matrix kipinde varyant sayısı. */
export function EditableGridPreview({ title, mode, columns, fixedRowLabel, addLabel, style, pickerSamples = {}, totals = [] }: {
  title: string; mode: "stage" | "list" | "matrix"; columns: GridColumn[]; fixedRowLabel: string; addLabel: string; style: CSSProperties;
  /** Alt toplam sütunları (`totals`): tasarımda tablo boştur, toplam satırı yer tutucu gösterir. */
  totals?: string[];
  /** Seçim sütunlarının örnek seçenekleri (sabit seçenekler ve sorgu önizlemesi, "etiket · açıklama"), sütun koduna göre. */
  pickerSamples?: Record<string, string[]>;
}) {
  const matrix = mode === "matrix";
  const headers = matrix ? ["Özellik adı", "Değerler"] : columns.map((column) => column.label);
  const colCount = Math.max(1, headers.length) + 1;
  return <article className="custom-page-preview-card" style={style}>
    <div className="custom-page-preview-card-head"><b>{title || "Satırlar"}</b><small>{matrix ? "Varyant matrisi" : mode === "stage" ? "Kayda kadar beklet" : "Liste"}</small></div>
    <div className="custom-page-preview-grid-scroll"><table className="custom-page-preview-grid">
      <thead><tr>{headers.length === 0 ? <th>Sütun ekleyin</th> : headers.map((header, index) => <th key={index}>{header}</th>)}<th scope="col" aria-label="Satır işlemleri" /></tr></thead>
      <tbody>
        {!matrix && fixedRowLabel && <tr><td colSpan={colCount}>{fixedRowLabel}</td></tr>}
        {matrix ? MATRIX_SAMPLE.map((row) => <tr key={row.name}><td>{row.name}</td><td>{row.values}</td><td /></tr>)
          : [0, 1].map((row) => <tr key={row}>
            {columns.length === 0 ? <td>—</td> : columns.map((column) => <td key={column.code}>{sampleCell(column, row, pickerSamples[column.code])}</td>)}
            <td>{mode === "stage" && row === 1 ? <span className="pd-tag tone-info">Yeni</span> : null}</td>
          </tr>)}
      </tbody>
      {!matrix && totals.length > 0 && <tfoot><tr>{columns.map((column, index) => <td key={column.code}>{totals.includes(column.code) ? <b>Σ</b> : index === 0 ? <b>Toplam</b> : null}</td>)}<td /></tr></tfoot>}
    </table></div>
    <div className="custom-page-preview-card-head">
      <span className="custom-page-preview-row-action">+ {addLabel || "Satır ekle"}</span>
      {matrix && <small>{variantCount(MATRIX_SAMPLE)} varyant oluşturulacak</small>}
    </div>
  </article>;
}

const CUSTOM_FIELD_SAMPLES = [{ label: "Renk", dataType: "Text" }, { label: "Ağırlık", dataType: "Decimal" }, { label: "Garanti bitişi", dataType: "Date" }];

/** Özel alanlar bloğu: tanım sorgusunun önizleme satırları (yoksa üç örnek alan), türe göre giriş. */
export function CustomFieldsPreview({ title, columns, definitions, style }: {
  title: string; columns: 1 | 2 | 3; definitions: Record<string, unknown>[] | null; style: CSSProperties;
}) {
  const rows = definitions && definitions.length > 0
    ? definitions.filter((row) => row.isActive !== false).slice(0, 40).map((row) => ({ label: String(row.label ?? row.code ?? "Alan"), dataType: String(row.dataType ?? "Text") }))
    : CUSTOM_FIELD_SAMPLES;
  const control = (dataType: string) => dataType === "Boolean" ? <input type="checkbox" tabIndex={-1} readOnly/>
    : <input tabIndex={-1} readOnly type={dataType === "Date" ? "date" : dataType === "Decimal" ? "number" : "text"}/>;
  return <section className="pd-layout-block pd-form-card" style={style}>
    {title && <h3>{title}</h3>}
    {definitions && definitions.length === 0 ? <p className="pd-tabs-empty">Tanımlı özel alan yok.</p>
      : <div className={`pd-form-card-grid is-cols-${columns}`}>
        {rows.map((row, index) => <div className="pd-form-card-cell" key={index}>
          <div className={`pd-binding-preview-input is-${row.dataType === "Boolean" ? "checkbox" : "text"}`}><label><span>{row.label}</span>{control(row.dataType)}</label></div>
        </div>)}
      </div>}
  </section>;
}

/** Görsel: tuvalde resim yüklenmez; yer tutucu kutu, "Görsel" ve bağlı metin gösterilir. */
export function ImagePreview({ title, value, height, style }: { title: string; value: string; height: number; style: CSSProperties }) {
  return <figure className="pd-layout-block" aria-label={title || "Görsel"}
    style={{ ...style, margin: 0, height, display: "grid", placeItems: "center", alignContent: "center", gap: 4, textAlign: "center" }}>
    <ImageIcon size={22} aria-hidden="true"/>
    <b>Görsel</b>
    {value && <small style={{ overflowWrap: "anywhere" }}>{value}</small>}
  </figure>;
}

/**
 * Pencere: tuvalde kapalı bir kart ("Pencere: <başlık> · <n> bileşen"); tıklanınca içerdiği bileşenler yerinde açılır.
 * Tıklanan bileşen müfettişte seçilir (Sekmeler önizlemesindeki gibi). `saveLabel` null ise pencerede yalnız "Kapat" vardır.
 */
export function DialogPreview({ title, presentation, ids, saveLabel, renderOwned, spanFor, onSelect, onDesign, style }: {
  title: string; presentation: "dialog" | "drawer"; ids: string[]; saveLabel: string | null; renderOwned: (id: string) => ReactNode; spanFor: (id: string) => number;
  onSelect: (id: string) => void; style: CSSProperties;
  /** "İçini tasarla": pencerenin tasarım ekranını açar. */
  onDesign?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const kind = presentation === "drawer" ? "Çekmece" : "Pencere";
  return <section className="pd-layout-block pd-dialog-preview" style={style}>
    <div className="pd-dialog-head" onDoubleClick={(event) => { if ((event.target as Element).closest("button")) event.stopPropagation(); }}>
      <span className="pd-dialog-icon" aria-hidden="true">{presentation === "drawer" ? "▥" : "▢"}</span>
      <span className="pd-dialog-title"><b>{title || "Başlıksız"}</b><small>{kind} · {ids.length} bileşen · ERP'de düğmeyle açılır</small></span>
      <button type="button" tabIndex={-1} aria-expanded={open} className="pd-dialog-toggle"
        onClick={(event) => { event.stopPropagation(); setOpen((current) => !current); }}>{open ? "İçini gizle ▴" : "İçini göster ▾"}</button>
      {onDesign && <button type="button" tabIndex={-1} className="pd-dialog-toggle pd-dialog-design" title="Pencerenin içini tasarla (çift tıklama)"
        onClick={(event) => { event.stopPropagation(); onDesign(); }}>✎ İçini tasarla</button>}
    </div>
    {open && <>
      <div className="pd-tabs-preview-panel">
        {ids.length === 0 ? <p className="pd-tabs-empty">Pencereye bileşen seçin</p>
          : ids.map((id) => <div key={id} className="pd-tabs-preview-item" style={{ gridColumn: `span ${spanFor(id)}` }}
            title="Düzenlemek için tıklayın" onClick={(event) => { event.stopPropagation(); onSelect(id); }}>{renderOwned(id)}</div>)}
      </div>
      <div className="custom-page-preview-card-head">
        <span className="custom-page-preview-row-action">{saveLabel === null ? "Kapat" : "Vazgeç"}</span>
        {saveLabel !== null && <span className="custom-page-preview-row-action">{saveLabel || "Kaydet"}</span>}
      </div>
    </>}
  </section>;
}

const ALERT_STRIP_ICONS: Record<string, LucideIcon> = { shield: ShieldCheck, shieldAlert: ShieldAlert, check: CheckCircle2, alert: AlertTriangle, info: Info };

/** Bildirim kutusu: ERP ile aynı. `icon` verilmişse durum şeridi (beyaz kart, tonlu simge kutusu, sağda `value` rozeti). */
export function AlertPreview({ variant, title, text, icon, value, style }: { variant: string; title: string; text: string; icon: string; value: string; style: CSSProperties }) {
  const StripIcon = ALERT_STRIP_ICONS[icon];
  if (!StripIcon) return <article className={`custom-page-preview-alert tone-${variant}`} style={style}><b>{title || "Bilgilendirme"}</b><p>{text}</p></article>;
  return <aside className={`pd-status-strip tone-${variant}`} style={style}>
    <span className="pd-status-strip-mark" aria-hidden="true"><StripIcon size={17}/></span>
    <span className="pd-status-strip-text"><b>{title || "Bilgilendirme"}</b>{text && <small>{text}</small>}</span>
    {value && <span className="pd-status-strip-badge">{value}</span>}
  </aside>;
}

/** Adımlar (ERP StepsIndicator görünümü): etkin adımdan öncekiler tamam (✓, yeşil), etkin adım vurgulu, sonrakiler soluk. */
export function StepsPreview({ labels, active, style }: { labels: string[]; active: number; style: CSSProperties }) {
  const shown = labels.length > 0 ? labels : ["Adım 1", "Adım 2"];
  return <ol className="pd-steps" aria-label="Adımlar" style={style}>
    {shown.map((label, index) => {
      const state = index < active ? "is-done" : index === active ? "is-active" : "is-next";
      return <li key={index} className={`pd-step ${state}`} aria-current={index === active ? "step" : undefined}>
        {index > 0 && <span className="pd-step-sep" aria-hidden="true"/>}
        <i aria-hidden="true">{index < active ? "✓" : index + 1}</i><span>{label || `Adım ${index + 1}`}</span>
      </li>;
    })}
  </ol>;
}

/** Kayıt özeti (ERP RecordHeader görünümü): simge karesi, kalın başlık ve soluk alt başlık, anahtar/değer çiftleri, sağda düğmeler. */
export function RecordHeaderPreview({ icon, title, subtitle, fields, buttons, style }: {
  icon?: unknown; title: string; subtitle: string; fields: { label: string; text: string }[]; buttons: ReactNode[]; style: CSSProperties;
}) {
  const Icon = typeof icon === "string" && Object.hasOwn(ICONS, icon) ? ICONS[icon] : undefined;
  return <section className="pd-record-header" style={style}>
    {Icon && <span className="pd-record-header-icon" aria-hidden="true"><Icon size={17}/></span>}
    <span className="pd-record-header-title"><b>{title || "—"}</b>{subtitle && <small>{subtitle}</small>}</span>
    {fields.length > 0 && <dl className="pd-record-header-fields">{fields.map((field, index) => <div key={index}><dt>{field.label}</dt><dd>{field.text || "—"}</dd></div>)}</dl>}
    {buttons.length > 0 && <span className="pd-record-header-actions">{buttons}</span>}
  </section>;
}
