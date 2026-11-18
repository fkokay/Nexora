// Saf (React'siz) özel alanlar bloğu (`customFieldsBlock`) yardımcıları: tanım satırları, değerler ve doğrulama.
import { validateInputValue } from "./inputValidation";
import { displayText } from "./pageBindings";

export type CustomFieldSpec = { code: string; label: string; inputType: "text" | "number" | "date" | "checkbox"; required: boolean; maxLength?: number };

export const MAX_CUSTOM_FIELDS = 40;
const MAX_TEXT_LENGTH = 500;
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);
/** Sunucu ondalık değerleri değişmez kültürle okur: yalnız noktalı ondalık. */
const DECIMAL_TEXT = /^-?\d+(\.\d+)?$/;

function inputTypeOf(dataType: unknown): CustomFieldSpec["inputType"] {
  switch (typeof dataType === "string" ? dataType.toLowerCase() : "") {
    case "decimal": return "number";
    case "date": return "date";
    case "boolean": return "checkbox";
    default: return "text";
  }
}

/**
 * Tanım satırlarından (`code`, `label`, `dataType`, `isRequired`, `maxLength`, `isActive`) alanları üretir.
 * `isActive === false` olan, kodsuz ya da tekrarlanan kodlu satırlar atlanır; en fazla 40 alan.
 */
export function customFieldSpecs(definitionRows: Record<string, unknown>[]): CustomFieldSpec[] {
  const specs: CustomFieldSpec[] = [];
  const seen = new Set<string>();
  for (const row of Array.isArray(definitionRows) ? definitionRows : []) {
    if (specs.length >= MAX_CUSTOM_FIELDS) break;
    if (typeof row !== "object" || row === null || row.isActive === false) continue;
    const code = typeof row.code === "string" ? row.code : "";
    if (code === "" || UNSAFE_KEYS.has(code) || seen.has(code)) continue;
    seen.add(code);
    const inputType = inputTypeOf(row.dataType);
    const spec: CustomFieldSpec = { code, label: typeof row.label === "string" && row.label !== "" ? row.label : code, inputType, required: row.isRequired === true };
    if (inputType === "text" && typeof row.maxLength === "number" && Number.isInteger(row.maxLength) && row.maxLength > 0) {
      spec.maxLength = Math.min(row.maxLength, MAX_TEXT_LENGTH);
    }
    specs.push(spec);
  }
  return specs;
}

/** Her alanın değeri: yazılan değer, yoksa değer satırındaki değer, yoksa "" (Boolean alanda "false"; zorunlu Boolean boş gönderilmez). */
export function customFieldValues(specs: CustomFieldSpec[], valueRows: Record<string, unknown>[], typed: Record<string, string>): Record<string, string> {
  const source = new Map<string, unknown>();
  for (const row of Array.isArray(valueRows) ? valueRows : []) {
    if (typeof row === "object" && row !== null && typeof row.code === "string" && !source.has(row.code)) source.set(row.code, row.value);
  }
  const values: Record<string, string> = {};
  for (const spec of specs) {
    const value = Object.prototype.hasOwnProperty.call(typed, spec.code) ? typed[spec.code] : displayText(source.get(spec.code));
    values[spec.code] = spec.inputType === "checkbox" && value === "" ? "false" : value;
  }
  return values;
}

/** Alan kodu → ileti. Zorunlu boş alan "Bu alan zorunludur."; Boolean alan zorunluluktan hiç kalmaz (sunucu "false" saklar). */
export function validateCustomFields(specs: CustomFieldSpec[], values: Record<string, string>): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const spec of specs) {
    const raw = typeof values[spec.code] === "string" ? values[spec.code] : "";
    if (spec.inputType === "checkbox") continue;
    if (spec.inputType === "number" && raw.trim() !== "" && !DECIMAL_TEXT.test(raw.trim())) { errors[spec.code] = "Geçerli bir sayı girin."; continue; }
    const message = validateInputValue(spec.inputType, { required: spec.required, upperCase: false, ...(spec.maxLength !== undefined ? { maxLength: spec.maxLength } : {}) }, raw);
    if (message !== null) errors[spec.code] = message;
  }
  return errors;
}
