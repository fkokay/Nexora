// Koşullu sayaç: sorgulu göstergenin `countWhen` koşulu, sorgunun yüklenmiş her satırında değerlendirilir; değer, koşulu
// sağlayan satır sayısıdır (eski Lot / Seri İzleme özet kartları gibi: yalnız yüklenmiş satırlar, sayfalı sorguda o sayfa).
// Satır `<sorguAdı>.satir` olarak bindirilir (tablonun `seciliSatir` bindirmesi gibi); diğer kökler (bugun, girişler…) sayfa kapsamından çözülür.
// Studio tuvali aynı kuralı page-designer/countWhen.ts ile uygular.
import { evaluateCondition, parseCondition } from "./conditions";
import type { PageScope } from "./pageBindings";

export const COUNT_ROW = "satir";

/**
 * `countWhen` yoksa (metin değil ya da boş) undefined; ayrıştırılamıyorsa null ("—" gösterilir); yoksa koşulu sağlayan satır sayısı.
 */
export function countRowsWhen(condition: unknown, rows: readonly Record<string, unknown>[], queryName: string, scope: PageScope): number | null | undefined {
  if (typeof condition !== "string" || condition.trim() === "") return undefined;
  const parsed = parseCondition(condition);
  if (!parsed.ok) return null;
  const base = scope[queryName];
  const own = typeof base === "object" && base !== null && !Array.isArray(base) ? base as Record<string, unknown> : {};
  let count = 0;
  for (const row of rows) {
    if (evaluateCondition(parsed.node, { ...scope, [queryName]: { ...own, [COUNT_ROW]: row } })) count += 1;
  }
  return count;
}

/** Sayacın gösterilen metni (eski ekran gibi tr-TR biçimi); ayrıştırılamayan koşulda "—". */
export const countText = (count: number | null) => count === null ? "—" : count.toLocaleString("tr-TR");
