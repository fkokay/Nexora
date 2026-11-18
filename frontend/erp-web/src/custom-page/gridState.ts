// Saf (React'siz) düzenlenebilir tablo (`editableGrid`) durumu: sütun tanımları, satır taslakları, doğrulama ve kapsam.
import { makeVariantDrafts } from "../inventory/variantDrafts";
import { validateInputValue, type InputRules } from "./inputValidation";
import { displayText } from "./pageBindings";

// ---- Sütun tanımları (gridColumns) ----
// Studio page-designer/gridColumns.ts bu bölümle aynıdır (erp-web/src/custom-page/gridState.ts ile aynıdır;
// biri değişirse diğeri de güncellenmelidir). Sunucu ile ortak vektörler: gridColumns.vectors.json.
//
// Biçim: "<kod>|<Etiket>|<tür>[|<kurallar>]". Katı okuma: parçalar ve kural belirteçleri kırpılmaz; boş dördüncü parça,
// boş belirteç, bilinmeyen belirteç ya da yanlış türdeki kural geçersizdir. Aynı kural iki kez yazılırsa sonuncusu geçerlidir.

export type GridInputType = "text" | "number" | "date" | "checkbox";
export type GridColumnRules = { required: boolean; unique: boolean; upperCase: boolean; readOnly: boolean; maxLength?: number; min?: number; max?: number; step?: number };
export type GridColumn = { code: string; label: string; inputType: GridInputType; rules: GridColumnRules };

const COLUMN_CODE = /^[A-Za-z_][A-Za-z0-9_]{0,63}(\.[\p{L}\p{N}_ -]{1,40})?$/u;
const INPUT_TYPES: readonly string[] = ["text", "number", "date", "checkbox"];
const RULE_NUMBER = /^-?\d+(\.\d+)?$/;
const RULE_INTEGER = /^\d+$/;
export const MAX_GRID_COLUMNS = 12;
const MAX_LABEL = 60;

/** Sütun kodunun kökü: "attributes.Renk" → "attributes". */
export function gridColumnRoot(code: string): string {
  const dot = code.indexOf(".");
  return dot < 0 ? code : code.slice(0, dot);
}

export function parseGridColumn(text: string): { ok: true; column: GridColumn } | { ok: false; error: string } {
  const fail = (reason: string) => ({ ok: false as const, error: `Sütun tanımı geçersiz (${reason}): ${text}` });
  if (typeof text !== "string") return fail("metin değil");
  const parts = text.split("|");
  if (parts.length < 3 || parts.length > 4) return fail("biçim kod|Etiket|tür[|kurallar] olmalı");
  const [code, label, type, ruleText] = parts;
  if (!COLUMN_CODE.test(code)) return fail("kod");
  if (label.length < 1 || label.length > MAX_LABEL || label.trim() === "") return fail("etiket 1-60 karakter olmalı");
  if (!INPUT_TYPES.includes(type)) return fail("tür text, number, date ya da checkbox olmalı");
  const inputType = type as GridInputType;
  const rules: GridColumnRules = { required: false, unique: false, upperCase: false, readOnly: false };
  if (ruleText !== undefined) {
    for (const token of ruleText.split(",")) {
      const colon = token.indexOf(":");
      const name = colon < 0 ? token : token.slice(0, colon);
      const argument = colon < 0 ? null : token.slice(colon + 1);
      if (argument === null && (name === "required" || name === "unique" || name === "readOnly")) { rules[name] = true; continue; }
      if (argument === null && name === "upperCase") {
        if (inputType !== "text") return fail("upperCase yalnız text sütununda");
        rules.upperCase = true;
        continue;
      }
      if (argument !== null && name === "maxLength") {
        if (inputType !== "text") return fail("maxLength yalnız text sütununda");
        if (!RULE_INTEGER.test(argument)) return fail("maxLength tamsayı olmalı");
        const value = Number(argument);
        if (value < 1 || value > 4000) return fail("maxLength 1-4000 olmalı");
        rules.maxLength = value;
        continue;
      }
      if (argument !== null && (name === "min" || name === "max" || name === "step")) {
        if (inputType !== "number") return fail(`${name} yalnız number sütununda`);
        if (!RULE_NUMBER.test(argument)) return fail(`${name} sayı olmalı`);
        const value = Number(argument);
        if (name === "step" && !(value > 0)) return fail("step sıfırdan büyük olmalı");
        rules[name] = value;
        continue;
      }
      return fail(`bilinmeyen kural '${token}'`);
    }
  }
  if (rules.min !== undefined && rules.max !== undefined && rules.min > rules.max) return fail("min max'tan büyük olamaz");
  return { ok: true, column: { code, label, inputType, rules } };
}

