// Hazır sayı değişkenleri: {{sayilar.<raporKaynağı>}} → o rapor kaynağının kayıt sayısı.
// Studio tasarımcısı (frontend/development-studio/.../page-designer/pageCounts.ts) aynı kuralı uygular.
import { useEffect, useState } from "react";
import { api } from "../erpApi";

export const COUNTS_ROOT = "sayilar";
const COUNT_REFERENCE = /\{\{\s*sayilar\.([A-Za-z_][A-Za-z0-9_]*)/g;

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

type CatalogSource = { code: string; columns?: { code: string }[] };

/**
 * Sayfada geçen rapor kaynaklarının kayıt sayısını mevcut rapor uç noktasıyla getirir (sayfa başına 1 satır).
 * Sayılar oturumdaki kullanıcının görebildiği kayıtlardır; erişilemeyen ya da bilinmeyen kaynak boş kalır.
 */
export function usePageCounts(codes: string[], token: string): Record<string, number> {
  const key = codes.join(",");
  const [counts, setCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    let active = true;
    if (!key) { setCounts({}); return () => { active = false; }; }
    void (async () => {
      try {
        const catalog = await api<CatalogSource[]>("/api/reports/catalog", token);
        const sources = Array.isArray(catalog) ? catalog : [];
        const entries = await Promise.all(key.split(",").map(async (code) => {
          const column = sources.find((item) => item.code === code)?.columns?.[0]?.code;
          if (!column || code === "customSql") return null;
          try {
            const result = await api<{ totalCount: number }>("/api/reports/run", token, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ source: code, columns: [column], filters: [], sortBy: column, descending: false, page: 1, pageSize: 1 }),
            });
            return typeof result.totalCount === "number" ? [code, result.totalCount] as const : null;
          } catch { return null; }
        }));
        if (active) setCounts(Object.fromEntries(entries.filter((entry): entry is readonly [string, number] => !!entry)));
      } catch {
        if (active) setCounts({});
      }
    })();
    return () => { active = false; };
  }, [key, token]);
  return counts;
}
