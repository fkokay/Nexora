import type { InvoiceDraftFormProps } from "../types";
import { InvoiceDraftDocumentFields } from "./InvoiceDraftDocumentFields";
import { InvoiceDraftLineEditor } from "./InvoiceDraftLineEditor";
import { InvoiceDraftTotals } from "./InvoiceDraftTotals";
import { RecordFormPage } from "../../record-form/RecordForm";
import "../../purchasing-record-forms.css";

export function InvoiceDraftForm(props: InvoiceDraftFormProps) {
  const requiredFilled = [
    props.draft.supplierId,
    props.draft.invoiceNumber.trim(),
    props.draft.invoiceDate,
    props.draft.currencyCode.trim(),
  ].filter(Boolean).length;
  return (
    <RecordFormPage
      variant="dialog"
      className={`prf-embedded${props.editing ? "" : " prf-no-cancel"}${props.supplierCount === 0 ? " prf-save-blocked" : ""}`}
      title={props.editing ? "Fatura Taslağını Düzenle" : "Tedarikçi Fatura Taslağı"}
      mode={props.editing ? "edit" : "create"}
      busy={props.busy}
      saveLabel={props.editing ? "Taslağı güncelle" : "Taslağı kaydet"}
      onSubmit={props.onSubmit}
      onCancel={() => {
        if (props.editing && !props.busy) props.onCancelEdit();
      }}
      status={
        <>
          <span>
            Zorunlu alanlar: <b>{requiredFilled} / 4</b>
          </span>
          <span>
            Satır sayısı: <b>{props.draft.lines.length}</b>
          </span>
          <span className="rf-status-end">
            Tutarlar kaydedildiği haliyle korunur; bu işlem muhasebe veya stok
            kaydı oluşturmaz.
          </span>
        </>
      }
    >
      <InvoiceDraftDocumentFields
        draft={props.draft}
        suppliers={props.visibleSuppliers}
        onUpdate={props.onUpdate}
        onSelectSupplier={props.onSelectSupplier}
        onSearchSuppliers={props.onSearchSuppliers}
      />
      <InvoiceDraftLineEditor
        draft={props.draft}
        expenseAccounts={props.expenseAccounts}
        receiptOptions={props.receiptOptions}
        onUpdateLine={props.onUpdateLine}
        onSelectReceiptLine={props.onSelectReceiptLine}
        onAddLine={props.onAddLine}
        onRemoveLine={props.onRemoveLine}
      />
      <InvoiceDraftTotals draft={props.draft} onUpdate={props.onUpdate} />
    </RecordFormPage>
  );
}
