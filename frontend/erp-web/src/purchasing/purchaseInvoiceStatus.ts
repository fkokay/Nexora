import type { StatusTagTone } from "../list-page/StatusTag";
import { purchaseInvoiceStatus } from "../document-page/documentStatus";

type InvoiceFields = { status: string; dueDate: string; paidAmount: number; outstandingAmount: number };

export type PurchaseInvoiceTag = { key: "voided" | "paid" | "overdue" | "partial" | "posted"; tone: StatusTagTone; label: string };

const dayNumber = (value: string) => {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
};

/**
 * Days past the due date of an unpaid posted invoice (0 when it is not overdue). `today` is the local date
 * (`YYYY-MM-DD`, localDateString). A voided invoice is never overdue, although the list still returns its total as
 * the outstanding amount.
 */
export function purchaseInvoiceOverdueDays(row: InvoiceFields, today: string): number {
  if (row.status !== "Posted" || row.outstandingAmount <= 0) return 0;
  return Math.max(0, Math.round(dayNumber(today) - dayNumber(row.dueDate)));
}

/**
 * Status tag of a purchase invoice row (taslak 07). The server status is only İşlendi / İptal; the payment state comes
 * from the row's paid / outstanding amounts and due date:
 * Voided → İptal (off); Posted, nothing outstanding and something paid → Ödendi (ok) — nothing outstanding without a
 * payment (fully returned) stays İşlendi; outstanding and past due → Vadesi geçti (bad);
 * outstanding with a payment → Kısmen ödendi (warn); otherwise İşlendi (info).
 */
export function purchaseInvoiceListTag(row: InvoiceFields, today: string): PurchaseInvoiceTag {
  if (row.status !== "Posted")
    return { key: "voided", tone: "off", label: purchaseInvoiceStatus(row.status).label };
  if (row.outstandingAmount <= 0)
    return row.paidAmount > 0
      ? { key: "paid", tone: "ok", label: "Ödendi" }
      : { key: "posted", tone: "info", label: purchaseInvoiceStatus("Posted").label };
  if (purchaseInvoiceOverdueDays(row, today) > 0) return { key: "overdue", tone: "bad", label: "Vadesi geçti" };
  if (row.paidAmount > 0) return { key: "partial", tone: "warn", label: "Kısmen ödendi" };
  return { key: "posted", tone: "info", label: purchaseInvoiceStatus("Posted").label };
}
