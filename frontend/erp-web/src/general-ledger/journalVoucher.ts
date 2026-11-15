/** Manual journal voucher helpers shared by the form and its submit handler. */
export type ManualJournalLine = {
  accountId: string;
  description: string;
  debit: string;
  credit: string;
};

export const emptyManualJournalLine = (): ManualJournalLine => ({
  accountId: "",
  description: "",
  debit: "",
  credit: "",
});

/**
 * Parses an amount typed as "1.250,50", "1250,5" or "1250.50" into cents.
 * Empty input is 0; anything that is not a non-negative amount returns null.
 */
export function parseAmountCents(value: string): number | null {
  const raw = value.replace(/\s/g, "");
  if (!raw) return 0;
  // "1.250" is read the Turkish way (thousands); "12.5" stays a decimal point.
  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : /^\d{1,3}(\.\d{3})+$/.test(raw)
      ? raw.replace(/\./g, "")
      : raw;
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.round(amount * 100) : null;
}

export const formatCents = (cents: number) =>
  (cents / 100).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** A line the user has not touched at all: ignored on save, so a trailing empty row never blocks it. */
export const isBlankManualJournalLine = (line: ManualJournalLine) =>
  !line.accountId &&
  !line.description.trim() &&
  !parseAmountCents(line.debit) &&
  !parseAmountCents(line.credit);

export function manualJournalTotals(lines: ManualJournalLine[]) {
  let debit = 0,
    credit = 0;
  for (const line of lines) {
    debit += parseAmountCents(line.debit) ?? 0;
    credit += parseAmountCents(line.credit) ?? 0;
  }
  return { debit, credit, difference: debit - credit };
}

/** Message shown next to the save bar while debit and credit totals differ. */
export function manualJournalBalanceMessage(difference: number) {
  return difference > 0
    ? `Fiş dengeli değil: alacağa ${formatCents(difference)} ekleyin ya da borcu azaltın.`
    : `Fiş dengeli değil: borca ${formatCents(-difference)} ekleyin ya da alacağı azaltın.`;
}

/**
 * Validates the voucher as the API will (2–100 lines, an account and exactly one positive
 * side per line, equal totals) and returns the request lines, or the first problem found.
 * Blank lines are dropped; an empty line description falls back to the voucher description.
 */
export function buildManualJournalRequestLines(
  lines: ManualJournalLine[],
  voucherDescription: string,
):
  | { ok: true; lines: { accountId: string; description: string; debit: number; credit: number }[] }
  | { ok: false; error: string } {
  const filled = lines
    .map((line, index) => ({ line, number: index + 1 }))
    .filter(({ line }) => !isBlankManualJournalLine(line));
  const fallbackDescription = voucherDescription.trim();
  const result: { accountId: string; description: string; debit: number; credit: number }[] = [];
  for (const { line, number } of filled) {
    const debit = parseAmountCents(line.debit),
      credit = parseAmountCents(line.credit);
    if (debit === null || credit === null)
      return { ok: false, error: `${number}. satırdaki tutar geçersiz. Örnek: 1.250,50` };
    if (!line.accountId) return { ok: false, error: `${number}. satırda hesap seçin.` };
    if ((debit > 0) === (credit > 0))
      return { ok: false, error: `${number}. satıra yalnızca borç ya da alacak tutarı girin.` };
    result.push({
      accountId: line.accountId,
      description: (line.description.trim() || fallbackDescription).slice(0, 240),
      debit: debit / 100,
      credit: credit / 100,
    });
  }
  if (result.length < 2) return { ok: false, error: "Fişte hesap ve tutarı girilmiş en az iki satır olmalı." };
  if (result.length > 100) return { ok: false, error: "Bir fişte en fazla 100 satır olabilir." };
  const totals = manualJournalTotals(filled.map(({ line }) => line));
  if (totals.difference !== 0) return { ok: false, error: manualJournalBalanceMessage(totals.difference) };
  return { ok: true, lines: result };
}
