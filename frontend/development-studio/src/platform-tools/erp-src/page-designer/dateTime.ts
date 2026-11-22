// Kurallar frontend/erp-web/src/custom-page/dateTimeInput.ts ile aynıdır (Studio erp-web içinden içe aktaramaz); biri değişirse diğeri de güncellenmelidir.
// Tarih + saat (`inputType: "datetime"`, `format: "datetime"`, parametre türü "datetime"): saat dilimli ISO 8601 olduğu gibi,
// dilimsiz metin (`datetime-local`, `YYYY-MM-DDTHH:mm`) yerel saat olarak okunur.

const LOCAL_TEXT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3})\d*)?)?$/;
const OFFSET_TEXT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/i;

function parseLocal(text: string): Date | null {
  const match = LOCAL_TEXT.exec(text);
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1, 6).map(Number);
  const second = match[6] ? Number(match[6]) : 0;
  const ms = match[7] ? Number(match[7].padEnd(3, "0")) : 0;
  const date = new Date(year, month - 1, day, hour, minute, second, ms);
  // 2026-02-31 gibi taşan tarihler geçersizdir.
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

export function parseDateTime(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (text === "") return null;
  if (OFFSET_TEXT.test(text)) {
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return parseLocal(text);
}

/** Parametre değeri: UTC ISO 8601 (`…Z`); boş veya geçersiz değer null. */
export function toIsoDateTime(value: unknown): string | null {
  return parseDateTime(value)?.toISOString() ?? null;
}

const dateTimeFormat = new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Yerel saatle `gg.aa.yyyy ss:dd`; çözülemeyen değer null. */
export function formatDateTime(value: unknown): string | null {
  const date = parseDateTime(value);
  return date ? dateTimeFormat.format(date) : null;
}
