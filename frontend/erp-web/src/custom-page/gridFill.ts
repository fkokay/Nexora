// Listeli (`list`) düzenlenebilir tablonun genel motor ekleri:
// - E1 sorgudan doldurma: `fillQuery`, `fillColumns` ({ tabloSütunu: sorguSütunu }; "seçimSütunu@label" anahtarı doldurulan
//   seçim hücresinin görünen metni), `skipWhenZero` (sayı sütunu);
// - E2 seçimle doldurma: `lookupFills` ({ seçimSütunu: { tabloSütunu: seçenekSütunu } }; kullanıcının yazdığı değer ezilmez);
// - E3 formül sütunları: `formulas` ({ sayıSütunu: ifade }, bkz. gridFormula.ts); formüller döngüsüz olarak birbirine başvurabilir;
// - `rowNumberColumn` (salt okunur sayı sütunu): gönderilen (skipWhenZero dışında kalmayan) satırlar sırayla 1..n;
// - `lockColumnsWhen` (["sütun1,sütun2=koşul"], `satir` tablonun satırı): koşul tutarken sütunlar salt okunur ve boştur, satırla
//   gönderilmez (ör. bedelsiz satırın fiyat hücreleri); koşul tutmaz olunca doldurmanın yazdığı değer (`filled`) geri gelir.
// Hesaplanan (`calc`) sütunlar önizlemeden gelir: hiçbir doldurmanın hedefi değildir.
// Sunucu kuralları TenantCustomPageSchema.GridEngine.cs içindedir; `stage` ve `matrix` kiplerinde bu özellikler yoktur.
import { displayText } from "./pageBindings";
import { emptyGridState, gridReducer, wireRow, type GridAction, type GridColumn, type GridDraft, type GridOptions, type GridState } from "./gridState";
import { evaluateFormula, formulaCellNumber, formulaOrder, parseFormula, type FormulaNode } from "./gridFormula";
import { evaluateCondition, parseCondition, type ConditionNode } from "./conditions";

export type GridFormula = { code: string; node: FormulaNode };
/** `lockColumnsWhen` kuralı: koşul (`satir` = tablonun satırı) tutarken kilitlenen sütunlar. */
export type GridLock = { columns: string[]; node: ConditionNode };
export type GridEngine = {
  /** Doldurma sorgusunun kimliği (yoksa ""). */
  fillQuery: string;
  /** Tablo sütunu → sorgu sütunu (yazılmayan sütun aynı kodlu sorgu sütunundan kopyalanır). */
  fillColumns: Record<string, string>;
  /** Seçim sütunu → doldurulan hücrenin görünen metninin sorgu sütunu (`fillColumns` "kod@label" anahtarları). */
  fillLabels: Record<string, string>;
  /** Boş ya da 0 iken satırın `satirlar`, `satirSayisi`, doğrulama ve `minRows` dışında kaldığı sayı sütunu (yoksa ""). */
  skipWhenZero: string;
  /** Seçim sütunu → (tablo sütunu → seçenek sütunu). */
  lookupFills: Record<string, Record<string, string>>;
  /** Formül sütunları (hesap sırasıyla: başvurulan formül önce). */
  formulas: GridFormula[];
  /** Gönderilen satırların sıra numarasını (1..n) alan sayı sütunu (yoksa ""). */
  rowNumberColumn: string;
  /** Satır koşuluyla kilitlenen sütunlar (`lockColumnsWhen`). */
  locks: GridLock[];
  /** Kilit koşulunun okuduğu satırın sütunları (tel biçimi; kilit yoksa boş). */
  lockRowColumns: GridColumn[];
};

const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const DATE_TEXT = /^\d{4}-\d{2}-\d{2}/;
const LABEL_SUFFIX = "@label";

export const EMPTY_GRID_ENGINE: GridEngine = { fillQuery: "", fillColumns: {}, fillLabels: {}, skipWhenZero: "", lookupFills: {}, formulas: [], rowNumberColumn: "",
  locks: [], lockRowColumns: [] };

/** Metin değerli düz eşlem (güvensiz anahtarlar ve metin olmayan değerler atlanır). */
function textMap(value: unknown): Record<string, string> {
  const result: Record<string, string> = {};
  if (!isRecord(value)) return result;
  for (const [key, item] of Object.entries(value)) if (!UNSAFE_KEYS.has(key) && typeof item === "string" && item !== "") result[key] = item;
  return result;
}

