import type { FormEvent } from "react";
import AdvancedDataGrid from "../../AdvancedDataGrid";
import { screenViewGridDefaults } from "../../screenViewGridLayout";
import ScreenViewGroupHeader from "../../ScreenViewGroupHeader";
import type { OrderDetail, Note, ScreenField } from "../types";
import { RecordFormGroup, RecordFormPage, RequiredMark } from "../../record-form/RecordForm";
import "../../purchasing-record-forms.css";

export function DeliveryNoteComposePanel({
  detail,
  notes,
  receiptId,
  quantities,
  documentNumber,
  documentDate,
  busy,
  fields,
  onSubmit,
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
  busy: boolean;
  fields: ScreenField[];
  onSubmit: (event: FormEvent) => void;
  onDocumentNumberChange: (value: string) => void;
  onDocumentDateChange: (value: string) => void;
  onReceiptChange: (value: string) => void;
  onQuantityChange: (lineNumber: number, value: string) => void;
}) {
  return (
    <section className="panel purchase-note-compose-panel">
      <RecordFormPage
        variant="dialog"
        className="prf-embedded prf-no-cancel"
        title="İrsaliye Kaydet"
        mode="create"
        busy={busy}
        saveLabel="İrsaliyeyi kaydet"
        onSubmit={onSubmit}
        onCancel={() => undefined}
        status={
          <>
            <span>
              {detail.code} · {detail.supplierName} · miktarlar sipariş satırının
              temel biriminde girilir.
            </span>
            <span className="rf-status-end">Bu kayıt stok veya muhasebe hareketi oluşturmaz.</span>
          </>
        }
      >
        <RecordFormGroup title="Belge Kimliği" bodyClassName="rf-identity prf-identity-3">
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
        <RecordFormGroup title="İrsaliye Satırları">
        <div className="ledger-list">
          <AdvancedDataGrid
            className="customer-table"
            gridId="purchase-delivery-order-lines"
            {...screenViewGridDefaults(fields)}
          >
            <thead>
              <ScreenViewGroupHeader fields={fields} />
              <tr>
                {fields.map((field) => (
                  <th key={field.key}>{field.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {detail.lines.map((line) => (
                <tr key={line.lineNumber}>
                  {fields.map((field) => (
                    <td key={field.key}>
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
          <p className="muted prf-note">
            Mal kabul bağlantısında tüm irsaliye satırları ile mal kabul
            satırları ve temel birim miktarları bire bir eşleşmelidir.
          </p>
        )}
        </RecordFormGroup>
      </RecordFormPage>
    </section>
  );
}
