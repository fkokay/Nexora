import { openWorkspacePage } from "../pageNavigation";

/**
 * Satış belgeleri arası geçiş: hedef liste sekmesini açar (açıksa ona geçer) ve sayfa parametresiyle belgeyi açtırır.
 * Hedef sayfa parametreyi bir kez okuyup temizler.
 */
export function openSalesQuote(quoteId: string) {
  openWorkspacePage({ page: "sales-quotes", params: { quoteId }, replace: false });
}

export function openSalesRequest(requestId: string) {
  openWorkspacePage({ page: "sales-customer-requests", params: { requestId }, replace: false });
}
