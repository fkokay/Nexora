import type { FormEvent, ReactNode } from "react";
import { RecordFormPage } from "../../record-form/RecordForm";
import "../../purchasing-record-forms.css";
import type { OrderDetail } from "../types";

/**
 * Delivery note create view (document create look, mockup 02 "düzenleniyor"): the order context, the note's identity
 * and lines, and the chosen order's notes with receipt link / unlink. The note has no status, so there is no flow.
 * Saving is the action bar's Kaydet (Ctrl+S); Vazgeç / Esc goes back to the list.
 */
export function DeliveryNoteCreateView({
  detail,
  documentNumber,
  busy,
  error,
  notice,
  dirty,
  onSubmit,
  onCancel,
  onDismissError,
  children,
}: {
  detail: OrderDetail | null;
  documentNumber: string;
  busy: boolean;
  error: string;
  notice: string;
  dirty: boolean;
  onSubmit: (event: FormEvent) => void;
  onCancel: () => void;
  onDismissError: () => void;
  children: ReactNode;
}) {
  return (
    <RecordFormPage
      className="purchase-note-create"
      title="Yeni tedarikçi irsaliyesi"
      mode="create"
      busy={busy}
      saveLabel="İrsaliyeyi kaydet"
      saveDisabledReason={detail ? undefined : "Önce bir sipariş seçin"}
      dirty={dirty}
      document={{
        type: "Tedarikçi irsaliyesi",
        code: documentNumber.trim() || undefined,
        party: detail?.supplierName,
      }}
      onSubmit={onSubmit}
      onCancel={onCancel}
      error={error}
      onDismissError={onDismissError}
      status={
        <>
          {detail ? (
            <span>
              {detail.code} · {detail.supplierName} · miktarlar sipariş satırının temel biriminde girilir.
            </span>
          ) : (
            <span>İrsaliye siparişe bağlanır; mal kabul stok girişinin tek kaynağıdır.</span>
          )}
          {notice && <span className="rf-status-notice">{notice}</span>}
          <span className="rf-status-end">Bu kayıt stok veya muhasebe hareketi oluşturmaz.</span>
        </>
      }
    >
      {children}
    </RecordFormPage>
  );
}
