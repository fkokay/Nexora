import { Plus, Trash2 } from "lucide-react";
import BindingInput, { type BindingSuggestion } from "./BindingInput";
import { ConditionBuilder } from "./ConditionBuilder";
import { sanitizeSafeValue } from "./DesignLanguageFields";
import type { ErpOperationParameter } from "./erpOperations";
import {
  COLUMN_STATIC_OPTION, GRID_COLUMN_TYPES, LOOKUP_COLUMN, MAX_COLUMN_STATIC_OPTIONS, MAX_GRID_COLUMNS, MAX_GRID_LABEL, MAX_GRID_TEXT_LENGTH, columnEntries, gridColumnRoot, gridColumnText,
  gridTotalCodes, parseGridColumn, parseGridColumns, renamedColumnEntries, renamedTotals, type GridColumn, type GridColumnLookup, type GridColumnType,
} from "./gridColumns";

export type GridMode = "stage" | "list" | "matrix";
type Patch = Record<string, unknown>;

export const gridModeLabels: Record<GridMode, string> = { stage: "Kayda kadar beklet", list: "Liste", matrix: "Varyant matrisi" };
const gridModeHelp: Record<GridMode, string> = {
  stage: "Kaynak sorgunun satırları salt okunurdur; eklenen ve silinmek üzere işaretlenen satırlar kayıt dizisinde satır satır gönderilir.",
  list: "Tüm satırlar düzenlenebilir; satırlar bir liste parametresine {{ad.satirlar}} olarak gönderilir.",
  matrix: "Her satır bir özellik ve virgülle ayrılmış değerleridir; tüm birleşimler varyant olarak oluşturulur (en fazla 200).",
};
const typeLabels: Record<GridColumnType, string> = { text: "Metin", number: "Sayı", date: "Tarih", checkbox: "Onay kutusu", lookup: "Seçim (sorgudan)" };
export const DEFAULT_MAX_ROWS = 50;
export const MAX_GRID_ROWS = 200;
/** En az satır (`minRows`): 0–100; tabloyu bağlayan kayıt daha az satırla engellenir (sunucu kuralı). */
export const MAX_MIN_ROWS = 100;
const MAX_ADD_LABEL = 40;
const MAX_BINDABLE = 200;
const MAP_KEY = /^[\p{L}\p{N}_ -]{1,40}$/u;

/** Kipin yasakladığı özellikler: kip değişince silinir (sunucu kuralı). */
const forbiddenByMode: Record<GridMode, string[]> = {
  stage: ["matrixCode", "matrixName"],
  list: ["sourceQuery", "rowKey", "matrixCode", "matrixName"],
  matrix: ["sourceQuery", "rowKey", "gridColumns", "maxRows", "fixedRowLabel", "minRows", "columnOptionsWhen", "columnStaticOptions", "totals"],
};

/** Katalog veri türünden sütun türü. */
function typeFor(dataType: string | undefined): GridColumnType {
  if (dataType === "int" || dataType === "decimal" || dataType === "number") return "number";
  if (dataType === "date") return "date";
  if (dataType === "bool" || dataType === "boolean") return "checkbox";
  return "text";
}
const cleanLabel = (text: string) => sanitizeSafeValue(text.replace(/\|/g, "")).slice(0, MAX_GRID_LABEL);
const isValidCode = (code: string) => parseGridColumn(`${code}|x|text`).ok;

/** Türe uymayan kuralları atar (tür değişince); seçim kaynağı yalnız seçim sütununda kalır. */
function normalizeRules(column: GridColumn): GridColumn {
  const rules = { ...column.rules };
  if (column.inputType !== "text") { rules.upperCase = false; delete rules.maxLength; }
  if (column.inputType !== "number") { delete rules.min; delete rules.max; delete rules.step; }
  const next: GridColumn = { ...column, rules };
  if (next.inputType !== "lookup") delete next.lookup;
  return next;
}

