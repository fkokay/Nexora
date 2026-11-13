import AdvancedDataGrid from "../../AdvancedDataGrid";
import ScreenViewGroupHeader from "../../ScreenViewGroupHeader";
import { DocumentSurface } from "../../document-page/DocumentSurface";
import type { Note, ScreenField } from "../types";

export function DeliveryNoteDetailDialog({
  note,
  loading,
  fields,
  onClose,
}: {
  note: Note;
  loading: boolean;
  fields: ScreenField[];
  onClose: () => void;
}) {
  return (
    <DocumentSurface
      title="Tedarikçi irsaliyesi"
      code={note.documentNumber}
      onClose={onClose}
      bodyClassName="modal ledger-modal"
    >
        {loading ? (
          <p className="table-empty">İrsaliye ayrıntısı yükleniyor…</p>
        ) : (
          <>
            <div className="balance-banner">
              <div>
                <small>Sipariş · tedarikçi</small>
                <b>
                  {note.purchaseOrderCode} · {note.supplierName}
                </b>
                <span>Belge tarihi {note.documentDate}</span>
              </div>
              <span className="ledger-currency">
                {note.purchaseReceiptCode
                  ? `Mal kabul eşleşti · ${note.purchaseReceiptCode}`
                  : "Mal kabul bağlantısı yok"}
              </span>
            </div>
            <div className="ledger-list">
              <AdvancedDataGrid className="customer-table">
                <thead>
                  <ScreenViewGroupHeader fields={fields} />
                  <tr>
                    {fields.map((field) => (
                      <th key={field.key}>{field.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(note.lines || []).map((line) => (
                    <tr key={line.orderLineNumber}>
                      {fields.map((field) => (
                        <td key={field.key}>
                          {field.key === "orderLineNumber"
                            ? line.orderLineNumber
                            : `${line.quantity.toLocaleString("tr-TR", { maximumFractionDigits: 4 })} ${line.unitCode}`}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {!note.lines?.length && (
                    <tr>
                      <td colSpan={fields.length} className="table-empty">
                        Satır ayrıntısı bulunamadı.
                      </td>
                    </tr>
                  )}
                </tbody>
              </AdvancedDataGrid>
            </div>
            <p className="muted">
              İrsaliye kaydı stok hareketi oluşturmaz. Stok girişi bağlı mal
              kabulde kaydedilir; irsaliye durumu ayrıca yönetilmez.
            </p>
            <div className="modal-foot">
              <button className="secondary" onClick={onClose}>
                Kapat
              </button>
            </div>
          </>
        )}
      </DocumentSurface>
  );
}
