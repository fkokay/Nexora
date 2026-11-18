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


// erp-web gridState.ts'teki adlarla (parseGridColumn birebir kopyadır).
const COLUMN_CODE = CODE;
const INPUT_TYPES: readonly string[] = GRID_COLUMN_TYPES;
const RULE_NUMBER = NUMBER;
const RULE_INTEGER = INTEGER;
const MAX_LABEL = MAX_GRID_LABEL;
type GridInputType = GridColumnType;

/** Sütun tanımını ayrıştırır; geçersizse Türkçe neden döner (erp-web parseGridColumn'un birebir kopyası). */
export function parseGridColumn(text: string): { ok: true; column: GridColumn } | { ok: false; error: string } {
  const fail = (reason: string) => ({ ok: false as const, error: `Sütun tanımı geçersiz (${reason}): ${text}` });
  if (typeof text !== "string") return fail("metin değil");
  const parts = text.split("|");
  if (parts.length < 3 || parts.length > 4) return fail("biçim kod|Etiket|tür[|kurallar] olmalı");
  const [code, label, type, ruleText] = parts;
  if (!COLUMN_CODE.test(code)) return fail("kod");
  if (label.length < 1 || label.length > MAX_LABEL || label.trim() === "") return fail("etiket 1-60 karakter olmalı");
  if (!INPUT_TYPES.includes(type)) return fail("tür text, number, date ya da checkbox olmalı");
  const inputType = type as GridInputType;
  const rules: GridColumnRules = { required: false, unique: false, upperCase: false, readOnly: false };
  if (ruleText !== undefined) {
    for (const token of ruleText.split(",")) {
      const colon = token.indexOf(":");
      const name = colon < 0 ? token : token.slice(0, colon);
      const argument = colon < 0 ? null : token.slice(colon + 1);
      if (argument === null && (name === "required" || name === "unique" || name === "readOnly")) { rules[name] = true; continue; }
      if (argument === null && name === "upperCase") {
        if (inputType !== "text") return fail("upperCase yalnız text sütununda");
        rules.upperCase = true;
        continue;
      }
      if (argument !== null && name === "maxLength") {
        if (inputType !== "text") return fail("maxLength yalnız text sütununda");
        if (!RULE_INTEGER.test(argument)) return fail("maxLength tamsayı olmalı");
        const value = Number(argument);
        if (value < 1 || value > 4000) return fail("maxLength 1-4000 olmalı");
        rules.maxLength = value;
        continue;
      }
      if (argument !== null && (name === "min" || name === "max" || name === "step")) {
        if (inputType !== "number") return fail(`${name} yalnız number sütununda`);
        if (!RULE_NUMBER.test(argument)) return fail(`${name} sayı olmalı`);
        const value = Number(argument);
        if (name === "step" && !(value > 0)) return fail("step sıfırdan büyük olmalı");
        rules[name] = value;
        continue;
      }
      return fail(`bilinmeyen kural '${token}'`);
    }
  }
  if (rules.min !== undefined && rules.max !== undefined && rules.min > rules.max) return fail("min max'tan büyük olamaz");
  return { ok: true, column: { code, label, inputType, rules } };
}

/** `gridColumns` özelliğini okur: metin olmayan ve geçersiz girdiler atlanır, en fazla 12 sütun. */
export function parseGridColumns(value: unknown): GridColumn[] {
  if (!Array.isArray(value)) return [];
  const columns: GridColumn[] = [];
  for (const item of value) {
    if (columns.length >= MAX_GRID_COLUMNS) break;
    if (typeof item !== "string") continue;
    const parsed = parseGridColumn(item);
    if (parsed.ok) columns.push(parsed.column);
  }
  return columns;
}

/**
 * Sayıyı üssüz yazar (kural sözdizimi `-?\d+(\.\d+)?`): String(1e-7) "1e-7" verir ve sunucu/erp-web onu reddeder.
 */
export function plainNumber(value: number): string {
  const text = String(value);
  if (!/e/i.test(text)) return text;
  return value.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 20 });
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
    if (rules.min !== undefined) tokens.push(`min:${plainNumber(rules.min)}`);
    if (rules.max !== undefined) tokens.push(`max:${plainNumber(rules.max)}`);
    if (rules.step !== undefined) tokens.push(`step:${plainNumber(rules.step)}`);
  }
  const base = `${column.code}|${column.label}|${inputType}`;
  return tokens.length > 0 ? `${base}|${tokens.join(",")}` : base;
}

/** Sütun kodunun kökü: "attributes.Renk" → "attributes". */
export const gridColumnRoot = (code: string) => code.split(".")[0];
