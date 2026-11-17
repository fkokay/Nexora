import AdvancedDataGrid from "../../AdvancedDataGrid";
import { screenViewGridDefaults } from "../../screenViewGridLayout";
import ScreenViewGroupHeader from "../../ScreenViewGroupHeader";
import { DocumentSurface } from "../../document-page/DocumentSurface";
import {
  DetailChain,
  DetailContext,
  DetailInfoGrid,
  DetailLinesHead,
  formatDate,
  formatQuantity,
} from "../../document-detail/DocumentDetailLayout";
import { SALES_DETAIL_HINTS, SalesFooterStatus, SalesLinesMeta } from "../../sales/salesDocumentDetail";
import { deliveryNoteLinkStatus } from "../../purchasing/purchaseDeliveryNotePanel";
import type { Note, ScreenField } from "../types";

/**
 * Kayıtlı tedarikçi irsaliyesinin belge ekranı (taslak 02). İrsaliyenin durumu yoktur: durum akışı çizilmez, başlıktaki
 * etiket mal kabul bağlantısından türetilir. Satırlar kiracının `purchase-delivery-note-lines` düzeniyle çizilir.
 */
export function DeliveryNoteDocument({
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
  const lines = note.lines ?? [];
  const numberFields = new Set(["orderLineNumber", "quantity"]);
  return (
    <DocumentSurface
      variant="detail"
      title="Tedarikçi irsaliyesi"
      code={note.documentNumber}
      subtitle={note.supplierName}
      status={deliveryNoteLinkStatus(note)}
      meta={<span>{formatDate(note.documentDate)}</span>}
      onClose={onClose}
      aside={
        <DetailContext title="Belge zinciri">
          <DetailChain
            items={[
              { key: "order", code: note.purchaseOrderCode, label: "Satınalma siparişi" },
              { key: "self", code: note.documentNumber, label: "Bu irsaliye", kind: "Tedarikçi irsaliyesi", current: true, status: deliveryNoteLinkStatus(note) },
              ...(note.purchaseReceiptCode ? [{ key: "receipt", code: note.purchaseReceiptCode, label: "Mal kabul" }] : []),
            ]}
          />
        </DetailContext>
      }
      hints={SALES_DETAIL_HINTS}
      footerStatus={<SalesFooterStatus lines={loading ? note.lineCount : lines.length} />}
    >
      <div className="dd-box">
        <DetailInfoGrid
          label="İrsaliye bilgileri"
          items={[
            { label: "Satınalma siparişi", value: note.purchaseOrderCode },
            { label: "Tedarikçi", value: note.supplierName },
            { label: "Belge tarihi", value: formatDate(note.documentDate) },
            { label: "Mal kabul", value: note.purchaseReceiptCode ?? "Bağlantısı yok" },
          ]}
        />
      </div>
      <div className="dd-box">
        <DetailLinesHead title="Satırlar" meta={<SalesLinesMeta lines={loading ? note.lineCount : lines.length} />} />
        {loading ? (
          <p className="dd-empty">İrsaliye ayrıntısı yükleniyor…</p>
        ) : (
          <div className="dd-grid">
            <AdvancedDataGrid
              className="customer-table"
              gridId="purchase-delivery-note-lines"
              {...screenViewGridDefaults(fields)}
              enableRowSelection={false}
            >
              <thead>
                <ScreenViewGroupHeader fields={fields} />
                <tr>
                  {fields.map((field) => (
                    <th key={field.key} className={numberFields.has(field.key) ? "dd-num" : undefined}>
                      {field.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.orderLineNumber}>
                    {fields.map((field) => (
                      <td key={field.key} className={numberFields.has(field.key) ? "dd-num" : undefined}>
                        {field.key === "orderLineNumber"
                          ? line.orderLineNumber
                          : `${formatQuantity(line.quantity)} ${line.unitCode}`}
                      </td>
                    ))}
                  </tr>
                ))}
                {lines.length === 0 && (
                  <tr>
                    <td colSpan={fields.length} className="table-empty">
                      Satır ayrıntısı bulunamadı.
                    </td>
                  </tr>
                )}
              </tbody>
            </AdvancedDataGrid>
          </div>
        )}
        <p className="muted purchase-note-effect">
          İrsaliye kaydı stok hareketi oluşturmaz. Stok girişi bağlı mal kabulde kaydedilir; irsaliye durumu ayrıca
          yönetilmez.
        </p>
      </div>
    </DocumentSurface>
  );
}