/** `gridColumns` özelliğini okur: metin olmayan ve geçersiz girdiler atlanır, en fazla 12 sütun. */
export function parseGridColumns(value: unknown): GridColumn[] {
  if (!Array.isArray(value)) return [];
  const columns: GridColumn[] = [];
  for (const item of value) {
    if (columns.length >= MAX_GRID_COLUMNS) break;
    if (typeof item !== "string") continue;
    const parsed = parseGridColumn(item);
    if (parsed.ok) columns.push(parsed.column);
  }
  return columns;
}

// ---- Satır durumu ----

export type GridMode = "stage" | "list" | "matrix";
export type GridDraft = { key: string; cells: Record<string, string | boolean> };
/**
 * `stage`: `added` yeni satırlar, `removed` silinmek üzere işaretlenen kaynak satır anahtarları (`rows` kullanılmaz).
 * `list`/`matrix`: `rows` tüm satırlar (`added`/`removed` kullanılmaz). `sourceKey` kaynak sorgunun `ranWith` anahtarıdır.
 */
export type GridState = { added: GridDraft[]; removed: string[]; rows: GridDraft[]; sourceKey: string | null; nextKey: number };
export type GridAction =
  | { type: "add" } | { type: "edit"; key: string; code: string; value: string | boolean } | { type: "remove"; key: string }
  | { type: "undoRemove"; key: string }
  /**
   * Farklı `sourceKey`: bekleyen değişiklikler temizlenir. Aynı `sourceKey` ve `sourceKeys` verilmişse (yenilenen kaynak):
   * yalnız artık kaynakta olmayan silme işaretleri düşer, yeni satırlar kalır. Aynı `sourceKey` ve `sourceKeys` yoksa
   * açık sıfırlamadır (İşlem Çubuğu Yeni): her şey temizlenir. `list`/`matrix` kiplerinde satırlar her zaman temizlenir.
   */
  | { type: "reset"; sourceKey: string | null; sourceKeys?: string[] }
  | { type: "commit"; list: "eklenenSatir" | "silinenSatir"; keys: string[] };
export type GridOptions = { mode: GridMode; maxRows: number };

export const GRID_UNIQUE = "Bu değer başka bir satırda da var.";
export const gridMaxRowsMessage = (n: number) => `En fazla ${n} satır eklenebilir.`;
/** Varyant kipinde en fazla özellik (boyut) satırı. */
export const MATRIX_MAX_ROWS = 10;
const ROW_KEY_PREFIX = "yeni-";

export const MATRIX_DIMENSION_COLUMNS: GridColumn[] = [
  { code: "name", label: "Özellik adı", inputType: "text", rules: { required: true, unique: false, upperCase: false, readOnly: false, maxLength: 40 } },
  { code: "values", label: "Değerler", inputType: "text", rules: { required: true, unique: false, upperCase: false, readOnly: false } },
];

export function emptyGridState(sourceKey: string | null = null): GridState {
  return { added: [], removed: [], rows: [], sourceKey, nextKey: 1 };
}

const rowLimit = (opts: GridOptions) => (opts.mode === "matrix" ? Math.min(opts.maxRows, MATRIX_MAX_ROWS) : opts.maxRows);
const editableRows = (mode: string, state: GridState) => (mode === "stage" ? state.added : state.rows);

/** Satır ekleme sınırdaysa gösterilecek ileti, değilse null. */
export function addBlockedMessage(state: GridState, opts: GridOptions): string | null {
  const limit = rowLimit(opts);
  return editableRows(opts.mode, state).length >= limit ? gridMaxRowsMessage(limit) : null;
}

