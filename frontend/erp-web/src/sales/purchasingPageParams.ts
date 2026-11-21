import { useEffect, useRef } from "react";
import { api } from "../erpApi";
import { pageParamsOf, setPageParams, usePageParams } from "../pageNavigation";

/**
 * Page params a purchasing system page passes when it opens a legacy purchasing screen (erpPage `params`, or the tab's own
 * params when the user picks "Eski ekranda aç"). Decision K7 of the purchasing inventory.
 */
export type PurchasingPageParam = "purchaseOrderId" | "receiptId" | "purchaseInvoiceId" | "requestId" | "supplierId";
export type PurchasingPageParams = Partial<Record<PurchasingPageParam, string>>;

/** The named params that have a value. */
export function pickPurchasingParams(params: Readonly<Record<string, string>>, names: readonly PurchasingPageParam[]): PurchasingPageParams {
  const picked: PurchasingPageParams = {};
  for (const name of names) if (params[name]) picked[name] = params[name];
  return picked;
}

/**
 * Reads the named params of `page` once and removes only those from the tab (other params stay), like the sessionStorage
 * hand-offs: the next menu-opened screen starts clean, and the tab re-reads them when it is opened again with new params.
 * `page` undefined disables the reader (e.g. a component rendered for another tab).
 */
export function usePurchasingPageParams(
  page: string | undefined,
  names: readonly PurchasingPageParam[],
  onParams: (params: PurchasingPageParams) => void,
) {
  const params = usePageParams(page);
  const handler = useRef(onParams);
  handler.current = onParams;
  const namesKey = names.join(",");
  useEffect(() => {
    if (!page) return;
    // Read the store, not the render's snapshot: a re-run effect (StrictMode) must not hand the same params out twice.
    const current = pageParamsOf(page);
    const picked = pickPurchasingParams(current, names);
    if (Object.keys(picked).length === 0) return;
    const rest: Record<string, string> = { ...current };
    for (const name of names) delete rest[name];
    setPageParams(page, rest);
    handler.current(picked);
    // `names` is compared by its joined value.
  }, [page, params, namesKey]);
}

/** A receipt's order and supplier (the receipt list opens a receipt through its order; invoice entry searches by its code). */
export type PurchasingReceiptRef = { id: string; code: string; purchaseOrderId: string; supplierId: string; supplierName: string };
export const loadPurchasingReceiptRef = (token: string, receiptId: string) =>
  api<PurchasingReceiptRef>(`/api/purchasing/receipts/${encodeURIComponent(receiptId)}`, token);

/** A supplier's display name for a filter chip opened with only `supplierId`. */
export const loadSupplierName = (token: string, supplierId: string) =>
  api<{ name?: string }>(`/api/customers/${encodeURIComponent(supplierId)}`, token).then((supplier) => supplier.name ?? "");
