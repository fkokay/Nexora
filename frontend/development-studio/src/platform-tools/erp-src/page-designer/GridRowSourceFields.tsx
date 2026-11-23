import { Plus, Trash2 } from "lucide-react";
import { LOOKUP_COLUMN, parseGridColumns, type GridColumn } from "./gridColumns";
import {
  MAX_INITIAL_ROWS_MAP, MAX_LOOKUP_FILL, editableColumns, rowsMapEntries, rowsMapText, skippableColumns, type LookupFillEntry, type RowsMapEntry,
} from "./gridRowSources";

type Patch = Record<string, unknown>;
type QueryColumn = { code: string; label?: string };
const pickable = (column: QueryColumn) => LOOKUP_COLUMN.test(column.code);

/** Alan adı seçici: sorgu sütunları biliniyorsa açılır liste, değilse metin (noktalı yol olabilir). */
function FieldPicker({ value, columns, placeholder, empty, disabled, ariaLabel, onChange }: {
  value: string; columns: QueryColumn[]; placeholder: string; empty?: string; disabled?: boolean; ariaLabel: string; onChange: (value: string) => void;
}) {
  if (columns.length > 0) return <select value={value} disabled={disabled} aria-label={ariaLabel} onChange={(event) => onChange(event.target.value)}>
    {empty !== undefined && <option value="">{empty}</option>}
    {columns.map((item) => <option key={item.code} value={item.code}>{item.label ? `${item.label} (${item.code})` : item.code}</option>)}
    {value && !columns.some((item) => item.code === value) && <option value={value}>{value}</option>}
  </select>;
  return <input key={`${ariaLabel}:${value}`} defaultValue={value} maxLength={128} spellCheck={false} placeholder={placeholder} disabled={disabled} aria-label={ariaLabel}
    onBlur={(event) => { const next = event.target.value.trim(); if (next === value || (next !== "" && !LOOKUP_COLUMN.test(next))) { event.target.value = value; return; } onChange(next); }}/>;
}

/**
 * Kaynaktan başlangıç satırları (`initialRowsQuery`, yalnız liste kipinde) ve sütun eşlemi (`initialRowsMap`), ayrıca boş
 * satırı kayıtta atlama (`skipRowsWhenEmpty`). Sorgu başarılı olunca tablo, sonuç satırı başına bir düzenlenebilir satırla
 * yeniden kurulur (aynı parametrelerle yeniden çalışınca kullanıcı düzenlemeleri korunur); sorgu beklerken ya da hata verince
 * bu tabloyu gönderen kayıtlar kapalıdır. Eşlem yoksa her sütun sonuç satırındaki aynı adlı alandan dolar; eşlem varsa
 * eşlemde olmayan sütunlar boş başlar. Boş satır atlama yalnız liste kipindedir.
 */
