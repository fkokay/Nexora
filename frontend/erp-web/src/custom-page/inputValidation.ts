// Saf (React'siz) giriş doğrulama kuralları. İstemci doğrulaması yalnız kullanıcıya yardımdır; sunucu yine doğrular.
import { bindingPath } from "./pageBindings";

export type InputRules = { required: boolean; min?: number | string; max?: number | string; step?: number; maxLength?: number;
  pattern?: string; patternMessage?: string; upperCase: boolean };

export const VALIDATION_BLOCKED = "Formda düzeltilmesi gereken alanlar var.";

const NUMBER_TEXT = /^-?\d+(\.\d+)?$/;
const DATE_TEXT = /^\d{4}-\d{2}-\d{2}$/;
const MAX_PATTERN = 200;
/** Sınır sayı (sayı girişi) ya da YYYY-MM-DD metni (tarih girişi) olabilir; başka her şey yok sayılır. */
const isLimit = (value: unknown): value is number | string =>
  (typeof value === "number" && Number.isFinite(value)) || (typeof value === "string" && DATE_TEXT.test(value));

/** Giriş bileşeninin özelliklerinden doğrulama kurallarını okur; geçersiz değerler yok sayılır. */
export function inputRules(props: Record<string, unknown>): InputRules {
  const rules: InputRules = { required: props.required === true, upperCase: props.upperCase === true };
  if (isLimit(props.min)) rules.min = props.min;
  if (isLimit(props.max)) rules.max = props.max;
  if (typeof props.step === "number" && Number.isFinite(props.step) && props.step > 0) rules.step = props.step;
  if (typeof props.maxLength === "number" && Number.isInteger(props.maxLength) && props.maxLength > 0) rules.maxLength = props.maxLength;
  if (typeof props.pattern === "string" && props.pattern !== "") {
    if (props.pattern.length <= MAX_PATTERN) rules.pattern = props.pattern;
    else console.warn(`Giriş deseni ${MAX_PATTERN} karakteri aşıyor; yok sayıldı.`);
  }
  if (typeof props.patternMessage === "string" && props.patternMessage !== "") rules.patternMessage = props.patternMessage;
  return rules;
}

function compilePattern(pattern: string): RegExp | null {
  if (pattern.length > MAX_PATTERN) return null;
  try { return new RegExp("^(?:" + pattern + ")$"); } catch {
    console.warn("Giriş deseni geçerli bir düzenli ifade değil; yok sayıldı.");
    return null;
  }
}

/** İlk başarısız denetimin Türkçe iletisini, hepsi geçerse null döner. Boş ve zorunlu olmayan değer her denetimi geçer. */
export function validateInputValue(inputType: string, rules: InputRules, raw: string | boolean): string | null {
  if (inputType === "checkbox" || typeof raw === "boolean") {
    return rules.required && raw !== true && raw !== "true" ? "Bu alan zorunludur." : null;
  }
  const text = raw;
  if (text.trim() === "") return rules.required ? "Bu alan zorunludur." : null;

  if (inputType === "number") {
    // Sınır kuralı yoksa tarayıcının sayı girişinin kabul ettiği her sonlu sayı geçer (".5", "1e3"); "abc" geçmez.
    // min/max/step varsa karşılaştırma için katı biçim aranır: noktalı ondalık; "1e3", "0x10", "1,5" geçersizdir.
    const hasNumberRule = typeof rules.min === "number" || typeof rules.max === "number" || rules.step !== undefined;
    const trimmed = text.trim();
    if (!hasNumberRule) return Number.isFinite(Number(trimmed)) ? checkTextRules(rules, text) : "Geçerli bir sayı girin.";
    if (!NUMBER_TEXT.test(trimmed)) return "Geçerli bir sayı girin.";
    const value = Number(trimmed);
    if (typeof rules.min === "number" && value < rules.min) return `En az ${String(rules.min)} olmalıdır.`;
    if (typeof rules.max === "number" && value > rules.max) return `En fazla ${String(rules.max)} olmalıdır.`;
    if (rules.step !== undefined) {
      const ratio = value / rules.step;
      if (Math.abs(ratio - Math.round(ratio)) >= 1e-9) return `Değer ${String(rules.step)} adımlarına uymalıdır.`;
    }
  } else if (inputType === "date") {
    const value = text.slice(0, 10);
    if (typeof rules.min === "string" && DATE_TEXT.test(rules.min) && value < rules.min) return `En erken ${rules.min} olabilir.`;
    if (typeof rules.max === "string" && DATE_TEXT.test(rules.max) && value > rules.max) return `En geç ${rules.max} olabilir.`;
  }

  return checkTextRules(rules, text);
}

function checkTextRules(rules: InputRules, text: string): string | null {
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
