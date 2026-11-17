/**
 * Expiry of a tracked lot / serial balance. There is no tenant setting for a "near expiry" window today, so the
 * Lot / seri izleme list uses this fixed one (named in its card label: "30 gün içinde dolacak").
 */
export const EXPIRY_SOON_DAYS = 30;

/** Today in the viewer's local calendar as YYYY-MM-DD (the API's expiry dates are date-only). */
export function localToday(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

const dayNumber = (value: string) => {
  const [year, month, date] = value.split("-").map(Number);
  return Date.UTC(year, month - 1, date) / 86_400_000;
};

/**
 * "expired" before `today`, "soon" from today through EXPIRY_SOON_DAYS days ahead, else null (also without a date).
 * Both arguments are YYYY-MM-DD; they are compared as calendar days, not as instants.
 */
export function expiryState(expiry: string | null, today: string): "expired" | "soon" | null {
  if (!expiry) return null;
  const days = dayNumber(expiry.slice(0, 10)) - dayNumber(today);
  if (!Number.isFinite(days)) return null;
  if (days < 0) return "expired";
  return days <= EXPIRY_SOON_DAYS ? "soon" : null;
}
