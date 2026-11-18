// erp-web/src/custom-page/gridState.ts ile aynıdır; biri değişirse diğeri de güncellenmelidir.
// (Yalnız sütun tanımı kısmı: parseGridColumn / parseGridColumns; ortak vektörler gridColumns.vectors.json.)
//
// Düzenlenebilir tablo sütunu: "<kod>|<Etiket>|<tür>[|<kurallar>]".

export type GridColumnType = "text" | "number" | "date" | "checkbox";
export type GridColumnRules = { required: boolean; unique: boolean; upperCase: boolean; readOnly: boolean; maxLength?: number; min?: number; max?: number; step?: number };
export type GridColumn = { code: string; label: string; inputType: GridColumnType; rules: GridColumnRules };

export const GRID_COLUMN_TYPES: readonly GridColumnType[] = ["text", "number", "date", "checkbox"];
export const MAX_GRID_COLUMNS = 12;
export const MAX_GRID_LABEL = 60;
export const MAX_GRID_TEXT_LENGTH = 4000;
const CODE = /^[A-Za-z_][A-Za-z0-9_]{0,63}(\.[\p{L}\p{N}_ -]{1,40})?$/u;
const NUMBER = /^-?\d+(\.\d+)?$/;
const INTEGER = /^\d+$/;

const emptyRules = (): GridColumnRules => ({ required: false, unique: false, upperCase: false, readOnly: false });

/** Sütun tanımını ayrıştırır; geçersizse Türkçe neden döner. */
export function parseGridColumn(text: string): { ok: true; column: GridColumn } | { ok: false; error: string } {
  if (typeof text !== "string") return { ok: false, error: "sütun tanımı metin olmalıdır" };
  const parts = text.split("|");
  if (parts.length < 3 || parts.length > 4) return { ok: false, error: "biçim kod|Etiket|tür[|kurallar] olmalıdır" };
  const [code, label, type, ruleText] = parts;
  if (!CODE.test(code)) return { ok: false, error: `sütun kodu geçersiz: ${code}` };
  if (label.length < 1 || label.length > MAX_GRID_LABEL) return { ok: false, error: `etiket 1–${MAX_GRID_LABEL} karakter olmalıdır` };
  if (!(GRID_COLUMN_TYPES as readonly string[]).includes(type)) return { ok: false, error: `sütun türü text, number, date veya checkbox olmalıdır: ${type}` };
  const inputType = type as GridColumnType;
  const rules = emptyRules();
  if (ruleText !== undefined) {
    for (const token of ruleText.split(",")) {
      const colon = token.indexOf(":");
      const name = colon < 0 ? token : token.slice(0, colon);
      const value = colon < 0 ? null : token.slice(colon + 1);
      const wrongType = (expected: GridColumnType) => inputType !== expected ? `'${name}' kuralı yalnız ${expected} sütununda kullanılabilir` : null;
      if (value === null) {
        if (name === "required" || name === "unique" || name === "readOnly") { rules[name] = true; continue; }
        if (name === "upperCase") { const problem = wrongType("text"); if (problem) return { ok: false, error: problem }; rules.upperCase = true; continue; }
        return { ok: false, error: `bilinmeyen kural: ${token}` };
      }
      if (name === "maxLength") {
        const problem = wrongType("text"); if (problem) return { ok: false, error: problem };
        const number = INTEGER.test(value) ? Number(value) : NaN;
        if (!(number >= 1 && number <= MAX_GRID_TEXT_LENGTH)) return { ok: false, error: `'maxLength' 1–${MAX_GRID_TEXT_LENGTH} arasında bir tam sayı olmalıdır` };
        rules.maxLength = number;
        continue;
      }
      if (name === "min" || name === "max" || name === "step") {
        const problem = wrongType("number"); if (problem) return { ok: false, error: problem };
        const number = NUMBER.test(value) ? Number(value) : NaN;
        if (!Number.isFinite(number)) return { ok: false, error: `'${name}' bir sayı olmalıdır` };
        if (name === "step" && number <= 0) return { ok: false, error: "'step' sıfırdan büyük olmalıdır" };
        rules[name] = number;
        continue;
      }
      return { ok: false, error: `bilinmeyen kural: ${token}` };
    }
    if (rules.min !== undefined && rules.max !== undefined && rules.min > rules.max) return { ok: false, error: "'min' 'max' değerinden büyük olamaz" };
  }
  return { ok: true, column: { code, label, inputType, rules } };
}

/** `gridColumns` özelliğinin geçerli sütunları (geçersizler atlanır), en çok 12. */
export function parseGridColumns(value: unknown): GridColumn[] {
  if (!Array.isArray(value)) return [];
  const columns: GridColumn[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const parsed = parseGridColumn(item);
    if (parsed.ok) columns.push(parsed.column);
    if (columns.length >= MAX_GRID_COLUMNS) break;
  }
  return columns;
}

/** Studio: sütunu kayıt biçimine yazar (parseGridColumn'un tersi); türe uymayan kurallar yazılmaz. */
export function gridColumnText(column: GridColumn): string {
  const { rules, inputType } = column;
  const tokens: string[] = [];
  if (rules.required) tokens.push("required");
  if (rules.unique) tokens.push("unique");
  if (rules.upperCase && inputType === "text") tokens.push("upperCase");
  if (rules.readOnly) tokens.push("readOnly");
  if (inputType === "text" && rules.maxLength !== undefined) tokens.push(`maxLength:${rules.maxLength}`);
  if (inputType === "number") {
    if (rules.min !== undefined) tokens.push(`min:${rules.min}`);
    if (rules.max !== undefined) tokens.push(`max:${rules.max}`);
    if (rules.step !== undefined) tokens.push(`step:${rules.step}`);
  }
  const base = `${column.code}|${column.label}|${inputType}`;
  return tokens.length > 0 ? `${base}|${tokens.join(",")}` : base;
}

/** Sütun kodunun kökü: "attributes.Renk" → "attributes". */
export const gridColumnRoot = (code: string) => code.split(".")[0];
