import { StatusTag } from "../../list-page/StatusTag";
import { salesListTag, type SalesListKind } from "../salesListStatus";

/** Amount cell of a sales list: normal weight; the cell carries `nx-num` (right, tabular-nums). */
export function listAmount(value: number, currency: string) {
  return (
    <>
      <span>{value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> <span>{currency}</span>
    </>
  );
}

/** Status cell of a sales list (see salesListTag for the tones). */
export function listTag(kind: SalesListKind, status: string) {
  const tag = salesListTag(kind, status);
  return <StatusTag tone={tag.tone}>{tag.label}</StatusTag>;
}

/** Number / code columns of the sales lists. */
export const SALES_NUMBER_FIELDS: ReadonlySet<string> = new Set(["lineCount", "grandTotal", "quoteCount"]);
export const SALES_CODE_FIELDS: ReadonlySet<string> = new Set(["code"]);

/*
 * Default column widths (fields without a tenant width), sized so the default columns and the checkbox column fit
 * beside the menu at 1440 with the panel closed and beside the panel at 1720 (no horizontal scroll).
 */
export const QUOTE_LIST_WIDTHS: Record<string, number> = {
  code: 120, customerName: 200, salesperson: 120, salesOrderCode: 105, quoteDate: 95, validUntil: 95, lineCount: 55,
  grandTotal: 130, status: 105,
};
export const ORDER_LIST_WIDTHS: Record<string, number> = {
  code: 115, quoteCode: 115, customerName: 230, orderDate: 100, lineCount: 55, grandTotal: 130, status: 105, actions: 56,
};
export const INVOICE_LIST_WIDTHS: Record<string, number> = {
  code: 120, deliveryCode: 110, orderCode: 110, customerName: 220, customerTaxNumber: 110, invoiceDate: 95,
  lineCount: 55, grandTotal: 130, status: 95,
};
export const DELIVERY_LIST_WIDTHS: Record<string, number> = {
  code: 120, orderCode: 115, deliveryDate: 100, warehouseName: 170, lineCount: 55, status: 105, invoiceStatus: 110,
};
