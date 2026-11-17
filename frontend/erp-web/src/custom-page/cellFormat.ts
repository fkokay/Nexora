export type Tone = "info" | "success" | "warning" | "danger";
export type ColumnFormat = "text" | "code" | "number" | "money" | "date" | "status";

export const TONES: readonly Tone[] = ["info", "success", "warning", "danger"];
export const COLUMN_FORMATS: readonly ColumnFormat[] = ["text", "code", "number", "money", "date", "status"];

const EMPTY = "—";

function splitEntry(entry: unknown): [string, string] | null {
  if (typeof entry !== "string") return null;
  const index = entry.lastIndexOf("=");
  if (index <= 0) return null;
  const key = entry.slice(0, index).trim();
  const value = entry.slice(index + 1).trim();
  return key && value ? [key, value] : null;
}

export function parseToneMap(entries: unknown): { key: string; tone: Tone }[] {
  if (!Array.isArray(entries)) return [];
  const result: { key: string; tone: Tone }[] = [];
  for (const entry of entries) {
    const pair = splitEntry(entry);
    if (!pair) continue;
    const tone = pair[1] as Tone;
    if (TONES.includes(tone)) result.push({ key: pair[0], tone });
  }
  return result;
}

const normalize = (text: string) => text.toLocaleLowerCase("tr-TR").trim();

export function toneFor(text: string, map: { key: string; tone: Tone }[]): Tone | null {
  const needle = normalize(text);
  return map.find((item) => normalize(item.key) === needle)?.tone ?? null;
}

export function parseColumnFormats(entries: unknown): Record<string, ColumnFormat> {
  const result: Record<string, ColumnFormat> = Object.create(null);
  if (!Array.isArray(entries)) return result;
  for (const entry of entries) {
    const pair = splitEntry(entry);
    if (!pair) continue;
    const format = pair[1] as ColumnFormat;
    if (COLUMN_FORMATS.includes(format)) result[pair[0]] = format;
  }
  return result;
}

const isNumericType = (dataType?: string) => { const type = dataType?.toLowerCase(); return type === "number" || type === "decimal"; };

const numberFormat = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 });
const moneyFormat = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateFormat = new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" });

export function formatCell(value: unknown, format?: ColumnFormat, dataType?: string): string {
  if (value === null || value === undefined) return EMPTY;
  if (typeof value === "string" && value.trim() === "") return EMPTY;
  const effective = format ?? (isNumericType(dataType) ? "number" : undefined);
  if (effective === "number" || effective === "money") {
    if (typeof value === "boolean") return String(value);
    const numeric = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(numeric)) {
      const text = (effective === "money" ? moneyFormat : numberFormat).format(numeric);
      return /^-0(,0+)?$/.test(text) ? text.slice(1) : text;
    }
    return String(value);
  }
  if (effective === "date") {
    if (typeof value === "string") {
      const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
      if (iso) return `${iso[3]}.${iso[2]}.${iso[1]}`;
    }
    const date = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(date.getTime()) ? String(value) : dateFormat.format(date);
  }
  if (typeof value === "boolean") return value ? "Evet" : "Hayır";
  if (typeof value === "object") {
    try { return JSON.stringify(value) ?? String(value); } catch { return String(value); }
  }
  return String(value);
}

export function isRightAligned(format: ColumnFormat | undefined, dataType?: string): boolean {
  if (format) return format === "number" || format === "money";
  return isNumericType(dataType);
}

const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

export function columnTotal(rows: Record<string, unknown>[], code: string): number | null {
  let total = 0;
  let found = false;
  for (const row of rows) {
    const value = row[code];
    if (isFiniteNumber(value)) {
      total += value;
      found = true;
    }
  }
  return found ? total : null;
}

export function trendPoints(rows: Record<string, unknown>[], max = 30): number[] {
  const keys: string[] = [];
  for (const row of rows) for (const key of Object.keys(row)) if (!keys.includes(key)) keys.push(key);
  const key = keys.find((candidate) => rows.some((row) => isFiniteNumber(row[candidate])));
  if (!key) return [];
  return rows.map((row) => row[key]).filter(isFiniteNumber).slice(0, max);
}

export function sparklinePath(rawPoints: number[], width: number, height: number): string {
  const points = rawPoints.filter(Number.isFinite);
  if (points.length < 2) return "";
  const min = Math.min(...points);
  const max = Math.max(...points);
  const pad = 2;
  const step = width / (points.length - 1);
  const round = (n: number) => Math.round(n * 100) / 100;
  return points
    .map((value, index) => {
      const y = max === min ? height / 2 : height - pad - ((value - min) / (max - min)) * (height - pad * 2);
      return `${round(index * step)},${round(y)}`;
    })
    .join(" ");
}
