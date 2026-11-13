import type { ReactNode } from "react";
import { DocumentStatusBadge } from "../../document-page/DocumentStatusBadge";
import { supplierQuoteStatus } from "../../document-page/documentStatus";
import AdvancedDataGrid from "../../AdvancedDataGrid";
import { screenViewGridDefaults } from "../../screenViewGridLayout";
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

const numericFields = new Set(["grandTotal", "lineCount"]);

type Props = {
  items: Quote[];
  fields?: ScreenField[];
  loading: boolean;
  selectedId: string | undefined;
  onSelect: (quote: Quote) => void;
};

function renderCell(quote: Quote, key: string): ReactNode {
  switch (key) {
    case "code":
      return <b>{quote.code}</b>;
    case "requestCode":
      return quote.requestCode;
    case "supplierName":
      return quote.supplierName;
    case "quoteDate":
      return quote.quoteDate;
    case "validUntil":
      return quote.validUntil || "—";
    case "status":
      return <DocumentStatusBadge status={supplierQuoteStatus(quote.status)} />;
    case "grandTotal":
      return `${quote.grandTotal.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ${quote.currencyCode}`;
    case "lineCount":
      return quote.lineCount.toLocaleString("tr-TR");
    case "createdAt":
      return new Date(quote.createdAt).toLocaleString("tr-TR");
    default:
      return null;
  }
}

export default function SupplierQuotesTable({
  items,
  fields = defaultSupplierQuoteFields,
  loading,
  selectedId,
  onSelect,
}: Props) {
  const columns = fields
    .filter((field) => field.visible)
    .sort((a, b) => a.position - b.position);
  const span = Math.max(columns.length, 1);
  return (
    <div
      className="customer-table-wrap supplier-quotes-table-wrap"
      role="region"
      aria-label="Tedarikçi teklifleri tablosu"
      tabIndex={0}
    >
      <AdvancedDataGrid
        className="customer-table"
        gridId="purchase-supplier-quotes"
        {...screenViewGridDefaults(columns)}
        externalPagination
        hideSearch
        enableRowSelection={false}
      >
        <thead>
          <tr>
            {columns.map((field) => (
              <th
                key={field.key}
                scope="col"
                className={numericFields.has(field.key) ? "numeric" : undefined}
              >
                {field.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={span} className="table-empty" role="status">
                Teklifler yükleniyor…
              </td>
            </tr>
          ) : !items.length ? (
            <tr>
              <td colSpan={span} className="table-empty">
                Bu filtrelerle teklif bulunamadı.
              </td>
            </tr>
          ) : (
            items.map((quote) => (
              <tr
                key={quote.id}
                tabIndex={0}
                onClick={() => onSelect(quote)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(quote);
                  }
                }}
                aria-selected={selectedId === quote.id}
                className={selectedId === quote.id ? "erp-selected-row" : ""}
              >
                {columns.map((field) => (
                  <td
                    key={field.key}
                    className={numericFields.has(field.key) ? "numeric" : undefined}
                  >
                    {renderCell(quote, field.key)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </AdvancedDataGrid>
    </div>
  );
}
