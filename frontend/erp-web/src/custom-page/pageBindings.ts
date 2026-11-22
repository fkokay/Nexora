// Saf (React'siz) yardımcılar: özel sayfa değişken bağlama kapsamı, yol çözümleme ve sorgu sıralama.

import { toIsoDateTime } from "./dateTimeInput";

export type PageScope = Record<string, unknown>;

const PATH = String.raw`[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*|\[\d{1,4}\])*`;
const EMBEDDED = new RegExp(String.raw`\{\{\s*(${PATH})\s*\}\}`, "g");
const SINGLE = new RegExp(String.raw`^\{\{\s*(${PATH})\s*\}\}$`);
const TOKEN = /([A-Za-z_][A-Za-z0-9_]*)|\[(\d{1,4})\]/g;

const isoDate = (year: number, monthIndex: number, day: number) => {
  const date = new Date(year, monthIndex, day);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

/**
 * Sayfa kapsamının `tarih` kökü (yerel saatle, YYYY-AA-GG; `bugun`un yanında): ayın ve yılın ilk günü ile `ucAyOnce` (iki ay
 * önceki ayın ilk günü; "Son 3 ay" bu ay dahil üç takvim ayıdır). Studio ikizi page-designer/pageBindings.ts ile aynı kuraldır.
 */
export function pageDateScope(now: Date = new Date()): { ayBasi: string; yilBasi: string; ucAyOnce: string } {
  return { ayBasi: isoDate(now.getFullYear(), now.getMonth(), 1), yilBasi: isoDate(now.getFullYear(), 0, 1), ucAyOnce: isoDate(now.getFullYear(), now.getMonth() - 2, 1) };
}

/** "q.rows[0].Ad" gibi bir yolu kapsamda çözer; çözülemezse undefined döner. */
export function resolvePath(scope: PageScope, path: string): unknown {
  if (!new RegExp(`^${PATH}$`).test(path)) return undefined;
  let current: unknown = scope;
  TOKEN.lastIndex = 0;
  for (const match of path.matchAll(TOKEN)) {
    if (current === null || typeof current !== "object") return undefined;
    if (match[1] !== undefined) {
      if (!Object.prototype.hasOwnProperty.call(current, match[1])) return undefined;
      current = (current as Record<string, unknown>)[match[1]];
    } else {
      if (!Array.isArray(current)) return undefined;
      current = current[Number(match[2])];
    }
  }
  return current;
}

/** Bir değeri metin olarak yazar; çözülemeyen, boş ve nesne değerleri "" olur. */
export function displayText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);
  return "";
}

/** "{{a}} ve {{b.c}}" ifadelerini kapsamdaki değerlerle değiştirir; çözülemeyen ifade "" olur. */
export function interpolate(template: string, scope: PageScope): string {
  if (!template.includes("{{")) return template;
  return template.replace(EMBEDDED, (_match, path: string) => displayText(resolvePath(scope, path)));
}

/** `interpolate` gibi; her çözülen değer `map` ile dönüştürülür (ör. bağlantıda encodeURIComponent). */
export function interpolateWith(template: string, scope: PageScope, map: (text: string) => string): string {
  if (!template.includes("{{")) return template;
  return template.replace(EMBEDDED, (_match, path: string) => map(displayText(resolvePath(scope, path))));
}

/** Şablonun bağlama dışındaki (sabit) metni. */
export const literalText = (template: string): string => template.replace(EMBEDDED, "");

/** Tek bir "{{ x.y }}" ifadesinin yolunu verir; ifade başka metin içeriyorsa null. */
export function bindingPath(expression: string): string | null {
  const match = SINGLE.exec(expression);
  return match ? match[1] : null;
}

