/** Satış talebi: müşteriden gelen ürün talebi. Tekliften önceki ilk adımdır. */
export type SalesRequestStatus = "Open" | "Quoted" | "Cancelled";

export type SalesRequestSummary = {
  id: string;
  code: string;
  customerId: string;
  customerName: string;
  requestDate: string;
  neededByDate: string | null;
  description: string | null;
  status: SalesRequestStatus;
  lineCount: number;
  quoteCount: number;
  createdAt: string;
};

export type SalesRequestLine = {
  lineNumber: number;
  stockItemId: string;
  stockCode: string;
  stockName: string;
  unitCode: string;
  quantity: number;
  enteredQuantity?: number | null;
  enteredUnitCode?: string | null;
};

export type SalesRequestQuoteLink = {
  id: string;
  code: string;
  status: string;
  grandTotal: number;
  currencyCode: string;
  quoteDate: string;
};

export type SalesRequestDetail = {
  id: string;
  code: string;
  customerId: string;
  customerName: string;
  currencyCode: string;
  requestDate: string;
  neededByDate: string | null;
  description: string | null;
  status: SalesRequestStatus;
  cancelReason: string | null;
  createdAt: string;
  lines: SalesRequestLine[];
  quotes: SalesRequestQuoteLink[];
};

/** Teklif formunun bu anahtarı okuyup talebi ön doldurması için kullanılır (bkz. SalesPage). */
export const quoteFromRequestStorageKey = "nexora.sales-quote.request-id";

export const formatRequestDate = (value: string | null) =>
  value ? new Date(`${value}T00:00:00`).toLocaleDateString("tr-TR") : "—";

export const formatRequestQuantity = (value: number) =>
  value.toLocaleString("tr-TR", { maximumFractionDigits: 4 });

export const formatRequestAmount = (value: number) =>
  value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
