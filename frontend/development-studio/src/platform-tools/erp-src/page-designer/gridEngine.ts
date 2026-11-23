// Listeli düzenlenebilir tablonun motor özellikleri (erp-web custom-page/gridFill.ts, sunucu TenantCustomPageSchema.GridEngine.cs):
// `fillQuery`, `fillColumns` ({ tabloSütunu: sorguSütunu }), `skipWhenZero`, `lookupFills` ({ seçimSütunu: { tabloSütunu: seçenekSütunu } })
// ve `formulas` ({ sayıSütunu: ifade }). Yalnız `list` kipinde geçerlidir.
import { formulaOrder, parseFormula } from "./gridFormula";
import { parseGridColumns } from "./gridColumns";

export const GRID_ENGINE_PROPS = ["fillQuery", "fillColumns", "skipWhenZero", "lookupFills", "formulas", "rowNumberColumn"] as const;
export type StringMap = Record<string, string>;

const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** Metin değerli düz eşlem (metin olmayan değerler ve güvensiz anahtarlar atlanır). */
export function stringMap(value: unknown): StringMap {
  const result: StringMap = {};
  if (!isRecord(value)) return result;
  for (const [key, item] of Object.entries(value)) if (!UNSAFE_KEYS.has(key) && typeof item === "string") result[key] = item;
  return result;
}

/** `lookupFills`: seçim sütunu → (tablo sütunu → seçenek sütunu). */
export function lookupFillsOf(value: unknown): Record<string, StringMap> {
  const result: Record<string, StringMap> = {};
  if (!isRecord(value)) return result;
  for (const [key, item] of Object.entries(value)) if (!UNSAFE_KEYS.has(key)) result[key] = stringMap(item);
  return result;
}

/** Boş eşlem yazılmaz (özellik silinir). */
const orUndefined = <T extends object>(map: T): T | undefined => (Object.keys(map).length > 0 ? map : undefined);

/** Eşlemde anahtar ya da değer olarak geçen `from` sütun kodunu `next` ile değiştirir (null: girdi kalkar). */
function renameKey(map: StringMap, from: string, next: string | null): StringMap {
  const result: StringMap = {};
  for (const [key, value] of Object.entries(map)) {
    if (key !== from) result[key] = value;
    else if (next !== null) result[next] = value;
  }
  return result;
}

/** Formül metnindeki sütun kodunu (tam sözcük) değiştirir. */
function renameInFormula(text: string, from: string, next: string): string {
  return text.replace(/[A-Za-z_][A-Za-z0-9_]*/g, (word) => (word === from ? next : word));
}

/**
 * Sütun yeniden adlanınca (`next` kod) ya da silinince / türü değişince (`next` null) motor özelliklerini taşır ya da kaldırır.
 * `keepNumber`: sütun hâlâ sayı sütunu mu (formül ve skipWhenZero için); `keepLookup`: hâlâ seçim sütunu mu (lookupFills anahtarı).
 * Değişiklik yoksa boş yama döner.
 */
export function renamedEngineProps(props: Record<string, unknown>, from: string, next: string | null, keepNumber = next !== null,
  keepLookup = next !== null): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const fillColumns = stringMap(props.fillColumns);
  if (from in fillColumns) patch.fillColumns = orUndefined(renameKey(fillColumns, from, next));
  if (props.skipWhenZero === from) patch.skipWhenZero = keepNumber && next !== null ? next : undefined;
  if (props.rowNumberColumn === from) patch.rowNumberColumn = keepNumber && next !== null ? next : undefined;
  const formulas = stringMap(props.formulas);
  const usesColumn = Object.values(formulas).some((text) => renameInFormula(text, from, "\u0000") !== text);
  if (from in formulas || usesColumn) {
    const mapped: StringMap = {};
    for (const [key, text] of Object.entries(formulas)) {
      const code = key === from ? (keepNumber ? next : null) : key;
      if (code === null) continue;
      // Silinen sütuna başvuran formül sunucuda reddedilir; metin korunur, uyarı müfettişte görünür.
      mapped[code] = next !== null && keepNumber ? renameInFormula(text, from, next) : text;
    }
    patch.formulas = orUndefined(mapped);
  }
  const fills = lookupFillsOf(props.lookupFills);
  if (Object.keys(fills).length > 0) {
    let changed = false;
    const mapped: Record<string, StringMap> = {};
    for (const [key, targets] of Object.entries(fills)) {
      const code = key === from ? (keepLookup ? next : null) : key;
      if (code !== key) changed = true;
      if (code === null) continue;
      const renamed = from in targets ? renameKey(targets, from, next) : targets;
      if (renamed !== targets) changed = true;
      if (Object.keys(renamed).length > 0) mapped[code] = renamed; else changed = true;
    }
    if (changed) patch.lookupFills = orUndefined(mapped);
  }
  return patch;
}

/** Kip `list` değilken motor özellikleri silinir (sunucu kuralı). */
export function engineResetPatch(): Record<string, undefined> {
  return Object.fromEntries(GRID_ENGINE_PROPS.map((key) => [key, undefined]));
}

/** Formül sütunu kodları (tablonun sayı sütunlarından formülü olanlar). */
export function formulaCodes(props: Record<string, unknown>): Set<string> {
  const numbers = new Set(parseGridColumns(props.gridColumns).filter((column) => column.inputType === "number").map((column) => column.code));
  return new Set(Object.keys(stringMap(props.formulas)).filter((code) => numbers.has(code)));
}

/**
 * Formülün sorunu (yoksa null): kendisi ve sıra numarası sütunu dışındaki sayı sütunlarına (diğer formüller dahil) başvurabilir;
 * formüller döngü oluşturamaz (sunucu kuralı).
 */
export function formulaProblem(props: Record<string, unknown>, code: string, text: string): string | null {
  const numbers = parseGridColumns(props.gridColumns).filter((column) => column.inputType === "number").map((column) => column.code);
  const rowNumber = typeof props.rowNumberColumn === "string" ? props.rowNumberColumn : "";
  const operandsFor = (target: string) => new Set(numbers.filter((item) => item !== target && item !== rowNumber));
  const parsed = parseFormula(text, operandsFor(code));
  if (!parsed.ok) return parsed.error;
  const refs: Record<string, string[]> = {};
  for (const [other, otherText] of Object.entries({ ...stringMap(props.formulas), [code]: text })) {
    if (!numbers.includes(other)) continue;
    const result = other === code ? parsed : parseFormula(otherText, operandsFor(other));
    if (result.ok) refs[other] = result.refs;
  }
  return formulaOrder(refs).cyclic.includes(code) ? "Formül geçersiz (formüller arasında döngü var)" : null;
}