/**
 * Izgaranın motor özelliklerini okur (yalnız `list` kipinde; diğer kiplerde boş). Tabloda olmayan sütunlara yazılan girdiler,
 * seçim sütunu olmayan `lookupFills` anahtarları ve geçersiz formüller atlanır (sunucu bunları zaten reddeder).
 */
export function parseGridEngine(props: Record<string, unknown>, columns: GridColumn[], mode: string): GridEngine {
  if (mode !== "list") return EMPTY_GRID_ENGINE;
  const byCode = new Map(columns.map((column) => [column.code, column]));
  const fillQuery = typeof props.fillQuery === "string" ? props.fillQuery.trim() : "";
  const fillMap = Object.entries(textMap(props.fillColumns));
  const fillColumns = Object.fromEntries(fillMap.filter(([code]) => byCode.get(code) !== undefined && byCode.get(code)!.inputType !== "calc"));
  const fillLabels = Object.fromEntries(fillMap.filter(([code]) => code.endsWith(LABEL_SUFFIX) && byCode.get(code.slice(0, -LABEL_SUFFIX.length))?.inputType === "lookup")
    .map(([code, source]) => [code.slice(0, -LABEL_SUFFIX.length), source]));
  const skip = typeof props.skipWhenZero === "string" && byCode.get(props.skipWhenZero)?.inputType === "number" ? props.skipWhenZero : "";
  const lookupFills: Record<string, Record<string, string>> = {};
  if (isRecord(props.lookupFills)) {
    for (const [code, targets] of Object.entries(props.lookupFills)) {
      if (UNSAFE_KEYS.has(code) || byCode.get(code)?.inputType !== "lookup") continue;
      const map = Object.fromEntries(Object.entries(textMap(targets)).filter(([target]) => byCode.has(target) && target !== code && byCode.get(target)!.inputType !== "calc"));
      if (Object.keys(map).length > 0) lookupFills[code] = map;
    }
  }
  const rowNumber = typeof props.rowNumberColumn === "string" && byCode.get(props.rowNumberColumn)?.inputType === "number" ? props.rowNumberColumn : "";
  const formulaTexts = textMap(props.formulas);
  // Formül, kendisi ve sıra numarası sütunu dışındaki sayı sütunlarına başvurabilir; döngüdeki formüller atlanır.
  const parsedFormulas = new Map<string, { node: FormulaNode; refs: string[] }>();
  for (const column of columns) {
    if (column.inputType !== "number" || column.code === rowNumber || !(column.code in formulaTexts)) continue;
    const operands = new Set(columns.filter((item) => item.inputType === "number" && item.code !== column.code && item.code !== rowNumber).map((item) => item.code));
    const parsed = parseFormula(formulaTexts[column.code], operands);
    if (parsed.ok) parsedFormulas.set(column.code, parsed);
  }
  const { order } = formulaOrder(Object.fromEntries([...parsedFormulas].map(([code, parsed]) => [code, parsed.refs])));
  const formulas: GridFormula[] = order.map((code) => ({ code, node: parsedFormulas.get(code)!.node }));
  const locks = parseLocks(props.lockColumnsWhen, columns);
  return { fillQuery, fillColumns, fillLabels, skipWhenZero: skip, lookupFills, formulas, rowNumberColumn: rowNumber, locks,
    lockRowColumns: locks.length > 0 ? columns.filter((column) => column.inputType !== "calc") : [] };
}

/** `lockColumnsWhen` öğeleri ("sütun1,sütun2=koşul", ilk "=" ayırır); tabloda olmayan ya da hesaplanan sütunlar ve geçersiz koşullar atlanır. */
function parseLocks(value: unknown, columns: GridColumn[]): GridLock[] {
  if (!Array.isArray(value)) return [];
  const lockable = new Set(columns.filter((column) => column.inputType !== "calc").map((column) => column.code));
  const locks: GridLock[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const at = item.indexOf("=");
    if (at <= 0) continue;
    const codes = [...new Set(item.slice(0, at).split(",").filter((code) => lockable.has(code)))];
    const parsed = parseCondition(item.slice(at + 1));
    if (codes.length > 0 && parsed.ok) locks.push({ columns: codes, node: parsed.node });
  }
  return locks;
}

const NO_LOCKS: ReadonlySet<string> = new Set();

