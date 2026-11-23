// Düzenlenebilir tablonun kaynaklı satır ayarları (Studio): başlangıç satırları (`initialRowsQuery` + `initialRowsMap`),
// boş satırı kayıtta atlama (`skipRowsWhenEmpty`) ve seçimin diğer hücreleri doldurması (`lookupFill`).
// Biçimler sunucu şemasıyla ve erp-web çalışma zamanıyla aynıdır:
// - initialRowsMap (1–16, yalnız initialRowsQuery ile): "<hücreKodu>=<kaynakAlanı>"; harita yoksa her sütun kendi adındaki
//   alandan dolar, harita varsa haritada olmayan sütunlar boş başlar. Her hücre bir kez.
// - lookupFill (1–16, matrix dışı): "<seçimSütunu>:<hedefSütun>=<seçenekAlanı>"; bir seçim sütunu için her hedef bir kez.
// - skipRowsWhenEmpty (yalnız list): calc / checkbox olmayan sütun kodu; bu hücresi boş ya da 0 olan satırlar kayda gönderilmez.
// calc sütunu bu üç ayarın hiçbirinde hedef olamaz.
import { LOOKUP_COLUMN, parseGridColumns, type GridColumn } from "./gridColumns";

export const MAX_INITIAL_ROWS_MAP = 16;
export const MAX_LOOKUP_FILL = 16;

export type RowsMapEntry = { cell: string; field: string };
export type LookupFillEntry = { lookup: string; target: string; field: string };

const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

/** "<hücre>=<alan>": hücre ilk "=" işaretine kadardır; alan noktalı yol olabilir. Bozuksa null. */
export function parseRowsMapEntry(text: unknown): RowsMapEntry | null {
  if (typeof text !== "string") return null;
  const index = text.indexOf("=");
  if (index < 1) return null;
  const cell = text.slice(0, index);
  const field = text.slice(index + 1);
  return LOOKUP_COLUMN.test(field) ? { cell, field } : null;
}

/** "<seçim>:<hedef>=<alan>": seçim ilk ":" işaretine, hedef ilk "=" işaretine kadardır. Bozuksa null. */
export function parseLookupFillEntry(text: unknown): LookupFillEntry | null {
  if (typeof text !== "string") return null;
  const colon = text.indexOf(":");
  const equals = text.indexOf("=");
  if (colon < 1 || equals < colon + 2) return null;
  const lookup = text.slice(0, colon);
  const target = text.slice(colon + 1, equals);
  const field = text.slice(equals + 1);
  if (lookup === target || !LOOKUP_COLUMN.test(field)) return null;
  return { lookup, target, field };
}

export const rowsMapText = (entry: RowsMapEntry) => `${entry.cell}=${entry.field}`;
export const lookupFillText = (entry: LookupFillEntry) => `${entry.lookup}:${entry.target}=${entry.field}`;

export const rowsMapEntries = (value: unknown) => strings(value).map(parseRowsMapEntry).filter((entry): entry is RowsMapEntry => entry !== null);
export const lookupFillEntries = (value: unknown) => strings(value).map(parseLookupFillEntry).filter((entry): entry is LookupFillEntry => entry !== null);

/** Kullanıcının girdiği hücreler: hesaplanan sütunlar hiçbir zaman doldurulmaz ve kayda gitmez. */
export const editableColumns = (columns: GridColumn[]) => columns.filter((column) => column.inputType !== "calc");
/** Boş satır atlama sütunu olabilecekler: hesaplanan ve onay kutusu sütunları dışındakiler. */
export const skippableColumns = (columns: GridColumn[]) => columns.filter((column) => column.inputType !== "calc" && column.inputType !== "checkbox");

/** Haritanın öğesi bir hücreyi doldurabilir mi: ızgaranın hesaplanan olmayan sütunu. */
/** "<sütun>" düzenlenebilir bir sütun ya da "<seçimSütunu>@label" (yüklenen seçim hücresinin görünen metni) olmalıdır. */
const LABEL_SUFFIX = "@label";
const mapCellOk = (cell: string, editable: ReadonlySet<string>, lookups: ReadonlySet<string>) =>
  cell.endsWith(LABEL_SUFFIX) ? lookups.has(cell.slice(0, -LABEL_SUFFIX.length)) : editable.has(cell);

/**
 * Sütun yeniden adlanınca (`next` kod) ya da silinince / uygun olmaktan çıkınca (`next` null) üç ayarın yeni değeri;
 * değişmeyen ayar dönmez. `nextIsLookup`: yeni sütun hâlâ seçim sütunu mu (lookupFill kaynağı olarak kalır mı).
 */
