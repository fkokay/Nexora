import type { InvoiceDraftFormProps } from '../types'
import { InvoiceDraftDocumentFields } from './InvoiceDraftDocumentFields'
import { InvoiceDraftLineEditor } from './InvoiceDraftLineEditor'
import { InvoiceDraftTotals } from './InvoiceDraftTotals'

export function InvoiceDraftForm(props: InvoiceDraftFormProps) {
  return <form className="sid-form" onSubmit={props.onSubmit}>
    <InvoiceDraftDocumentFields draft={props.draft} editing={props.editing} suppliers={props.visibleSuppliers} onUpdate={props.onUpdate} onSelectSupplier={props.onSelectSupplier} onSearchSuppliers={props.onSearchSuppliers}/>
    <InvoiceDraftLineEditor draft={props.draft} expenseAccounts={props.expenseAccounts} receiptOptions={props.receiptOptions} onUpdateLine={props.onUpdateLine} onSelectReceiptLine={props.onSelectReceiptLine} onAddLine={props.onAddLine} onRemoveLine={props.onRemoveLine}/>
    <InvoiceDraftTotals draft={props.draft} editing={props.editing} busy={props.busy} supplierCount={props.supplierCount} onUpdate={props.onUpdate} onCancelEdit={props.onCancelEdit}/>
  </form>
}
