import { Link2 } from "lucide-react";
import AdvancedDataGrid from "../../AdvancedDataGrid";
import { screenViewGridDefaults } from "../../screenViewGridLayout";
import ScreenViewGroupHeader from "../../ScreenViewGroupHeader";
import { DetailLinesHead } from "../../document-detail/DocumentDetailLayout";
import type { OrderDetail, Note, ScreenField } from "../types";

/** The chosen order's delivery notes with link / unlink of a receipt (buttons, not submits of the note form). */
export function OrderDeliveryNotesPanel({
  detail,
  notes,
  fields,
  receiptId,
  busy,
  onReceiptChange,
  onLink,
  onUnlink,
}: {
  detail: OrderDetail;
  notes: Note[];
  fields: ScreenField[];
  receiptId: string;
  busy: boolean;
  onReceiptChange: (value: string) => void;
  onLink: (note: Note) => void;
  onUnlink: (note: Note) => void;
}) {
  return (
    <div className="dd-box purchase-note-related">
      <DetailLinesHead title="Bu siparişin irsaliyeleri" meta="Mutabık olan belgeler bağlı mal kabul kodunu gösterir." />
      <div className="dd-grid">
        <AdvancedDataGrid
          className="customer-table"
          gridId="purchase-order-delivery-notes"
          {...screenViewGridDefaults(fields)}
          enableRowSelection={false}
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
            {notes.map((note) => (
              <tr key={note.id}>
                {fields.map((field) => (
                  <td key={field.key}>
                    {field.key === "documentNumber" ? (
                      note.documentNumber
                    ) : field.key === "documentDate" ? (
                      note.documentDate
                    ) : field.key === "lineCount" ? (
                      note.lineCount
                    ) : field.key === "purchaseReceiptCode" ? (
                      note.purchaseReceiptCode || "Bekliyor"
                    ) : note.purchaseReceiptId ? (
                      <button
                        type="button"
                        className="row-action danger-action"
                        disabled={busy}
                        onClick={() => onUnlink(note)}
                      >
                        Bağlantıyı kaldır
                      </button>
                    ) : (
                      <div className="form-inline">
                        <select
                          aria-label={`${note.documentNumber} mal kabul seçin`}
                          value={receiptId}
                          onChange={(event) =>
                            onReceiptChange(event.target.value)
                          }
                        >
                          <option value="">Mal kabul seçin</option>
                          {detail.receipts
                            .filter(
                              (receipt) =>
                                receipt.status === "Posted" &&
                                !notes.some(
                                  (item) =>
                                    item.purchaseReceiptId === receipt.id,
                                ),
                            )
                            .map((receipt) => (
                              <option key={receipt.id} value={receipt.id}>
                                {receipt.code}
                              </option>
                            ))}
                        </select>
                        <button
                          type="button"
                          className="row-action"
                          disabled={busy || !receiptId}
                          onClick={() => onLink(note)}
                        >
                          <Link2 size={14} /> Bağla
                        </button>
                      </div>
                    )}
                  </td>
                ))}
              </tr>
            ))}
            {notes.length === 0 && (
              <tr>
                <td colSpan={fields.length} className="table-empty">
                  Bu sipariş için irsaliye yok.
                </td>
              </tr>
            )}
          </tbody>
        </AdvancedDataGrid>
      </div>
    </div>
  );
}