type CodeOption = { code: string; label: string; type: GridColumnType; map: boolean };
export type QueryColumn = { code: string; label?: string };
/** Seçim sütununun sorgu sütunu: ad ya da noktalı yol (sunucu ve erp-web kuralı). */
const pickable = (column: QueryColumn) => LOOKUP_COLUMN.test(column.code);
/** Sorgu seçilince değer / etiket / açıklama sütunlarının varsayılanı: id, kod ve ad (yoksa ilk sütunlar). */
function defaultLookup(query: string, columns: QueryColumn[]): GridColumnLookup {
  const codes = columns.filter(pickable).map((column) => column.code);
  const has = (code: string) => codes.includes(code);
  const valueColumn = has("id") ? "id" : codes[0] ?? "id";
  const labelColumn = has("code") ? "code" : has("name") ? "name" : codes.find((code) => code !== valueColumn) ?? valueColumn;
  const descriptionColumn = labelColumn === "code" && has("name") ? "name" : undefined;
  return { query, valueColumn, labelColumn, ...(descriptionColumn ? { descriptionColumn } : {}) };
}

function NumberRule({ label, value, disabled, onChange, min, integer }: { label: string; value: number | undefined; disabled?: boolean; onChange: (value: number | undefined) => void; min?: number; integer?: boolean }) {
  return <label className="pd-field">{label}<input type="number" value={value ?? ""} min={min} step={integer ? 1 : "any"} disabled={disabled}
    onChange={(event) => {
      if (event.target.value === "") { onChange(undefined); return; }
      const number = Number(event.target.value);
      if (Number.isFinite(number) && (!integer || Number.isInteger(number))) onChange(number);
    }}/></label>;
}

/** Seçim sütununun kaynağı: okuma sorgusu ve değer / etiket / açıklama sütunları (önizleme ya da katalog sütunlarından). */
function LookupColumnFields({ column, index, lookupQueries, columnsOf, disabled, onChange }: {
  column: GridColumn; index: number; lookupQueries: { id: string; name: string }[]; columnsOf: (queryId: string) => QueryColumn[]; disabled?: boolean;
  onChange: (lookup: GridColumnLookup) => void;
}) {
  const lookup = column.lookup ?? { query: "", valueColumn: "", labelColumn: "" };
  const columns = lookup.query ? columnsOf(lookup.query).filter(pickable) : [];
  const knownQuery = lookupQueries.some((query) => query.id === lookup.query);
  const columnField = (key: "valueColumn" | "labelColumn" | "descriptionColumn", label: string) => {
    const chosen = lookup[key] ?? "";
    const write = (value: string) => {
      const next = { ...lookup };
      if (key === "descriptionColumn") { if (value) next.descriptionColumn = value; else delete next.descriptionColumn; }
      else if (value) next[key] = value; else return;
      onChange(next);
    };
    const aria = `Sütun ${index + 1} ${label.toLocaleLowerCase("tr-TR")}`;
    return <label className="pd-field">{label}
      {columns.length > 0
        ? <select value={chosen} aria-label={aria} onChange={(event) => write(event.target.value)}>
          {key === "descriptionColumn" && <option value="">(Açıklama yok)</option>}
          {columns.map((item) => <option key={item.code} value={item.code}>{item.label || item.code}</option>)}
          {chosen && !columns.some((item) => item.code === chosen) && <option value={chosen}>{chosen}</option>}
        </select>
        : <input key={`${key}:${chosen}`} defaultValue={chosen} maxLength={128} spellCheck={false} placeholder="Sütun adı" aria-label={aria}
          onBlur={(event) => { const value = event.target.value.trim(); if (value === chosen || (value !== "" && !LOOKUP_COLUMN.test(value))) { event.target.value = chosen; return; } write(value); }}/>}
    </label>;
  };
  return <>
    <label className="pd-field">Seçenek sorgusu<small>Sorgu satırın bir hücresini <code>{"{{<tablo>.satir.<sütun>}}"}</code> ile bağlarsa her satır kendi seçeneklerini alır (ör. kartın birimleri). <code>{"{{<tablo>.arama}}"}</code> odaktaki seçim hücresine yazılan metindir (sunucu araması).</small>
      <select value={lookup.query} disabled={disabled} aria-label={`Sütun ${index + 1} seçenek sorgusu`}
        onChange={(event) => { if (event.target.value) onChange(defaultLookup(event.target.value, columnsOf(event.target.value))); }}>
        {!knownQuery && <option value={lookup.query}>{lookup.query || "Sorgu seçin"}</option>}
        {lookupQueries.map((query) => <option key={query.id} value={query.id}>{query.name}</option>)}
      </select>
      {!knownQuery && <small className="pd-query-warning">{`Seçim sütununun sorgusu sayfada bir okuma sorgusu olmalıdır: ${lookup.query}`}</small>}
    </label>
    <div className="pd-field-row">
      {columnField("valueColumn", "Değer sütunu")}
      {columnField("labelColumn", "Etiket sütunu")}
    </div>
    {columnField("descriptionColumn", "Açıklama sütunu")}
    <small>Seçilen değer “etiket · açıklama” olarak gösterilir; salt okunur hücrede yalnız etiket görünür. Boş hücre kayda gönderilmez.</small>
  </>;
}

