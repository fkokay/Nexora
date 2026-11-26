export type MetricCompare = { direction: "up" | "down" | "flat"; percent: number };

const toNumber = (raw: unknown): number | null => {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const parsed = Number(raw.trim());
  return Number.isFinite(parsed) ? parsed : null;
};

/** Değerin karşılaştırma değerine göre yüzde farkı; sayıya çevrilemeyen değerde ya da karşılaştırma 0 iken `null`. */
export function metricCompare(value: unknown, compare: unknown): MetricCompare | null {
  const current = toNumber(value);
  const previous = toNumber(compare);
  if (current === null || previous === null || previous === 0) return null;
  const percent = Math.round(Math.abs((current - previous) / Math.abs(previous)) * 100);
  const direction = current > previous ? "up" : current < previous ? "down" : "flat";
  return { direction, percent: direction === "flat" ? 0 : percent };
}

/** Karşılaştırma satırı metni: `▲ %12` / `▼ %12` / `%0`. */
export const metricCompareText = (compare: MetricCompare): string =>
  compare.direction === "up" ? `▲ %${compare.percent}` : compare.direction === "down" ? `▼ %${compare.percent}` : "%0";
