// Saf (React'siz) kurallar: sorgulu göstergenin koşullu sayacı (`countWhen`). ERP çalışma zamanı
// (frontend/erp-web/src/custom-page/countWhen.ts) ve sunucu (TenantCustomPageSchema.ValidateCountWhen) ile aynı kural:
// satır `<sorguAdı>.satir` olarak bindirilir, değer koşulu sağlayan yüklenmiş satır sayısıdır.
import { conditionProblem, evaluateCondition, parseCondition } from "./conditions";
import type { PageScope } from "./pageBindings";

export const COUNT_ROW = "satir";

/** Müfettiş ve kayıt öncesi denetim: sözdizimi, kök adları ve sorgunun kendi adına (`<sorgu>.satir.<alan>`) başvuru. */
export function countWhenProblem(text: unknown, queryName: string | null, pageNames: string[]): string | null {
  if (typeof text !== "string" || text === "") return null;
  if (!queryName) return "'countWhen' yalnızca sorgusu olan gösterge bileşeninde kullanılabilir.";
  const problem = conditionProblem("countWhen", text, pageNames);
  if (problem) return problem;
  const parsed = parseCondition(text);
  return parsed.ok && !parsed.roots.includes(queryName) ? `'countWhen' koşulu satır alanlarına '${queryName}.satir.<alan>' ile başvurmalıdır.` : null;
}

/** Koşulu sağlayan satır sayısı; koşul yoksa undefined, ayrıştırılamıyorsa null. Tuvalde örnek satırlar (en fazla 5) sayılır. */
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

export const countText = (count: number | null) => count === null ? "—" : count.toLocaleString("tr-TR");