/** Sorguları parametre bağlamalarının dayandığı sorgulara göre sıralar (bağımlılar sonra). Adların listesini döndürür. */
export function queryOrder(queries: { name: string; parameters: { binding: string }[] }[]): string[] {
  const names = new Set(queries.map((query) => query.name));
  const dependencies = new Map<string, string[]>(queries.map((query) => [query.name, query.parameters
    .map((parameter) => bindingPath(parameter.binding)?.match(/^[A-Za-z_][A-Za-z0-9_]*/)?.[0])
    .filter((root): root is string => !!root && names.has(root) && root !== query.name)]));
  const ordered: string[] = [];
  const state = new Map<string, "visiting" | "done">();
  const visit = (name: string) => {
    if (state.has(name)) return; // tamamlandı ya da döngü (şema döngüyü reddeder; burada sonsuz döngüden kaçınılır)
    state.set(name, "visiting");
    for (const dependency of dependencies.get(name) ?? []) visit(dependency);
    state.set(name, "done");
    ordered.push(name);
  };
  for (const query of queries) visit(query.name);
  return ordered;
}

/** Bağlama ifadesinden çıkan çözülmüş değeri parametre türüne çevirir; çözülemezse null. */
export function coerceParameter(value: unknown, type: string): unknown {
  if (value === undefined || value === null) return null;
  switch (type) {
    case "text":
      return typeof value === "string" ? value : typeof value === "number" || typeof value === "boolean" ? String(value) : null;
    case "int": case "decimal":
      if (typeof value === "number") return Number.isFinite(value) ? value : null;
      return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
    case "date":
      return typeof value === "string" && value.length >= 10 ? value.slice(0, 10) : null;
    case "datetime":
      // Tarih + saat: saat dilimli ISO 8601 (UTC'ye normalize); dilimsiz metin yerel saattir, çözülemeyen değer null.
      return toIsoDateTime(value);
    case "bool":
      if (typeof value === "boolean") return value;
      return value === "true" ? true : value === "false" ? false : null;
    case "guid":
      return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
    case "list":
      return coerceList(value);
    case "map":
      return coerceMap(value);
    default:
      return null;
  }
}

export const MAX_LIST_ITEMS = 200;
export const MAX_MAP_KEYS = 40;
/** Nesne prototipini değiştirebilecek anahtarlar her düzeyde düşürülür. */
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** `map`: en fazla 40 anahtarlı düz nesne; metin ve null değerler kalır, diğerleri düşer. Nesne değilse null. */
function coerceMap(value: unknown): Record<string, string | null> | null {
  if (!isPlainObject(value)) return null;
  const map: Record<string, string | null> = {};
  let count = 0;
  for (const [key, item] of Object.entries(value)) {
    if (count >= MAX_MAP_KEYS) break;
    if (UNSAFE_KEYS.has(key) || (typeof item !== "string" && item !== null)) continue;
    map[key] = item;
    count += 1;
  }
  return map;
}

/**
 * `list`: en fazla 200 düz nesneden oluşan dizi. Nesne olmayan öğeler düşer; öğe değerleri skaler (metin, sayı, mantıksal, null)
 * ya da bir düzey derin metin eşlemidir (eşlemdeki metin olmayan değerler ve diğer değerler düşer). Dizi değilse null.
 */
function coerceList(value: unknown): Record<string, unknown>[] | null {
  if (!Array.isArray(value)) return null;
  const list: Record<string, unknown>[] = [];
  for (const item of value) {
    if (list.length >= MAX_LIST_ITEMS) break;
    if (!isPlainObject(item)) continue;
    const row: Record<string, unknown> = {};
    for (const [key, field] of Object.entries(item)) {
      if (UNSAFE_KEYS.has(key)) continue;
      if (field === null || typeof field === "string" || typeof field === "boolean" || (typeof field === "number" && Number.isFinite(field))) {
        row[key] = field;
      } else if (isPlainObject(field)) {
        const nested: Record<string, string> = {};
        let count = 0;
        for (const [nestedKey, nestedValue] of Object.entries(field)) {
          if (count >= MAX_MAP_KEYS) break;
          if (UNSAFE_KEYS.has(nestedKey) || typeof nestedValue !== "string") continue;
          nested[nestedKey] = nestedValue;
          count += 1;
        }
        row[key] = nested;
      }
    }
    list.push(row);
  }
  return list;
}
