import AdvancedDataGrid from "../../AdvancedDataGrid";
import { screenViewGridDefaults } from "../../screenViewGridLayout";
import ScreenViewGroupHeader from "../../ScreenViewGroupHeader";
import type { OrderDetail, Note, ScreenField } from "../types";
import { RecordFormGroup, RequiredMark } from "../../record-form/RecordForm";
import "../../purchasing-record-forms.css";
import { DetailLinesHead } from "../../document-detail/DocumentDetailLayout";
import { SalesLinesMeta } from "../../sales/salesDocumentDetail";

const NUMBER_FIELDS: ReadonlySet<string> = new Set(["lineNumber", "orderedQuantity", "deliveryQuantity"]);

/** Belge kimliği and the order lines of the delivery note create view (inside the note form). */
export function DeliveryNoteComposePanel({
  detail,
  notes,
  receiptId,
  quantities,
  documentNumber,
  documentDate,
  fields,
  onDocumentNumberChange,
  onDocumentDateChange,
  onReceiptChange,
  onQuantityChange,
}: {
  detail: OrderDetail;
  notes: Note[];
  receiptId: string;
  quantities: Record<number, string>;
  documentNumber: string;
  documentDate: string;
  fields: ScreenField[];
  onDocumentNumberChange: (value: string) => void;
  onDocumentDateChange: (value: string) => void;
  onReceiptChange: (value: string) => void;
  onQuantityChange: (lineNumber: number, value: string) => void;
}) {
  return (
    <>
        <RecordFormGroup title="Belge Kimliği" bodyClassName="rf-identity doc-form-fields">
          <label>
            <span>Tedarikçi irsaliye numarası <RequiredMark /></span>
            <input
              className="rf-must rf-mono"
              value={documentNumber}
              onChange={(event) => onDocumentNumberChange(event.target.value)}
              maxLength={80}
              required
            />
          </label>
          <label>
            <span>Belge tarihi <RequiredMark /></span>
            <input
              className="rf-must"
              type="date"
              value={documentDate}
              onChange={(event) => onDocumentDateChange(event.target.value)}
              required
            />
          </label>
          <label>
            Mevcut mal kabul (isteğe bağlı)
            <select
              value={receiptId}
              onChange={(event) => onReceiptChange(event.target.value)}
            >
              <option value="">Sonradan bağlayacağım</option>
              {detail.receipts
                .filter(
                  (receipt) =>
                    receipt.status === "Posted" &&
                    !notes.some((note) => note.purchaseReceiptId === receipt.id),
                )
                .map((receipt) => (
                  <option key={receipt.id} value={receipt.id}>
                    {receipt.code} · {receipt.receiptDate}
                  </option>
                ))}
            </select>
          </label>
        </RecordFormGroup>
        <div className="dd-box">
        <DetailLinesHead title="İrsaliye Satırları" meta={<SalesLinesMeta lines={detail.lines.length} />} />
        <div className="dd-grid">
          <AdvancedDataGrid
            className="customer-table"
            gridId="purchase-delivery-order-lines"
            {...screenViewGridDefaults(fields)}
            enableRowSelection={false}
          >
            <thead>
              <ScreenViewGroupHeader fields={fields} />
              <tr>
                {fields.map((field) => (
                  <th key={field.key} className={NUMBER_FIELDS.has(field.key) ? "dd-num" : undefined}>{field.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {detail.lines.map((line) => (
                <tr key={line.lineNumber}>
                  {fields.map((field) => (
                    <td key={field.key} className={NUMBER_FIELDS.has(field.key) ? "dd-num" : undefined}>
                      {field.key === "lineNumber" ? (
                        line.lineNumber
                      ) : field.key === "product" ? (
                        `${line.stockCode} · ${line.stockName}`
                      ) : field.key === "orderedQuantity" ? (
                        `${line.quantity.toLocaleString("tr-TR")} ${line.unitCode}`
                      ) : (
                        <input
                          className="rf-num"
                          aria-label={`${line.stockCode} irsaliye miktarı`}
                          type="number"
                          min="0"
                          max={line.quantity}
                          step="0.0001"
                          value={quantities[line.lineNumber] || ""}
                          onChange={(event) =>
                            onQuantityChange(
                              line.lineNumber,
                              event.target.value,
                            )
                          }
                        />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </AdvancedDataGrid>
        </div>
        {receiptId && (
          <p className="muted prf-note purchase-note-effect">
            Mal kabul bağlantısında tüm irsaliye satırları ile mal kabul
            satırları ve temel birim miktarları bire bir eşleşmelidir.
          </p>
        )}
        </div>
    </>
  );
}
