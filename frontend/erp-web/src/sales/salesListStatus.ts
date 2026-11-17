import type { StatusTagTone } from "../list-page/StatusTag";
import {
  returnStatus,
  salesDeliveryStatus,
  salesInvoiceStatus,
  salesOrderStatus,
  salesQuoteStatus,
  salesRequestStatus,
} from "../document-page/documentStatus";
import type { DocumentStatusTone } from "../document-page/DocumentSurface";

export type SalesListKind = "quote" | "order" | "delivery" | "invoice" | "request" | "return";

const toneOf: Record<DocumentStatusTone, StatusTagTone> = {
  success: "ok",
  info: "info",
  warning: "warn",
  danger: "bad",
  neutral: "off",
};

const names = {
  quote: salesQuoteStatus,
  order: salesOrderStatus,
  delivery: salesDeliveryStatus,
  invoice: salesInvoiceStatus,
  request: salesRequestStatus,
  return: returnStatus,
} satisfies Record<SalesListKind, (status: string) => { label: string; tone: DocumentStatusTone }>;

/**
 * Status tag of a sales list row (StatusTag tones): the label is the document's own (documentStatus.ts); the tone
 * follows it, except that a draft is "info" (taslak) and a sent quote "warn" (awaiting the customer's answer).
 * Done ok, cancelled / expired off, rejected bad, waiting warn (Açık order, Açık request).
 */
export function salesListTag(kind: SalesListKind, status: string): { tone: StatusTagTone; label: string } {
  const named = names[kind](status);
  if (status === "Draft") return { tone: "info", label: named.label };
  if (kind === "quote" && status === "Sent") return { tone: "warn", label: named.label };
  return { tone: toneOf[named.tone], label: named.label };
}
