import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import AdvancedDataGrid from "../AdvancedDataGrid";
import { columnTotal, formatCell, isRightAligned, parseColumnFormats, toneFor, type ColumnFormat, type Tone } from "./cellFormat";
import { displayText } from "./pageBindings";
import { PagedTableFooter } from "./PagedTableFooter";
import type { QueryState } from "./usePageQueries";
import type { ActionStatus } from "./PageDialog";
import type { RowAction, TablePaging } from "../TenantCustomPage";
import "./data-table-grid.css";

/**
 * Sayfa tasarımcısının `dataTable` bileşeni: yerleşik ERP listeleriyle (Stok Kartları) aynı gelişmiş ızgara.
 * Sütun filtreleri, sütun seçici, sıralama, pivot, satır onay kutuları ve kullanıcının görünüm ayarları
 * (`nexora.grid.<gridId>`) gelir. Ham `QueryTable` ile aynı özellikleri alır; sayfa seçimi (`<tablo>.seciliSatir`)
 * ızgaranın güncel satırıdır, onay kutuları ise yalnız ızgara içi çoklu seçimdir.
 */
/** Tasarımcıdaki tablo araçları: kaydedilmemişse açıktır (false = gizli). */
export type GridTools = { search: boolean; filters: boolean; columns: boolean; export: boolean; pivot: boolean };
export const ALL_GRID_TOOLS: GridTools = { search: true, filters: true, columns: true, export: true, pivot: true };
/** dataTable props → araçlar: `showGridSearch`, `showColumnFilters`, `showColumnChooser`, `showExport`, `showPivot`. */
export function gridToolsOf(props: Record<string, unknown> | undefined): GridTools {
  const on = (key: string) => props?.[key] !== false;
  return { search: on("showGridSearch"), filters: on("showColumnFilters"), columns: on("showColumnChooser"), export: on("showExport"), pivot: on("showPivot") };
}
export type DataTableGridProps = {
  tools?: GridTools;
  /** Görünüm ayarlarının anahtarı: `custom-page.<sayfaKodu>.<bileşenId>`. */
  gridId: string;
  state: QueryState; columns: string[]; title: string; description: string; style: CSSProperties;
  valueLabels?: Record<string, Record<string, string>>;
  columnLabels?: Record<string, string>; columnUnits?: Record<string, string>;
  selected?: Record<string, unknown> | null; onSelect?: (row: Record<string, unknown> | null, options?: { user?: boolean }) => void;
  /** Satırı aç (çift tıklama veya Enter); verilmezse Enter yalnız seçimi değiştirir. */
  onOpenRow?: (row: Record<string, unknown>) => void;
  formats?: Record<string, ColumnFormat>; toneMap?: { key: string; tone: Tone }[]; totals?: string[]; density?: "dense" | "comfort";
  paging?: TablePaging;
  rowActions?: RowAction[];
  emptyText?: string;
  limit?: number;
  status?: ActionStatus | null;
};

const MANUAL_QUERY_IDLE = "Bu sorgu elle çalıştırılır.";
const neverRan = (state: QueryState) => !state.ran && !state.loading && !state.error;

/** Satırın kimliği (yenilemede aynı kaydı bulmak için); TenantCustomPage `rowIdentity` ile aynı kural. */
function rowIdentity(row: Record<string, unknown>): string | null {
  const scalar = (value: unknown) => (typeof value === "string" || typeof value === "number") && value !== "";
  if (scalar(row.id)) return `id=${String(row.id)}`;
  const parts: string[] = [];
  for (const [key, value] of Object.entries(row)) {
    if (value !== null && typeof value === "object" && !Array.isArray(value) && scalar((value as Record<string, unknown>).id)) parts.push(`${key}.id=${String((value as Record<string, unknown>).id)}`);
    else if (key.endsWith(".id") && scalar(value) && !(key.slice(0, -3) in row)) parts.push(`${key}=${String(value)}`);
  }
  return parts.length > 0 ? parts.sort().join("|") : null;
}

const labeledCell = (labels: Record<string, Record<string, string>>, code: string, value: unknown, format?: ColumnFormat, dataType?: string) => {
  const own = labels[code];
  const key = value == null ? "" : typeof value === "object" ? null : String(value);
  return own && key !== null && Object.prototype.hasOwnProperty.call(own, key) ? own[key] : formatCell(value, format, dataType);
};

