// Düzenlenebilir tablonun hesaplanan (`calc`) sütunlarının Studio denetimi. Kaynaktan doldurma, boş satır atlama ve seçimle
// doldurma listeli tablonun motor özellikleridir (gridEngine.ts: fillQuery / fillColumns / skipWhenZero / lookupFills).
import { parseGridColumns } from "./gridColumns";

/** Kayıt sorunu (sunucu da reddeder): hesaplanan sütunun sorgusu sayfadaki bir okuma sorgusu olmalıdır. Sorun yoksa null. */
export function calcColumnProblem(props: Record<string, unknown>, readIds: ReadonlySet<string>): string | null {
  for (const column of parseGridColumns(props.gridColumns))
    if (column.calc && !readIds.has(column.calc.query)) return `'${column.code}' hesaplanan sütununun sorgusu sayfadaki bir okuma sorgusu olmalıdır: ${column.calc.query}`;
  return null;
}
