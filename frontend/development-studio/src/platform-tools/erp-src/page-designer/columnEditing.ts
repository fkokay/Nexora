// Saf (React'siz) ızgara sütun düzenleme kuralları. Kayıtlı biçim değişmez: `columns` görünen sütun kodları
// (boş dizi = tüm sütunlar, sorgu sırasıyla), `columnFormats` "kod=biçim", `totals` toplamı alınan kodlar.
import type { ColumnFormat } from "./cellFormat";

export type SourceColumn = { code: string; label?: string; dataType?: string };
/** Sunucu şemasındaki dizi sınırı (SafeValue: en fazla 40 dize). Daha fazlası ancak "tümü" (boş dizi) olarak kaydedilir. */
export const MAX_VISIBLE_COLUMNS = 40;
export const MAX_COLUMN_FORMATS = 20;
export const MAX_TOTALS = 12;
export const KEEP_ONE_VISIBLE = "En az bir sütun görünür kalmalı.";
export const TOO_MANY_VISIBLE = `En fazla ${MAX_VISIBLE_COLUMNS} sütun ayrı ayrı seçilebilir; hepsini göstermek için “Tümünü göster”i kullanın.`;

export type ColumnsResult = { ok: true; columns: string[] } | { ok: false; error: string };

/** Sütun kodu olarak kullanılabilen sonuç sütunları ("=" içermeyen, en fazla 128 karakter). */
export const selectableColumns = <T extends SourceColumn>(available: readonly T[]): T[] =>
  available.filter((column) => column.code !== "" && !column.code.includes("=") && column.code.length <= 128);

/** Görünen sütunlar, gösterim sırasıyla. Seçim boşsa tüm sütunlar görünür. */
export function visibleCodes(selected: readonly string[], available: readonly SourceColumn[]): string[] {
  return selected.length > 0 ? [...selected] : available.map((column) => column.code);
}

function finalize(next: string[], available: readonly SourceColumn[]): ColumnsResult {
  if (next.length === 0) return { ok: false, error: KEEP_ONE_VISIBLE };
  const all = available.map((column) => column.code);
  // Sorgu sırasıyla tüm sütunlar: boş diziyle kaydedilir (sonradan eklenen sütunlar da görünür).
  if (next.length === all.length && next.every((code, index) => code === all[index])) return { ok: true, columns: [] };
  if (next.length > MAX_VISIBLE_COLUMNS) return { ok: false, error: TOO_MANY_VISIBLE };
  return { ok: true, columns: next };
}

/** Sütunları görünür ya da gizli yapar; yeni görünenler sona eklenir. */
export function setVisible(selected: readonly string[], available: readonly SourceColumn[], codes: readonly string[], visible: boolean): ColumnsResult {
  const current = visibleCodes(selected, available);
  const next = visible ? [...current, ...codes.filter((code, index) => !current.includes(code) && codes.indexOf(code) === index)] : current.filter((code) => !codes.includes(code));
  return finalize(next, available);
}

/** "Tümünü göster": sınır aşılırsa kayıt "tümü"ne (sorgu sırası) döner. */
export function showAll(selected: readonly string[], available: readonly SourceColumn[], codes: readonly string[] = available.map((column) => column.code)): ColumnsResult {
  const result = setVisible(selected, available, codes, true);
  if (!result.ok && result.error === TOO_MANY_VISIBLE && codes.length >= available.length) return { ok: true, columns: [] };
  return result;
}

/** "Yalnız seçilileri göster": seçilenler mevcut gösterim sırasını korur, diğerleri gizlenir. */
export function showOnly(selected: readonly string[], available: readonly SourceColumn[], codes: readonly string[]): ColumnsResult {
  const current = visibleCodes(selected, available);
  const kept = current.filter((code) => codes.includes(code));
  const added = available.map((column) => column.code).filter((code) => codes.includes(code) && !kept.includes(code));
  return finalize([...kept, ...added], available);
}

/** Görünen bir sütunu taşır: hedef sıra numarası, "start" / "end" ya da bir adım (±1 için `step`). */
export function moveVisible(selected: readonly string[], available: readonly SourceColumn[], code: string, target: number | "start" | "end"): ColumnsResult {
  const current = visibleCodes(selected, available);
  const from = current.indexOf(code);
  if (from < 0) return { ok: false, error: "Gizli sütun taşınamaz; önce görünür yapın." };
  const to = target === "start" ? 0 : target === "end" ? current.length - 1 : Math.max(0, Math.min(current.length - 1, target));
  if (to === from) return { ok: true, columns: [...selected] };
  const next = [...current];
  next.splice(from, 1);
  next.splice(to, 0, code);
  return finalize(next, available);
}

/** Sürükle-bırak: `code` sütunu `targetCode` sütununun önüne (ya da `after` ise arkasına) taşınır. */
export function dropOnto(selected: readonly string[], available: readonly SourceColumn[], code: string, targetCode: string, after: boolean): ColumnsResult {
  const current = visibleCodes(selected, available);
  if (code === targetCode || !current.includes(targetCode)) return { ok: true, columns: [...selected] };
  const without = current.filter((item) => item !== code);
  if (!current.includes(code)) return { ok: false, error: "Gizli sütun taşınamaz; önce görünür yapın." };
  const index = without.indexOf(targetCode) + (after ? 1 : 0);
  return moveVisible(selected, available, code, index);
}

