// Listeli (`list`) düzenlenebilir tablonun genel motor ekleri:
// - E1 sorgudan doldurma: `fillQuery`, `fillColumns` ({ tabloSütunu: sorguSütunu }), `skipWhenZero` (sayı sütunu);
// - E2 seçimle doldurma: `lookupFills` ({ seçimSütunu: { tabloSütunu: seçenekSütunu } });
// - E3 formül sütunları: `formulas` ({ sayıSütunu: ifade }, bkz. gridFormula.ts); formüller döngüsüz olarak birbirine başvurabilir;
// - `rowNumberColumn` (salt okunur sayı sütunu): gönderilen (skipWhenZero dışında kalmayan) satırlar sırayla 1..n.
// Sunucu kuralları TenantCustomPageSchema.cs ValidateGridEngineProps içindedir; `stage` ve `matrix` kiplerinde bu özellikler yoktur.
import { displayText } from "./pageBindings";
import { emptyGridState, gridReducer, type GridAction, type GridColumn, type GridDraft, type GridOptions, type GridState } from "./gridState";
import { evaluateFormula, formulaCellNumber, formulaOrder, parseFormula, type FormulaNode } from "./gridFormula";

export type GridFormula = { code: string; node: FormulaNode };
export type GridEngine = {
  /** Doldurma sorgusunun kimliği (yoksa ""). */
  fillQuery: string;
  /** Tablo sütunu → sorgu sütunu (yazılmayan sütun aynı kodlu sorgu sütunundan kopyalanır). */
  fillColumns: Record<string, string>;
  /** Boş ya da 0 iken satırın `satirlar`, `satirSayisi`, doğrulama ve `minRows` dışında kaldığı sayı sütunu (yoksa ""). */
  skipWhenZero: string;
  /** Seçim sütunu → (tablo sütunu → seçenek sütunu). */
  lookupFills: Record<string, Record<string, string>>;
  /** Formül sütunları (hesap sırasıyla: başvurulan formül önce). */
  formulas: GridFormula[];
  /** Gönderilen satırların sıra numarasını (1..n) alan sayı sütunu (yoksa ""). */
  rowNumberColumn: string;
};

const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const DATE_TEXT = /^\d{4}-\d{2}-\d{2}/;

export const EMPTY_GRID_ENGINE: GridEngine = { fillQuery: "", fillColumns: {}, skipWhenZero: "", lookupFills: {}, formulas: [], rowNumberColumn: "" };

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
  const fillColumns = Object.fromEntries(Object.entries(textMap(props.fillColumns)).filter(([code]) => byCode.has(code)));
  const skip = typeof props.skipWhenZero === "string" && byCode.get(props.skipWhenZero)?.inputType === "number" ? props.skipWhenZero : "";
  const lookupFills: Record<string, Record<string, string>> = {};
  if (isRecord(props.lookupFills)) {
    for (const [code, targets] of Object.entries(props.lookupFills)) {
      if (UNSAFE_KEYS.has(code) || byCode.get(code)?.inputType !== "lookup") continue;
      const map = Object.fromEntries(Object.entries(textMap(targets)).filter(([target]) => byCode.has(target) && target !== code));
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
  return { fillQuery, fillColumns, skipWhenZero: skip, lookupFills, formulas, rowNumberColumn: rowNumber };
}

/** Formül ve sıra numarası sütunları salt okunurdur (çizimde ve doğrulamada). */
export function withFormulaColumns(columns: GridColumn[], engine: GridEngine): GridColumn[] {
  if (engine.formulas.length === 0 && !engine.rowNumberColumn) return columns;
  const codes = new Set(engine.formulas.map((formula) => formula.code));
  if (engine.rowNumberColumn) codes.add(engine.rowNumberColumn);
  return columns.map((column) => (codes.has(column.code) ? { ...column, rules: { ...column.rules, readOnly: true } } : column));
}

/** Satırdaki değer: önce düz "a.b" anahtarı, sonra iç içe nesne. */
function rowValue(row: Record<string, unknown>, code: string): unknown {
  if (Object.prototype.hasOwnProperty.call(row, code)) return row[code];
  const dot = code.indexOf(".");
  if (dot < 0) return undefined;
  const nested = row[code.slice(0, dot)];
  const key = code.slice(dot + 1);
  return isRecord(nested) && Object.prototype.hasOwnProperty.call(nested, key) ? nested[key] : undefined;
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

/** Bir kaynak satırdan doldurulan hücreler: `fillColumns` eşlemi, yoksa aynı kodlu sütun. Formül sütunları hesaplanır. */
export function fillCells(columns: GridColumn[], engine: GridEngine, row: Record<string, unknown>): Record<string, string | boolean> {
  const formulaCodes = new Set(engine.formulas.map((formula) => formula.code));
  if (engine.rowNumberColumn) formulaCodes.add(engine.rowNumberColumn);
  const cells: Record<string, string | boolean> = {};
  for (const column of columns) {
    if (formulaCodes.has(column.code)) continue;
    const value = cellValueOf(column, rowValue(row, engine.fillColumns[column.code] ?? column.code));
    if (value !== undefined) cells[column.code] = value;
  }
  return cells;
}

/** Seçilen seçenek satırından aynı satırın üzerine yazılacak hücreler (`lookupFills`); boş değer hücreyi boşaltır. */
export function lookupFillCells(columns: GridColumn[], engine: GridEngine, lookupCode: string, option: Record<string, unknown> | null): Record<string, string | boolean> {
  const targets = engine.lookupFills[lookupCode];
  if (!targets || !option) return {};
  const byCode = new Map(columns.map((column) => [column.code, column]));
  const cells: Record<string, string | boolean> = {};
  for (const [target, source] of Object.entries(targets)) {
    const column = byCode.get(target);
    if (!column) continue;
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

/** Doldurma anahtarı ve kaynak satırlarından tablo durumu: kaynak satır başına bir düzenlenebilir taslak. */
export function filledGridState(columns: GridColumn[], engine: GridEngine, fillKey: string, rows: Record<string, unknown>[]): GridState {
  const drafts = rows.map((row, index): GridDraft => applyFormulas(engine, { key: `dolu-${index + 1}`, cells: fillCells(columns, engine, row) }));
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
  /** Seçim hücresinde seçenek seçildi: hücre ve `lookupFills` hücreleri tek adımda yazılır (seçim etiketleri düşer). */
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
        return { key: draft.key, cells: { ...draft.cells, ...action.fills }, ...(Object.keys(labels).length > 0 ? { labels } : {}) };
      }) };
    }
  } else {
    next = gridReducer(state, action, opts);
    if (action.type === "reset" && next.fillKey !== undefined) {
      const { fillKey: _dropped, ...rest } = next;
      next = rest;
    }
  }
  if ((engine.formulas.length === 0 && !engine.rowNumberColumn) || opts.mode === "stage") return next;
  let changed = false;
  const computed = next.rows.map((draft) => {
    const result = applyFormulas(engine, draft);
    if (result !== draft) changed = true;
    return result;
  });
  const rows = numberRows(engine, computed);
  return changed || rows !== computed ? { ...next, rows } : next;
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