export function gridReducer(state: GridState, action: GridAction, opts: GridOptions): GridState {
  const stage = opts.mode === "stage";
  const field = stage ? "added" : "rows";
  const drafts = state[field];
  switch (action.type) {
    case "add": {
      if (addBlockedMessage(state, opts) !== null) return state;
      const draft: GridDraft = { key: `${ROW_KEY_PREFIX}${state.nextKey}`, cells: {} };
      return { ...state, [field]: [...drafts, draft], nextKey: state.nextKey + 1 };
    }
    case "edit": {
      const index = drafts.findIndex((draft) => draft.key === action.key);
      if (index < 0) return state; // kaynak satırlar salt okunur
      const next = drafts.slice();
      next[index] = { key: drafts[index].key, cells: { ...drafts[index].cells, [action.code]: action.value } };
      return { ...state, [field]: next };
    }
    case "remove": {
      if (drafts.some((draft) => draft.key === action.key)) return { ...state, [field]: drafts.filter((draft) => draft.key !== action.key) };
      if (!stage || state.removed.includes(action.key)) return state;
      return { ...state, removed: [...state.removed, action.key] };
    }
    case "undoRemove":
      return state.removed.includes(action.key) ? { ...state, removed: state.removed.filter((key) => key !== action.key) } : state;
    case "reset": {
      if (stage && action.sourceKey === state.sourceKey && action.sourceKeys) {
        const existing = new Set(action.sourceKeys);
        const removed = state.removed.filter((key) => existing.has(key));
        return removed.length === state.removed.length ? state : { ...state, removed };
      }
      return { ...state, added: [], removed: [], rows: [], sourceKey: action.sourceKey };
    }
    case "commit": {
      const keys = new Set(action.keys);
      if (!stage) return state;
      if (action.list === "eklenenSatir") return { ...state, added: state.added.filter((draft) => !keys.has(draft.key)) };
      return { ...state, removed: state.removed.filter((key) => !keys.has(key)) };
    }
    default:
      return state;
  }
}

// ---- Değerler ----

const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const DATE_TEXT = /^\d{4}-\d{2}-\d{2}$/;

function columnsFor(mode: string, columns: GridColumn[]): GridColumn[] {
  return mode === "matrix" ? MATRIX_DIMENSION_COLUMNS : columns;
}

/** Hücrenin yazıldığı ham metin/değer; `upperCase` uygulanır. */
function cellRaw(column: GridColumn, draft: GridDraft): string | boolean {
  const raw = draft.cells[column.code];
  if (column.inputType === "checkbox") return raw === true || raw === "true";
  const text = typeof raw === "string" ? raw : raw === undefined ? "" : String(raw);
  return column.rules.upperCase ? text.toUpperCase() : text;
}

/** Tel biçimindeki hücre değeri; boş hücre undefined. */
function cellWire(column: GridColumn, draft: GridDraft): string | number | boolean | undefined {
  const raw = draft.cells[column.code];
  if (raw === undefined) return undefined;
  if (column.inputType === "checkbox") return raw === true || raw === "true";
  const text = String(cellRaw(column, draft)).trim();
  if (text === "") return undefined;
  if (column.inputType === "number") {
    const value = Number(text);
    return Number.isFinite(value) ? value : undefined;
  }
  if (column.inputType === "date") {
    const value = text.slice(0, 10);
    return DATE_TEXT.test(value) ? value : undefined;
  }
  return text;
}

/** Taslağı tel biçimine çevirir: boş hücreler atlanır, "a.b" sütunları `{ a: { b: "<metin>" } }` eşlemine yazılır. */
function wireRow(columns: GridColumn[], draft: GridDraft): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const column of columns) {
    const value = cellWire(column, draft);
    if (value === undefined) continue;
    const dot = column.code.indexOf(".");
    const root = dot < 0 ? column.code : column.code.slice(0, dot);
    if (UNSAFE_KEYS.has(root)) continue;
    if (dot < 0) { row[root] = value; continue; }
    const key = column.code.slice(dot + 1);
    if (UNSAFE_KEYS.has(key)) continue;
    const map = isRecord(row[root]) ? row[root] as Record<string, unknown> : {};
    // Eşlem öğeleri yalnız metin değer taşır (sunucu ve koşturucu eşlemi metin değerli okur).
    map[key] = String(value);
    row[root] = map;
  }
  return row;
}

