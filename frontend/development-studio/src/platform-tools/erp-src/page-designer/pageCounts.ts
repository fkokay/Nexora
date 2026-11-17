// Hazır sayı değişkenleri: {{sayilar.<raporKaynağı>}} → o rapor kaynağının kayıt sayısı.
// ERP'deki sayfa gösterimi (frontend/erp-web/src/custom-page/usePageCounts.ts) aynı kuralı uygular.

export const COUNTS_ROOT = "sayilar";
const COUNT_REFERENCE = /\{\{\s*sayilar\.([A-Za-z_][A-Za-z0-9_]*)/g;
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Bir rapor kaynağı sayı değişkeni olabilir mi: ad tanımlayıcı olmalı, SQL raporu ve özel veri kaynakları hariç. */
export const isCountableSource = (code: string) => IDENTIFIER.test(code) && code !== "customSql";

/** Metinlerde geçen {{sayilar.x}} kaynak kodlarını sıralı ve tekil verir. */
export function referencedCountCodes(texts: Iterable<string>): string[] {
  const codes = new Set<string>();
  for (const text of texts) for (const match of text.matchAll(COUNT_REFERENCE)) codes.add(match[1]);
  return [...codes].sort();
}

/** Bir değerin içindeki tüm metinleri toplar (bileşen props ve sorgu bağlamaları için). */
export function collectTexts(value: unknown, into: string[] = []): string[] {
  if (typeof value === "string") into.push(value);
  else if (Array.isArray(value)) for (const item of value) collectTexts(item, into);
  else if (value && typeof value === "object") for (const item of Object.values(value)) collectTexts(item, into);
  return into;
}
