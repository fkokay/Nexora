import type { InvoiceDraftFormProps } from "../types";
import { InvoiceDraftDocumentFields } from "./InvoiceDraftDocumentFields";
import { InvoiceDraftLineEditor } from "./InvoiceDraftLineEditor";
import { InvoiceDraftTotals } from "./InvoiceDraftTotals";
import { RecordFormPage } from "../../record-form/RecordForm";
import { SALES_FORM_HINTS } from "../../sales/salesDocumentForm";
import { SupplierInvoiceDraftFlow } from "../../purchasing/purchaseCreateForms";
import "../../standalone-supplier-invoice-draft.css";

/**
 * Bağımsız tedarikçi fatura taslağının belge oluşturma ekranı (taslak 02, belge düzenlenirken): başlıkta tür, numara ·
 * tedarikçi ve durum akışı (kayıt taslağı kaydeder: geçerli adım Taslak). Alanlar, doğrulamalar ve kaydetme aynıdır.
 */
export function InvoiceDraftForm(props: InvoiceDraftFormProps) {
  const requiredFilled = [
    props.draft.supplierId,
    props.draft.invoiceNumber.trim(),
    props.draft.invoiceDate,
    props.draft.currencyCode.trim(),
  ].filter(Boolean).length;
  const supplier = props.visibleSuppliers.find((item) => item.id === props.draft.supplierId);
  return (
    <RecordFormPage
      className="sales-rf sid-create"
      title={props.editing ? "Fatura Taslağını Düzenle" : "Tedarikçi Fatura Taslağı"}
      document={{
        type: "Tedarikçi faturası",
        code: props.draft.invoiceNumber.trim() || undefined,
        party: supplier?.name,
        statusFlow: <SupplierInvoiceDraftFlow />,
        hints: SALES_FORM_HINTS,
      }}
      mode={props.editing ? "edit" : "create"}
      busy={props.busy}
      saveLabel={props.editing ? "Taslağı güncelle" : "Taslağı kaydet"}
      formId="standalone-invoice-draft-form"
      onSubmit={props.onSubmit}
      onCancel={() => {
        if (!props.busy) props.onCancelEdit();
      }}
      error={props.error}
      onDismissError={props.onDismissError}
      status={
        <>
          <span>
            Zorunlu alanlar: <b>{requiredFilled} / 4</b>
          </span>
          <span>
            Satır sayısı: <b>{props.draft.lines.length}</b>
          </span>
          {props.notice && <span className="rf-status-notice">{props.notice}</span>}
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