/** Kaynak satırdaki sütun değeri: önce düz "a.b" anahtarı, sonra iç içe nesne. */
function sourceValue(row: Record<string, unknown>, code: string): unknown {
  if (Object.prototype.hasOwnProperty.call(row, code)) return row[code];
  const dot = code.indexOf(".");
  if (dot < 0) return undefined;
  const nested = row[code.slice(0, dot)];
  const key = code.slice(dot + 1);
  return isRecord(nested) && Object.prototype.hasOwnProperty.call(nested, key) ? nested[key] : undefined;
}

const rowKeyOf = (row: Record<string, unknown>, rowKey: string) => displayText(row[rowKey]);
const uniqueText = (value: unknown) => displayText(value).trim().toUpperCase();

/** Kaynakta hâlâ bulunan silme işaretli satırlar (kaynak sırasıyla). */
function removedSourceRows(state: GridState, sourceRows: Record<string, unknown>[], rowKey: string): Record<string, unknown>[] {
  const removed = new Set(state.removed);
  return sourceRows.filter((row) => removed.has(rowKeyOf(row, rowKey)));
}

function keptSourceRows(state: GridState, sourceRows: Record<string, unknown>[], rowKey: string): Record<string, unknown>[] {
  const removed = new Set(state.removed);
  return sourceRows.filter((row) => !removed.has(rowKeyOf(row, rowKey)));
}

function inputRulesOf(column: GridColumn): InputRules {
  const rules: InputRules = { required: column.rules.required, upperCase: column.rules.upperCase };
  if (column.rules.maxLength !== undefined) rules.maxLength = column.rules.maxLength;
  if (column.rules.min !== undefined) rules.min = column.rules.min;
  if (column.rules.max !== undefined) rules.max = column.rules.max;
  if (column.rules.step !== undefined) rules.step = column.rules.step;
  return rules;
}

/**
 * Hücre iletileri: satır anahtarı → sütun kodu → ileti (Faz A giriş iletileri, `unique`). `maxRows` verilir ve düzenlenebilir
 * satır sayısı onu aşarsa tablo düzeyi ileti `[""][""]` anahtarındadır (sınırda dolu tablo geçerlidir). Salt okunur
 * sütunlar ve kaynak satırlar doğrulanmaz; `unique` silinmeyen kaynak satırlarla ve `fixedValues` (sabit satır) değerleriyle de
 * karşılaştırılır (büyük/küçük harf duyarsız).
 */
export function validateGrid(mode: string, columns: GridColumn[], state: GridState, sourceRows: Record<string, unknown>[], rowKey: string,
  maxRows?: number, fixedValues?: Record<string, string[]>): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {};
  const set = (key: string, code: string, message: string) => { (result[key] ??= {})[code] = message; };
  const drafts = editableRows(mode, state);
  const kept = mode === "stage" ? keptSourceRows(state, sourceRows, rowKey) : [];
  for (const column of columnsFor(mode, columns)) {
    if (column.rules.readOnly) continue;
    const rules = inputRulesOf(column);
    for (const draft of drafts) {
      const message = validateInputValue(column.inputType, rules, cellRaw(column, draft));
      if (message !== null) set(draft.key, column.code, message);
    }
    if (!column.rules.unique || column.inputType === "checkbox") continue;
    const counts = new Map<string, number>();
    const add = (text: string) => { if (text !== "") counts.set(text, (counts.get(text) ?? 0) + 1); };
    for (const row of kept) add(uniqueText(sourceValue(row, column.code)));
    // Sabit satır (ör. ana birim) da tablonun bir satırıdır: aynı değer yeni satırda tekrarlanamaz.
    for (const value of fixedValues?.[column.code] ?? []) add(uniqueText(value));
    for (const draft of drafts) add(uniqueText(cellRaw(column, draft)));
    for (const draft of drafts) {
      const text = uniqueText(cellRaw(column, draft));
      if (text !== "" && (counts.get(text) ?? 0) > 1 && !result[draft.key]?.[column.code]) set(draft.key, column.code, GRID_UNIQUE);
    }
  }
  if (maxRows !== undefined) {
    const limit = mode === "matrix" ? Math.min(maxRows, MATRIX_MAX_ROWS) : maxRows;
    if (drafts.length > limit) set("", "", gridMaxRowsMessage(limit));
  }
  return result;
}

