// Studio eşi: frontend/development-studio/src/platform-tools/erp-src/page-designer/dateTime.ts; ikisi birlikte değişmelidir.
/**
 * Tarih + saat girişi (`inputType: "datetime"`) ve biçimi (`format: "datetime"`).
 * Ham değer tarayıcının `datetime-local` metnidir (yerel saat, `YYYY-MM-DDTHH:mm`); kapsamdaki değer saat dilimli ISO 8601
 * (UTC, `…Z`) metnidir. Kaynak kayıttan gelen ISO değeri dokunulmadıkça ham değer olarak kalır; böylece değiştirilmeden
 * kaydedilen değer aynı anı (saniyesiyle) korur.
 */

const LOCAL_TEXT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3})\d*)?)?$/;
const OFFSET_TEXT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/i;

const pad = (value: number, length = 2) => String(value).padStart(length, "0");

/** Saat dilimsiz yerel metni (`datetime-local`) Date'e çevirir; geçersizse null. */
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

/** Ham veya kaynak değeri Date'e çevirir: saat dilimli ISO olduğu gibi, dilimsiz metin yerel saat olarak okunur. */
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

/** `datetime-local` denetiminin değeri: yerel `YYYY-MM-DDTHH:mm`; boş/geçersiz değer "". */
export function toLocalInputText(value: unknown): string {
  const date = parseDateTime(value);
  if (!date) return "";
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Kapsamdaki değer: UTC ISO 8601 (`…Z`); boş veya geçersiz değer null. */
export function toIsoDateTime(value: unknown): string | null {
  return parseDateTime(value)?.toISOString() ?? null;
}

const dateTimeFormat = new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Yerel saatle `gg.aa.yyyy ss:dd`; çözülemeyen değer null. */
export function formatDateTime(value: unknown): string | null {
  const date = parseDateTime(value);
  return date ? dateTimeFormat.format(date) : null;
}