export function GridRowSourceFields({ mode, props, readQueries, columnsOf, disabled, onPatch }: {
  mode: "stage" | "list"; props: Patch; readQueries: { id: string; name: string }[]; columnsOf: (queryId: string) => QueryColumn[];
  disabled?: boolean; onPatch: (patch: Patch) => void;
}) {
  const columns = editableColumns(parseGridColumns(props.gridColumns));
  const query = typeof props.initialRowsQuery === "string" ? props.initialRowsQuery : "";
  const knownQuery = readQueries.some((item) => item.id === query);
  const sourceColumns = query ? columnsOf(query).filter(pickable) : [];
  const map = rowsMapEntries(props.initialRowsMap);
  const mapped = map.length > 0;
  // Eşlem yokken her sütun aynı adlı alandan dolar; eşlem varken yalnız eşlemdeki sütunlar dolar.
  const fieldOf = (cell: string) => mapped ? map.find((entry) => entry.cell === cell)?.field ?? "" : cell;
  const setField = (cell: string, field: string) => {
    const next: RowsMapEntry[] = columns.flatMap((column) => {
      const value = column.code === cell ? field : fieldOf(column.code);
      return value ? [{ cell: column.code, field: value }] : [];
    }).slice(0, MAX_INITIAL_ROWS_MAP);
    // Eşlem tam olarak "her sütun kendi adından" ise yazılmaz (varsayılanla aynı).
    const identity = next.length === columns.length && next.every((entry) => entry.cell === entry.field);
    onPatch({ initialRowsMap: next.length > 0 && !identity ? next.map(rowsMapText) : undefined });
  };
  const skip = typeof props.skipRowsWhenEmpty === "string" ? props.skipRowsWhenEmpty : "";
  const skippable = skippableColumns(parseGridColumns(props.gridColumns));
  return <>
    {mode === "list" && <div className="pd-field">Başlangıç satırları<small>Seçilen okuma sorgusunun satırları tabloya düzenlenebilir satır olarak yüklenir (ör. düzenlenen belgenin kalemleri, tekliften sipariş, siparişin kalan miktarları). Yeni / kayıttan sonra tablo son yüklenen satırlara döner.</small>
      <select value={knownQuery ? query : query ? "__stale" : ""} disabled={disabled} aria-label="Başlangıç satırları sorgusu"
        onChange={(event) => { if (event.target.value === "__stale") return; onPatch({ initialRowsQuery: event.target.value || undefined, ...(event.target.value ? {} : { initialRowsMap: undefined }) }); }}>
        <option value="">Yok (boş tabloyla başlar)</option>
        {readQueries.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        {query && !knownQuery && <option value="__stale">{query}</option>}
      </select>
      {query && !knownQuery && <small className="pd-query-warning">{`Başlangıç satırlarının sorgusu sayfada bir okuma sorgusu olmalıdır: ${query}`}</small>}
      {query && knownQuery && (columns.length === 0 ? <small className="pd-query-muted">Önce sütun ekleyin.</small>
        : <table className="pd-query-params"><thead><tr><th scope="col">Sütun</th><th scope="col">Kaynak alan</th></tr></thead><tbody>
          {columns.map((column) => <tr key={column.code}><td><code>{column.code}</code></td><td>
            <FieldPicker value={fieldOf(column.code)} columns={sourceColumns} placeholder="(boş başlar)" empty="(boş başlar)" disabled={disabled}
              ariaLabel={`${column.code} kaynak alanı`} onChange={(field) => setField(column.code, field)}/>
          </td></tr>)}
        </tbody></table>)}
      {query && knownQuery && <small className="pd-query-muted">{mapped ? "Eşlemde olmayan sütunlar boş başlar." : "Eşlem yazılmadı: her sütun kaynak satırdaki aynı adlı alandan dolar."}</small>}
    </div>}
    {mode === "list" && <label className="pd-field">Boş satırı atla<small>Bu hücresi boş ya da 0 olan satırlar kayda gönderilmez ve doğrulanmaz (ör. sevk edilmeyecek kalan miktar).</small>
      <select value={skip} disabled={disabled} aria-label="Boş satırı atlama sütunu" onChange={(event) => onPatch({ skipRowsWhenEmpty: event.target.value || undefined })}>
        <option value="">Atlanmaz</option>
        {skippable.map((column) => <option key={column.code} value={column.code}>{`${column.label} (${column.code})`}</option>)}
        {skip && !skippable.some((column) => column.code === skip) && <option value={skip}>{skip}</option>}
      </select>
    </label>}
  </>;
}

/**
 * Seçim sütununun doldurması (`lookupFill`): kullanıcı bu hücrede bir seçenek seçince, seçenek satırının alanı aynı satırın
 * hedef hücresine yazılır; hedef boşsa ya da önceki seçimin yazdığı değeri taşıyorsa. Kullanıcının yazdığı değer ezilmez;
 * satırlar kaynaktan yüklenirken ve sıfırlamada çalışmaz; seçimi temizlemek doldurulanları silmez.
 */
export function LookupFillFields({ lookup, entries, targets, optionColumns, disabled, onChange }: {
  lookup: GridColumn; entries: LookupFillEntry[]; targets: GridColumn[]; optionColumns: QueryColumn[]; disabled?: boolean;
  onChange: (next: LookupFillEntry[]) => void;
}) {
  const used = new Set(entries.map((entry) => entry.target));
  const free = targets.filter((column) => !used.has(column.code));
  const set = (index: number, patch: Partial<LookupFillEntry>) => onChange(entries.map((entry, i) => i === index ? { ...entry, ...patch } : entry));
  const add = () => {
    const target = free[0];
    if (!target) return;
    const field = optionColumns.find((item) => item.code === target.code)?.code ?? optionColumns[0]?.code ?? target.code;
    onChange([...entries, { lookup: lookup.code, target: target.code, field }]);
  };
  return <div className="pd-field">Seçilince doldur<small>Seçenek satırının alanı aynı satırdaki hücreye yazılır (ör. birim, fiyat, KDV); kullanıcının yazdığı değer ezilmez.</small>
    {entries.map((entry, index) => <div className="pd-field-row" key={`${entry.target}:${index}`}>
      <select value={entry.target} disabled={disabled} aria-label={`${lookup.code} doldurma hedefi ${index + 1}`} onChange={(event) => set(index, { target: event.target.value })}>
        {targets.filter((column) => column.code === entry.target || !used.has(column.code)).map((column) => <option key={column.code} value={column.code}>{`${column.label} (${column.code})`}</option>)}
        {!targets.some((column) => column.code === entry.target) && <option value={entry.target}>{entry.target}</option>}
      </select>
      <FieldPicker value={entry.field} columns={optionColumns} placeholder="Seçenek alanı" disabled={disabled} ariaLabel={`${lookup.code} doldurma alanı ${index + 1}`}
        onChange={(field) => { if (field) set(index, { field }); }}/>
      <button type="button" className="pd-icon-button danger" aria-label={`${lookup.code} doldurma ${index + 1} sil`} disabled={disabled}
        onClick={() => onChange(entries.filter((_, i) => i !== index))}><Trash2 size={12}/></button>
    </div>)}
    <button type="button" className="pd-button small" disabled={disabled || free.length === 0 || entries.length >= MAX_LOOKUP_FILL} onClick={add}
      title={free.length === 0 ? "Doldurulacak başka sütun yok." : undefined}><Plus size={13}/>Doldurma ekle</button>
  </div>;
}