export function renamedRowSources(props: Record<string, unknown>, from: string, next: string | null, nextIsLookup: boolean): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const map = strings(props.initialRowsMap);
  if (map.some((item) => parseRowsMapEntry(item)?.cell === from)) {
    const mapped = map.flatMap((item) => {
      const entry = parseRowsMapEntry(item);
      if (entry?.cell !== from) return [item];
      return next === null ? [] : [rowsMapText({ ...entry, cell: next })];
    });
    patch.initialRowsMap = mapped.length > 0 ? mapped : undefined;
  }
  if (props.skipRowsWhenEmpty === from) patch.skipRowsWhenEmpty = next ?? undefined;
  const fill = strings(props.lookupFill);
  if (fill.some((item) => { const entry = parseLookupFillEntry(item); return entry?.lookup === from || entry?.target === from; })) {
    const mapped = fill.flatMap((item) => {
      const entry = parseLookupFillEntry(item);
      if (!entry || (entry.lookup !== from && entry.target !== from)) return [item];
      if (next === null || (entry.lookup === from && !nextIsLookup)) return [];
      const moved = { ...entry, lookup: entry.lookup === from ? next : entry.lookup, target: entry.target === from ? next : entry.target };
      return moved.lookup === moved.target ? [] : [lookupFillText(moved)];
    });
    patch.lookupFill = mapped.length > 0 ? mapped : undefined;
  }
  return patch;
}

/**
 * Uzlaştırma: kipine ve sütunlarına uymayan kaynaklı satır ayarlarını atar (geçerli değerlere dokunmaz).
 * `readIds`: sayfadaki okuma sorgularının kimlikleri. Değişiklik yoksa null.
 */
export function cleanRowSources(props: Record<string, unknown>, readIds: ReadonlySet<string>): Record<string, unknown> | null {
  const next = { ...props };
  let touched = false;
  const drop = (key: string) => { if (key in next) { delete next[key]; touched = true; } };
  const mode = props.gridMode === "stage" || props.gridMode === "matrix" ? props.gridMode : "list";
  if (mode !== "list" || !(typeof next.initialRowsQuery === "string" && readIds.has(next.initialRowsQuery))) { drop("initialRowsQuery"); drop("initialRowsMap"); }
  if (mode !== "list") drop("skipRowsWhenEmpty");
  if (mode === "matrix") drop("lookupFill");
  const columns = parseGridColumns(props.gridColumns);
  const editable = new Set(editableColumns(columns).map((column) => column.code));
  const skippable = new Set(skippableColumns(columns).map((column) => column.code));
  const lookups = new Set(columns.filter((column) => column.inputType === "lookup").map((column) => column.code));
  if ("initialRowsMap" in next) {
    const raw = Array.isArray(next.initialRowsMap) ? next.initialRowsMap as unknown[] : [];
    const seen = new Set<string>();
    const kept = raw.filter((item): item is string => {
      const entry = parseRowsMapEntry(item);
      if (!entry || !mapCellOk(entry.cell, editable, lookups) || seen.has(entry.cell)) return false;
      seen.add(entry.cell);
      return true;
    }).slice(0, MAX_INITIAL_ROWS_MAP);
    if (!sameStrings(raw, kept)) { if (kept.length > 0) next.initialRowsMap = kept; else delete next.initialRowsMap; touched = true; }
  }
  if ("skipRowsWhenEmpty" in next && !(typeof next.skipRowsWhenEmpty === "string" && skippable.has(next.skipRowsWhenEmpty))) drop("skipRowsWhenEmpty");
  if ("lookupFill" in next) {
    const raw = Array.isArray(next.lookupFill) ? next.lookupFill as unknown[] : [];
    const seen = new Set<string>();
    const kept = raw.filter((item): item is string => {
      const entry = parseLookupFillEntry(item);
      if (!entry || !lookups.has(entry.lookup) || !editable.has(entry.target) || seen.has(`${entry.lookup}:${entry.target}`)) return false;
      seen.add(`${entry.lookup}:${entry.target}`);
      return true;
    }).slice(0, MAX_LOOKUP_FILL);
    if (!sameStrings(raw, kept)) { if (kept.length > 0) next.lookupFill = kept; else delete next.lookupFill; touched = true; }
  }
  return touched ? next : null;
}

const sameStrings = (a: unknown[], b: string[]) => a.length === b.length && a.every((item, index) => item === b[index]);

/** Kayıt sorunu (sunucu da reddeder): hesaplanan sütunun sorgusu sayfadaki bir okuma sorgusu olmalıdır. Sorun yoksa null. */
export function calcColumnProblem(props: Record<string, unknown>, readIds: ReadonlySet<string>): string | null {
  for (const column of parseGridColumns(props.gridColumns))
    if (column.calc && !readIds.has(column.calc.query)) return `'${column.code}' hesaplanan sütununun sorgusu sayfadaki bir okuma sorgusu olmalıdır: ${column.calc.query}`;
  return null;
}