/**
 * Tablonun sayfa kapsamı. `stage`: `satirlar` = silinmeyen kaynak satırlar + yeni satırlar (tel biçiminde).
 * `list`: `satirlar` satırların tel biçimi. `matrix`: `satirlar` = makeVariantDrafts(matrix.code, matrix.name, boyutlar).
 * `eklenenler`/`silinenler` yalnız `stage` kipinde doludur; `list`/`matrix` satır varsa `degisti` olur.
 */
export function gridScope(mode: string, columns: GridColumn[], state: GridState, sourceRows: Record<string, unknown>[], rowKey: string,
  matrix?: { code: string; name: string }): { satirlar: unknown[]; eklenenler: Record<string, unknown>[]; silinenler: Record<string, unknown>[]; eklenenSayisi: number; silinenSayisi: number; degisti: boolean } {
  if (mode === "stage") {
    const eklenenler = state.added.map((draft) => wireRow(columns, draft));
    const silinenler = removedSourceRows(state, sourceRows, rowKey);
    return {
      satirlar: [...keptSourceRows(state, sourceRows, rowKey), ...eklenenler], eklenenler, silinenler,
      eklenenSayisi: eklenenler.length, silinenSayisi: silinenler.length, degisti: eklenenler.length + silinenler.length > 0,
    };
  }
  const satirlar = mode === "matrix"
    ? makeVariantDrafts(matrix?.code ?? "", matrix?.name ?? "", state.rows.map((draft) => ({
      name: String(cellRaw(MATRIX_DIMENSION_COLUMNS[0], draft)), values: String(cellRaw(MATRIX_DIMENSION_COLUMNS[1], draft)),
    })))
    : state.rows.map((draft) => wireRow(columns, draft));
  return { satirlar, eklenenler: [], silinenler: [], eklenenSayisi: 0, silinenSayisi: 0, degisti: state.rows.length > 0 };
}

/** Yinelenen dizi adımının satırları: yeni satırlar tel biçiminde ya da kaynakta hâlâ bulunan silinecek kaynak satırlar. */
export function iterationRows(list: "eklenenSatir" | "silinenSatir", columns: GridColumn[], state: GridState, sourceRows: Record<string, unknown>[],
  rowKey: string): { key: string; row: Record<string, unknown> }[] {
  if (list === "eklenenSatir") return state.added.map((draft) => ({ key: draft.key, row: wireRow(columns, draft) }));
  return removedSourceRows(state, sourceRows, rowKey).map((row) => ({ key: rowKeyOf(row, rowKey), row }));
}

const LABEL_BINDING = /\{\{\s*([^{}]+?)\s*\}\}/g;
/**
 * `fixedRowLabel` bağlamalarından sabit satırın sütun değerleri (büyük/küçük harf duyarsız): son yol parçası sütun kodu ya da `base` + sütun kodu olan bağlama (ör. `kart.rows[0].unitCode`, `birimler.meta.baseUnitCode`
 * → `unitCode`) o sütunun değeridir. Şemada yapısal sabit satır değeri olmadığından bu bir sezgidir.
 */
export function fixedRowValues(label: string, columns: GridColumn[], resolve: (path: string) => unknown): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const match of label.matchAll(LABEL_BINDING)) {
    const path = match[1];
    const last = path.split(/[.[\]]/).filter(Boolean).pop()?.toLowerCase() ?? "";
    for (const column of columns) {
      const code = column.code.toLowerCase();
      if (!column.rules.unique || (last !== code && last !== `base${code}`)) continue;
      const text = displayText(resolve(path));
      if (text.trim() !== "") (result[column.code] ??= []).push(text);
    }
  }
  return result;
}