/** Satırda şu an kilitli sütunlar: koşulu tutan kuralların sütunları (`satir` satırın tel biçimidir). */
export function lockedColumns(engine: GridEngine, draft: GridDraft): ReadonlySet<string> {
  if (engine.locks.length === 0) return NO_LOCKS;
  const scope = { satir: wireRow(engine.lockRowColumns, draft) };
  const locked = new Set<string>();
  for (const lock of engine.locks) if (evaluateCondition(lock.node, scope)) for (const code of lock.columns) locked.add(code);
  return locked.size > 0 ? locked : NO_LOCKS;
}

/** Kilitli hücreler silinir (doldurma değeri `filled`'da kalır). Değişen yoksa aynı taslak. */
function clearLocked(draft: GridDraft, locked: ReadonlySet<string>): GridDraft {
  if (locked.size === 0 || ![...locked].some((code) => code in draft.cells)) return draft;
  const cells = { ...draft.cells };
  for (const code of locked) delete cells[code];
  return { ...draft, cells };
}

/**
 * Satırın kilit, formül ve yeniden kilit adımları: kilidi kalkan (önceki taslakta kilitli, şimdi değil) boş hücreye doldurmanın
 * değeri geri yazılır, kilitli hücreler silinir, formüller hesaplanır ve kilitli formül sütunları da boşaltılır.
 */
function computeRow(engine: GridEngine, previous: GridDraft | undefined, draft: GridDraft): GridDraft {
  if (engine.locks.length === 0) return applyFormulas(engine, draft);
  const locked = lockedColumns(engine, draft);
  let next = draft;
  if (previous && draft.filled) {
    const before = lockedColumns(engine, previous);
    let cells: Record<string, string | boolean> | null = null;
    for (const code of before) {
      if (locked.has(code) || draft.filled[code] === undefined) continue;
      const current = draft.cells[code];
      if (current !== undefined && String(current).trim() !== "") continue;
      cells ??= { ...draft.cells };
      cells[code] = draft.filled[code];
    }
    if (cells) next = { ...draft, cells };
  }
  return clearLocked(applyFormulas(engine, clearLocked(next, locked)), locked);
}

/** Formül ve sıra numarası sütunları salt okunurdur (çizimde ve doğrulamada). */
export function withFormulaColumns(columns: GridColumn[], engine: GridEngine): GridColumn[] {
  if (engine.formulas.length === 0 && !engine.rowNumberColumn) return columns;
  const codes = new Set(engine.formulas.map((formula) => formula.code));
  if (engine.rowNumberColumn) codes.add(engine.rowNumberColumn);
  return columns.map((column) => (codes.has(column.code) ? { ...column, rules: { ...column.rules, readOnly: true } } : column));
}

/** Satırdaki değer: önce düz "a.b" anahtarı (düzleştirilmiş alan), sonra iç içe nesne yolu (her derinlikte). */
function rowValue(row: Record<string, unknown>, code: string): unknown {
  if (Object.prototype.hasOwnProperty.call(row, code)) return row[code];
  if (!code.includes(".")) return undefined;
  let current: unknown = row;
  for (const part of code.split(".")) {
    if (UNSAFE_KEYS.has(part) || !isRecord(current) || !Object.prototype.hasOwnProperty.call(current, part)) return undefined;
    current = current[part];
  }
  return current;
}

/**
 * Sorgu ya da seçenek değerinin hücre değeri: onay kutusunda bool, tarihte "yyyy-aa-gg", diğerlerinde metin. null/undefined
 * (ve nesne/dizi) undefined: hücreye yazılmaz.
 */
export function cellValueOf(column: GridColumn, value: unknown): string | boolean | undefined {
  if (value === null || value === undefined || typeof value === "object") return undefined;
  if (column.inputType === "checkbox") return value === true || value === "true";
  if (column.inputType === "date") {
    const text = String(value);
    return DATE_TEXT.test(text) ? text.slice(0, 10) : text;
  }
  if (column.inputType === "number" && typeof value === "number") return Number.isFinite(value) ? String(value) : undefined;
  return displayText(value);
}

/**
 * Bir kaynak satırdan doldurulan hücreler: `fillColumns` eşlemi, yoksa aynı kodlu sütun. Formül sütunları hesaplanır;
 * hesaplanan (`calc`) sütunlar önizlemeden gelir, doldurulmaz.
 */