/** Seçim sütununun sabit seçenekleri: satır başına "değer=Etiket"; alandan çıkınca yazılır. */
function ColumnStaticOptions({ value, disabled, onChange, index }: { value: string[]; disabled?: boolean; onChange: (next: string[]) => void; index: number }) {
  const joined = value.join("\n");
  return <label className="pd-field">Sabit seçenekler<small>Her satıra bir “değer=Etiket”; boş değer için “=Ana birim”. Sorgu seçeneklerinden önce gösterilir (en fazla {MAX_COLUMN_STATIC_OPTIONS}).</small>
    <textarea key={joined} rows={2} defaultValue={joined} spellCheck={false} disabled={disabled} aria-label={`Sütun ${index + 1} sabit seçenekleri`}
      onBlur={(event) => {
        const next = event.target.value.split("\n").map((line) => line.trim()).filter(Boolean).slice(0, MAX_COLUMN_STATIC_OPTIONS);
        if (next.join("\n") !== joined) onChange(next);
      }}/>
    {value.some((entry) => !COLUMN_STATIC_OPTION.test(entry)) && <small className="pd-query-warning">Sabit seçenekler değer=Etiket biçiminde olmalıdır.</small>}
  </label>;
}

/** Sütun satırı: kod, etiket, tür ve kurallar; seçim sütununda kaynak, seçenek koşulu ve sabit seçenekler. */
function ColumnEditor({ column, index, options, takenCodes, disabled, onChange, onRemove, lookupQueries, columnsOf, pageNames, suggestions, optionsWhen, staticOptions, onOptionsWhen, onStaticOptions }: {
  column: GridColumn; index: number; options: CodeOption[]; takenCodes: string[]; disabled?: boolean; onChange: (column: GridColumn) => void; onRemove: () => void;
  lookupQueries: { id: string; name: string }[]; columnsOf: (queryId: string) => QueryColumn[]; pageNames: string[]; suggestions: BindingSuggestion[];
  optionsWhen: string | undefined; staticOptions: string[]; onOptionsWhen: (next: string | undefined) => void; onStaticOptions: (next: string[]) => void;
}) {
  const root = gridColumnRoot(column.code);
  const mapOption = column.code.includes(".") ? options.find((option) => option.map && option.code === root) : undefined;
  const selectValue = mapOption ? `${root}.` : column.code;
  const known = options.some((option) => (option.map ? `${option.code}.` : option.code) === selectValue);
  const set = (patch: Partial<GridColumn>) => onChange(normalizeRules({ ...column, ...patch }));
  const setRule = (patch: Partial<GridColumn["rules"]>) => {
    const rules = { ...column.rules, ...patch };
    // min ≤ max korunur: çelişen öteki sınır yeni değere çekilir.
    if (patch.min !== undefined && rules.max !== undefined && patch.min > rules.max) rules.max = patch.min;
    if (patch.max !== undefined && rules.min !== undefined && patch.max < rules.min) rules.min = patch.max;
    onChange({ ...column, rules });
  };
  const duplicate = takenCodes.includes(column.code.toLowerCase());
  const optionPaths = [...(column.lookup ? columnsOf(column.lookup.query) : []).filter((item) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(item.code))
    .map((item) => ({ path: `satir.${item.code}`, label: `satir.${item.code} · Seçenek satırı`, group: "Seçenek satırı" })),
  ...suggestions.map((item) => ({ path: item.path, label: `${item.path}${item.detail ? ` · ${item.detail}` : ""}`, group: item.group }))];
  return <fieldset className="pd-tabs-editor-tab" disabled={disabled}>
    <div className="pd-tabs-editor-head">
      {options.length > 0 ? <select value={known ? selectValue : column.code} aria-label={`Sütun ${index + 1} kodu`} onChange={(event) => {
        const option = options.find((item) => (item.map ? `${item.code}.` : item.code) === event.target.value);
        if (!option) return;
        const code = option.map ? `${option.code}.${column.code.includes(".") ? column.code.split(".")[1] : "Ozellik"}` : option.code;
        // Seçim sütunu kod değişince türünü korur (değer kimliktir; katalog türü metindir).
        set({ code, inputType: option.map ? "text" : column.inputType === "lookup" ? "lookup" : option.type, label: column.label || cleanLabel(option.label) || code });
      }}>
        {options.map((option) => <option key={option.code} value={option.map ? `${option.code}.` : option.code}>{option.map ? `${option.label} (${option.code}.…)` : `${option.label} (${option.code})`}</option>)}
        {!known && <option value={column.code}>{column.code}</option>}
      </select>
        : <input key={`code:${column.code}`} defaultValue={column.code} maxLength={105} spellCheck={false} aria-label={`Sütun ${index + 1} kodu`}
          onBlur={(event) => { const code = event.target.value.trim(); if (code !== column.code && isValidCode(code)) set({ code }); else event.target.value = column.code; }}/>}
      {mapOption && <input key={`key:${column.code}`} defaultValue={column.code.split(".")[1]} maxLength={40} aria-label={`Sütun ${index + 1} özellik adı`}
        onBlur={(event) => { const key = event.target.value.trim(); if (MAP_KEY.test(key) && `${root}.${key}` !== column.code) set({ code: `${root}.${key}` }); else event.target.value = column.code.split(".")[1]; }}/>}
      <button type="button" className="pd-icon-button danger" aria-label={`Sütun ${index + 1} sil`} onClick={onRemove}><Trash2 size={12}/></button>
    </div>
    {duplicate && <small className="pd-query-warning">Bu sütun kodu tabloda zaten var.</small>}
    <div className="pd-field-row">
      <label className="pd-field">Etiket<input key={`label:${column.label}`} defaultValue={column.label} maxLength={MAX_GRID_LABEL}
        onBlur={(event) => { const label = cleanLabel(event.target.value); if (label && label !== column.label) set({ label }); else event.target.value = column.label; }}/></label>
      <label className="pd-field">Tür<select value={column.inputType} disabled={!!mapOption} onChange={(event) => {
        const inputType = event.target.value as GridColumnType;
        if (inputType !== "lookup") { set({ inputType }); return; }
        const query = lookupQueries[0];
        if (query) set({ inputType, lookup: column.lookup ?? defaultLookup(query.id, columnsOf(query.id)) });
      }}>
        {GRID_COLUMN_TYPES.map((type) => <option key={type} value={type} disabled={type === "lookup" && lookupQueries.length === 0 && column.inputType !== "lookup"}
          title={type === "lookup" && lookupQueries.length === 0 ? "Önce bir okuma sorgusu ekleyin." : undefined}>{typeLabels[type]}</option>)}
      </select></label>
    </div>
    {column.inputType === "lookup" && <>
      <LookupColumnFields column={column} index={index} lookupQueries={lookupQueries} columnsOf={columnsOf} disabled={disabled} onChange={(lookup) => onChange({ ...column, lookup })}/>
      <div className="pd-field">Seçenek koşulu<small>Her seçenek satırı için değerlendirilir; <code>satir.&lt;sütun&gt;</code> seçenek satırıdır (ör. <code>satir.isActive == true</code>). Yanlışsa seçenek gizlenir; seçili değer yine görünür.</small>
        <ConditionBuilder key={`optionsWhen:${column.code}`} prop="optionsWhen" value={optionsWhen} pageNames={[...pageNames, "satir"]} disabled={disabled}
          paths={optionPaths} onChange={onOptionsWhen}/>
      </div>
      <ColumnStaticOptions value={staticOptions} index={index} disabled={disabled} onChange={onStaticOptions}/>
    </>}
    <div className="pd-field-row">
      <label className="pd-check"><input type="checkbox" checked={column.rules.required} onChange={(event) => setRule({ required: event.target.checked })}/>Zorunlu</label>
      <label className="pd-check"><input type="checkbox" checked={column.rules.unique} onChange={(event) => setRule({ unique: event.target.checked })}/>Benzersiz</label>
      {column.inputType === "text" && <label className="pd-check"><input type="checkbox" checked={column.rules.upperCase} onChange={(event) => setRule({ upperCase: event.target.checked })}/>Büyük harf</label>}
      <label className="pd-check"><input type="checkbox" checked={column.rules.readOnly} onChange={(event) => setRule({ readOnly: event.target.checked })}/>Salt okunur</label>
    </div>
    {column.inputType === "text" && <NumberRule label="En fazla karakter" value={column.rules.maxLength} min={1} integer
      onChange={(value) => setRule({ maxLength: value === undefined ? undefined : Math.max(1, Math.min(MAX_GRID_TEXT_LENGTH, value)) })}/>}
    {column.inputType === "number" && <div className="pd-field-row">
      <NumberRule label="En az" value={column.rules.min} onChange={(value) => setRule({ min: value })}/>
      <NumberRule label="En fazla" value={column.rules.max} onChange={(value) => setRule({ max: value })}/>
      <NumberRule label="Adım" value={column.rules.step} onChange={(value) => setRule({ step: value !== undefined && value > 0 ? value : undefined })}/>
    </div>}
  </fieldset>;
}

