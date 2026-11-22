// Düzenlenebilir tablonun sütun toplamları (`totals`): alt satırda çizilir ve kapsamda `{{<tablo>.toplam.<sütun>}}` olarak okunur.
// Koşullar iki toplamı mevcut dilbilgisiyle karşılaştırabilir (ör. "fis.toplam.debit == fis.toplam.credit").
import type { GridColumn, GridMode } from "./gridState";

const MAX_TOTALS = 12;
/** Kayan nokta gürültüsü atılır (0.1 + 0.2 == 0.3); 6 ondalık hane tutar ve miktar sütunları için yeterlidir. */
const PRECISION = 1e6;

/** `totals` özelliği: yalnız bu tablonun `number` sütun kodları (tekrarsız, sırası korunur); `matrix` kipinde toplam yoktur. */
export function parseGridTotals(value: unknown, columns: GridColumn[], mode: GridMode): string[] {
  if (mode === "matrix" || !Array.isArray(value)) return [];
  const numeric = new Set(columns.filter((column) => column.inputType === "number").map((column) => column.code));
  const codes: string[] = [];
  for (const item of value) {
    if (codes.length >= MAX_TOTALS) break;
    if (typeof item === "string" && numeric.has(item) && !codes.includes(item)) codes.push(item);
  }
  return codes;
}

function cellNumber(row: unknown, code: string): number {
  if (row === null || typeof row !== "object") return 0;
  const value = (row as Record<string, unknown>)[code];
  const numeric = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isFinite(numeric) ? numeric : 0;
}

/** Satırların (tablo kapsamının `satirlar`ı) sütun toplamları; boş ya da sayı olmayan hücre 0 sayılır. Satır yoksa her toplam 0. */
export function gridColumnTotals(codes: string[], rows: unknown[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const code of codes) {
    let sum = 0;
    for (const row of rows) sum += cellNumber(row, code);
    const rounded = Math.round(sum * PRECISION) / PRECISION;
    totals[code] = Object.is(rounded, -0) ? 0 : rounded;
  }
  return totals;
}

const totalFormat = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 6 });
/** Alt satır metni: en az 2, en çok 6 ondalık (30000 → "30.000,00"). */
export function formatGridTotal(value: number): string {
  return totalFormat.format(value);
}