export function fillCells(columns: GridColumn[], engine: GridEngine, row: Record<string, unknown>): Record<string, string | boolean> {
  const formulaCodes = new Set(engine.formulas.map((formula) => formula.code));
  if (engine.rowNumberColumn) formulaCodes.add(engine.rowNumberColumn);
  const cells: Record<string, string | boolean> = {};
  for (const column of columns) {
    if (formulaCodes.has(column.code) || column.inputType === "calc") continue;
    const value = cellValueOf(column, rowValue(row, engine.fillColumns[column.code] ?? column.code));
    if (value !== undefined) cells[column.code] = value;
  }
  return cells;
}

/** Doldurulan seçim hücrelerinin görünen metni (`fillColumns` "kod@label"); boş metin yazılmaz. */
export function fillLabelsOf(engine: GridEngine, row: Record<string, unknown>, cells: Record<string, string | boolean>): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const [code, source] of Object.entries(engine.fillLabels)) {
    if (cells[code] === undefined) continue;
    const value = rowValue(row, source);
    const text = value === null || value === undefined || typeof value === "object" ? "" : displayText(value);
    if (text !== "") labels[code] = text;
  }
  return labels;
}

/**
 * Seçilen seçenek satırından aynı satırın üzerine yazılacak hücreler (`lookupFills`); seçeneğin boş değeri hücreyi boşaltır.
 * Taslak verilirse kullanıcının yazdığı değer ezilmez: hedef yalnız boşsa ya da hâlâ önceki doldurmanın yazdığı değeri
 * taşıyorsa yazılır (ör. stok değişince eski stokun fiyatı yenilenir, elle yazılan fiyat kalır).
 */
export function lookupFillCells(columns: GridColumn[], engine: GridEngine, lookupCode: string, option: Record<string, unknown> | null,
  draft?: GridDraft): Record<string, string | boolean> {
  const targets = engine.lookupFills[lookupCode];
  if (!targets || !option) return {};
  const byCode = new Map(columns.map((column) => [column.code, column]));
  const cells: Record<string, string | boolean> = {};
  for (const [target, source] of Object.entries(targets)) {
    const column = byCode.get(target);
    if (!column) continue;
    if (draft) {
      const current = draft.cells[target];
      const typed = current !== undefined && current !== false && String(current).trim() !== "";
      if (typed && current !== draft.filled?.[target]) continue;
    }
    cells[target] = cellValueOf(column, rowValue(option, source)) ?? (column.inputType === "checkbox" ? false : "");
  }
  return cells;
}

/**
 * Taslağın formül hücrelerini bağımlılık sırasıyla hesaplar: her ara sonuç 2 ondalığa yuvarlanıp yazıldıktan sonra sonraki
 * formüllerce okunur (ör. toplam = yuvarlanmış net + yuvarlanmış KDV). Değişen yoksa aynı taslak döner.
 */
export function applyFormulas(engine: GridEngine, draft: GridDraft): GridDraft {
  if (engine.formulas.length === 0) return draft;
  let cells: Record<string, string | boolean> | null = null;
  for (const formula of engine.formulas) {
    const current = cells ?? draft.cells;
    const text = String(evaluateFormula(formula.node, (code) => formulaCellNumber(current[code])));
    if (draft.cells[formula.code] === text) continue;
    cells ??= { ...draft.cells };
    cells[formula.code] = text;
  }
  return cells ? { ...draft, cells } : draft;
}

/**
 * Doldurma anahtarı ve kaynak satırlarından tablo durumu: kaynak satır başına bir düzenlenebilir taslak. Doldurulan hücreler
 * `filled` olarak işaretlenir: kullanıcı değiştirmedikçe seçimle doldurma (`lookupFills`) onları yenileyebilir.
 */
export function filledGridState(columns: GridColumn[], engine: GridEngine, fillKey: string, rows: Record<string, unknown>[]): GridState {
  const drafts = rows.map((row, index): GridDraft => {
    const cells = fillCells(columns, engine, row);
    const labels = fillLabelsOf(engine, row, cells);
    const draft: GridDraft = { key: `dolu-${index + 1}`, cells, ...(Object.keys(labels).length > 0 ? { labels } : {}), ...(Object.keys(cells).length > 0 ? { filled: { ...cells } } : {}) };
    return computeRow(engine, undefined, draft);
  });
  return { ...emptyGridState(null), rows: numberRows(engine, drafts), fillKey };
}