/**
 * Düzenlenebilir tablo müfettişi: kip, kaynak sorgu ve satır anahtarı (stage), sütunlar (stage/list), satır sınırları,
 * düğme ve sabit satır metinleri, varyant önekleri (matrix). `onPatch` undefined değeri siler.
 * `sourceColumns`: stage kipinde kaynak sorgunun sütunları; `listParameter`: tabloyu {{ad.satirlar}} ile bağlayan liste parametresi.
 * Seçim sütunlarının seçenek koşulu ve sabit seçenekleri ızgaranın `columnOptionsWhen` / `columnStaticOptions` özelliklerindedir
 * ("<sütun>=<koşul>", "<sütun>=<değer>=<Etiket>"); sütun yeniden adlanınca ya da silinince birlikte taşınır / kalkar.
 */
export function EditableGridFields({ name, props, readQueries, sourceColumns, listParameter, suggestions, disabled, onPatch, columnsOf = () => [], pageNames = [] }: {
  name: string | undefined; props: Record<string, unknown>; readQueries: { id: string; name: string }[];
  sourceColumns: { code: string; label?: string; dataType?: string }[];
  listParameter: { query: string; spec: ErpOperationParameter } | null;
  suggestions: BindingSuggestion[]; disabled?: boolean; onPatch: (patch: Patch) => void;
  /** Seçim sütunu sorgusunun sütunları (önizleme ya da katalog). */
  columnsOf?: (queryId: string) => QueryColumn[];
  /** Seçenek koşulunun kök adları (sayfadaki adlı bileşenler ve sorgular). */
  pageNames?: string[];
}) {
  const mode: GridMode = props.gridMode === "stage" || props.gridMode === "matrix" ? props.gridMode : "list";
  const rawColumns = Array.isArray(props.gridColumns) ? props.gridColumns.filter((item): item is string => typeof item === "string") : [];
  const items = listParameter?.spec.items ?? [];
  const options: CodeOption[] = mode === "stage"
    ? sourceColumns.filter((column) => isValidCode(column.code)).map((column) => ({ code: column.code, label: column.label || column.code, type: typeFor(column.dataType), map: false }))
    : items.map((item) => ({ code: item.code, label: item.label || item.code, type: typeFor(item.dataType), map: item.dataType === "map" }));
  const text = (key: string) => typeof props[key] === "string" ? props[key] as string : "";
  const writeColumns = (next: string[], extra: Patch = {}) => onPatch({ gridColumns: next.length > 0 ? next.slice(0, MAX_GRID_COLUMNS) : undefined, ...extra });
  const entryList = (key: "columnOptionsWhen" | "columnStaticOptions") => Array.isArray(props[key]) ? (props[key] as unknown[]).filter((item): item is string => typeof item === "string") : [];
  /** Bir sütunun ayar girdilerini değiştirir (`values` boşsa sütunun girdileri kalkar); diğer sütunlarınkiler korunur. */
  const setEntries = (key: "columnOptionsWhen" | "columnStaticOptions", code: string, values: string[]) => {
    const others = entryList(key).filter((item) => item.slice(0, item.indexOf("=")) !== code);
    const next = [...others, ...values.map((value) => `${code}=${value}`)];
    onPatch({ [key]: next.length > 0 ? next : undefined });
  };
  const setMode = (next: GridMode) => {
    if (next === mode) return;
    const patch: Patch = { gridMode: next };
    for (const key of forbiddenByMode[next]) patch[key] = undefined;
    onPatch(patch);
  };
  const addColumn = () => {
    const used = new Set(rawColumns.map((item) => item.split("|")[0].toLowerCase()));
    const option = options.find((item) => !item.map && !used.has(item.code.toLowerCase()));
    let code = option?.code;
    if (!code) { let number = rawColumns.length + 1; while (used.has(`alan${number}`)) number++; code = `alan${number}`; }
    const column: GridColumn = { code, label: cleanLabel(option?.label ?? code) || code, inputType: option?.type ?? "text", rules: { required: false, unique: false, upperCase: false, readOnly: false } };
    writeColumns([...rawColumns, gridColumnText(column)]);
  };
  const missingItems = mode === "list" && listParameter ? rawColumns.map((raw) => parseGridColumn(raw)).flatMap((parsed) => {
    if (!parsed.ok) return [];
    const root = gridColumnRoot(parsed.column.code);
    const item = items.find((entry) => entry.code === root);
    return !item || (parsed.column.code.includes(".") && item.dataType !== "map") ? [parsed.column.code] : [];
  }) : [];
  const matrixMissing = mode === "matrix" && listParameter ? ["code", "name", "attributes"].filter((code) => !items.some((item) => item.code === code)) : [];
  const maxRows = typeof props.maxRows === "number" ? props.maxRows : undefined;
  const minRows = typeof props.minRows === "number" ? props.minRows : undefined;
  return <>
    {!name && <small className="pd-query-warning">Düzenlenebilir tablonun adı olmalıdır.</small>}
    <div className="pd-field">Kip<small>{gridModeHelp[mode]}</small>
      <div className="pd-segment" role="group" aria-label="Tablo kipi">
        {(Object.keys(gridModeLabels) as GridMode[]).map((item) => <button type="button" key={item} aria-pressed={mode === item} className={mode === item ? "active" : ""}
          disabled={disabled} onClick={() => setMode(item)}>{gridModeLabels[item]}</button>)}
      </div>
    </div>
    {mode === "stage" && <>
      <label className="pd-field">Kaynak sorgu<small>Mevcut satırları veren okuma sorgusu (ör. stok kartının birimleri).</small>
        <select value={text("sourceQuery")} disabled={disabled} onChange={(event) => onPatch({ sourceQuery: event.target.value || undefined })}>
          <option value="">Okuma sorgusu seçin</option>
          {readQueries.map((query) => <option key={query.id} value={query.id}>{query.name}</option>)}
        </select>
        {!text("sourceQuery") && <small className="pd-query-warning">Kayda kadar beklet kipinde kaynak sorgu gerekir.</small>}
      </label>
      <label className="pd-field">Satır anahtarı<small>Kaynak satırını tanımlayan sütun; boşsa <code>id</code>.</small>
        {sourceColumns.length > 0 ? <select value={text("rowKey")} disabled={disabled} onChange={(event) => onPatch({ rowKey: event.target.value || undefined })}>
          <option value="">id (varsayılan)</option>
          {sourceColumns.map((column) => <option key={column.code} value={column.code}>{column.label || column.code}</option>)}
          {text("rowKey") && !sourceColumns.some((column) => column.code === text("rowKey")) && <option value={text("rowKey")}>{text("rowKey")}</option>}
        </select>
          : <input value={text("rowKey")} maxLength={128} spellCheck={false} disabled={disabled} placeholder="id" onChange={(event) => onPatch({ rowKey: event.target.value.trim() || undefined })}/>}
      </label>
    </>}
    {mode !== "matrix" && <div className="pd-field">Sütunlar<small>{mode === "stage" ? "Kodlar kaynak sorgunun sütunlarından seçilir." : "Kodlar bağlı liste parametresinin alanlarından seçilir; eşlem alanında (ör. attributes) özellik adını yazın."}</small>
      {mode === "list" && !listParameter && <small className="pd-query-muted">Tablo henüz bir liste parametresine bağlı değil; bağlayınca alanlar burada listelenir.</small>}
      {missingItems.map((code) => <small key={code} className="pd-query-warning">{`'${name ?? ""}' tablosunun '${code}' sütunu '${listParameter?.spec.name ?? ""}' parametresinin alanlarında yok.`}</small>)}
      {rawColumns.length === 0 && <small className="pd-query-warning">En az bir sütun ekleyin.</small>}
      <div className="pd-tabs-editor">
        {rawColumns.map((raw, index) => {
          const parsed = parseGridColumn(raw);
          const remove = () => writeColumns(rawColumns.filter((_, i) => i !== index), parsed.ok ? { ...renamedColumnEntries(props, parsed.column.code, null), ...renamedTotals(props, parsed.column.code, null) } : {});
          if (!parsed.ok) return <fieldset className="pd-tabs-editor-tab" key={index} disabled={disabled}>
            <div className="pd-tabs-editor-head"><code>{raw}</code><button type="button" className="pd-icon-button danger" aria-label={`Sütun ${index + 1} sil`} onClick={remove}><Trash2 size={12}/></button></div>
            <small className="pd-query-warning">{parsed.error}</small>
          </fieldset>;
          const taken = rawColumns.filter((_, i) => i !== index).map((item) => item.split("|")[0].toLowerCase());
          const code = parsed.column.code;
          return <ColumnEditor key={index} column={parsed.column} index={index} options={options} takenCodes={taken} disabled={disabled} onRemove={remove}
            lookupQueries={readQueries} columnsOf={columnsOf} pageNames={pageNames} suggestions={suggestions}
            optionsWhen={columnEntries(props.columnOptionsWhen).find((entry) => entry.code === code)?.rest || undefined}
            staticOptions={columnEntries(props.columnStaticOptions).filter((entry) => entry.code === code).map((entry) => entry.rest)}
            onOptionsWhen={(next) => setEntries("columnOptionsWhen", code, next ? [next] : [])}
            onStaticOptions={(next) => setEntries("columnStaticOptions", code, next)}
            onChange={(column) => {
              // Kod değişince ya da sütun seçim türünden çıkınca ızgaranın sütun ayarları da taşınır / kalkar.
              const entries = column.code !== code ? renamedColumnEntries(props, code, column.inputType === "lookup" ? column.code : null)
                : column.inputType !== "lookup" ? renamedColumnEntries(props, code, null) : {};
              // Alt toplam yalnız sayı sütununda kalır; kod değişince taşınır.
              const totals = renamedTotals(props, code, column.inputType === "number" ? column.code : null);
              writeColumns(rawColumns.map((item, i) => i === index ? gridColumnText(column) : item), { ...entries, ...totals });
            }}/>;
        })}
      </div>
      <button type="button" className="pd-button small" disabled={disabled || rawColumns.length >= MAX_GRID_COLUMNS} onClick={addColumn}
        title={rawColumns.length >= MAX_GRID_COLUMNS ? `En fazla ${MAX_GRID_COLUMNS} sütun olabilir.` : undefined}><Plus size={13}/>Sütun ekle</button>
    </div>}
    {mode !== "matrix" && <GridTotalsField props={props} disabled={disabled} onPatch={onPatch}/>}
    {mode === "matrix" && <>
      {matrixMissing.length > 0 && <small className="pd-query-warning">{`Varyant matrisi için '${listParameter?.spec.name ?? ""}' parametresinde code, name ve attributes alanları olmalıdır.`}</small>}
      <label className="pd-field">Varyant kodu öneki<small>Ör. <code>{"{{kod.value}}"}</code>; değerlerle birleşerek varyant kodunu oluşturur.</small>
        <BindingInput value={text("matrixCode")} maxLength={MAX_BINDABLE} suggestions={suggestions} disabled={disabled} ariaLabel="Varyant kodu öneki"
          placeholder="{{kod.value}}" onChange={(next) => onPatch({ matrixCode: next || undefined })}/></label>
      <label className="pd-field">Varyant adı öneki<small>Ör. <code>{"{{ad.value}}"}</code>.</small>
        <BindingInput value={text("matrixName")} maxLength={MAX_BINDABLE} suggestions={suggestions} disabled={disabled} ariaLabel="Varyant adı öneki"
          placeholder="{{ad.value}}" onChange={(next) => onPatch({ matrixName: next || undefined })}/></label>
      {(!text("matrixCode") || !text("matrixName")) && <small className="pd-query-warning">Varyant tablosu için 'matrixCode' ve 'matrixName' gerekli.</small>}
    </>}
    {mode !== "matrix" && <>
      <label className="pd-field">En fazla satır<small>1–{MAX_GRID_ROWS}; boşsa {DEFAULT_MAX_ROWS}.</small>
        <input type="number" min={1} max={MAX_GRID_ROWS} step={1} value={maxRows ?? ""} disabled={disabled} placeholder={String(DEFAULT_MAX_ROWS)}
          onChange={(event) => {
            const number = Number(event.target.value);
            onPatch({ maxRows: event.target.value === "" || !Number.isInteger(number) ? undefined : Math.max(1, Math.min(MAX_GRID_ROWS, number)) });
          }}/></label>
      <label className="pd-field">En az satır<small>0–{MAX_MIN_ROWS}; tabloyu bağlayan kayıt daha az satırla “En az n kalem girin.” uyarısıyla engellenir. Boşsa sınır yok.</small>
        <input type="number" min={0} max={MAX_MIN_ROWS} step={1} value={minRows ?? ""} disabled={disabled} placeholder="0" aria-label="En az satır"
          onChange={(event) => {
            const number = Number(event.target.value);
            onPatch({ minRows: event.target.value === "" || !Number.isInteger(number) ? undefined : Math.max(0, Math.min(MAX_MIN_ROWS, number)) });
          }}/>
        {minRows !== undefined && maxRows !== undefined && minRows > maxRows && <small className="pd-query-warning">En az satır en fazla satırdan büyük olamaz.</small>}</label>
      <label className="pd-field">Sabit ilk satır<small>Tüm sütunlara yayılan, silinemeyen salt okunur satır (ör. temel birim).</small>
        <BindingInput value={text("fixedRowLabel")} maxLength={MAX_BINDABLE} suggestions={suggestions} disabled={disabled} ariaLabel="Sabit ilk satır"
          placeholder="Temel birim: {{kart.rows[0].unitCode}}" onChange={(next) => onPatch({ fixedRowLabel: next || undefined })}/></label>
    </>}
    <label className="pd-field">Ekleme düğmesi metni<small>Boşsa “Satır ekle”.</small>
      <input value={text("addLabel")} maxLength={MAX_ADD_LABEL} disabled={disabled} placeholder="Satır ekle"
        onChange={(event) => onPatch({ addLabel: sanitizeSafeValue(event.target.value, false).slice(0, MAX_ADD_LABEL) || undefined })}/></label>
  </>;
}

