// Seçim doldurması (`lookupFill`): seçim hücresinde kullanıcı bir seçenek seçince seçenek satırının alanları aynı satırın diğer
// hücrelerine kopyalanır (ör. stok → birim, satış fiyatı, KDV oranı). Saf (React'siz).
import type { GridColumn, GridDraft } from "./gridState";
import { displayText } from "./pageBindings";

/** Bir doldurma kuralı: `lookup` sütunu seçilince `target` hücresine seçenek satırının `field` alanı yazılır. */
export type LookupFillRule = { lookup: string; target: string; field: string };

const ENTRY = /^([A-Za-z_][A-Za-z0-9_.]*):([A-Za-z_][A-Za-z0-9_.]*)=([A-Za-z_][A-Za-z0-9_]{0,63}(?:\.[A-Za-z_][A-Za-z0-9_]{0,63})*)$/;
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * `lookupFill`: "<seçimSütunu>:<hedefSütun>=<seçenekAlanı>" öğeleri. Seçim sütunu bu tablonun `lookup` sütunu, hedef ise
 * hesaplanan olmayan, kendisinden farklı bir sütun olmalı (seçim sütunu da olabilir, ör. birim); aksi halde öğe atlanır.
 * Aynı hedef iki kez yazılırsa sonuncusu geçerlidir.
 */
export function parseLookupFill(value: unknown, columns: GridColumn[]): LookupFillRule[] {
  if (!Array.isArray(value)) return [];
  const byCode = new Map(columns.map((column) => [column.code, column]));
  const rules: LookupFillRule[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const match = ENTRY.exec(item);
    if (!match) continue;
    const [, lookup, target, field] = match;
    if (field.split(".").some((part) => UNSAFE_KEYS.has(part)) || UNSAFE_KEYS.has(target)) continue;
    const source = byCode.get(lookup);
    const destination = byCode.get(target);
    if (!source || source.inputType !== "lookup" || !destination || target === lookup) continue;
    if (destination.inputType === "calc") continue;
    const existing = rules.findIndex((rule) => rule.lookup === lookup && rule.target === target);
    if (existing >= 0) rules.splice(existing, 1);
    rules.push({ lookup, target, field });
  }
  return rules;
}

function optionField(row: Record<string, unknown>, field: string): unknown {
  if (Object.prototype.hasOwnProperty.call(row, field)) return row[field];
  let current: unknown = row;
  for (const part of field.split(".")) {
    if (!isRecord(current) || !Object.prototype.hasOwnProperty.call(current, part)) return undefined;
    current = current[part];
  }
  return current;
}

/**
 * Kullanıcının `lookupCode` hücresinde seçtiği seçenek satırından yazılacak hücreler. Hedef yalnız boşsa ya da hâlâ önceki
 * doldurmanın yazdığı değeri taşıyorsa yazılır (kullanıcının yazdığı değer ezilmez). Seçenek satırı yoksa (seçim temizlendi) ya
 * da alan boşsa o hedef yazılmaz; temizlenen seçim doldurulmuş hücreleri silmez.
 */
export function lookupFillValues(rules: LookupFillRule[], lookupCode: string, draft: GridDraft, option: Record<string, unknown> | null,
  columns: GridColumn[]): Record<string, string> {
  const values: Record<string, string> = {};
  if (!option) return values;
  const byCode = new Map(columns.map((column) => [column.code, column]));
  for (const rule of rules) {
    if (rule.lookup !== lookupCode) continue;
    const raw = optionField(option, rule.field);
    if (raw === null || raw === undefined || typeof raw === "object") continue;
    const column = byCode.get(rule.target);
    let text = displayText(raw);
    if (column?.inputType === "date") text = text.slice(0, 10);
    if (column?.inputType === "checkbox") text = raw === true || raw === "true" ? "true" : "false";
    if (text === "") continue;
    const current = draft.cells[rule.target];
    const currentText = current === undefined ? "" : String(current);
    const previous = draft.filled?.[rule.target];
    if (currentText.trim() !== "" && currentText !== previous) continue;
    values[rule.target] = text;
  }
  return values;
}