/** Satır anahtarı: çizilen listedeki sıra (ızgara seçimi ve güncel satır bununla izlenir). */
const rowKey = (index: number) => `r${index}`;
const keyIndex = (key: string | null) => key && /^r\d+$/.test(key) ? Number(key.slice(1)) : -1;

export function DataTableGrid({ gridId, state, columns, title, description, style, selected, onSelect, onOpenRow, formats = parseColumnFormats(undefined), toneMap = [], totals = [], density = "dense", paging, rowActions = [], emptyText = "", limit, status = null, valueLabels = {}, columnLabels = {}, columnUnits = {}, tools = ALL_GRID_TOOLS }: DataTableGridProps) {
  // Seçilen sütunlar tasarımcının seçim sırasıyla; başlık `columnLabels` ile değişebilir.
  const chosen = columns.length > 0 ? columns.flatMap((code) => state.columns.filter((column) => column.code === code)
    .map((column) => columnLabels[code] ? { ...column, label: columnLabels[code] } : column)) : [];
  const visible = (chosen.length > 0 ? chosen : state.columns).slice(0, 20);
  const drawn = limit !== undefined ? state.rows.slice(0, limit) : state.rows;
  const actionsShown = rowActions.length > 0 && drawn.some((row) => rowActions.some((action) => action.visible(row)));
  // Yeni sonuç gelince aynı kimlikli satır varsa seçim ona geçer, yoksa kalkar (açık kayıt penceresi aynı kaydı izler).
  useEffect(() => {
    if (!selected || state.rows.includes(selected)) return;
    const identity = rowIdentity(selected);
    const same = identity === null ? undefined : state.rows.find((row) => rowIdentity(row) === identity);
    onSelect?.(same ?? null);
  }, [state.rows]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tıklama satırı kendisi seçer/bırakır; ızgaranın aynı tıklamadaki güncel satır isteği yok sayılır (çift seçim olmaz).
  const clickRef = useRef(false);
  const toggle = (row: Record<string, unknown>) => onSelect?.(selected === row ? null : row, { user: true });
  const selectedIndex = selected ? drawn.indexOf(selected) : -1;
  const currentRowKey = onSelect ? (selectedIndex >= 0 ? rowKey(selectedIndex) : null) : undefined;
  const onCurrentRowChange = onSelect ? (key: string | null) => {
    if (clickRef.current) return;
    const row = drawn[keyIndex(key)];
    if (row && row !== selected) onSelect(row, { user: true });
  } : undefined;

  const cellClass = (column: { code: string; dataType?: string }) => {
    const format = formats[column.code];
    const right = isRightAligned(format, column.dataType);
    return [right ? "nx-num" : "", format === "code" ? "code" : ""].filter(Boolean).join(" ") || undefined;
  };
  const renderCell = (column: { code: string; dataType?: string }, row: Record<string, unknown>): ReactNode => {
    const value = labeledCell(valueLabels, column.code, row[column.code], formats[column.code], column.dataType);
    const unit = columnUnits[column.code] ? displayText(row[columnUnits[column.code]]) : "";
    const text = unit && value !== "—" ? `${value} ${unit}` : value;
    if (formats[column.code] !== "status" || text === "—") return text;
    const tone = toneFor(text, toneMap);
    return <span className={`tenant-page-tag${tone ? ` tone-${tone}` : ""}`}>{text}</span>;
  };
  // Satır işlemi tıklaması satır seçimini değiştirmez; satırı işlem kendisi seçer.
  const actionCell = (row: Record<string, unknown>) => <td className="tenant-page-row-actions" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
    {rowActions.filter((action) => action.visible(row)).map((action) => {
      const reason = action.disabled(row);
      return <button key={action.id} type="button" className="tenant-page-row-action" disabled={reason !== null} title={reason ?? undefined}
        onClick={(event) => { event.stopPropagation(); action.run(row, event.currentTarget); }}>{action.label}</button>;
    })}
  </td>;
  const colCount = Math.max(1, visible.length + (actionsShown ? 1 : 0));
  const totalColumns = visible.filter((column) => totals.includes(column.code));
  const totalLabel = paging ? `Sayfa toplamı · ${drawn.length} kayıt`
    : state.truncated ? `Toplam · ilk ${drawn.length} satır` : `Toplam · ${drawn.length} kayıt`;
  // Sonuç varken yenileme ızgarayı kaldırmaz: kullanıcının filtre ve sıralaması korunur.
  const showGrid = !state.error && !neverRan(state) && !(state.loading && state.rows.length === 0);

  return <section className={`tenant-page-block tenant-page-data-grid tenant-page-report-widget ${state.error ? "is-error" : ""}`} style={style}>
    {title && <h3>{title}</h3>}
    {description && <p>{description}</p>}
    {/* Arama girişi yükleme sırasında da yerinde kalır (yazarken odak kaybolmasın). */}
    {paging?.search && <div className="tenant-page-table-search">{paging.search}</div>}
    {state.error ? <div className="tenant-custom-page-error tenant-page-query-error" role="alert"><AlertCircle size={16} /><span>{state.error}</span></div>
      : neverRan(state) ? <div className="tenant-report-state" role="status">{emptyText || MANUAL_QUERY_IDLE}</div>
        : !showGrid ? <div className="tenant-report-state" role="status">Yükleniyor…</div>
          : <>
            {state.loading && <div className="tenant-report-state" role="status">Yükleniyor…</div>}
            <div className={`customer-table-wrap tenant-page-data-grid-wrap${density === "comfort" ? " is-comfort" : ""}`}>
              <AdvancedDataGrid className="customer-table tenant-page-grid-table" gridId={gridId} aria-label={title || "Kayıtlar"}
                externalPagination={!!paging} enableRowSelection={false} selectable
                hideSearch={!tools.search} hideFilters={!tools.filters} hideColumnChooser={!tools.columns} hideExport={!tools.export} hidePivot={!tools.pivot}
                currentRowKey={currentRowKey} onCurrentRowChange={onCurrentRowChange}>
                <thead><tr>
                  {visible.map((column) => <th key={column.code} className={isRightAligned(formats[column.code], column.dataType) ? "nx-num" : undefined}>{column.label || column.code}</th>)}
                  {actionsShown && <th className="tenant-page-row-actions">İşlemler</th>}
                </tr></thead>
                <tbody>
                  {drawn.length === 0 ? <tr><td colSpan={Math.max(2, colCount)} className="table-empty tenant-report-state">{emptyText || "Gösterilecek kayıt bulunamadı."}</td></tr>
                    : drawn.map((row, index) => <tr key={rowKey(index)} className={onSelect ? `tenant-page-row-selectable${selected === row ? " is-selected" : ""}` : undefined}
                      onClick={onSelect ? () => { clickRef.current = true; queueMicrotask(() => { clickRef.current = false; }); toggle(row); } : undefined}
                      tabIndex={onSelect || onOpenRow ? 0 : undefined}
                      onDoubleClick={onOpenRow ? () => onOpenRow(row) : undefined}
                      onKeyDown={onSelect || onOpenRow ? (event) => {
                        // Boşluk ızgaranın onay kutusudur. Enter satırı açar (açılamıyorsa seçer); bir sayfa komutu
                        // Enter'ı aldıysa (Aç) seçim değişmez.
                        if (event.defaultPrevented || event.key !== "Enter") return;
                        event.preventDefault();
                        if (onOpenRow) { if (selected !== row) onSelect?.(row, { user: true }); onOpenRow(row); }
                        else toggle(row);
                      } : undefined}>
                      {visible.map((column) => <td key={column.code} className={cellClass(column)}>{renderCell(column, row)}</td>)}
                      {actionsShown && actionCell(row)}
                    </tr>)}
                </tbody>
              </AdvancedDataGrid>
            </div>
            {totalColumns.length > 0 && drawn.length > 0 && <dl className="tenant-page-grid-totals" aria-label="Toplamlar">
              <dt className="tenant-page-total-label">{totalLabel}</dt>
              {totalColumns.map((column) => {
                const total = columnTotal(drawn, column.code);
                return <div key={column.code}><dt>{column.label || column.code}</dt>
                  <dd className="num">{total !== null ? formatCell(total, formats[column.code] === "money" ? "money" : "number") : "—"}</dd></div>;
              })}
            </dl>}
          </>}
    {status && <p className={`tenant-page-action-feedback is-${status.tone}`} role={status.tone === "error" ? "alert" : "status"}>{status.text}</p>}
    {!paging && !state.loading && !state.error && state.truncated && <p className="tenant-page-truncated" role="status">İlk 5.000 satır gösteriliyor.</p>}
    {paging && !state.error && !neverRan(state) && <PagedTableFooter page={paging.page} pageSize={paging.pageSize} total={state.rowCount}
      meta={paging.meta} onPage={paging.onPage} loading={state.loading} />}
  </section>;
}