/** `rowNumberColumn`: sayılan satırlar görüntü sırasıyla 1..n alır; atlanan satırın hücresi boştur. Değişen yoksa aynı dizi. */
export function numberRows(engine: GridEngine, rows: GridDraft[]): GridDraft[] {
  const code = engine.rowNumberColumn;
  if (!code) return rows;
  let n = 0;
  let changed = false;
  const next = rows.map((draft) => {
    const text = isSkippedRow(engine, draft) ? null : String(++n);
    if (text === null ? !(code in draft.cells) : draft.cells[code] === text) return draft;
    changed = true;
    const cells = { ...draft.cells };
    if (text === null) delete cells[code]; else cells[code] = text;
    return { ...draft, cells };
  });
  return changed ? next : rows;
}

export type GridEngineAction = GridAction
  /** Seçim hücresinde seçenek seçildi: hücre ve `lookupFills` hücreleri tek adımda yazılır (seçim etiketleri düşer, doldurulan değerler `filled`'da). */
  | { type: "pick"; key: string; code: string; value: string; label?: string; fills: Record<string, string | boolean> };

/** `gridReducer` + seçimle doldurma + formüllerin yeniden hesabı. `reset` doldurma anahtarını da atar. */
export function gridEngineReducer(state: GridState, action: GridEngineAction, opts: GridOptions, engine: GridEngine): GridState {
  let next: GridState;
  if (action.type === "pick") {
    next = gridReducer(state, { type: "edit", key: action.key, code: action.code, value: action.value, label: action.label }, opts);
    if (Object.keys(action.fills).length > 0) {
      const field = opts.mode === "stage" ? "added" : "rows";
      next = { ...next, [field]: next[field].map((draft) => {
        if (draft.key !== action.key) return draft;
        const labels = { ...draft.labels };
        for (const code of Object.keys(action.fills)) delete labels[code];
        const filled = { ...draft.filled, ...action.fills };
        return { key: draft.key, cells: { ...draft.cells, ...action.fills }, ...(Object.keys(labels).length > 0 ? { labels } : {}), filled };
      }) };
    }
  } else {
    next = gridReducer(state, action, opts);
    if (action.type === "reset" && next.fillKey !== undefined) {
      const { fillKey: _dropped, ...rest } = next;
      next = rest;
    }
  }
  if ((engine.formulas.length === 0 && !engine.rowNumberColumn && engine.locks.length === 0) || opts.mode === "stage") return next;
  let changed = false;
  const before = engine.locks.length > 0 ? new Map(state.rows.map((draft) => [draft.key, draft])) : null;
  const computed = next.rows.map((draft) => {
    const result = computeRow(engine, before?.get(draft.key), draft);
    if (result !== draft) changed = true;
    return result;
  });
  const rows = numberRows(engine, computed);
  return changed || rows !== computed ? { ...next, rows } : next;
}

/** Kilitli (boş, salt okunur) hücrelerin doğrulama iletileri düşer (ör. bedelsiz satırın zorunlu fiyatı). Değişen yoksa aynı nesne. */
export function withoutLockedErrors(engine: GridEngine, state: GridState, errors: Record<string, Record<string, string>>): Record<string, Record<string, string>> {
  if (engine.locks.length === 0) return errors;
  let result: Record<string, Record<string, string>> | null = null;
  for (const draft of state.rows) {
    const cells = errors[draft.key];
    if (!cells) continue;
    const locked = lockedColumns(engine, draft);
    if (!Object.keys(cells).some((code) => locked.has(code))) continue;
    result ??= { ...errors };
    const kept = Object.fromEntries(Object.entries(cells).filter(([code]) => !locked.has(code)));
    if (Object.keys(kept).length > 0) result[draft.key] = kept; else delete result[draft.key];
  }
  return result ?? errors;
}

/** `skipWhenZero` sütunu boş ya da 0 olan satır sayılmaz. */
export function isSkippedRow(engine: GridEngine, draft: GridDraft): boolean {
  if (!engine.skipWhenZero) return false;
  return formulaCellNumber(draft.cells[engine.skipWhenZero]) === 0;
}

/** Sayılan satırlar: `satirlar`, `satirSayisi`, doğrulama ve `minRows` bu durumla hesaplanır (çizim tüm satırları gösterir). */
export function countedGridState(engine: GridEngine, state: GridState): GridState {
  if (!engine.skipWhenZero || !state.rows.some((draft) => isSkippedRow(engine, draft))) return state;
  return { ...state, rows: state.rows.filter((draft) => !isSkippedRow(engine, draft)) };
}

/** Seçenek satırı: `lookupCandidates` satırları; sabit seçeneklerin satırı yoktur (null ya da boş). */
export function optionRowOf(row: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  return row && Object.keys(row).length > 0 ? row : null;
}
