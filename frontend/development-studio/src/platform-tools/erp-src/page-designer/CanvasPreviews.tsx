import { Children, useState, type CSSProperties, type ReactNode } from "react";
import { AlertTriangle, BarChart3, Box, CheckCircle2, Clock, ImageIcon, Receipt, Search, Users, Wallet, type LucideIcon } from "lucide-react";
import { columnTotal, formatCell, isRightAligned, parseColumnFormats, parseToneMap, sparklinePath, toneFor, trendPoints, type Tone } from "./cellFormat";
import type { GridColumn } from "./gridColumns";

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
/** Sunucu sayfalı listenin tuval altbilgisi (ERP PagedTableFooter görünümü; düğmeler tuvalde kapalıdır). */
export type GridPaging = { pageSize: number; total: number; meta: { label: string; value: string }[]; search?: ReactNode };

export function GridPreview({ title, subtitle, columns, rows, truncated, props, emptyText, rowAction, rowActionLabels, showTotals, paging, style }: {
  title: string; subtitle: string; columns: PreviewColumn[]; rows: Record<string, unknown>[]; truncated: boolean;
  props: Record<string, unknown>; emptyText: string; rowAction?: string;
  /** Satır işlemi düğmelerinin (rowActions) etiketleri: "İşlemler" sütununda satır başına çip olarak çizilir. */
  rowActionLabels?: string[];
  showTotals?: boolean; paging?: GridPaging; style: CSSProperties;
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
  const colCount = columns.length + (hasActions ? 1 : 0);
  return <article className="custom-page-preview-card" style={style}>
    <div className="custom-page-preview-card-head"><b>{title}</b><small>{subtitle}</small></div>
    {paging?.search && <div className="pd-grid-search">{paging.search}</div>}
    <div className="custom-page-preview-grid-scroll"><table className={`custom-page-preview-grid${comfort ? " is-comfort" : ""}`}>
      <thead><tr>{columns.map((column) => <th key={column.code} className={isRightAligned(formats[column.code], column.dataType) ? "num" : undefined}>{column.label || column.code}</th>)}{hasActions &&<th scope="col">İşlemler</th>}</tr></thead>
      <tbody>{rows.length === 0 ? <tr><td colSpan={Math.max(1, colCount)}>{emptyText}</td></tr>
        : rows.map((row, rowIndex) => <tr key={String(row.id ?? rowIndex)}>{columns.map((column) => <td key={column.code} className={cellClass(column)}>{cell(column, row)}</td>)}{hasActions &&<td>{actionChips.map((label, index) => <span key={index} className="custom-page-preview-row-action" style={index > 0 ? { marginLeft: 4 } : undefined}>{label}</span>)}</td>}</tr>)}</tbody>
      {hasTotals && <tfoot><tr className="pd-total">
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
export function LookupPreview({ placeholder, value, options, ready }: {
  placeholder: string; value: string; options: { label: string; description: string }[]; ready: boolean;
}) {
  return <div className="pd-lookup">
    <span className="pd-lookup-box"><Search size={13} aria-hidden="true" /><input tabIndex={-1} readOnly placeholder={placeholder || "Ara…"} value={value}/></span>
    <ul className="pd-lookup-list" aria-hidden="true">
      {options.length === 0 ? <li className="pd-lookup-empty">{ready ? "Sonuç bulunamadı." : "Seçenekler için sorguyu önizleyin"}</li>
        : options.slice(0, 3).map((option, index) => <li key={index}><span>{option.label}</span>{option.description && <small>{option.description}</small>}</li>)}
    </ul>
  </div>;
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
      {tabs[active].ids.length === 0 ? <p className="pd-tabs-empty">Bu sekmeye bileşen seçin</p>
        : tabs[active].ids.map((id) => <div key={id} className="pd-tabs-preview-item" style={{ gridColumn: `span ${spanFor(id)}` }}
          title="Düzenlemek için tıklayın" onClick={(event) => { event.stopPropagation(); onSelect(id); }}>{renderOwned(id)}</div>)}
    </div>
  </section>;
}

type ActionBarBound ={ new: boolean; save: boolean; remove: boolean; filter: boolean; print: boolean; excel: boolean };

/** ERP'deki İşlem Çubuğu: sıra ve kısayollar sabittir; bağlanmamış komutlar soluk. Yenile her zaman etkindir; Aç özel sayfalarda kullanılmaz (hep soluk). */
export function ActionBarPreview({ bound, moreCount, style }: { bound: ActionBarBound; moreCount: number; style: CSSProperties }) {
  // Birincil düğme: bağlıysa Kaydet, değilse bağlıysa Yeni, yoksa hiçbiri; soluk düğme asla birincil çizilmez.
  const primary = bound.save ? "save" : bound.new ? "new" : "";
  const button = (id: string, label: string, key: string, on: boolean) =>
    <span className={`pd-bar-btn${on && primary === id ? " is-primary" : ""}${on ? "" : " is-off"}`} title={on ? undefined : "Bu sayfada bağlanmadı"}>{id === "new" ? "+ " : ""}{label}<span className="pd-bar-key">{key}</span></span>;
  const active = [bound.new && "Yeni", bound.save && "Kaydet", bound.remove && "Sil", "Yenile", bound.filter && "Filtre", bound.print && "Yazdır", bound.excel && "Excel", moreCount > 0 && "İşlemler"].filter(Boolean).join(", ");
  return <div className="pd-actionbar-wrap" style={style}>
    <div className="pd-actionbar" role="img" aria-label={`İşlem Çubuğu önizlemesi: ${active} bağlı`}>
      {button("new", "Yeni", "F2", bound.new)}{button("open", "Aç", "Enter", false)}{button("save", "Kaydet", "Ctrl+S", bound.save)}{button("remove", "Sil", "Ctrl+Del", bound.remove)}
      <span className="pd-bar-sep" />
      {button("refresh", "Yenile", "F5", true)}{button("filter", "Filtre", "Ctrl+F", bound.filter)}
      <span className="pd-bar-sep" />
      {button("print", "Yazdır", "Ctrl+P", bound.print)}{button("excel", "Excel", "Ctrl+E", bound.excel)}
      <span className="pd-bar-grow" />
      <span className={`pd-bar-btn is-more${moreCount > 0 ? "" : " is-off"}`} title={moreCount > 0 ? undefined : "Bu sayfada bağlanmadı"}>İşlemler{moreCount > 0 ? ` (${moreCount})` : ""} ▾<span className="pd-bar-key">Alt+İ</span></span>
    </div>
    <p className="pd-actionbar-note">Bu çubuk ERP'de sayfanın üstündeki İşlem Çubuğu'nda görünür.</p>
  </div>;
}

// Faz B önizlemeleri: ERP EditableGrid / CustomFieldsBlock / PageImage / PageDialog görünümünün etkileşimsiz karşılıkları.

const sampleCell = (column: GridColumn, row: number): ReactNode => column.inputType === "checkbox" ? (row === 0 ? "✓" : "")
  : column.inputType === "number" ? String(row + 1) : column.inputType === "date" ? formatCell(`2026-01-0${row + 1}`, "date") : row === 0 ? "Örnek" : "Yeni değer";
const MATRIX_SAMPLE = [{ name: "Renk", values: "Kırmızı, Mavi" }, { name: "Beden", values: "S, M" }];
/** Örnek boyutlardan oluşacak varyant sayısı (değer sayılarının çarpımı). */
const variantCount = (rows: { values: string }[]) => rows.reduce((total, row) => total * row.values.split(",").filter((item) => item.trim() !== "").length, 1);

/** Düzenlenebilir tablo: başlık satırı ve iki örnek satır; stage kipinde ikinci satır "Yeni", matrix kipinde varyant sayısı. */
export function EditableGridPreview({ title, mode, columns, fixedRowLabel, addLabel, style }: {
  title: string; mode: "stage" | "list" | "matrix"; columns: GridColumn[]; fixedRowLabel: string; addLabel: string; style: CSSProperties;
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
            {columns.length === 0 ? <td>—</td> : columns.map((column) => <td key={column.code}>{sampleCell(column, row)}</td>)}
            <td>{mode === "stage" && row === 1 ? <span className="pd-tag tone-info">Yeni</span> : null}</td>
          </tr>)}
      </tbody>
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
export function DialogPreview({ title, presentation, ids, saveLabel, renderOwned, spanFor, onSelect, style }: {
  title: string; presentation: "dialog" | "drawer"; ids: string[]; saveLabel: string | null; renderOwned: (id: string) => ReactNode; spanFor: (id: string) => number;
  onSelect: (id: string) => void; style: CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const kind = presentation === "drawer" ? "Çekmece" : "Pencere";
  return <section className="pd-layout-block pd-tabs-preview" style={style}>
    <div className="pd-tabs-preview-list">
      <button type="button" tabIndex={-1} aria-expanded={open} className={open ? "is-active" : undefined}
        onClick={(event) => { event.stopPropagation(); setOpen((current) => !current); }}>{`${kind}: ${title || "Başlıksız"} · ${ids.length} bileşen`} {open ? "▴" : "▾"}</button>
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
