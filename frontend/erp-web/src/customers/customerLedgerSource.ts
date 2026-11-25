import type { CustomerStatementLine } from "../erp-types";

/** Statement source kinds (the API's `sourceType`) and their Turkish names. */
export const LEDGER_SOURCE_LABELS: Record<string, string> = {
  SalesInvoice: "Satış faturası",
  CustomerCollection: "Tahsilat",
  SalesReturn: "Satış iadesi",
  PurchaseInvoice: "Alış faturası",
  PurchaseInvoiceDraft: "Alış faturası taslağı",
  SupplierPayment: "Tedarikçi ödemesi",
  SupplierReturn: "Alış iadesi",
};

export const NO_LEDGER_SOURCE = "Elle girilen hareket; bağlı belge yok";

/**
 * The screen and page params that open a statement line's document ("Karar 4" params, read once by the target screen).
 * A collection opens its invoice on Tahsilat ve İadeler; a supplier payment opens its purchase invoice. Null without a document.
 */
export function ledgerSourceTarget(line: Pick<CustomerStatementLine, "sourceType" | "sourceOpenId">): { page: string; params: Record<string, string> } | null {
  const id = line.sourceOpenId;
  if (!id || !line.sourceType) return null;
  switch (line.sourceType) {
    case "SalesInvoice": return { page: "sales-invoices", params: { invoiceId: id } };
    case "CustomerCollection": return { page: "sales-invoices", params: { invoiceId: id, tab: "transactions" } };
    case "SalesReturn": return { page: "sales-returns", params: { returnId: id } };
    case "PurchaseInvoice":
    case "SupplierPayment": return { page: "sales-purchase-invoices", params: { invoiceId: id } };
    case "PurchaseInvoiceDraft": return { page: "sales-purchase-invoice-drafts", params: { draftId: id } };
    case "SupplierReturn": return { page: "sales-purchase-returns", params: { returnId: id } };
    default: return null;
  }
}