/** Alt toplam satırı (`totals`): seçilen sayı sütunlarının toplamı tablonun altında gösterilir ve {{<tablo>.toplam.<kod>}} olarak bağlanır. */
function GridTotalsField({ props, disabled, onPatch }: { props: Patch; disabled?: boolean; onPatch: (patch: Patch) => void }) {
  const numbers = parseGridColumns(props.gridColumns).filter((column) => column.inputType === "number");
  const selected = gridTotalCodes(props);
  const toggle = (code: string, on: boolean) => {
    // Sütun sırası korunur; sayı sütunu olmayan eski girdiler yazılırken düşer.
    const next = numbers.map((column) => column.code).filter((item) => item === code ? on : selected.includes(item));
    onPatch({ totals: next.length > 0 ? next : undefined });
  };
  return <div className="pd-field">Alt toplam<small>Seçilen sayı sütunlarının toplamı tablonun altında gösterilir; <code>{"{{tablo.toplam.kod}}"}</code> olarak bağlanır (ör. borç = alacak koşulu).</small>
    {numbers.length === 0 ? <small className="pd-query-muted">Tabloda sayı sütunu yok.</small>
      : numbers.map((column) => <label key={column.code} className="pd-check"><input type="checkbox" checked={selected.includes(column.code)} disabled={disabled}
        aria-label={`${column.code} alt toplamı`} onChange={(event) => toggle(column.code, event.target.checked)}/>{column.label || column.code} <code>{column.code}</code></label>)}
  </div>;
}
