// Listeli düzenlenebilir tablonun motor özellikleri (erp-web custom-page/gridFill.ts, sunucu TenantCustomPageSchema.GridEngine.cs):
// `fillQuery`, `fillColumns` ({ tabloSütunu: sorguSütunu }; "seçimSütunu@label" anahtarı doldurulan seçim hücresinin görünen metni),
// `skipWhenZero`, `lookupFills` ({ seçimSütunu: { tabloSütunu: seçenekSütunu } }), `formulas` ({ sayıSütunu: ifade }), `rowNumberColumn`
// ve `lockColumnsWhen` (["sütun1,sütun2=koşul"]; `satir` tablonun satırı). Yalnız `list` kipinde geçerlidir; hesaplanan (`calc`) sütun
// hiçbir doldurmanın hedefi olmaz.
import { parseCondition } from "./conditions";
import { formulaOrder, parseFormula } from "./gridFormula";
import { parseGridColumns } from "./gridColumns";

export const GRID_ENGINE_PROPS = ["fillQuery", "fillColumns", "skipWhenZero", "lookupFills", "formulas", "rowNumberColumn", "lockColumnsWhen"] as const;
/** `lockColumnsWhen` en çok kural sayısı (sunucudaki MaxLockRules). */
export const MAX_LOCK_RULES = 8;
/** `fillColumns` anahtar soneki: seçim sütununun doldurulan görünen metni. */
export const FILL_LABEL_SUFFIX = "@label";
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
  const labelKey = from + FILL_LABEL_SUFFIX;
  if (from in fillColumns || labelKey in fillColumns) {
    let mapped = renameKey(fillColumns, from, next);
    // Görünen metin eşlemi yalnız seçim sütunuyla kalır.
    mapped = renameKey(mapped, labelKey, next !== null && keepLookup ? next + FILL_LABEL_SUFFIX : null);
    patch.fillColumns = orUndefined(mapped);
  }
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
  if (Array.isArray(props.lockColumnsWhen)) {
    const raw = props.lockColumnsWhen.filter((item): item is string => typeof item === "string");
    const mapped = raw.flatMap((text) => {
      const rule = lockRuleOf(text);
      if (!rule) return [text];
      const columns = rule.columns.flatMap((code) => (code !== from ? [code] : next !== null ? [next] : []));
      if (columns.length === 0) return [];
      // Silinen sütuna başvuran koşul sunucuda reddedilir; metin korunur, uyarı müfettişte görünür.
      return [lockRuleText({ columns, condition: next !== null ? renameRowPath(rule.condition, from, next) : rule.condition })];
    });
    if (mapped.length !== raw.length || mapped.some((text, index) => text !== raw[index])) patch.lockColumnsWhen = mapped.length > 0 ? mapped : undefined;
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

// ---- lockColumnsWhen ----

export type LockRule = { columns: string[]; condition: string };

/** "sütun1,sütun2=koşul" (ilk "=" ayırır); biçimsizse null. */
export function lockRuleOf(text: string): LockRule | null {
  const at = text.indexOf("=");
  if (at <= 0 || at === text.length - 1) return null;
  return { columns: text.slice(0, at).split(","), condition: text.slice(at + 1) };
}

export const lockRuleText = (rule: LockRule): string => `${rule.columns.join(",")}=${rule.condition}`;

/** Izgaranın kilit kuralları (metin olmayan öğeler atlanır). */
export function lockRulesOf(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

const QUOTED = /'[^']*'|"[^"]*"/g;
const ROW_PATH = /\bsatir((?:\.[A-Za-z_][A-Za-z0-9_]*)+)/g;
const rootOf = (code: string) => (code.includes(".") ? code.slice(0, code.indexOf(".")) : code);

/** Koşuldaki `satir.<from>` yolunu `satir.<next>` yapar (tırnaklı metinlere dokunmaz). */
function renameRowPath(condition: string, from: string, next: string): string {
  return condition.replace(new RegExp(`${QUOTED.source}|${ROW_PATH.source}`, "g"),
    (match, path?: string) => (path !== undefined && path.slice(1) === from ? `satir.${next}` : match));
}

/**
 * Kilit kuralının sorunu (yoksa null; sunucu kuralı): sütunlar tablonun farklı, hesaplanmayan sütunlarıdır, sıra numarası ya da
 * skipWhenZero sütunu olamaz; koşul yalnız tablonun satırına (`satir.<sütun>`) başvurur ve kuralın kilitlediği sütunu okuyamaz.
 */
export function lockRuleProblem(props: Record<string, unknown>, text: string): string | null {
  const rule = lockRuleOf(text);
  if (!rule) return "'lockColumnsWhen' öğeleri \"sütun1,sütun2=koşul\" biçiminde olmalıdır.";
  const columns = parseGridColumns(props.gridColumns);
  const codes = new Set(columns.map((column) => column.code));
  const calc = new Set(columns.filter((column) => column.inputType === "calc").map((column) => column.code));
  const roots = new Set(columns.map((column) => rootOf(column.code)));
  if (new Set(rule.columns).size !== rule.columns.length) return `'lockColumnsWhen' sütunları farklı sütun kodu olmalıdır: ${rule.columns.join(",")}`;
  for (const code of rule.columns) {
    if (!codes.has(code)) return `'lockColumnsWhen' sütunu ızgarada yok: ${code}`;
    if (calc.has(code)) return `'lockColumnsWhen' hesaplanan (calc) sütunu kilitleyemez: ${code}`;
    if (code === props.rowNumberColumn) return `'lockColumnsWhen' sıra numarası sütununu kilitleyemez: ${code}`;
    if (code === props.skipWhenZero) return `'lockColumnsWhen' 'skipWhenZero' sütununu kilitleyemez: ${code}`;
  }
  const parsed = parseCondition(rule.condition);
  if (!parsed.ok) return `'lockColumnsWhen' koşulu geçersiz: ${parsed.error}`;
  const other = parsed.roots.find((root) => root !== "satir");
  if (other) return `'lockColumnsWhen' koşulu yalnız satırın sütunlarına (satir.<sütun>) başvurabilir: ${other}`;
  for (const match of rule.condition.replace(QUOTED, "''").matchAll(ROW_PATH)) {
    const path = match[1].slice(1);
    const root = rootOf(path);
    if (!codes.has(path) && !roots.has(root)) return `'lockColumnsWhen' koşulu ızgarada olmayan bir sütuna başvuruyor: ${path}`;
    if (calc.has(path)) return `'lockColumnsWhen' koşulu hesaplanan (calc) sütuna başvuramaz: ${path}`;
    if (rule.columns.some((code) => code === path || rootOf(code) === root)) return `'lockColumnsWhen' koşulu kilitlediği sütuna başvuramaz: ${path}`;
  }
  return null;
}