const looksLikeId = (column: SourceColumn) => {
  const type = column.dataType?.toLowerCase() ?? "";
  return type === "guid" || type === "uniqueidentifier" || column.code.toLowerCase() === "id" || column.code.toLowerCase() === "rowversion";
};

/**
 * "Kaydet ve bağla" sonrası ızgaraya önerilen sütunlar: kimlik benzeri sütunlar atlanır, ilk `max` sütun alınır.
 * Hepsi kimlik benzeriyse ilk sütunlar kullanılır; sütun bilinmiyorsa boş dizi (tümü) döner.
 */
export function proposeColumns(columns: readonly SourceColumn[], max = 8): string[] {
  const usable = selectableColumns(columns);
  const preferred = usable.filter((column) => !looksLikeId(column));
  return (preferred.length > 0 ? preferred : usable).slice(0, max).map((column) => column.code);
}

/** Basit kipteki çipler: ilk `limit` görünen sütun ve kalan sayısı. */
export function chipSummary(visible: readonly string[], limit = 8): { shown: string[]; more: number } {
  return { shown: visible.slice(0, limit), more: Math.max(0, visible.length - limit) };
}

export type FormatsResult = { ok: true; entries: string[] } | { ok: false; error: string };

/** Sütun biçimini yazar ("" biçimi kaldırır); diğer girdiler ve sıraları korunur. */
export function setColumnFormat(entries: readonly string[], code: string, format: ColumnFormat | ""): FormatsResult {
  const index = entries.findIndex((entry) => entry.slice(0, entry.lastIndexOf("=")) === code);
  const next = [...entries];
  if (format === "") { if (index >= 0) next.splice(index, 1); return { ok: true, entries: next }; }
  if (index >= 0) next[index] = `${code}=${format}`;
  else {
    if (entries.length >= MAX_COLUMN_FORMATS) return { ok: false, error: `En fazla ${MAX_COLUMN_FORMATS} sütuna biçim verilebilir.` };
    next.push(`${code}=${format}`);
  }
  return { ok: true, entries: next };
}

export type TotalsResult = { ok: true; totals: string[] } | { ok: false; error: string };

export function toggleTotal(totals: readonly string[], code: string, on: boolean): TotalsResult {
  if (!on) return { ok: true, totals: totals.filter((item) => item !== code) };
  if (totals.includes(code)) return { ok: true, totals: [...totals] };
  if (totals.length >= MAX_TOTALS) return { ok: false, error: `Toplam satırında en fazla ${MAX_TOTALS} sütun olabilir.` };
  return { ok: true, totals: [...totals, code] };
}

/** Toplam alınabilir mi: biçim sayı/para ya da biçimsiz sayısal sütun. */
export const totalable = (format: ColumnFormat | undefined, dataType: string | undefined) =>
  format ? format === "number" || format === "money" : dataType === "number" || dataType === "decimal";

/** Hizalama biçimden türetilir (ERP aynı kuralla çizer): sayı ve para sağa, diğerleri sola. */
export const alignmentFor = (format: ColumnFormat | undefined, dataType: string | undefined) =>
  (format ? format === "number" || format === "money" : dataType === "number" || dataType === "decimal") ? "Sağa" : "Sola";

/** Kod ya da etikette arama (Türkçe büyük/küçük harf duyarsız). */
// toLocaleLowerCase("tr-TR") yüzlerce sütunda her tuşta yavaştır; Türkçe I/İ eşlemesi elle yapılır.
const trLower = (text: string) => text.replace(/I/g, "ı").replace(/İ/g, "i").toLowerCase();
export function filterColumns<T extends SourceColumn>(columns: readonly T[], term: string): T[] {
  const needle = trLower(term.trim());
  if (!needle) return [...columns];
  return columns.filter((column) => trLower(column.code).includes(needle) || trLower(column.label ?? "").includes(needle));
}

/** Satır sırası: "Görünenler önce" açıkken görünenler gösterim sırasıyla, sonra gizliler sorgu sırasıyla. */
export function orderedColumns<T extends SourceColumn>(available: readonly T[], selected: readonly string[], visibleFirst: boolean, stale: (code: string) => T): T[] {
  const visible = visibleCodes(selected, available);
  const byCode = new Map(available.map((column) => [column.code, column]));
  if (!visibleFirst) return [...available, ...visible.filter((code) => !byCode.has(code)).map(stale)];
  const head = visible.map((code) => byCode.get(code) ?? stale(code));
  return [...head, ...available.filter((column) => !visible.includes(column.code))];
}

/** Shift ile tıklama: listede iki kod arasındaki (ikisi dahil) bütün kodlar. */
export function rangeCodes(order: readonly string[], anchor: string, target: string): string[] {
  const from = order.indexOf(anchor);
  const to = order.indexOf(target);
  if (from < 0 || to < 0) return [target];
  return order.slice(Math.min(from, to), Math.max(from, to) + 1);
}
