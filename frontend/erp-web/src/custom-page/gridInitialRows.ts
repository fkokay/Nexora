// Düzenlenebilir tablonun başlangıç satırları (`initialRowsQuery`, yalnız `list` kipi): bir okuma sorgusunun sonuç satırları
// tam düzenlenebilir taslaklara çevrilir (düzenleme, revizyon, talepten/tekliften/siparişten belge). Saf (React'siz).
import { emptyGridState, sameDrafts, type GridColumn, type GridDraft, type GridState } from "./gridState";
import { displayText } from "./pageBindings";

/** Hücre ve görünen etiket eşlemi: sütun kodu → kaynak satır alanı. */
export type InitialRowsMap = { cells: Record<string, string>; labels: Record<string, string> };

const FIELD = /^[A-Za-z_][A-Za-z0-9_]{0,63}(\.[A-Za-z_][A-Za-z0-9_]{0,63})*$/;
const LABEL_SUFFIX = "@label";
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * `initialRowsMap`: "<sütunKodu>=<kaynakAlanı>" öğeleri; "<sütunKodu>@label=<kaynakAlanı>" seçim hücresinin görünen metnidir
 * (ör. "stockItemId@label=stockName"). Eşlenmemiş her sütun kendi koduyla aynı adlı alandan okunur. Hesaplanan sütunlar hiç
 * okunmaz; bilinmeyen sütun kodu, geçersiz alan ve metin olmayan öğeler atlanır.
 */
export function parseInitialRowsMap(value: unknown, columns: GridColumn[]): InitialRowsMap {
  const editable = columns.filter((column) => column.inputType !== "calc");
  const codes = new Set(editable.map((column) => column.code));
  const cells: Record<string, string> = Object.fromEntries(editable.map((column) => [column.code, column.code]));
  const labels: Record<string, string> = {};
  if (!Array.isArray(value)) return { cells, labels };
  for (const item of value) {
    if (typeof item !== "string") continue;
    const index = item.indexOf("=");
    if (index <= 0) continue;
    const left = item.slice(0, index).trim();
    const field = item.slice(index + 1).trim();
    if (!FIELD.test(field) || field.split(".").some((part) => UNSAFE_KEYS.has(part))) continue;
    if (left.endsWith(LABEL_SUFFIX)) {
      const code = left.slice(0, -LABEL_SUFFIX.length);
      if (codes.has(code)) labels[code] = field;
      continue;
    }
    if (codes.has(left)) cells[left] = field;
  }
  return { cells, labels };
}

/** Kaynak satırdaki alan: önce düz anahtar (düzleştirilmiş "a.b" dahil), sonra iç içe nesne yolu. */
function fieldValue(row: Record<string, unknown>, field: string): unknown {
  if (Object.prototype.hasOwnProperty.call(row, field)) return row[field];
  let current: unknown = row;
  for (const part of field.split(".")) {
    if (!isRecord(current) || !Object.prototype.hasOwnProperty.call(current, part)) return undefined;
    current = current[part];
  }
  return current;
}

/** Kaynak değerin hücre biçimi: onay kutusu boolean, tarih "yyyy-MM-dd", diğerleri metin; boş değer undefined. */
function cellValue(column: GridColumn, value: unknown): string | boolean | undefined {
  if (value === null || value === undefined) return undefined;
  if (column.inputType === "checkbox") return value === true || value === "true";
  const text = displayText(value);
  if (text === "") return undefined;
  return column.inputType === "date" ? text.slice(0, 10) : text;
}

const SOURCE_KEY_PREFIX = "kaynak-";

/** Kaynak satırlardan taslaklar: anahtar "kaynak-<sıra>" (yeni satırların "yeni-<n>" anahtarlarıyla çakışmaz), `origin: "source"`. */
export function seedDrafts(columns: GridColumn[], rows: Record<string, unknown>[], map: InitialRowsMap): GridDraft[] {
  return rows.map((row, index) => {
    const cells: Record<string, string | boolean> = {};
    const labels: Record<string, string> = {};
    for (const column of columns) {
      const field = map.cells[column.code];
      if (field === undefined) continue;
      const value = cellValue(column, fieldValue(row, field));
      if (value === undefined) continue;
      cells[column.code] = value;
      const labelField = map.labels[column.code];
      const label = labelField === undefined ? "" : displayText(fieldValue(row, labelField));
      if (column.inputType === "lookup" && label !== "") labels[column.code] = label;
    }
    const draft: GridDraft = { key: `${SOURCE_KEY_PREFIX}${index + 1}`, cells, origin: "source" };
    if (Object.keys(labels).length > 0) draft.labels = labels;
    return draft;
  });
}

/**
 * Başlangıç satırlı tablonun durumu. `key` sorgunun çalıştığı değerlerin anahtarıdır (`ranWith`), `rows` sonuç satırları
 * (sorgu yanıt almadıysa null). Kurallar:
 * - Saklı durum yoksa ya da başka bir anahtarla yüklendiyse: sonuç satırlarından yeni durum (sıfırlama — Yeni, kayıt sonrası —
 *   saklı durumu sildiğinden son yüklenen satırlara döner).
 * - Aynı anahtar: kullanıcının değişiklikleri korunur; tablo hiç değiştirilmediyse (satırlar yüklenenlerle aynı) ve sorgu yeni
 *   satırlar döndüyse (ör. kayıttan sonra yenileme) yenileri alınır.
 * - Sorgu hiç yanıt almadıysa (parametre yok, bekliyor): saklı durum ya da boş tablo.
 */
export function initialGridState(stored: GridState | undefined, columns: GridColumn[], map: InitialRowsMap, key: string,
  rows: Record<string, unknown>[] | null): GridState {
  if (rows === null) return stored ?? emptyGridState(key);
  const seeded = seedDrafts(columns, rows, map);
  if (!stored || stored.sourceKey !== key || !stored.loaded) return { ...emptyGridState(key), rows: seeded, loaded: seeded };
  if (sameDrafts(stored.rows, stored.loaded) && !sameDrafts(stored.loaded, seeded)) return { ...stored, rows: seeded, loaded: seeded };
  return stored;
}
