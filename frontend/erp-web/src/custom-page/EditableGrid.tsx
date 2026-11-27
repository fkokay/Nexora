import type { CSSProperties, ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { addBlockedMessage, MATRIX_DIMENSION_COLUMNS, type GridAction, type GridColumn, type GridDraft, type GridState } from "./gridState";
import { displayText } from "./pageBindings";
import { LookupInput, type LookupOption } from "./LookupInput";
import { formatGridTotal } from "./gridTotals";

/** Seçim (lookup) hücresinin çizim verisi: seçenekler, seçili değerin görünen metni ve arama/seçim geri çağrıları. */
export type GridPicker = {
  options: LookupOption[]; loading: boolean; error?: string; selected: { value: string; label: string } | null;
  onSearch: (text: string) => void; onChange: (value: string, row: Record<string, unknown> | null, label: string) => void;
};

const MATRIX_CAP = 200;
const MATRIX_OVER = "En fazla 200 varyant oluşturulabilir; ilk 200 kullanılacak.";

/** Kaynak satırdaki sütun değeri: önce düz "a.b" anahtarı, sonra iç içe nesne. */
function sourceCell(row: Record<string, unknown>, code: string): string {
  if (Object.prototype.hasOwnProperty.call(row, code)) return displayText(row[code]);
  const dot = code.indexOf(".");
  const nested = dot < 0 ? undefined : row[code.slice(0, dot)];
  return nested && typeof nested === "object" && !Array.isArray(nested) ? displayText((nested as Record<string, unknown>)[code.slice(dot + 1)]) : "";
}

/**
 * Düzenlenebilir tablo (`editableGrid`): gerçek bir `<table>`. `stage` kipinde kaynak satırlar salt okunurdur (silinmek
 * üzere işaretlenir, "Geri al" ile geri alınır), yeni satırlar düzenlenir; `list`/`matrix` kiplerinde tüm satırlar düzenlenir.
 */
export function EditableGrid({ id, title, description, mode, columns, state, sourceRows, rowKey, dispatch, errors, fixedRowLabel, addLabel, maxRows,
  disabled, disabledReason, loading, error, matrixPreviewCount, style, pickerFor, pickerLabel, totals = {}, calcText, lockedFor }: {
  id: string; title: string; /** Başlığın altındaki açıklama (kalıplı pencerede satır tablosu); boşsa çizilmez. */ description?: string; mode: "stage" | "list" | "matrix"; columns: GridColumn[];
  state: GridState; sourceRows: Record<string, unknown>[]; rowKey: string; dispatch: (action: GridAction) => void;
  errors: Record<string, Record<string, string>>; fixedRowLabel: string; addLabel: string; maxRows: number;
  disabled: boolean; disabledReason: string; loading: boolean; error?: string; matrixPreviewCount?: number; style: CSSProperties;
  /** Seçim sütununun düzenlenebilir hücresi (yoksa hücre metin girişi gibi çizilir). */
  pickerFor?: (column: GridColumn, draft: GridDraft) => GridPicker;
  /** Seçim sütununun salt okunur metni: değerin seçenek etiketi (kaynak satırlar ve readOnly sütun). */
  pickerLabel?: (column: GridColumn, value: string, draft?: GridDraft) => string;
  /** Sütun toplamları (`totals`): sütun kodu → toplam; boşsa alt satır çizilmez. */
  totals?: Record<string, number>;
  /** Hesaplanan (`calc`) hücrenin metni (sunucu önizlemesinden; yoksa "—"). */
  calcText?: (column: GridColumn, draft: GridDraft) => string;
  /** Satırın kilitli sütunları (`lockColumnsWhen`): hücre salt okunur "—" olarak çizilir. */
  lockedFor?: (draft: GridDraft) => ReadonlySet<string>;
}) {
  const shown = mode === "matrix" ? MATRIX_DIMENSION_COLUMNS : columns;
  const blocked = addBlockedMessage(state, { mode, maxRows });
  const removed = new Set(state.removed);
  const source = mode === "stage" ? sourceRows : [];
  const drafts = mode === "stage" ? state.added : state.rows;
  const span = shown.length + 2;
  let position = 0;

  const editCell = (draft: GridDraft, column: GridColumn, n: number, locked: ReadonlySet<string> | undefined): ReactNode => {
    const raw = draft.cells[column.code];
    const message = errors[draft.key]?.[column.code];
    const label = `${column.label} (satır ${n})`;
    if (locked?.has(column.code)) return <td key={column.code} className="is-locked" data-locked={column.code} aria-label={label}>—</td>;
    const inputId = `page-grid-${id}-${draft.key}-${column.code}`;
    const common = { id: inputId, "aria-label": label, "aria-invalid": message ? true : undefined, disabled, readOnly: column.rules.readOnly || undefined };
    if (column.inputType === "calc") return <td key={column.code} className="num" data-calc={column.code} aria-label={label}>{calcText ? calcText(column, draft) : "—"}</td>;
    if (column.inputType === "lookup") {
      const value = typeof raw === "string" ? raw : "";
      if (column.rules.readOnly || !pickerFor) return <td key={column.code}>{(pickerLabel ? pickerLabel(column, value, draft) : value) || "—"}</td>;
      const picker = pickerFor(column, draft);
      return <td key={column.code} className={`tenant-page-grid-picker${message ? " is-invalid" : ""}`}>
        <LookupInput inputId={inputId} label="" ariaLabel={label} raw={value} placeholder="" allowClear={!column.rules.required} disabled={disabled} floating
          options={picker.options} loading={picker.loading} error={picker.error} selected={picker.selected}
          onChange={picker.onChange} onSearch={picker.onSearch} />
        {message && <small className="tenant-page-input-error">{message}</small>}
      </td>;
    }
    const control = column.inputType === "checkbox"
      ? <input {...common} type="checkbox" checked={raw === true || raw === "true"} onChange={(event) => dispatch({ type: "edit", key: draft.key, code: column.code, value: event.target.checked })} />
      : <input {...common} type={column.inputType === "text" ? "text" : column.inputType} value={typeof raw === "string" ? raw : ""}
        step={column.inputType === "number" ? column.rules.step ?? "any" : undefined}
        min={column.inputType === "number" ? column.rules.min : undefined} max={column.inputType === "number" ? column.rules.max : undefined}
        maxLength={column.inputType === "text" ? column.rules.maxLength : undefined}
        onChange={(event) => dispatch({ type: "edit", key: draft.key, code: column.code, value: column.rules.upperCase ? event.target.value.toUpperCase() : event.target.value })} />;
    return <td key={column.code} className={message ? "is-invalid" : undefined}>
      {control}
      {message && <small className="tenant-page-input-error">{message}</small>}
    </td>;
  };

  const hasTotal = (code: string) => Object.prototype.hasOwnProperty.call(totals, code);
  const tableError = errors[""]?.[""];
  return <section className={`tenant-page-block tenant-page-grid${disabled ? " is-disabled" : ""}`} style={style} data-grid={id}>
    {title && <h3>{title}</h3>}
    {description && <p className="tenant-page-text">{description}</p>}
    {disabled && disabledReason && <p className="tenant-page-disabled-reason">{disabledReason}</p>}
    {loading ? <div className="tenant-report-state" role="status">Yükleniyor…</div>
      : error ? <div className="tenant-custom-page-error tenant-page-query-error" role="alert"><AlertCircle size={16} /><span>{error}</span></div>
      : <div className="tenant-page-table-scroll"><table className="tenant-page-grid-table">
        <thead><tr>{shown.map((column) => <th scope="col" key={column.code}>{column.label}{column.rules.required && <b aria-hidden="true"> *</b>}</th>)}
          <th scope="col"><span className="sr-only">Durum</span></th><th scope="col"><span className="sr-only">İşlem</span></th></tr></thead>
        <tbody>
          {fixedRowLabel && <tr className="is-fixed"><td colSpan={span}>{fixedRowLabel}</td></tr>}
          {source.map((row, index) => {
            position += 1;
            const key = displayText(row[rowKey]) || `kaynak-${index}`;
            const isRemoved = removed.has(key);
            return <tr key={`s-${key}`} className={isRemoved ? "is-removed" : undefined}>
              {shown.map((column) => {
                const text = column.inputType === "calc" ? "" : sourceCell(row, column.code);
                return <td key={column.code}>{(column.inputType === "lookup" && pickerLabel && text ? pickerLabel(column, text) : text) || "—"}</td>;
              })}
              <td>{isRemoved && <span className="tenant-page-tag tone-danger">Silinecek</span>}</td>
              <td className="tenant-page-grid-actions">{isRemoved
                ? <button type="button" className="tenant-page-row-action" disabled={disabled} onClick={() => dispatch({ type: "undoRemove", key })}>Geri al</button>
                : <button type="button" className="tenant-page-row-action" aria-label="Satırı sil" disabled={disabled} onClick={() => dispatch({ type: "remove", key })}>Sil</button>}</td>
            </tr>;
          })}
          {drafts.map((draft) => {
            position += 1;
            const n = position;
            const locked = lockedFor?.(draft);
            return <tr key={draft.key} className="is-new">
              {shown.map((column) => editCell(draft, column, n, locked))}
              <td>{mode === "stage" && <span className="tenant-page-tag tone-info">Yeni</span>}</td>
              <td className="tenant-page-grid-actions"><button type="button" className="tenant-page-row-action" aria-label="Satırı sil" disabled={disabled}
                onClick={() => dispatch({ type: "remove", key: draft.key })}>Sil</button></td>
            </tr>;
          })}
          {!fixedRowLabel && source.length === 0 && drafts.length === 0 && <tr><td colSpan={span} className="tenant-report-state">Henüz satır yok.</td></tr>}
        </tbody>
        {mode !== "matrix" && shown.some((column) => hasTotal(column.code)) && <tfoot><tr className="is-total">
          {shown.map((column, index) => hasTotal(column.code)
            ? <td key={column.code} className="num" data-total={column.code}><span className="sr-only">{column.label} toplamı </span>{formatGridTotal(totals[column.code])}</td>
            : <td key={column.code}>{index === 0 ? "Toplam" : ""}</td>)}
          <td /><td />
        </tr></tfoot>}
      </table></div>}
    {tableError && <p className="tenant-page-input-error" role="alert">{tableError}</p>}
    {mode === "matrix" && matrixPreviewCount !== undefined && matrixPreviewCount > 0 && <p className="tenant-page-grid-preview" role="status">
      {matrixPreviewCount > MATRIX_CAP ? MATRIX_OVER : `${matrixPreviewCount} varyant oluşturulacak`}</p>}
    <div className="tenant-page-grid-footer">
      <button type="button" className="tenant-page-button is-secondary" disabled={disabled || blocked !== null} onClick={() => dispatch({ type: "add" })}>{addLabel}</button>
      {blocked && <small className="tenant-page-disabled-reason">{blocked}</small>}
    </div>
  </section>;
}
