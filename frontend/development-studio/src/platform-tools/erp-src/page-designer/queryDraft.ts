// Saf (React'siz) sorgu taslağı yardımcıları: Sorgular sekmesi ve "Yeni sorgu / Düzenle" penceresi aynı kuralları kullanır.
import type { PageQuery, PageQueryParameter, QueryKind } from "./QueriesPanel";

export const MAX_QUERY_PARAMETERS = 20;
const isCollection = (type: string) => type === "list" || type === "map";

const isParameterChar = (char: string) => /[A-Za-z0-9_@#$]/.test(char);
/**
 * SQL metninde geçen @parametre adları (ilk geçiş sırası, büyük/küçük harf duyarsız tekil). Sunucudaki
 * TenantCustomPageQueries.SqlParameterNames ile aynı kurallar: dizgiler, [köşeli]/"tırnaklı" adlar, yorumlar
 * ve @@sistem değişkenleri sayılmaz.
 */
export function sqlParameterNames(sql: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < sql.length; index++) {
    const current = sql[index];
    if (current === "'" || current === "[" || current === "\"") {
      const closing = current === "[" ? "]" : current;
      index++;
      while (index < sql.length) {
        if (sql[index] === closing && sql[index + 1] === closing) { index += 2; continue; }
        if (sql[index] === closing) break;
        index++;
      }
      continue;
    }
    if (current === "-" && sql[index + 1] === "-") { while (index < sql.length && sql[index] !== "\n") index++; continue; }
    if (current === "/" && sql[index + 1] === "*") { const end = sql.indexOf("*/", index + 2); index = end < 0 ? sql.length : end + 1; continue; }
    if (current !== "@") continue;
    const start = index + 1;
    if (sql[start] === "@") { index = start; while (index + 1 < sql.length && isParameterChar(sql[index + 1])) index++; continue; }
    let stop = start;
    while (stop < sql.length && isParameterChar(sql[stop])) stop++;
    if (stop > start) {
      const name = sql.slice(start, stop);
      if (!seen.has(name.toLowerCase())) { seen.add(name.toLowerCase()); names.push(name); }
    }
    index = stop - 1;
  }
  return names;
}

/**
 * Parametre listesini SQL'deki adlara eşitler; var olan parametrelerin bağlaması ve türü korunur. Yazarken adı geçici
 * olarak bozulan (ör. "@tarih" → "@tari" → "@tarih") parametreler için `remembered` önceki ayarı verir.
 */
export function syncParameters(sql: string, existing: PageQueryParameter[], remembered: (name: string) => PageQueryParameter | undefined, defaultBinding: (name: string) => string): PageQueryParameter[] {
  return sqlParameterNames(sql).slice(0, MAX_QUERY_PARAMETERS).map((name) => {
    const previous = existing.find((parameter) => parameter.name.toLowerCase() === name.toLowerCase()) ?? remembered(name);
    // Koleksiyon türleri SQL'de yoktur: ERP işleminden kalan list/map türü metne döner.
    return previous ? { ...previous, name, type: isCollection(previous.type) ? "text" : previous.type } : { name, binding: defaultBinding(name), type: "text" };
  });
}

/**
 * Sorguya bir düzenleme yaması uygular (sayfadaki `updateQuery` ile aynı kurallar): `operation: undefined` anahtarı
 * kaldırır (SQL moduna dönüş), SQL modunda `sql` değişince parametreler SQL'den yeniden çıkarılır. `memory` bu
 * düzenleme oturumunda SQL'den geçici düşen parametrelerin ayarını tutar.
 */
export function applyQueryPatch(query: PageQuery, patch: Partial<PageQuery>, memory: Map<string, PageQueryParameter>, defaultBinding: (name: string) => string): PageQuery {
  const next: PageQuery = { ...query, ...patch };
  if ("operation" in patch && patch.operation === undefined) delete next.operation;
  if (typeof next.operation === "string") return next;
  if (typeof query.operation !== "string") for (const parameter of query.parameters) memory.set(parameter.name.toLowerCase(), parameter);
  if (patch.sql !== undefined) next.parameters = syncParameters(patch.sql, next.parameters, (name) => memory.get(name.toLowerCase()), defaultBinding);
  return next;
}

/** Penceredeki yeni sorgu: alanın ilk izinli türüyle; okuma alanında ERP kataloğu hazırsa ERP işlemi modunda açılır. */
export function newDraftQuery(id: string, name: string, kinds: QueryKind[], erpReady: boolean): PageQuery {
  const kind = kinds[0] ?? "read";
  const read = kind === "read";
  if (erpReady) return { id, name, kind, operation: "", parameters: [], runOn: read ? "load" : "manual" };
  return { id, name, kind, sql: read ? "SELECT 1 AS Deger" : "", parameters: [], runOn: read ? "load" : "manual" };
}

/** Sayfada kullanılmayan ilk "<taban><n>" adı. */
export function freeQueryName(base: string, taken: string[]): string {
  for (let index = 1; index <= 999; index++) if (!taken.includes(`${base}${index}`.toLowerCase())) return `${base}${index}`;
  return `${base}${Date.now() % 100000}`;
}
