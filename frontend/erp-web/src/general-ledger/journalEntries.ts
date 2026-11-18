import type { JournalEntrySummary, JournalEntryView } from "../erp-types";
import { journalSourceTypeLabel } from "./sourceTypeLabels";

/** Helpers of the journal ledger list, its panel and the read-only entry document. */

/** Debit equals credit to the kuruş (as the voucher form checks it), not by floating-point equality. */
export const isBalanced = (entry: { totalDebit: number; totalCredit: number }) =>
  Math.round(entry.totalDebit * 100) === Math.round(entry.totalCredit * 100);

/** Long legacy codes keep the prefix and the last 8 characters: "YV-…1a2b3c4d". */
export const shortenEntryCode = (code: string) => {
  if (code.length <= 16) return code;
  const dash = code.indexOf("-");
  const prefix = dash > 0 && dash <= 4 ? code.slice(0, dash + 1) : code.slice(0, 3);
  return `${prefix}…${code.slice(-8)}`;
};

/** "16.11 17:48" (mockup 09); the full date and time is the cell's title. */
export const entryCreatedLabel = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { short: "—", full: value };
  return {
    short: date.toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).replace(/\s+/, " "),
    full: date.toLocaleString("tr-TR"),
  };
};

/**
 * Why "Ters kayıt oluştur" is unavailable for an entry (null = available). The rule is today's: a TenantAdmin
 * reverses a manual entry that has no reversal yet; a sourced entry is cancelled from its source document.
 */
export function reversalBlockReason(role: string, entry: JournalEntryView | null, busy: boolean): string | null {
  if (role !== "TenantAdmin") return "Ters kaydı yalnız firma yöneticisi oluşturabilir";
  if (!entry) return "Fiş yükleniyor…";
  if (entry.sourceType === "ManualReversal") return "Ters kayıt fişi yeniden ters çevrilemez";
  if (entry.sourceType !== "Manual") return "Kaynaklı fiş kaynak belgeden iptal edilir";
  if (entry.isReversed) return "Bu fişin ters kaydı var";
  if (busy) return "İşlem sürüyor…";
  return null;
}

/** "Kaynak belge" text of an entry: there is no source document number in the API, only its type. */
export function entrySourceText(entry: Pick<JournalEntrySummary, "sourceType">, reversedCode: string | null) {
  if (entry.sourceType === "ManualReversal") return `Ters çevrilen fiş: ${reversedCode ?? "—"}`;
  if (entry.sourceType === "Manual") return "Manuel fiş (kaynak belge yok)";
  return journalSourceTypeLabel(entry.sourceType);
}

