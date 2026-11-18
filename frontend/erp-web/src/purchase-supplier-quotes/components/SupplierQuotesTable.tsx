import type { MutableRefObject, ReactNode } from "react";
import type { GridExportActions } from "../../AdvancedDataGrid";
import SalesDocumentGrid, { type SalesGridSelection } from "../../sales/components/SalesDocumentGrid";
import { listAmount } from "../../sales/components/salesListCells";
import { StatusTag } from "../../list-page/StatusTag";
import { PURCHASE_QUOTE_LIST_WIDTHS, purchaseQuoteListTag } from "../../purchasing/purchaseQuoteList";
import type { Quote, ScreenField } from "../types";

export const defaultSupplierQuoteFields: ScreenField[] = [
  { key: "code", label: "Teklif no", visible: true, position: 0 },
  { key: "requestCode", label: "Talep", visible: true, position: 1 },
  { key: "supplierName", label: "Tedarikçi", visible: true, position: 2 },
  { key: "quoteDate", label: "Tarih", visible: true, position: 3 },
  { key: "validUntil", label: "Geçerlilik", visible: true, position: 4 },
  { key: "status", label: "Durum", visible: true, position: 5 },
  { key: "grandTotal", label: "Toplam", visible: true, position: 6 },
  { key: "lineCount", label: "Satır", visible: false, position: 7 },
  { key: "createdAt", label: "Oluşturulma", visible: false, position: 8 },
];

const numericFields: ReadonlySet<string> = new Set(["grandTotal", "lineCount"]);
const codeFields: ReadonlySet<string> = new Set(["code", "requestCode"]);

type Props = {
  items: Quote[];
  fields?: ScreenField[];
  loading: boolean;
  toolbarContainer?: HTMLElement | null;
  exportActionsRef?: MutableRefObject<GridExportActions | null>;
  /** List type: checkbox column, page-owned current row, bulk bar; Enter / double click open the quote's request. */
  selection: SalesGridSelection;
  footer?: ReactNode;
};

const date = (value: string | null) => (value ? value.slice(0, 10).split("-").reverse().join(".") : "—");

function renderCell(quote: Quote, key: string): ReactNode {
  switch (key) {
    case "code":
      return quote.code;
    case "requestCode":
      return quote.requestCode;
    case "supplierName":
      return <b className="customer-name">{quote.supplierName}</b>;
    case "quoteDate":
      return date(quote.quoteDate);
    case "validUntil":
      return date(quote.validUntil);
    case "status": {
      const tag = purchaseQuoteListTag(quote.status);
      return <StatusTag tone={tag.tone}>{tag.label}</StatusTag>;
    }
    case "grandTotal":
      return listAmount(quote.grandTotal, quote.currencyCode);
    case "lineCount":
      return quote.lineCount.toLocaleString("tr-TR");
    case "createdAt":
      return new Date(quote.createdAt).toLocaleString("tr-TR");
    default:
      return null;
  }
}

/** Satınalma Teklifleri tablosu: Satış listeleriyle aynı liste tipi (SalesDocumentGrid), kiracının ekran düzeniyle. */
export default function SupplierQuotesTable({
  items,
  fields = defaultSupplierQuoteFields,
  loading,
  toolbarContainer,
  exportActionsRef,
  selection,
  footer,
}: Props) {
  const columns = fields
    .filter((field) => field.visible)
    .sort((a, b) => a.position - b.position);
  return (
    <SalesDocumentGrid
      gridId="purchase-supplier-quotes"
      ariaLabel="Tedarikçi teklifleri tablosu"
      hideExport
      exportActionsRef={exportActionsRef}
      fields={columns}
      items={items}
      loading={loading}
      loadingMessage="Teklifler yükleniyor…"
      emptyMessage="Bu filtrelerle teklif bulunamadı."
      search=""
      searchEmptyMessage="Bu filtrelerle teklif bulunamadı."
      toolbarContainer={toolbarContainer}
      renderCell={(field, quote) => renderCell(quote, field.key)}
      selection={selection}
      footer={footer}
      columnWidths={PURCHASE_QUOTE_LIST_WIDTHS}
      numberFields={numericFields}
      codeFields={codeFields}
    />
  );
}
