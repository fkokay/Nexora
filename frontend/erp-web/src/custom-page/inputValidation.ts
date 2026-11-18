// Saf (React'siz) giriş doğrulama kuralları. İstemci doğrulaması yalnız kullanıcıya yardımdır; sunucu yine doğrular.
import { bindingPath } from "./pageBindings";

export type InputRules = { required: boolean; min?: number | string; max?: number | string; step?: number; maxLength?: number;
  pattern?: string; patternMessage?: string; upperCase: boolean };

export const VALIDATION_BLOCKED = "Formda düzeltilmesi gereken alanlar var.";

const isLimit = (value: unknown): value is number | string =>
  (typeof value === "number" && Number.isFinite(value)) || (typeof value === "string" && value !== "");

/** Giriş bileşeninin özelliklerinden doğrulama kurallarını okur; geçersiz değerler yok sayılır. */
export function inputRules(props: Record<string, unknown>): InputRules {
  const rules: InputRules = { required: props.required === true, upperCase: props.upperCase === true };
  if (isLimit(props.min)) rules.min = props.min;
  if (isLimit(props.max)) rules.max = props.max;
  if (typeof props.step === "number" && Number.isFinite(props.step) && props.step > 0) rules.step = props.step;
  if (typeof props.maxLength === "number" && Number.isInteger(props.maxLength) && props.maxLength > 0) rules.maxLength = props.maxLength;
  if (typeof props.pattern === "string" && props.pattern !== "") rules.pattern = props.pattern;
  if (typeof props.patternMessage === "string" && props.patternMessage !== "") rules.patternMessage = props.patternMessage;
  return rules;
}

function compilePattern(pattern: string): RegExp | null {
  try { return new RegExp("^(?:" + pattern + ")$", "u"); } catch { return null; }
}

/** İlk başarısız denetimin Türkçe iletisini, hepsi geçerse null döner. Boş ve zorunlu olmayan değer her denetimi geçer. */
export function validateInputValue(inputType: string, rules: InputRules, raw: string | boolean): string | null {
  if (inputType === "checkbox" || typeof raw === "boolean") {
    return rules.required && raw !== true && raw !== "true" ? "Bu alan zorunludur." : null;
  }
  const text = raw;
  if (text.trim() === "") return rules.required ? "Bu alan zorunludur." : null;

  if (inputType === "number") {
    const value = Number(text.trim());
    if (!Number.isFinite(value)) return "Geçerli bir sayı girin.";
    if (rules.min !== undefined && value < Number(rules.min)) return `En az ${String(rules.min)} olmalıdır.`;
    if (rules.max !== undefined && value > Number(rules.max)) return `En fazla ${String(rules.max)} olmalıdır.`;
    if (rules.step !== undefined) {
      const ratio = value / rules.step;
      if (Math.abs(ratio - Math.round(ratio)) >= 1e-9) return `Değer ${String(rules.step)} adımlarına uymalıdır.`;
    }
  } else if (inputType === "date") {
    const value = text.slice(0, 10);
    if (rules.min !== undefined && value < String(rules.min)) return `En erken ${String(rules.min)} olabilir.`;
    if (rules.max !== undefined && value > String(rules.max)) return `En geç ${String(rules.max)} olabilir.`;
  }

  if (rules.maxLength !== undefined && text.length > rules.maxLength) return `En fazla ${String(rules.maxLength)} karakter girilebilir.`;
  if (rules.pattern !== undefined) {
    const pattern = compilePattern(rules.pattern);
    if (pattern && !pattern.test(text)) return rules.patternMessage ?? "Değer beklenen biçimde değil.";
  }
  return null;
}

/** Yazarken uygulanan dönüşüm: `upperCase` JS toUpperCase() ile (sunucunun ToUpperInvariant'ı gibi); hiçbir zaman kırpmaz. */
export function applyTyping(rules: InputRules, text: string): string {
  return rules.upperCase ? text.toUpperCase() : text;
}

/** Input names bound as `{{<name>.value}}` by the query's parameters, in parameter order. */
export function boundInputNames(query: { parameters: { binding: string }[] }): string[] {
  const names: string[] = [];
  for (const parameter of query.parameters) {
    const match = bindingPath(parameter.binding)?.match(/^([A-Za-z_][A-Za-z0-9_]*)\.value$/);
    if (match && !names.includes(match[1])) names.push(match[1]);
  }
  return names;
}
